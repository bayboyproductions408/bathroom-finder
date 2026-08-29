/* Backend tests. Run: node --test tests/api.test.js
   Uses a throwaway database, so it never touches real tester data.        */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createAPI } = require('../server/api.js');

const DB = path.join(os.tmpdir(), `bf-test-${Date.now()}.db`);
const api = createAPI({file: DB, adminToken: 'test-admin'});
/* WAL mode leaves -wal and -shm beside the database; clear all three, and
   never let tidying up fail the run — a flaky release gate is worse than none */
test.after(() => {
  try { api.db.close(); } catch(e){}
  for (const suffix of ['', '-wal', '-shm']) { try { fs.rmSync(DB + suffix, {force:true}); } catch(e){} }
});

/* tiny harness: call a route without an HTTP server */
function call(method, pathname, {body = {}, token, admin, query = ''} = {}){
  return new Promise(resolve => {
    const headers = {};
    if (token) headers.authorization = 'Bearer ' + token;
    if (admin) headers['x-admin-token'] = admin;
    const req = {method, headers};
    const url = new URL(`http://x${pathname}${query}`);
    let status = 200, payload = null, binary = null;
    const res = {
      writeHead(s, h){ status = s; this._h = h; },
      end(data){
        if (this._h && this._h['Content-Type'] && !this._h['Content-Type'].startsWith('application/json')) binary = data;
        else { try { payload = JSON.parse(data); } catch(e){ payload = data; } }
        resolve({status, body:payload, binary});
      }
    };
    api.handle(req, res, url, body, '1.2.3.4').then(handled => {
      if (!handled) resolve({status:404, body:{error:'no route'}});
    });
  });
}

const PLACE = {id:'osm:node/1', cat:'toilets', lat:51.5, lng:-0.12, name:'Test Toilets', tags:{amenity:'toilets'}};
const IMG = 'data:image/jpeg;base64,' + Buffer.from('not-a-real-jpeg-but-bytes').toString('base64');

let alice, bob;

test('health check answers', async () => {
  const r = await call('GET', '/api/v1/health');
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.ok, true);
});

test('registering gives a token and no personal data is required', async () => {
  const r = await call('POST', '/api/v1/register', {body:{name:'Alice'}});
  assert.strictEqual(r.status, 200);
  assert.ok(r.body.token && r.body.userId);
  alice = r.body;
  bob = (await call('POST', '/api/v1/register', {body:{name:'Bob'}})).body;
  assert.notStrictEqual(alice.token, bob.token);
});

test('writing requires a token', async () => {
  const r = await call('POST', '/api/v1/review', {body:{place:PLACE, stars:5}});
  assert.strictEqual(r.status, 401);
});

test('a bad token is rejected', async () => {
  const r = await call('POST', '/api/v1/review', {body:{place:PLACE, stars:5}, token:'made-up'});
  assert.strictEqual(r.status, 401);
});

test('THE POINT: one person writes a review, another person sees it', async () => {
  const w = await call('POST', '/api/v1/review',
    {body:{place:PLACE, stars:5, text:'Spotless and unlocked', tags:['Spotless']}, token:alice.token});
  assert.strictEqual(w.status, 200);

  const seen = await call('GET', '/api/v1/place', {query:'?id=' + encodeURIComponent(PLACE.id), token:bob.token});
  assert.strictEqual(seen.status, 200);
  assert.strictEqual(seen.body.community.reviews.length, 1);
  assert.strictEqual(seen.body.community.reviews[0].user, 'Alice');
  assert.strictEqual(seen.body.community.reviews[0].text, 'Spotless and unlocked');
  assert.strictEqual(seen.body.community.stats.count, 1);
  assert.strictEqual(seen.body.community.stats.rating, 5);
});

test('ratings average across people', async () => {
  await call('POST', '/api/v1/review', {body:{place:PLACE, stars:3, text:'Fine'}, token:bob.token});
  const r = await call('GET', '/api/v1/place', {query:'?id=' + encodeURIComponent(PLACE.id)});
  assert.strictEqual(r.body.community.stats.count, 2);
  assert.strictEqual(r.body.community.stats.rating, 4);
});

test('stars outside 1-5 are refused', async () => {
  for (const stars of [0, 6, -1, 'five'])
    assert.strictEqual((await call('POST', '/api/v1/review', {body:{place:PLACE, stars}, token:alice.token})).status, 400);
});

test('places in a bounding box come back with their community data', async () => {
  const r = await call('GET', '/api/v1/places', {query:'?bbox=51.4,-0.2,51.6,-0.05'});
  assert.strictEqual(r.status, 200);
  assert.ok(r.body.places.some(p => p.id === PLACE.id));
  assert.strictEqual(r.body.community[PLACE.id].stats.count, 2);
});

test('a bounding box elsewhere returns nothing', async () => {
  const r = await call('GET', '/api/v1/places', {query:'?bbox=40.0,-75.0,40.1,-74.9'});
  assert.strictEqual(r.body.places.length, 0);
});

test('a malformed bbox is refused', async () => {
  assert.strictEqual((await call('GET', '/api/v1/places', {query:'?bbox=nonsense'})).status, 400);
});

let photoId;
test('SAFETY: an uploaded photo is never published on the client’s say-so', async () => {
  const r = await call('POST', '/api/v1/photo',
    {body:{place:PLACE, dataUrl:IMG, clientVerdict:'approved', scores:{porn:0.001}, faces:0}, token:alice.token});
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.state, 'pending', 'a client claiming "approved" must not publish anything');
  photoId = r.body.id;
});

test('SAFETY: a pending photo is invisible to everyone but its owner', async () => {
  const asBob = await call('GET', '/api/v1/photo', {query:'?id=' + photoId, token:bob.token});
  assert.strictEqual(asBob.status, 403);
  const anon = await call('GET', '/api/v1/photo', {query:'?id=' + photoId});
  assert.strictEqual(anon.status, 403);
  const asAlice = await call('GET', '/api/v1/photo', {query:'?id=' + photoId, token:alice.token});
  assert.strictEqual(asAlice.status, 200);
});

test('SAFETY: a photo the device check rejected cannot be uploaded at all', async () => {
  const r = await call('POST', '/api/v1/photo',
    {body:{place:PLACE, dataUrl:IMG, clientVerdict:'rejected'}, token:alice.token});
  assert.strictEqual(r.status, 400);
});

test('non-images are refused', async () => {
  const r = await call('POST', '/api/v1/photo',
    {body:{place:PLACE, dataUrl:'data:text/html;base64,PHNjcmlwdD4='}, token:alice.token});
  assert.strictEqual(r.status, 400);
});

test('moderation queue needs the moderator token', async () => {
  assert.strictEqual((await call('GET', '/api/v1/moderation/queue')).status, 403);
  assert.strictEqual((await call('GET', '/api/v1/moderation/queue', {token:alice.token})).status, 403);
  const ok = await call('GET', '/api/v1/moderation/queue', {admin:'test-admin'});
  assert.strictEqual(ok.status, 200);
  assert.ok(ok.body.photos.some(p => p.id === photoId));
});

test('once a moderator approves it, everyone can see it', async () => {
  const d = await call('POST', '/api/v1/moderation/decide',
    {body:{id:photoId, state:'approved'}, admin:'test-admin'});
  assert.strictEqual(d.status, 200);
  const asBob = await call('GET', '/api/v1/photo', {query:'?id=' + photoId, token:bob.token});
  assert.strictEqual(asBob.status, 200);
  assert.ok(asBob.binary && asBob.binary.length > 0);
});

test('reporting a published photo takes it down immediately', async () => {
  const r = await call('POST', '/api/v1/report',
    {body:{targetType:'photo', targetId:photoId, kind:'inappropriate'}, token:bob.token});
  assert.strictEqual(r.status, 200);
  const asBob = await call('GET', '/api/v1/photo', {query:'?id=' + photoId, token:bob.token});
  assert.strictEqual(asBob.status, 403, 'a reported photo must stop being served at once');
});

test('one report does not retire a place, two different people do', async () => {
  const p2 = {...PLACE, id:'osm:node/2', name:'Doomed Toilets'};
  const first = await call('POST', '/api/v1/report', {body:{place:p2, kind:'closed'}, token:alice.token});
  assert.strictEqual(first.body.retired, false);
  const second = await call('POST', '/api/v1/report', {body:{place:p2, kind:'closed'}, token:bob.token});
  assert.strictEqual(second.body.retired, true);
  const list = await call('GET', '/api/v1/places', {query:'?bbox=51.4,-0.2,51.6,-0.05'});
  assert.ok(!list.body.places.some(p => p.id === p2.id), 'a retired place stops being listed');
});

test('the same person reporting twice does not retire a place', async () => {
  const p3 = {...PLACE, id:'osm:node/3', name:'Survivor Toilets'};
  await call('POST', '/api/v1/report', {body:{place:p3, kind:'closed'}, token:alice.token});
  const again = await call('POST', '/api/v1/report', {body:{place:p3, kind:'closed'}, token:alice.token});
  assert.strictEqual(again.body.retired, false, 'one person must not be able to delete a place alone');
});

test('corrections are shared, not just local', async () => {
  await call('POST', '/api/v1/correction',
    {body:{place:PLACE, kind:'hours', value:'24/7'}, token:alice.token});
  await call('POST', '/api/v1/correction',
    {body:{place:PLACE, kind:'indoor', value:'Second floor, past the lifts'}, token:alice.token});
  const asBob = await call('GET', '/api/v1/place', {query:'?id=' + encodeURIComponent(PLACE.id), token:bob.token});
  assert.strictEqual(asBob.body.community.corrections.hours, '24/7');
  assert.strictEqual(asBob.body.community.corrections.indoor, 'Second floor, past the lifts');
});

test('confirmations are shared', async () => {
  await call('POST', '/api/v1/confirm', {body:{place:PLACE, status:'open'}, token:bob.token});
  const r = await call('GET', '/api/v1/place', {query:'?id=' + encodeURIComponent(PLACE.id)});
  assert.ok(r.body.community.confirms.length >= 1);
  assert.strictEqual(r.body.community.confirms[0].status, 'open');
});

test('a place added by one tester appears for another', async () => {
  const mine = {id:'local:99', cat:'toilets', lat:51.51, lng:-0.11, name:'Alley Loo', tags:{}};
  await call('POST', '/api/v1/place', {body:{place:mine}, token:alice.token});
  const list = await call('GET', '/api/v1/places', {query:'?bbox=51.4,-0.2,51.6,-0.05', token:bob.token});
  assert.ok(list.body.places.some(p => p.id === 'local:99' && p.name === 'Alley Loo'));
});

test('testers can send feedback, and moderators can read it', async () => {
  const r = await call('POST', '/api/v1/feedback',
    {body:{text:'The map jumps when I search', context:{screen:'map'}}, token:bob.token});
  assert.strictEqual(r.status, 200);
  const seen = await call('GET', '/api/v1/moderation/feedback', {admin:'test-admin'});
  assert.ok(seen.body.feedback.some(f => f.text.includes('map jumps') && f.by === 'Bob'));
});

test('empty feedback is refused', async () => {
  assert.strictEqual((await call('POST', '/api/v1/feedback', {body:{text:' '}, token:bob.token})).status, 400);
});

test('stats give a launch dashboard', async () => {
  const r = await call('GET', '/api/v1/moderation/stats', {admin:'test-admin'});
  assert.ok(r.body.users >= 2 && r.body.reviews >= 2);
  assert.ok('pending_photos' in r.body && 'open_reports' in r.body);
});

test('unknown endpoints 404 rather than crashing', async () => {
  assert.strictEqual((await call('GET', '/api/v1/nope')).status, 404);
});

/* App Store guideline 1.2 requires UGC apps to be able to block abusive users */
test('blocking requires the moderator token', async () => {
  assert.strictEqual((await call('POST', '/api/v1/moderation/block',
    {body:{userId:bob.userId}, token:alice.token})).status, 403);
});

test('SAFETY: a blocked user’s reviews vanish for everyone else', async () => {
  const place = {...PLACE, id:'osm:node/50', name:'Blocking Test'};
  await call('POST', '/api/v1/review', {body:{place, stars:1, text:'abusive nonsense'}, token:bob.token});
  const before = await call('GET', '/api/v1/place', {query:'?id=' + encodeURIComponent(place.id)});
  assert.strictEqual(before.body.community.reviews.length, 1);

  const blocked = await call('POST', '/api/v1/moderation/block',
    {body:{userId:bob.userId, blocked:true}, admin:'test-admin'});
  assert.strictEqual(blocked.status, 200);
  assert.strictEqual(blocked.body.blocked, true);

  const after = await call('GET', '/api/v1/place', {query:'?id=' + encodeURIComponent(place.id)});
  assert.strictEqual(after.body.community.reviews.length, 0, 'a blocked user must disappear from the map');
  /* the rating has to follow: hiding the review but still counting it would
     leave a 1-star rating on a place with no visible reviews */
  assert.strictEqual(after.body.community.stats.count, 0, 'a blocked review must not still count');
  assert.strictEqual(after.body.community.stats.rating, null, 'a blocked review must not skew the rating');
});

test('SAFETY: a blocked user cannot post anything new', async () => {
  const r = await call('POST', '/api/v1/review', {body:{place:PLACE, stars:5, text:'let me back in'}, token:bob.token});
  assert.strictEqual(r.status, 403);
});

test('blocking can be undone', async () => {
  const un = await call('POST', '/api/v1/moderation/block',
    {body:{userId:bob.userId, blocked:false}, admin:'test-admin'});
  assert.strictEqual(un.body.blocked, false);
  const r = await call('POST', '/api/v1/review', {body:{place:PLACE, stars:4, text:'behaving now'}, token:bob.token});
  assert.strictEqual(r.status, 200);
});

test('moderators can list contributors to act on', async () => {
  const r = await call('GET', '/api/v1/moderation/users', {admin:'test-admin'});
  assert.strictEqual(r.status, 200);
  const b = r.body.users.find(u => u.id === bob.userId);
  assert.ok(b && typeof b.reviews === 'number', 'each contributor shows what they have posted');
});

/* ---------- monetisation ---------- */
let campaignId;
test('creating a campaign needs the moderator token', async () => {
  const r = await call('POST', '/api/v1/moderation/sponsor',
    {body:{business:'Sneaky Co', headline:'buy', lat:51.5, lng:-0.12}, token:alice.token});
  assert.strictEqual(r.status, 403);
});

test('a campaign can be created and goes live', async () => {
  const r = await call('POST', '/api/v1/moderation/sponsor', {admin:'test-admin', body:{
    business:'Bell & Bean Coffee', headline:'Clean bathroom, no purchase needed',
    body:'Two minutes away, open until 8pm', cta:'Directions',
    lat:51.5005, lng:-0.1201, radius:1500, status:'live',
    cpmCents:500, cpcCents:40, budgetCents:5000, contact:'ads@example.com'}});
  assert.strictEqual(r.status, 200);
  campaignId = r.body.id;
});

test('the app can fetch nearby sponsors without a login', async () => {
  const r = await call('GET', '/api/v1/sponsors', {query:'?lat=51.5&lng=-0.12'});
  assert.strictEqual(r.status, 200);
  assert.ok(r.body.sponsors.some(s => s.id === campaignId));
});

test('sponsors far away are not served', async () => {
  const r = await call('GET', '/api/v1/sponsors', {query:'?lat=40.71&lng=-74.0'});
  assert.strictEqual(r.body.sponsors.length, 0, 'a London café must not advertise in New York');
});

test('impressions and clicks are counted, and spend accrues', async () => {
  await call('POST', '/api/v1/sponsors/impression', {body:{id:campaignId}});
  await call('POST', '/api/v1/sponsors/click', {body:{id:campaignId}});
  const r = await call('GET', '/api/v1/moderation/revenue', {admin:'test-admin'});
  const c = r.body.campaigns.find(x => x.id === campaignId);
  assert.strictEqual(c.impressions, 1);
  assert.strictEqual(c.clicks, 1);
  assert.ok(r.body.revenue_cents > 0, 'a click at 40c should register spend');
});

test('a paused campaign stops being served', async () => {
  await call('POST', '/api/v1/moderation/sponsor', {admin:'test-admin', body:{id:campaignId, status:'paused'}});
  const r = await call('GET', '/api/v1/sponsors', {query:'?lat=51.5&lng=-0.12'});
  assert.ok(!r.body.sponsors.some(s => s.id === campaignId));
  await call('POST', '/api/v1/moderation/sponsor', {admin:'test-admin', body:{id:campaignId, status:'live'}});
});

test('a campaign stops when its budget is spent', async () => {
  const made = await call('POST', '/api/v1/moderation/sponsor', {admin:'test-admin', body:{
    business:'Tiny Budget Ltd', headline:'One click only', lat:51.5006, lng:-0.1202,
    status:'live', cpcCents:100, budgetCents:100}});
  const id = made.body.id;
  let live = await call('GET', '/api/v1/sponsors', {query:'?lat=51.5&lng=-0.12'});
  assert.ok(live.body.sponsors.some(s => s.id === id), 'should serve before the budget is gone');
  await call('POST', '/api/v1/sponsors/click', {body:{id}});
  live = await call('GET', '/api/v1/sponsors', {query:'?lat=51.5&lng=-0.12'});
  assert.ok(!live.body.sponsors.some(s => s.id === id), 'must stop the moment the budget is spent');
});

test('businesses can send an advertising enquiry', async () => {
  const r = await call('POST', '/api/v1/lead',
    {body:{business:'Corner Cafe', contact:'owner@example.com', note:'Interested', lat:51.5, lng:-0.12}});
  assert.strictEqual(r.status, 200);
  const seen = await call('GET', '/api/v1/moderation/revenue', {admin:'test-admin'});
  assert.ok(seen.body.leads.some(l => l.business === 'Corner Cafe'));
});

test('an enquiry without a contact is refused', async () => {
  assert.strictEqual((await call('POST', '/api/v1/lead', {body:{business:'No Contact Ltd'}})).status, 400);
});

test('the revenue dashboard reports what matters', async () => {
  const r = await call('GET', '/api/v1/moderation/revenue', {admin:'test-admin'});
  for (const k of ['live_campaigns','revenue_cents','impressions','clicks','open_leads','ctr'])
    assert.ok(k in r.body, `dashboard is missing ${k}`);
});

/* ---------- surviving a server wipe ----------
   The free tier has no persistent disk, so devices re-upload what they wrote.
   That is only safe if repeats are idempotent. */
test('a re-uploaded review does not duplicate', async () => {
  const place = {...PLACE, id:'osm:node/900', name:'Wipe Test'};
  const body = {place, stars:4, text:'Survives a restart', localId:'lr_abc123'};

  const first = await call('POST', '/api/v1/review', {body, token:alice.token});
  assert.strictEqual(first.status, 200);

  const again = await call('POST', '/api/v1/review', {body, token:alice.token});
  assert.strictEqual(again.status, 200);
  assert.strictEqual(again.body.duplicate, true, 'the second upload must be recognised');

  const seen = await call('GET', '/api/v1/place', {query:'?id=' + encodeURIComponent(place.id)});
  assert.strictEqual(seen.body.community.reviews.length, 1, 'one review, not two');
  assert.strictEqual(seen.body.community.stats.count, 1);
});

test('the same localId from a different person is still their own review', async () => {
  const place = {...PLACE, id:'osm:node/901', name:'Collision Test'};
  await call('POST', '/api/v1/review', {body:{place, stars:5, text:'mine', localId:'lr_same'}, token:alice.token});
  await call('POST', '/api/v1/review', {body:{place, stars:1, text:'also mine', localId:'lr_same'}, token:bob.token});
  const seen = await call('GET', '/api/v1/place', {query:'?id=' + encodeURIComponent(place.id)});
  assert.strictEqual(seen.body.community.reviews.length, 2,
    'localId is only unique per person, so two people may pick the same one');
});

test('the client is told which reviews are its own', async () => {
  const place = {...PLACE, id:'osm:node/902', name:'Ownership Test'};
  await call('POST', '/api/v1/review', {body:{place, stars:3, text:'x', localId:'lr_own'}, token:alice.token});
  const asAlice = await call('GET', '/api/v1/place', {query:'?id=' + encodeURIComponent(place.id), token:alice.token});
  const asBob = await call('GET', '/api/v1/place', {query:'?id=' + encodeURIComponent(place.id), token:bob.token});
  assert.strictEqual(asAlice.body.community.reviews[0].mine, true);
  assert.strictEqual(asBob.body.community.reviews[0].mine, false);
  assert.strictEqual(asAlice.body.community.reviews[0].localId, 'lr_own');
});

test('a review without a localId still works (older clients)', async () => {
  const place = {...PLACE, id:'osm:node/903', name:'Legacy Test'};
  const r1 = await call('POST', '/api/v1/review', {body:{place, stars:4, text:'no local id'}, token:alice.token});
  const r2 = await call('POST', '/api/v1/review', {body:{place, stars:2, text:'also none'}, token:alice.token});
  assert.strictEqual(r1.status, 200);
  assert.strictEqual(r2.status, 200);
  const seen = await call('GET', '/api/v1/place', {query:'?id=' + encodeURIComponent(place.id)});
  assert.strictEqual(seen.body.community.reviews.length, 2,
    'null localId must not collide with another null');
});

/* ---- blocking ----
   Guideline 1.2 wants a way to block an abusive contributor, and the client
   can only do that if a review says, stably and opaquely, who wrote it. The
   display name cannot carry that: it is free text and two people can pick the
   same one. */
test('a review carries a stable author key', async () => {
  const place = {...PLACE, id:'osm:node/910', name:'Author Key'};
  await call('POST', '/api/v1/review', {body:{place, stars:4, text:'first', localId:'lr_a1'}, token:alice.token});
  const seen = await call('GET', '/api/v1/place', {query:'?id=' + encodeURIComponent(place.id)});
  const r = seen.body.community.reviews[0];
  assert.ok(r.author, 'every review needs an author key or nothing can be blocked');
  assert.match(r.author, /^[0-9a-f]{16}$/, 'opaque, fixed length');
});

test('the author key is the same person across different places', async () => {
  const p1 = {...PLACE, id:'osm:node/911', name:'Across One'};
  const p2 = {...PLACE, id:'osm:node/912', name:'Across Two'};
  await call('POST', '/api/v1/review', {body:{place:p1, stars:5, text:'here', localId:'lr_x1'}, token:alice.token});
  await call('POST', '/api/v1/review', {body:{place:p2, stars:1, text:'and here', localId:'lr_x2'}, token:alice.token});
  const a = await call('GET', '/api/v1/place', {query:'?id=' + encodeURIComponent(p1.id)});
  const b = await call('GET', '/api/v1/place', {query:'?id=' + encodeURIComponent(p2.id)});
  assert.strictEqual(a.body.community.reviews[0].author, b.body.community.reviews[0].author,
    'blocking someone has to hide them everywhere, not just where you blocked them');
});

test('two people get different author keys, and neither is the user id', async () => {
  const place = {...PLACE, id:'osm:node/913', name:'Two People'};
  await call('POST', '/api/v1/review', {body:{place, stars:5, text:'alice', localId:'lr_p1'}, token:alice.token});
  await call('POST', '/api/v1/review', {body:{place, stars:1, text:'bob', localId:'lr_p2'}, token:bob.token});
  const seen = await call('GET', '/api/v1/place', {query:'?id=' + encodeURIComponent(place.id)});
  const keys = seen.body.community.reviews.map(r => r.author);
  assert.strictEqual(new Set(keys).size, 2, 'blocking one must not hide the other');
  assert.ok(!keys.includes(alice.userId) && !keys.includes(bob.userId),
    'the bundle is public, so it must not hand out the row key for an account');
});
