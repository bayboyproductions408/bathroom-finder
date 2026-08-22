/* The whole point of moving off the local file is that a restart no longer
   loses data. That claim deserves a test, because the failure mode is silent:
   everything works, and the reviews are simply gone the next morning.

   Runs against the libSQL driver — the same code path Turso uses in
   production, pointed at a local file so it needs no account and no network.
   Skips rather than fails when the client is not installed, so a checkout
   without node_modules can still run the rest of the suite.

   Run: node tests/durability.test.js                                       */
'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert');

const { createAPI } = require('../server/api.js');

let ok = 0, failed = 0;
const check = (name, fn) => fn().then(
  () => { ok++; console.log('  ok   ' + name); },
  err => { failed++; console.log('  FAIL ' + name + '\n       ' + err.message); });

/* the same tiny harness the API tests use */
function caller(api){
  return (method, pathname, {body = {}, token, admin, query = ''} = {}) =>
    new Promise(resolve => {
      const headers = {};
      if (token) headers.authorization = 'Bearer ' + token;
      if (admin) headers['x-admin-token'] = admin;
      const url = new URL(`http://x${pathname}${query}`);
      const res = {
        writeHead(s, h){ this._s = s; this._h = h; },
        end(data){
          let payload = data;
          try { payload = JSON.parse(data); } catch(e){}
          resolve({status: this._s || 200, body: payload});
        }
      };
      api.handle({method, headers}, res, url, body, '1.2.3.4').then(handled => {
        if (!handled) resolve({status:404, body:{error:'no route'}});
      });
    });
}

const PLACE = {id:'osm:node/7', cat:'toilets', lat:51.5, lng:-0.12,
               name:'Durable Toilets', tags:{amenity:'toilets'}};

async function main(){
  try { require.resolve('@libsql/client'); }
  catch(e){
    console.log('\nDurability\n  skipped — @libsql/client not installed (npm install)\n');
    return;
  }

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bf-durable-'));
  const url = 'file:' + path.join(dir, 'd.db').replace(/\\/g, '/');

  console.log('\nDurability (libSQL driver — the Turso code path)');

  /* ---- first run: write something a tester would care about ---- */
  let api = createAPI({file: path.join(dir, 'unused.db'), adminToken: 'test-admin', url});
  let call = caller(api);

  const me = (await call('POST', '/api/v1/register', {body:{name:'Ada'}})).body;
  await check('a review can be written', async () => {
    const r = await call('POST', '/api/v1/review', {token: me.token, body:{
      place: PLACE, stars: 5, text: 'survives a restart', localId: 'lid-durable'}});
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  });
  await api.db.close();

  /* ---- restart: a brand new API object against the same database ---- */
  api = createAPI({file: path.join(dir, 'unused.db'), adminToken: 'test-admin', url});
  call = caller(api);

  await check('the review is still there after a restart', async () => {
    const r = await call('GET', '/api/v1/place', {query: '?id=' + encodeURIComponent(PLACE.id)});
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    const reviews = r.body.community.reviews;
    assert.strictEqual(reviews.length, 1, `expected 1 review, got ${reviews.length}`);
    assert.strictEqual(reviews[0].text, 'survives a restart');
  });

  await check('the rating survives too, not just the row', async () => {
    const r = await call('GET', '/api/v1/place', {query: '?id=' + encodeURIComponent(PLACE.id)});
    assert.strictEqual(r.body.community.stats.count, 1);
    assert.strictEqual(r.body.community.stats.rating, 5);
  });

  await check('the identity token still works after a restart', async () => {
    const r = await call('POST', '/api/v1/me', {token: me.token, body:{name:'Ada L'}});
    assert.strictEqual(r.status, 200, 'token was invalidated by the restart');
  });

  /* the re-upload guard must still recognise what this device wrote, or every
     device would duplicate its reviews on the first sync after a restart */
  await check('a re-upload after a restart is still deduplicated', async () => {
    const r = await call('POST', '/api/v1/review', {token: me.token, body:{
      place: PLACE, stars: 5, text: 'survives a restart', localId: 'lid-durable'}});
    assert.strictEqual(r.body.duplicate, true, 'the same localId was accepted twice');
    assert.strictEqual(r.body.community.reviews.length, 1);
  });

  await api.db.close();
  try { fs.rmSync(dir, {recursive:true, force:true}); } catch(e){}

  console.log(`\n${ok} passed, ${failed} failed\n`);
  if (failed) process.exit(1);
}

main().catch(err => { console.error(err); process.exit(1); });
