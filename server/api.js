/* =====================================================================
   Bathroom Finder — shared backend.

   This is the thing that turns the app from single-player into something
   worth testing: a review written by one person is seen by everyone else.

   Storage is SQLite, reached through server/db.js, which picks its backing
   from the environment: a local file for tests and development, or Turso
   over the network when TURSO_DATABASE_URL is set. Every query here is
   awaited, so the two are interchangeable and the free host's habit of
   wiping its disk stops mattering.

   Identity is a device token, not an account: no email, no password, no
   personal data. Testers pick a display name and that is all we hold.
   ===================================================================== */
'use strict';
const { openStore, tursoClientAvailable } = require('./db.js');
const osm = require('./osm.js');
const crypto = require('node:crypto');
const path = require('node:path');
const fs = require('node:fs');

const MAX_PHOTO_BYTES = 900 * 1024;

function open(opts){
  const db = openStore(opts);
  const schema = db.exec(`
    CREATE TABLE IF NOT EXISTS users(
      id TEXT PRIMARY KEY, token_hash TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user', blocked INTEGER NOT NULL DEFAULT 0,
      created INTEGER NOT NULL);

    CREATE TABLE IF NOT EXISTS places(
      id TEXT PRIMARY KEY, source TEXT NOT NULL, cat TEXT NOT NULL,
      lat REAL NOT NULL, lng REAL NOT NULL, name TEXT NOT NULL, sub TEXT,
      tags TEXT NOT NULL DEFAULT '{}', created_by TEXT, created INTEGER NOT NULL,
      retired INTEGER NOT NULL DEFAULT 0);
    CREATE INDEX IF NOT EXISTS places_bbox ON places(lat, lng);

    /* local_id is the client's own id for a review it wrote. The free hosting
       tier has no persistent disk, so the database can be wiped by a restart;
       devices re-upload what they wrote and this makes that idempotent. */
    CREATE TABLE IF NOT EXISTS reviews(
      id TEXT PRIMARY KEY, place_id TEXT NOT NULL, user_id TEXT NOT NULL,
      stars INTEGER NOT NULL, text TEXT, tags TEXT, sub TEXT,
      hidden INTEGER NOT NULL DEFAULT 0, created INTEGER NOT NULL,
      local_id TEXT);
    CREATE INDEX IF NOT EXISTS reviews_place ON reviews(place_id);
    /* reviews_local is NOT created here. On a database that predates local_id
       the table already exists, CREATE TABLE IF NOT EXISTS leaves it alone, and
       indexing a column that is not there aborts the whole script. It is
       created below, after the ALTER TABLE that guarantees the column. */

    CREATE TABLE IF NOT EXISTS photos(
      id TEXT PRIMARY KEY, place_id TEXT NOT NULL, review_id TEXT,
      user_id TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'pending',
      scores TEXT, faces INTEGER, reasons TEXT, mime TEXT NOT NULL DEFAULT 'image/jpeg',
      bytes BLOB NOT NULL, created INTEGER NOT NULL, decided INTEGER, decided_by TEXT);
    CREATE INDEX IF NOT EXISTS photos_place ON photos(place_id, state);
    CREATE INDEX IF NOT EXISTS photos_state ON photos(state);

    CREATE TABLE IF NOT EXISTS confirms(
      id TEXT PRIMARY KEY, place_id TEXT NOT NULL, user_id TEXT NOT NULL,
      status TEXT NOT NULL, created INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS confirms_place ON confirms(place_id);

    CREATE TABLE IF NOT EXISTS reports(
      id TEXT PRIMARY KEY, target_type TEXT NOT NULL, target_id TEXT NOT NULL,
      user_id TEXT NOT NULL, kind TEXT NOT NULL, note TEXT, created INTEGER NOT NULL,
      resolved INTEGER NOT NULL DEFAULT 0);
    CREATE INDEX IF NOT EXISTS reports_target ON reports(target_type, target_id);

    CREATE TABLE IF NOT EXISTS corrections(
      id TEXT PRIMARY KEY, place_id TEXT NOT NULL, user_id TEXT NOT NULL,
      kind TEXT NOT NULL, value TEXT, created INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS corrections_place ON corrections(place_id, kind);

    CREATE TABLE IF NOT EXISTS feedback(
      id TEXT PRIMARY KEY, user_id TEXT, text TEXT NOT NULL, context TEXT,
      created INTEGER NOT NULL, done INTEGER NOT NULL DEFAULT 0);

    /* Sponsored listings — a business paying to be the bathroom people are
       sent to. Billing needs counts, so impressions and clicks are recorded
       and the placement stops when the budget is spent. */
    CREATE TABLE IF NOT EXISTS sponsors(
      id TEXT PRIMARY KEY, place_id TEXT, business TEXT NOT NULL,
      headline TEXT NOT NULL, body TEXT, cta TEXT,
      lat REAL NOT NULL, lng REAL NOT NULL, radius INTEGER NOT NULL DEFAULT 1500,
      status TEXT NOT NULL DEFAULT 'pending',
      cpm_cents INTEGER NOT NULL DEFAULT 0, cpc_cents INTEGER NOT NULL DEFAULT 0,
      budget_cents INTEGER NOT NULL DEFAULT 0, spent_cents INTEGER NOT NULL DEFAULT 0,
      impressions INTEGER NOT NULL DEFAULT 0, clicks INTEGER NOT NULL DEFAULT 0,
      contact TEXT, starts INTEGER, ends INTEGER, created INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS sponsors_live ON sponsors(status, lat, lng);

    /* OpenStreetMap places, cached.

       Every client used to query Overpass directly from the browser. Overpass
       is a volunteer-run free service that rate-limits hard, so at any real
       usage that means a slow, half-broken map for users and a lot of traffic
       aimed at someone else's donated hardware. Caching here turns thousands
       of identical requests for the same city block into one.

       Keyed by tile so overlapping viewports share work. tiles_fetched records
       that a tile was looked at even when it came back empty — otherwise empty
       countryside is re-fetched forever. */
    CREATE TABLE IF NOT EXISTS pois(
      id TEXT PRIMARY KEY, tile TEXT NOT NULL, cat TEXT NOT NULL,
      lat REAL NOT NULL, lng REAL NOT NULL, name TEXT NOT NULL, sub TEXT,
      tags TEXT NOT NULL DEFAULT '{}', fetched INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS pois_bbox ON pois(lat, lng);
    CREATE INDEX IF NOT EXISTS pois_tile ON pois(tile);

    CREATE TABLE IF NOT EXISTS tiles_fetched(
      tile TEXT PRIMARY KEY, fetched INTEGER NOT NULL, count INTEGER NOT NULL DEFAULT 0);

    /* Enquiries from businesses who want to advertise — the actual sales
       pipeline, and the thing worth checking every morning. */
    CREATE TABLE IF NOT EXISTS leads(
      id TEXT PRIMARY KEY, business TEXT NOT NULL, contact TEXT NOT NULL,
      note TEXT, lat REAL, lng REAL, created INTEGER NOT NULL,
      handled INTEGER NOT NULL DEFAULT 0);
  `);
  /* Statements are prepared lazily by the driver, so nothing here has to
     finish before createAPI returns — callers await db.ready instead, which
     keeps require-time construction synchronous. */
  db.ready = schema.then(async () => {
    /* existing deployments predate local_id; add it without losing data */
    try { await db.exec('ALTER TABLE reviews ADD COLUMN local_id TEXT'); } catch(e){ /* already there */ }
    try { await db.exec('CREATE UNIQUE INDEX IF NOT EXISTS reviews_local ON reviews(user_id, local_id) WHERE local_id IS NOT NULL'); } catch(e){}
  });
  /* Say what actually went wrong. Without a handler this surfaces as a bare
     unhandled rejection at some unrelated moment later; the await in handle()
     still sees the rejection and turns it into a 500. */
  db.ready.catch(err => {
    console.error('\nDatabase schema could not be created:');
    console.error('  ' + err.message + '\n');
  });
  return db;
}

const uid = p => p + '_' + crypto.randomBytes(9).toString('hex');
const hash = t => crypto.createHash('sha256').update(String(t)).digest('hex');
const now = () => Date.now();
const json = v => JSON.stringify(v == null ? null : v);
const parse = (v, d) => { try { return v == null ? d : JSON.parse(v); } catch(e){ return d; } };

/* ---------- rate limiting: crude, in-memory, enough for a beta ---------- */
const hits = new Map();
function rateLimit(key, max, windowMs){
  const t = now();
  const rec = hits.get(key) || {n:0, until:t + windowMs};
  if (t > rec.until){ rec.n = 0; rec.until = t + windowMs; }
  rec.n++;
  hits.set(key, rec);
  if (hits.size > 5000) for (const [k, v] of hits) if (t > v.until) hits.delete(k);
  return rec.n <= max;
}

class HttpError extends Error {
  constructor(status, message){ super(message); this.status = status; }
}
const bad = (s, m) => { throw new HttpError(s, m); };

function createAPI({file, adminToken, url, authToken}){
  const db = open({file, url, authToken});

  const q = {
    userByToken: db.prepare('SELECT * FROM users WHERE token_hash = ?'),
    insertUser:  db.prepare('INSERT INTO users(id, token_hash, name, role, created) VALUES (?,?,?,?,?)'),
    renameUser:  db.prepare('UPDATE users SET name = ? WHERE id = ?'),
    upsertPlace: db.prepare(`INSERT INTO places(id, source, cat, lat, lng, name, sub, tags, created_by, created)
                             VALUES (?,?,?,?,?,?,?,?,?,?)
                             ON CONFLICT(id) DO UPDATE SET name=excluded.name, cat=excluded.cat, tags=excluded.tags`),
    getPlace:    db.prepare('SELECT * FROM places WHERE id = ?'),

    /* cached OpenStreetMap places */
    poiPut:  db.prepare(`INSERT INTO pois(id, tile, cat, lat, lng, name, sub, tags, fetched)
                         VALUES (?,?,?,?,?,?,?,?,?)
                         ON CONFLICT(id) DO UPDATE SET
                           name=excluded.name, sub=excluded.sub, cat=excluded.cat,
                           lat=excluded.lat, lng=excluded.lng, tile=excluded.tile,
                           tags=excluded.tags, fetched=excluded.fetched`),
    poisIn:  db.prepare(`SELECT * FROM pois
                         WHERE lat BETWEEN ? AND ? AND lng BETWEEN ? AND ? LIMIT 900`),
    tileGet: db.prepare('SELECT * FROM tiles_fetched WHERE tile = ?'),
    tilePut: db.prepare(`INSERT INTO tiles_fetched(tile, fetched, count) VALUES (?,?,?)
                         ON CONFLICT(tile) DO UPDATE SET fetched=excluded.fetched, count=excluded.count`),
    placesIn:    db.prepare(`SELECT * FROM places WHERE retired = 0 AND lat BETWEEN ? AND ? AND lng BETWEEN ? AND ? LIMIT 500`),
    /* ON CONFLICT DO NOTHING makes a re-upload harmless: a device that
       re-sends what it wrote after a server wipe cannot create duplicates. */
    /* The unique index is partial (local_id IS NOT NULL) so that reviews
       without one never collide with each other. SQLite requires a partial
       index's WHERE clause repeated here for it to be a valid conflict
       target — without it: "ON CONFLICT clause does not match any PRIMARY
       KEY or UNIQUE constraint". */
    insReview:   db.prepare(`INSERT INTO reviews(id, place_id, user_id, stars, text, tags, sub, created, local_id)
                             VALUES (?,?,?,?,?,?,?,?,?)
                             ON CONFLICT(user_id, local_id) WHERE local_id IS NOT NULL DO NOTHING`),
    reviewByLocal: db.prepare('SELECT id FROM reviews WHERE user_id = ? AND local_id = ?'),
    /* a blocked user's contributions disappear from everyone else's view —
       required by App Store guideline 1.2 for user-generated content */
    reviewsFor:  db.prepare(`SELECT r.*, u.name AS user_name FROM reviews r JOIN users u ON u.id = r.user_id
                             WHERE r.place_id = ? AND r.hidden = 0 AND u.blocked = 0
                             ORDER BY r.created DESC, r.rowid DESC LIMIT 100`),
    blockUser:   db.prepare('UPDATE users SET blocked = ? WHERE id = ?'),
    userById:    db.prepare('SELECT id, name, blocked, created FROM users WHERE id = ?'),
    recentUsers: db.prepare(`SELECT u.id, u.name, u.blocked, u.created,
                               (SELECT COUNT(*) FROM reviews WHERE user_id = u.id) reviews,
                               (SELECT COUNT(*) FROM photos  WHERE user_id = u.id) photos,
                               (SELECT COUNT(*) FROM reports WHERE user_id = u.id) reports_made
                             FROM users u ORDER BY u.created DESC LIMIT 100`),
    hidePhotosOf: db.prepare(`UPDATE photos SET state = 'rejected', decided = ?, decided_by = 'blocked'
                              WHERE user_id = ? AND state != 'rejected'`),
    /* must exclude blocked users too, or a blocked review vanishes from the
       list while still inflating the count and skewing the average */
    statsFor:    db.prepare(`SELECT COUNT(*) n, AVG(r.stars) avg FROM reviews r
                             JOIN users u ON u.id = r.user_id
                             WHERE r.place_id = ? AND r.hidden = 0 AND u.blocked = 0`),
    insPhoto:    db.prepare('INSERT INTO photos(id, place_id, review_id, user_id, state, scores, faces, reasons, mime, bytes, created) VALUES (?,?,?,?,?,?,?,?,?,?,?)'),
    photoById:   db.prepare('SELECT * FROM photos WHERE id = ?'),
    photosFor:   db.prepare(`SELECT id, user_id, state, created FROM photos WHERE place_id = ? AND state = 'approved' ORDER BY created DESC, rowid DESC LIMIT 30`),
    myPhotosFor: db.prepare(`SELECT id, user_id, state, created FROM photos WHERE place_id = ? AND user_id = ? ORDER BY created DESC, rowid DESC LIMIT 30`),
    pending:     db.prepare(`SELECT p.id, p.place_id, p.user_id, p.state, p.scores, p.faces, p.reasons, p.created,
                                    u.name AS user_name, pl.name AS place_name
                             FROM photos p JOIN users u ON u.id = p.user_id
                             LEFT JOIN places pl ON pl.id = p.place_id
                             WHERE p.state = 'pending' ORDER BY p.created ASC LIMIT 100`),
    decide:      db.prepare('UPDATE photos SET state = ?, decided = ?, decided_by = ? WHERE id = ?'),
    insConfirm:  db.prepare('INSERT INTO confirms(id, place_id, user_id, status, created) VALUES (?,?,?,?,?)'),
    confirmsFor: db.prepare('SELECT status, created FROM confirms WHERE place_id = ? ORDER BY created DESC, rowid DESC LIMIT 40'),
    insReport:   db.prepare('INSERT INTO reports(id, target_type, target_id, user_id, kind, note, created) VALUES (?,?,?,?,?,?,?)'),
    reportsFor:  db.prepare('SELECT kind, created, user_id FROM reports WHERE target_type = ? AND target_id = ?'),
    distinctReporters: db.prepare(`SELECT COUNT(DISTINCT user_id) n FROM reports WHERE target_type='place' AND target_id = ? AND kind IN ('closed','noexist')`),
    retire:      db.prepare('UPDATE places SET retired = 1 WHERE id = ?'),
    insCorr:     db.prepare('INSERT INTO corrections(id, place_id, user_id, kind, value, created) VALUES (?,?,?,?,?,?)'),
    corrFor:     db.prepare(`SELECT kind, value, created, COUNT(*) OVER (PARTITION BY kind) votes
                             FROM corrections WHERE place_id = ? ORDER BY created DESC, rowid DESC`),
    insFeedback: db.prepare('INSERT INTO feedback(id, user_id, text, context, created) VALUES (?,?,?,?,?)'),

    /* live sponsors near a point, cheap bounding-box filter first */
    liveSponsors: db.prepare(`SELECT * FROM sponsors
                              WHERE status = 'live'
                                AND (budget_cents = 0 OR spent_cents < budget_cents)
                                AND (starts IS NULL OR starts <= ?) AND (ends IS NULL OR ends >= ?)
                                AND lat BETWEEN ? AND ? AND lng BETWEEN ? AND ?
                              ORDER BY cpm_cents DESC LIMIT 20`),
    sponsorById:  db.prepare('SELECT * FROM sponsors WHERE id = ?'),
    countImpression: db.prepare(`UPDATE sponsors SET impressions = impressions + 1,
                                   spent_cents = spent_cents + (cpm_cents / 1000.0)
                                 WHERE id = ?`),
    countClick:   db.prepare(`UPDATE sponsors SET clicks = clicks + 1,
                                spent_cents = spent_cents + cpc_cents WHERE id = ?`),
    allSponsors:  db.prepare('SELECT * FROM sponsors ORDER BY created DESC LIMIT 200'),
    insSponsor:   db.prepare(`INSERT INTO sponsors(id, place_id, business, headline, body, cta,
                                lat, lng, radius, status, cpm_cents, cpc_cents, budget_cents,
                                contact, starts, ends, created)
                              VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`),
    setSponsorStatus: db.prepare('UPDATE sponsors SET status = ? WHERE id = ?'),
    insLead:      db.prepare('INSERT INTO leads(id, business, contact, note, lat, lng, created) VALUES (?,?,?,?,?,?,?)'),
    allLeads:     db.prepare('SELECT * FROM leads ORDER BY created DESC LIMIT 200'),
    revenue:      db.prepare(`SELECT
                    (SELECT COUNT(*) FROM sponsors WHERE status='live') live_campaigns,
                    (SELECT COALESCE(SUM(spent_cents),0) FROM sponsors) revenue_cents,
                    (SELECT COALESCE(SUM(impressions),0) FROM sponsors) impressions,
                    (SELECT COALESCE(SUM(clicks),0) FROM sponsors) clicks,
                    (SELECT COUNT(*) FROM leads WHERE handled=0) open_leads`),
    allFeedback: db.prepare(`SELECT f.*, u.name AS user_name FROM feedback f LEFT JOIN users u ON u.id = f.user_id
                             ORDER BY f.created DESC LIMIT 200`),
    counts:      db.prepare(`SELECT
                    (SELECT COUNT(*) FROM users) users,
                    (SELECT COUNT(*) FROM reviews WHERE hidden=0) reviews,
                    (SELECT COUNT(*) FROM photos) photos,
                    (SELECT COUNT(*) FROM photos WHERE state='pending') pending_photos,
                    (SELECT COUNT(*) FROM confirms) confirms,
                    (SELECT COUNT(*) FROM reports WHERE resolved=0) open_reports,
                    (SELECT COUNT(*) FROM places WHERE source='local') added_places,
                    (SELECT COUNT(*) FROM feedback WHERE done=0) feedback`)
  };

  const auth = async req => {
    const h = req.headers.authorization || '';
    const token = h.startsWith('Bearer ') ? h.slice(7) : null;
    if (!token) return null;
    const u = await q.userByToken.get(hash(token));
    if (!u) return null;
    if (u.blocked) bad(403, 'This device has been blocked');
    return u;
  };
  const need = async req => (await auth(req)) || bad(401, 'Register first');
  const isAdmin = req => {
    const h = req.headers['x-admin-token'];
    return !!(adminToken && h && crypto.timingSafeEqual(
      Buffer.from(String(h).padEnd(64).slice(0,64)), Buffer.from(String(adminToken).padEnd(64).slice(0,64))));
  };
  const needAdmin = req => { if (!isAdmin(req)) bad(403, 'Moderator token required'); };

  /* keep an OSM place around once it has community data attached */
  async function ensurePlace(p, userId){
    if (!p || !p.id) bad(400, 'A place is required');
    const existing = await q.getPlace.get(p.id);
    if (existing) return existing;
    if (typeof p.lat !== 'number' || typeof p.lng !== 'number') bad(400, 'That place has no coordinates');
    await q.upsertPlace.run(p.id, p.source || (String(p.id).startsWith('osm:') ? 'osm' : 'local'),
      p.cat || 'toilets', p.lat, p.lng, String(p.name || 'Unnamed').slice(0, 120),
      String(p.sub || '').slice(0, 120), json(p.tags || {}), userId || null, now());
    return await q.getPlace.get(p.id);
  }

  async function placeBundle(id, viewerId){
    const stats = await q.statsFor.get(id) || {n:0, avg:null};
    const corrections = {};
    for (const c of await q.corrFor.all(id)) if (!corrections[c.kind]) corrections[c.kind] = parse(c.value, null);
    const photos = (await q.photosFor.all(id)).map(p => ({id:p.id, by:p.user_id, state:p.state}));
    const mine = viewerId ? (await q.myPhotosFor.all(id, viewerId)).filter(p => p.state !== 'approved')
                                .map(p => ({id:p.id, by:p.user_id, state:p.state})) : [];
    return {
      id,
      reviews: (await q.reviewsFor.all(id)).map(r => ({
        id:r.id, localId:r.local_id, mine: viewerId ? r.user_id === viewerId : false,
        user:r.user_name, stars:r.stars, text:r.text,
        tags:parse(r.tags, []), sub:parse(r.sub, null), at:r.created,
        photos: [] })),
      stats: {count: stats.n || 0, rating: stats.avg ? Math.round(stats.avg*10)/10 : null},
      confirms: (await q.confirmsFor.all(id)).map(c => ({at:c.created, status:c.status})),
      reports: (await q.reportsFor.all('place', id)).map(r => ({kind:r.kind, at:r.created})),
      corrections,
      photos: photos.concat(mine)
    };
  }

  /* ---------------- routes ---------------- */
  const routes = {
    /* storage/durable are here so "did Turso actually take?" can be answered
       from outside, without reading a deploy log. Only the driver's name is
       exposed — never the URL, and never the token. */
    'GET /api/v1/health': async () => ({
      ok: true, version: 1, time: now(),
      storage: db.kind, durable: db.kind === 'turso',
      /* false means this host skipped the dependency install, and switching
         on Turso would take the service down rather than make it durable */
      tursoReady: tursoClientAvailable()}),

    'POST /api/v1/register': async (req, body, ip) => {
      if (!rateLimit('reg:' + ip, 20, 3600000)) bad(429, 'Too many registrations from here');
      const name = String(body.name || '').trim().slice(0, 40) || 'Anonymous';
      const token = crypto.randomBytes(24).toString('base64url');
      const id = uid('u');
      await q.insertUser.run(id, hash(token), name, 'user', now());
      return {userId:id, token, name};
    },

    'POST /api/v1/me': async (req, body) => {
      const u = await need(req);
      if (body.name){ await q.renameUser.run(String(body.name).trim().slice(0,40), u.id); }
      return {userId:u.id, name: body.name ? String(body.name).trim().slice(0,40) : u.name, role:u.role};
    },

    /* community data for everything in view, in one round trip */
    'GET /api/v1/places': async (req, body, ip, url) => {
      const bbox = String(url.searchParams.get('bbox') || '').split(',').map(Number);
      if (bbox.length !== 4 || bbox.some(isNaN)) bad(400, 'bbox=south,west,north,east is required');
      const [s, w, n, e] = bbox;
      const viewer = await auth(req);
      const rows = await q.placesIn.all(Math.min(s,n), Math.max(s,n), Math.min(w,e), Math.max(w,e));
      return {
        places: rows.map(p => ({
          id:p.id, source:p.source, cat:p.cat, lat:p.lat, lng:p.lng,
          name:p.name, sub:p.sub, tags:parse(p.tags, {}), createdBy:p.created_by
        })),
        community: Object.fromEntries(
          await Promise.all(rows.map(async p => [p.id, await placeBundle(p.id, viewer && viewer.id)])))
      };
    },

    /* The map's data source. Clients call this instead of Overpass, so a
       popular block costs one upstream query rather than one per visitor. */
    'GET /api/v1/osm': async (req, body, ip, url) => {
      const bbox = String(url.searchParams.get('bbox') || '').split(',').map(Number);
      if (bbox.length !== 4 || bbox.some(isNaN)) bad(400, 'bbox=south,west,north,east is required');
      const [s0, w0, n0, e0] = bbox;
      const s = Math.min(s0, n0), n = Math.max(s0, n0);
      const w = Math.min(w0, e0), e = Math.max(w0, e0);
      /* A whole-continent bbox would ask Overpass for the impossible. */
      if ((n - s) > 0.5 || (e - w) > 0.5) bad(400, 'bbox is too large — zoom in');
      if (!rateLimit('osm:' + ip, 240, 60 * 60 * 1000)) bad(429, 'Slow down a moment');
      return await osm.placesIn(q, {s, w, n, e});
    },

    'GET /api/v1/place': async (req, body, ip, url) => {
      const id = url.searchParams.get('id');
      if (!id) bad(400, 'id is required');
      const viewer = await auth(req);
      const p = await q.getPlace.get(id);
      return {place: p ? {id:p.id, cat:p.cat, lat:p.lat, lng:p.lng, name:p.name, sub:p.sub,
                          tags:parse(p.tags, {}), retired:!!p.retired} : null,
              community: await placeBundle(id, viewer && viewer.id)};
    },

    'POST /api/v1/place': async (req, body) => {
      const u = await need(req);
      if (!rateLimit('place:' + u.id, 30, 3600000)) bad(429, 'That is a lot of new places — try later');
      const p = await ensurePlace(body.place, u.id);
      return {place:{id:p.id}};
    },

    'POST /api/v1/review': async (req, body) => {
      const u = await need(req);
      if (!rateLimit('review:' + u.id, 40, 3600000)) bad(429, 'Too many reviews just now');
      await ensurePlace(body.place, u.id);
      const stars = Number(body.stars);
      if (!(stars >= 1 && stars <= 5)) bad(400, 'Stars must be 1 to 5');
      const localId = body.localId ? String(body.localId).slice(0, 64) : null;
      /* a device re-uploading after a server reset must not duplicate */
      if (localId){
        const existing = await q.reviewByLocal.get(u.id, localId);
        if (existing) return {id: existing.id, duplicate: true, community: await placeBundle(body.place.id, u.id)};
      }
      const id = uid('r');
      await q.insReview.run(id, body.place.id, u.id, Math.round(stars),
        String(body.text || '').slice(0, 2000), json(body.tags || []), json(body.sub || null),
        Number(body.at) || now(), localId);
      return {id, community: await placeBundle(body.place.id, u.id)};
    },

    /* Photos always arrive pending. The on-device check runs first and blocks
       the obvious cases, but a client can lie, so the server never treats a
       client verdict as permission to publish. A person decides.          */
    'POST /api/v1/photo': async (req, body) => {
      const u = await need(req);
      if (!rateLimit('photo:' + u.id, 30, 3600000)) bad(429, 'Too many photos just now');
      await ensurePlace(body.place, u.id);
      const m = String(body.dataUrl || '').match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
      if (!m) bad(400, 'Expected a jpeg, png or webp data URL');
      const bytes = Buffer.from(m[2], 'base64');
      if (bytes.length > MAX_PHOTO_BYTES) bad(413, 'That photo is too large');
      if (body.clientVerdict === 'rejected') bad(400, 'That photo did not pass the safety check');
      const id = uid('ph');
      await q.insPhoto.run(id, body.place.id, body.reviewId || null, u.id, 'pending',
        json(body.scores || null), body.faces == null ? null : Number(body.faces),
        json(body.reasons || []), m[1], bytes, now());
      return {id, state:'pending'};
    },

    'GET /api/v1/photo': async (req, body, ip, url) => {
      const id = url.searchParams.get('id');
      const p = id && await q.photoById.get(id);
      if (!p) bad(404, 'No such photo');
      const viewer = await auth(req);
      const maySee = p.state === 'approved' || (viewer && viewer.id === p.user_id) || isAdmin(req);
      if (!maySee) bad(403, 'That photo is not published');
      return {__binary:true, mime:p.mime, bytes:p.bytes};
    },

    'POST /api/v1/confirm': async (req, body) => {
      const u = await need(req);
      if (!rateLimit('confirm:' + u.id, 120, 3600000)) bad(429, 'Slow down a moment');
      await ensurePlace(body.place, u.id);
      const status = ['open','locked','private','hours','indoor'].includes(body.status) ? body.status : 'open';
      await q.insConfirm.run(uid('c'), body.place.id, u.id, status, now());
      return {community: await placeBundle(body.place.id, u.id)};
    },

    'POST /api/v1/report': async (req, body) => {
      const u = await need(req);
      if (!rateLimit('report:' + u.id, 60, 3600000)) bad(429, 'Too many reports just now');
      const type = ['place','photo','review'].includes(body.targetType) ? body.targetType : 'place';
      if (type === 'place') await ensurePlace(body.place, u.id);
      const targetId = type === 'place' ? body.place.id : String(body.targetId || '');
      if (!targetId) bad(400, 'What is being reported?');
      await q.insReport.run(uid('rep'), type, targetId, u.id, String(body.kind || 'other').slice(0,40),
        String(body.note || '').slice(0, 500), now());
      /* a reported photo comes down at once and goes back to the queue */
      if (type === 'photo'){
        const ph = await q.photoById.get(targetId);
        if (ph && ph.state === 'approved') await q.decide.run('pending', now(), 'reported', targetId);
      }
      /* two different people saying it is gone retires it for everyone */
      let retired = false;
      if (type === 'place' && ['closed','noexist'].includes(body.kind)){
        const n = (await q.distinctReporters.get(targetId)).n;
        if (n >= 2){ await q.retire.run(targetId); retired = true; }
      }
      return {ok:true, retired, community: type === 'place' ? await placeBundle(targetId, u.id) : undefined};
    },

    'POST /api/v1/correction': async (req, body) => {
      const u = await need(req);
      if (!rateLimit('corr:' + u.id, 60, 3600000)) bad(429, 'Too many corrections just now');
      await ensurePlace(body.place, u.id);
      if (!['moved','hours','indoor'].includes(body.kind)) bad(400, 'Unknown correction');
      await q.insCorr.run(uid('cor'), body.place.id, u.id, body.kind, json(body.value), now());
      await q.insConfirm.run(uid('c'), body.place.id, u.id, body.kind, now());
      return {community: await placeBundle(body.place.id, u.id)};
    },

    'POST /api/v1/feedback': async (req, body) => {
      const u = await auth(req);
      if (!rateLimit('fb:' + (u ? u.id : 'anon'), 20, 3600000)) bad(429, 'Thanks — that is plenty for now');
      const text = String(body.text || '').trim();
      if (text.length < 3) bad(400, 'Tell us a little more');
      await q.insFeedback.run(uid('fb'), u ? u.id : null, text.slice(0, 4000),
        json(body.context || null), now());
      return {ok:true};
    },

    /* ---- sponsored listings ---------------------------------------------
       Read is public (the app needs it); everything that costs money or
       changes what people see is moderator-only.                        */
    'GET /api/v1/sponsors': async (req, body, ip, url) => {
      const lat = Number(url.searchParams.get('lat')), lng = Number(url.searchParams.get('lng'));
      if (isNaN(lat) || isNaN(lng)) bad(400, 'lat and lng are required');
      const t = now(), pad = 0.05;                       // ~5km box, filtered properly client-side
      const rows = await q.liveSponsors.all(t, t, lat-pad, lat+pad, lng-pad, lng+pad);
      return {sponsors: rows.map(s => ({
        id:s.id, placeId:s.place_id, business:s.business, headline:s.headline,
        body:s.body, cta:s.cta, lat:s.lat, lng:s.lng, radius:s.radius}))};
    },

    /* Billing runs off these two. Impressions are cheap and frequent, so
       they are fire-and-forget; a click is the thing worth arguing over. */
    'POST /api/v1/sponsors/impression': async (req, body, ip) => {
      const s = await q.sponsorById.get(String(body.id || ''));
      if (!s || s.status !== 'live') return {ok:false};
      if (!rateLimit('imp:' + ip + ':' + s.id, 60, 3600000)) return {ok:false, throttled:true};
      await q.countImpression.run(s.id);
      return {ok:true};
    },
    'POST /api/v1/sponsors/click': async (req, body, ip) => {
      const s = await q.sponsorById.get(String(body.id || ''));
      if (!s || s.status !== 'live') return {ok:false};
      if (!rateLimit('clk:' + ip + ':' + s.id, 20, 3600000)) return {ok:false, throttled:true};
      await q.countClick.run(s.id);
      return {ok:true};
    },

    /* A business asking to advertise. No auth — it is a contact form. */
    'POST /api/v1/lead': async (req, body, ip) => {
      if (!rateLimit('lead:' + ip, 10, 3600000)) bad(429, 'Too many enquiries from here');
      const business = String(body.business || '').trim().slice(0, 120);
      const contact  = String(body.contact  || '').trim().slice(0, 200);
      if (!business || !contact) bad(400, 'A business name and a way to reach you are both needed');
      await q.insLead.run(uid('lead'), business, contact, String(body.note || '').slice(0, 1000),
        body.lat == null ? null : Number(body.lat), body.lng == null ? null : Number(body.lng), now());
      return {ok:true};
    },

    'POST /api/v1/moderation/sponsor': async (req, body) => {
      needAdmin(req);
      if (body.id && body.status){
        if (!['pending','live','paused','ended'].includes(body.status)) bad(400, 'Unknown status');
        if (!await q.sponsorById.get(body.id)) bad(404, 'No such campaign');
        await q.setSponsorStatus.run(body.status, body.id);
        return {ok:true, id:body.id, status:body.status};
      }
      const required = ['business','headline','lat','lng'];
      for (const k of required) if (body[k] == null || body[k] === '') bad(400, `${k} is required`);
      const id = uid('sp');
      await q.insSponsor.run(id, body.placeId || null, String(body.business).slice(0,120),
        String(body.headline).slice(0,120), String(body.body || '').slice(0,300),
        String(body.cta || 'Directions').slice(0,40),
        Number(body.lat), Number(body.lng), Number(body.radius) || 1500,
        body.status === 'live' ? 'live' : 'pending',
        Math.round(Number(body.cpmCents) || 0), Math.round(Number(body.cpcCents) || 0),
        Math.round(Number(body.budgetCents) || 0),
        String(body.contact || '').slice(0,200),
        body.starts ? Number(body.starts) : null, body.ends ? Number(body.ends) : null, now());
      return {ok:true, id};
    },
    'GET /api/v1/moderation/revenue': async req => {
      needAdmin(req);
      const r = await q.revenue.get();
      return {
        ...r,
        revenue: '$' + (r.revenue_cents/100).toFixed(2),
        ctr: r.impressions ? +(r.clicks / r.impressions * 100).toFixed(2) : 0,
        campaigns: (await q.allSponsors.all()).map(s => ({
          id:s.id, business:s.business, headline:s.headline, status:s.status,
          impressions:s.impressions, clicks:s.clicks,
          ctr: s.impressions ? +(s.clicks/s.impressions*100).toFixed(2) : 0,
          spent: '$' + (s.spent_cents/100).toFixed(2),
          budget: '$' + (s.budget_cents/100).toFixed(2)})),
        leads: (await q.allLeads.all()).map(l => ({
          id:l.id, business:l.business, contact:l.contact, note:l.note,
          at:l.created, handled:!!l.handled}))
      };
    },

    /* ---- moderator ---- */
    'GET /api/v1/moderation/queue': async req => {
      needAdmin(req);
      return {photos: (await q.pending.all()).map(p => ({
        id:p.id, placeId:p.place_id, placeName:p.place_name, by:p.user_name,
        state:p.state, scores:parse(p.scores, null), faces:p.faces,
        reasons:parse(p.reasons, []), at:p.created}))};
    },
    'POST /api/v1/moderation/decide': async (req, body) => {
      needAdmin(req);
      if (!['approved','rejected'].includes(body.state)) bad(400, 'approved or rejected');
      const p = await q.photoById.get(String(body.id || ''));
      if (!p) bad(404, 'No such photo');
      await q.decide.run(body.state, now(), 'moderator', p.id);
      return {ok:true, id:p.id, state:body.state};
    },
    'GET /api/v1/moderation/stats': async req => { needAdmin(req); return await q.counts.get(); },

    /* Blocking an abusive contributor. Their reviews stop being served and
       their photos come down; nothing they post afterwards is accepted. */
    'POST /api/v1/moderation/block': async (req, body) => {
      needAdmin(req);
      const u = await q.userById.get(String(body.userId || ''));
      if (!u) bad(404, 'No such user');
      const blocked = body.blocked === false ? 0 : 1;
      await q.blockUser.run(blocked, u.id);
      if (blocked) await q.hidePhotosOf.run(now(), u.id);
      return {ok:true, userId:u.id, name:u.name, blocked: !!blocked};
    },
    'GET /api/v1/moderation/users': async req => {
      needAdmin(req);
      return {users: (await q.recentUsers.all()).map(u => ({
        id:u.id, name:u.name, blocked:!!u.blocked, at:u.created,
        reviews:u.reviews, photos:u.photos, reportsMade:u.reports_made}))};
    },
    'GET /api/v1/moderation/feedback': async req => {
      needAdmin(req);
      return {feedback: (await q.allFeedback.all()).map(f => ({
        id:f.id, by:f.user_name || 'anonymous', text:f.text,
        context:parse(f.context, null), at:f.created, done:!!f.done}))};
    }
  };

  async function handle(req, res, url, body, ip){
    await db.ready;                       /* schema is in place before any query */
    const key = `${req.method} ${url.pathname}`;
    const route = routes[key];
    if (!route) return false;
    try {
      const out = await route(req, body || {}, ip, url);
      if (out && out.__binary){
        res.writeHead(200, {'Content-Type':out.mime, 'Cache-Control':'private, max-age=3600'});
        res.end(Buffer.from(out.bytes));
        return true;
      }
      res.writeHead(200, {'Content-Type':'application/json'});
      res.end(JSON.stringify(out));
    } catch(err){
      const status = err instanceof HttpError ? err.status : 500;
      if (status === 500) console.error('api error', key, err);
      res.writeHead(status, {'Content-Type':'application/json'});
      res.end(JSON.stringify({error: err.message || 'Something went wrong'}));
    }
    return true;
  }

  return {handle, db, routes:Object.keys(routes), _q:q, _ensurePlace:ensurePlace, _hash:hash};
}

module.exports = {createAPI, open, MAX_PHOTO_BYTES};
