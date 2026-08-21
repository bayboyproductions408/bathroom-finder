/* =====================================================================
   Bathroom Finder — shared backend.

   This is the thing that turns the app from single-player into something
   worth testing: a review written by one person is seen by everyone else.

   Storage is SQLite through node:sqlite, built into Node 24 — no npm, no
   external service, one file on disk. It moves to Postgres later by
   swapping this file; the HTTP shape stays the same.

   Identity is a device token, not an account: no email, no password, no
   personal data. Testers pick a display name and that is all we hold.
   ===================================================================== */
'use strict';
const { DatabaseSync } = require('node:sqlite');
const crypto = require('node:crypto');
const path = require('node:path');
const fs = require('node:fs');

const MAX_PHOTO_BYTES = 900 * 1024;

function open(file){
  fs.mkdirSync(path.dirname(file), {recursive:true});
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(`
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

    CREATE TABLE IF NOT EXISTS reviews(
      id TEXT PRIMARY KEY, place_id TEXT NOT NULL, user_id TEXT NOT NULL,
      stars INTEGER NOT NULL, text TEXT, tags TEXT, sub TEXT,
      hidden INTEGER NOT NULL DEFAULT 0, created INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS reviews_place ON reviews(place_id);

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
  `);
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

function createAPI({file, adminToken}){
  const db = open(file);

  const q = {
    userByToken: db.prepare('SELECT * FROM users WHERE token_hash = ?'),
    insertUser:  db.prepare('INSERT INTO users(id, token_hash, name, role, created) VALUES (?,?,?,?,?)'),
    renameUser:  db.prepare('UPDATE users SET name = ? WHERE id = ?'),
    upsertPlace: db.prepare(`INSERT INTO places(id, source, cat, lat, lng, name, sub, tags, created_by, created)
                             VALUES (?,?,?,?,?,?,?,?,?,?)
                             ON CONFLICT(id) DO UPDATE SET name=excluded.name, cat=excluded.cat, tags=excluded.tags`),
    getPlace:    db.prepare('SELECT * FROM places WHERE id = ?'),
    placesIn:    db.prepare(`SELECT * FROM places WHERE retired = 0 AND lat BETWEEN ? AND ? AND lng BETWEEN ? AND ? LIMIT 500`),
    insReview:   db.prepare('INSERT INTO reviews(id, place_id, user_id, stars, text, tags, sub, created) VALUES (?,?,?,?,?,?,?,?)'),
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

  const auth = req => {
    const h = req.headers.authorization || '';
    const token = h.startsWith('Bearer ') ? h.slice(7) : null;
    if (!token) return null;
    const u = q.userByToken.get(hash(token));
    if (!u) return null;
    if (u.blocked) bad(403, 'This device has been blocked');
    return u;
  };
  const need = req => auth(req) || bad(401, 'Register first');
  const isAdmin = req => {
    const h = req.headers['x-admin-token'];
    return !!(adminToken && h && crypto.timingSafeEqual(
      Buffer.from(String(h).padEnd(64).slice(0,64)), Buffer.from(String(adminToken).padEnd(64).slice(0,64))));
  };
  const needAdmin = req => { if (!isAdmin(req)) bad(403, 'Moderator token required'); };

  /* keep an OSM place around once it has community data attached */
  function ensurePlace(p, userId){
    if (!p || !p.id) bad(400, 'A place is required');
    const existing = q.getPlace.get(p.id);
    if (existing) return existing;
    if (typeof p.lat !== 'number' || typeof p.lng !== 'number') bad(400, 'That place has no coordinates');
    q.upsertPlace.run(p.id, p.source || (String(p.id).startsWith('osm:') ? 'osm' : 'local'),
      p.cat || 'toilets', p.lat, p.lng, String(p.name || 'Unnamed').slice(0, 120),
      String(p.sub || '').slice(0, 120), json(p.tags || {}), userId || null, now());
    return q.getPlace.get(p.id);
  }

  function placeBundle(id, viewerId){
    const stats = q.statsFor.get(id) || {n:0, avg:null};
    const corrections = {};
    for (const c of q.corrFor.all(id)) if (!corrections[c.kind]) corrections[c.kind] = parse(c.value, null);
    const photos = q.photosFor.all(id).map(p => ({id:p.id, by:p.user_id, state:p.state}));
    const mine = viewerId ? q.myPhotosFor.all(id, viewerId).filter(p => p.state !== 'approved')
                                .map(p => ({id:p.id, by:p.user_id, state:p.state})) : [];
    return {
      id,
      reviews: q.reviewsFor.all(id).map(r => ({
        id:r.id, user:r.user_name, stars:r.stars, text:r.text,
        tags:parse(r.tags, []), sub:parse(r.sub, null), at:r.created,
        photos: [] })),
      stats: {count: stats.n || 0, rating: stats.avg ? Math.round(stats.avg*10)/10 : null},
      confirms: q.confirmsFor.all(id).map(c => ({at:c.created, status:c.status})),
      reports: q.reportsFor.all('place', id).map(r => ({kind:r.kind, at:r.created})),
      corrections,
      photos: photos.concat(mine)
    };
  }

  /* ---------------- routes ---------------- */
  const routes = {
    'GET /api/v1/health': () => ({ok:true, version:1, time:now()}),

    'POST /api/v1/register': (req, body, ip) => {
      if (!rateLimit('reg:' + ip, 20, 3600000)) bad(429, 'Too many registrations from here');
      const name = String(body.name || '').trim().slice(0, 40) || 'Anonymous';
      const token = crypto.randomBytes(24).toString('base64url');
      const id = uid('u');
      q.insertUser.run(id, hash(token), name, 'user', now());
      return {userId:id, token, name};
    },

    'POST /api/v1/me': (req, body) => {
      const u = need(req);
      if (body.name){ q.renameUser.run(String(body.name).trim().slice(0,40), u.id); }
      return {userId:u.id, name: body.name ? String(body.name).trim().slice(0,40) : u.name, role:u.role};
    },

    /* community data for everything in view, in one round trip */
    'GET /api/v1/places': (req, body, ip, url) => {
      const bbox = String(url.searchParams.get('bbox') || '').split(',').map(Number);
      if (bbox.length !== 4 || bbox.some(isNaN)) bad(400, 'bbox=south,west,north,east is required');
      const [s, w, n, e] = bbox;
      const viewer = auth(req);
      const rows = q.placesIn.all(Math.min(s,n), Math.max(s,n), Math.min(w,e), Math.max(w,e));
      return {
        places: rows.map(p => ({
          id:p.id, source:p.source, cat:p.cat, lat:p.lat, lng:p.lng,
          name:p.name, sub:p.sub, tags:parse(p.tags, {}), createdBy:p.created_by
        })),
        community: Object.fromEntries(rows.map(p => [p.id, placeBundle(p.id, viewer && viewer.id)]))
      };
    },

    'GET /api/v1/place': (req, body, ip, url) => {
      const id = url.searchParams.get('id');
      if (!id) bad(400, 'id is required');
      const viewer = auth(req);
      const p = q.getPlace.get(id);
      return {place: p ? {id:p.id, cat:p.cat, lat:p.lat, lng:p.lng, name:p.name, sub:p.sub,
                          tags:parse(p.tags, {}), retired:!!p.retired} : null,
              community: placeBundle(id, viewer && viewer.id)};
    },

    'POST /api/v1/place': (req, body) => {
      const u = need(req);
      if (!rateLimit('place:' + u.id, 30, 3600000)) bad(429, 'That is a lot of new places — try later');
      const p = ensurePlace(body.place, u.id);
      return {place:{id:p.id}};
    },

    'POST /api/v1/review': (req, body) => {
      const u = need(req);
      if (!rateLimit('review:' + u.id, 40, 3600000)) bad(429, 'Too many reviews just now');
      ensurePlace(body.place, u.id);
      const stars = Number(body.stars);
      if (!(stars >= 1 && stars <= 5)) bad(400, 'Stars must be 1 to 5');
      const id = uid('r');
      q.insReview.run(id, body.place.id, u.id, Math.round(stars),
        String(body.text || '').slice(0, 2000), json(body.tags || []), json(body.sub || null), now());
      return {id, community: placeBundle(body.place.id, u.id)};
    },

    /* Photos always arrive pending. The on-device check runs first and blocks
       the obvious cases, but a client can lie, so the server never treats a
       client verdict as permission to publish. A person decides.          */
    'POST /api/v1/photo': (req, body) => {
      const u = need(req);
      if (!rateLimit('photo:' + u.id, 30, 3600000)) bad(429, 'Too many photos just now');
      ensurePlace(body.place, u.id);
      const m = String(body.dataUrl || '').match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
      if (!m) bad(400, 'Expected a jpeg, png or webp data URL');
      const bytes = Buffer.from(m[2], 'base64');
      if (bytes.length > MAX_PHOTO_BYTES) bad(413, 'That photo is too large');
      if (body.clientVerdict === 'rejected') bad(400, 'That photo did not pass the safety check');
      const id = uid('ph');
      q.insPhoto.run(id, body.place.id, body.reviewId || null, u.id, 'pending',
        json(body.scores || null), body.faces == null ? null : Number(body.faces),
        json(body.reasons || []), m[1], bytes, now());
      return {id, state:'pending'};
    },

    'GET /api/v1/photo': (req, body, ip, url) => {
      const id = url.searchParams.get('id');
      const p = id && q.photoById.get(id);
      if (!p) bad(404, 'No such photo');
      const viewer = auth(req);
      const maySee = p.state === 'approved' || (viewer && viewer.id === p.user_id) || isAdmin(req);
      if (!maySee) bad(403, 'That photo is not published');
      return {__binary:true, mime:p.mime, bytes:p.bytes};
    },

    'POST /api/v1/confirm': (req, body) => {
      const u = need(req);
      if (!rateLimit('confirm:' + u.id, 120, 3600000)) bad(429, 'Slow down a moment');
      ensurePlace(body.place, u.id);
      const status = ['open','locked','private','hours','indoor'].includes(body.status) ? body.status : 'open';
      q.insConfirm.run(uid('c'), body.place.id, u.id, status, now());
      return {community: placeBundle(body.place.id, u.id)};
    },

    'POST /api/v1/report': (req, body) => {
      const u = need(req);
      if (!rateLimit('report:' + u.id, 60, 3600000)) bad(429, 'Too many reports just now');
      const type = ['place','photo','review'].includes(body.targetType) ? body.targetType : 'place';
      if (type === 'place') ensurePlace(body.place, u.id);
      const targetId = type === 'place' ? body.place.id : String(body.targetId || '');
      if (!targetId) bad(400, 'What is being reported?');
      q.insReport.run(uid('rep'), type, targetId, u.id, String(body.kind || 'other').slice(0,40),
        String(body.note || '').slice(0, 500), now());
      /* a reported photo comes down at once and goes back to the queue */
      if (type === 'photo'){
        const ph = q.photoById.get(targetId);
        if (ph && ph.state === 'approved') q.decide.run('pending', now(), 'reported', targetId);
      }
      /* two different people saying it is gone retires it for everyone */
      let retired = false;
      if (type === 'place' && ['closed','noexist'].includes(body.kind)){
        const n = q.distinctReporters.get(targetId).n;
        if (n >= 2){ q.retire.run(targetId); retired = true; }
      }
      return {ok:true, retired, community: type === 'place' ? placeBundle(targetId, u.id) : undefined};
    },

    'POST /api/v1/correction': (req, body) => {
      const u = need(req);
      if (!rateLimit('corr:' + u.id, 60, 3600000)) bad(429, 'Too many corrections just now');
      ensurePlace(body.place, u.id);
      if (!['moved','hours','indoor'].includes(body.kind)) bad(400, 'Unknown correction');
      q.insCorr.run(uid('cor'), body.place.id, u.id, body.kind, json(body.value), now());
      q.insConfirm.run(uid('c'), body.place.id, u.id, body.kind, now());
      return {community: placeBundle(body.place.id, u.id)};
    },

    'POST /api/v1/feedback': (req, body) => {
      const u = auth(req);
      if (!rateLimit('fb:' + (u ? u.id : 'anon'), 20, 3600000)) bad(429, 'Thanks — that is plenty for now');
      const text = String(body.text || '').trim();
      if (text.length < 3) bad(400, 'Tell us a little more');
      q.insFeedback.run(uid('fb'), u ? u.id : null, text.slice(0, 4000),
        json(body.context || null), now());
      return {ok:true};
    },

    /* ---- moderator ---- */
    'GET /api/v1/moderation/queue': req => {
      needAdmin(req);
      return {photos: q.pending.all().map(p => ({
        id:p.id, placeId:p.place_id, placeName:p.place_name, by:p.user_name,
        state:p.state, scores:parse(p.scores, null), faces:p.faces,
        reasons:parse(p.reasons, []), at:p.created}))};
    },
    'POST /api/v1/moderation/decide': (req, body) => {
      needAdmin(req);
      if (!['approved','rejected'].includes(body.state)) bad(400, 'approved or rejected');
      const p = q.photoById.get(String(body.id || ''));
      if (!p) bad(404, 'No such photo');
      q.decide.run(body.state, now(), 'moderator', p.id);
      return {ok:true, id:p.id, state:body.state};
    },
    'GET /api/v1/moderation/stats': req => { needAdmin(req); return q.counts.get(); },

    /* Blocking an abusive contributor. Their reviews stop being served and
       their photos come down; nothing they post afterwards is accepted. */
    'POST /api/v1/moderation/block': (req, body) => {
      needAdmin(req);
      const u = q.userById.get(String(body.userId || ''));
      if (!u) bad(404, 'No such user');
      const blocked = body.blocked === false ? 0 : 1;
      q.blockUser.run(blocked, u.id);
      if (blocked) q.hidePhotosOf.run(now(), u.id);
      return {ok:true, userId:u.id, name:u.name, blocked: !!blocked};
    },
    'GET /api/v1/moderation/users': req => {
      needAdmin(req);
      return {users: q.recentUsers.all().map(u => ({
        id:u.id, name:u.name, blocked:!!u.blocked, at:u.created,
        reviews:u.reviews, photos:u.photos, reportsMade:u.reports_made}))};
    },
    'GET /api/v1/moderation/feedback': req => {
      needAdmin(req);
      return {feedback: q.allFeedback.all().map(f => ({
        id:f.id, by:f.user_name || 'anonymous', text:f.text,
        context:parse(f.context, null), at:f.created, done:!!f.done}))};
    }
  };

  async function handle(req, res, url, body, ip){
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
