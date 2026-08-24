/* The OSM cache is the thing standing between our users and a volunteer-run
   free service. These check the parts that decide how often we call it.

   Run: node --test tests/osm.test.js                                       */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const osm = require('../server/osm.js');
const { openLocal } = require('../server/db.js');

/* --- a stand-in Overpass that counts how often it is asked --------------- */
function fakeOverpass(elements){
  const calls = [];
  const impl = async (url, opts) => {
    calls.push({url, body: opts.body});
    return {ok:true, status:200, json: async () => ({elements})};
  };
  impl.calls = calls;
  return impl;
}

const ELEMENTS = [
  {type:'node', id:1, lat:47.6090, lon:-122.3400, tags:{amenity:'toilets'}},
  {type:'node', id:2, lat:47.6092, lon:-122.3402, tags:{shop:'hardware', name:'Ace Hardware'}},
  {type:'node', id:3, lat:47.6094, lon:-122.3404, tags:{amenity:'pharmacy', name:'Walgreens'}},
  {type:'node', id:4, lat:47.6096, lon:-122.3406, tags:{amenity:'bench'}}   /* unnamed: dropped */
];

async function freshDb(){
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bf-osm-'));
  const db = openLocal(path.join(dir, 'osm.db'));
  await db.exec(`
    CREATE TABLE pois(id TEXT PRIMARY KEY, tile TEXT NOT NULL, cat TEXT NOT NULL,
      lat REAL NOT NULL, lng REAL NOT NULL, name TEXT NOT NULL, sub TEXT,
      tags TEXT NOT NULL DEFAULT '{}', fetched INTEGER NOT NULL);
    CREATE TABLE tiles_fetched(tile TEXT PRIMARY KEY, fetched INTEGER NOT NULL,
      count INTEGER NOT NULL DEFAULT 0);`);
  const q = {
    poiPut:  db.prepare(`INSERT INTO pois(id, tile, cat, lat, lng, name, sub, tags, fetched)
                         VALUES (?,?,?,?,?,?,?,?,?)
                         ON CONFLICT(id) DO UPDATE SET name=excluded.name, sub=excluded.sub,
                           cat=excluded.cat, lat=excluded.lat, lng=excluded.lng,
                           tile=excluded.tile, tags=excluded.tags, fetched=excluded.fetched`),
    poisIn:  db.prepare(`SELECT * FROM pois WHERE lat BETWEEN ? AND ? AND lng BETWEEN ? AND ? LIMIT 900`),
    tileGet: db.prepare('SELECT * FROM tiles_fetched WHERE tile = ?'),
    tilePut: db.prepare(`INSERT INTO tiles_fetched(tile, fetched, count) VALUES (?,?,?)
                         ON CONFLICT(tile) DO UPDATE SET fetched=excluded.fetched, count=excluded.count`)
  };
  return {db, q, dir};
}

const BOX = {s:47.6075, w:-122.3430, n:47.6125, e:-122.3350};

test('first request asks Overpass and stores what came back', async () => {
  const {q} = await freshDb();
  const fake = fakeOverpass(ELEMENTS);
  const r = await osm.placesIn(q, BOX, {fetch: fake});
  assert.strictEqual(fake.calls.length, 1, 'should have asked Overpass once');
  assert.strictEqual(r.places.length, 3, 'the unnamed bench should be dropped');
  assert.ok(r.places.some(p => p.name === 'Ace Hardware'));
  assert.ok(r.places.some(p => p.cat === 'health'));
});

test('THE POINT: a second request for the same area does not ask again', async () => {
  const {q} = await freshDb();
  const fake = fakeOverpass(ELEMENTS);
  await osm.placesIn(q, BOX, {fetch: fake});
  const second = await osm.placesIn(q, BOX, {fetch: fake});
  assert.strictEqual(fake.calls.length, 1, 'second view must be served from cache');
  assert.strictEqual(second.places.length, 3);
  assert.strictEqual(second.fetchedTiles, 0);
});

test('an overlapping viewport reuses the same tiles', async () => {
  const {q} = await freshDb();
  const fake = fakeOverpass(ELEMENTS);
  await osm.placesIn(q, BOX, {fetch: fake});
  /* nudged a little, as a pan would */
  await osm.placesIn(q, {s:47.6080, w:-122.3425, n:47.6120, e:-122.3355}, {fetch: fake});
  assert.strictEqual(fake.calls.length, 1, 'a small pan should not re-query');
});

test('a stale tile is refetched once the TTL passes', async () => {
  const {q} = await freshDb();
  const fake = fakeOverpass(ELEMENTS);
  const t0 = Date.now();
  await osm.placesIn(q, BOX, {fetch: fake, now: t0});
  await osm.placesIn(q, BOX, {fetch: fake, now: t0 + osm.TTL_MS + 1000});
  assert.strictEqual(fake.calls.length, 2, 'expired cache should refresh');
});

test('an empty area is remembered, so quiet places are not re-queried forever', async () => {
  const {q} = await freshDb();
  const fake = fakeOverpass([]);
  await osm.placesIn(q, BOX, {fetch: fake});
  const second = await osm.placesIn(q, BOX, {fetch: fake});
  assert.strictEqual(fake.calls.length, 1, 'empty must still count as fetched');
  assert.strictEqual(second.places.length, 0);
});

test('SAFETY: when Overpass is down, serve the cache and say so', async () => {
  const {q} = await freshDb();
  const ok = fakeOverpass(ELEMENTS);
  await osm.placesIn(q, BOX, {fetch: ok});

  const dead = async () => { throw new Error('504'); };
  /* force the cache to look stale so it tries upstream and fails */
  const later = Date.now() + osm.TTL_MS + 1000;
  const r = await osm.placesIn(q, BOX, {fetch: dead, now: later});

  assert.strictEqual(r.stale, true, 'must admit the data is stale');
  assert.strictEqual(r.places.length, 3, 'a stale map beats a blank one');
});

test('a first-ever request with Overpass down fails soft, not loud', async () => {
  const {q} = await freshDb();
  const dead = async () => { throw new Error('timeout'); };
  const r = await osm.placesIn(q, BOX, {fetch: dead});
  assert.strictEqual(r.stale, true);
  assert.deepStrictEqual(r.places, [], 'nothing cached yet, but no exception');
});

test('a huge viewport cannot ask for unbounded tiles', () => {
  const many = osm.tilesFor(-40, -70, 40, 70);
  assert.ok(many.length <= osm.MAX_TILES + 1, `capped, got ${many.length}`);
});

test('tiles are stable, so overlapping views share cache keys', () => {
  /* Two points inside one tile must key the same. Note -122.3400 is exactly a
     tile boundary at this grid size, so pick points that are plainly inside
     one — an off-by-one here would silently halve the cache hit rate. */
  assert.strictEqual(osm.tileKey(47.6090, -122.3410), osm.tileKey(47.6099, -122.3490));
  /* and a point a couple of kilometres away must not */
  assert.notStrictEqual(osm.tileKey(47.6090, -122.3410), osm.tileKey(47.6290, -122.3410));
});

test('the query Overpass receives asks for named businesses, not just toilets', () => {
  const qy = osm.buildQuery(47.60, -122.34, 47.61, -122.33);
  assert.ok(qy.includes('"amenity"="toilets"'), 'toilets still fetched separately');
  assert.ok(qy.includes('nwr["shop"]["name"]'), 'all named shops');
  assert.ok(qy.includes('healthcare'), 'healthcare included');
  assert.ok(/\["name"\]/.test(qy), 'name filter is what keeps this affordable');
});

test('an empty answer is distrusted quickly, a full one is kept', async () => {
  const {q} = await freshDb();
  const empty = fakeOverpass([]);
  const t0 = Date.now();
  await osm.placesIn(q, BOX, {fetch: empty, now: t0});

  /* Still cached an hour later — a genuinely quiet area must not be hammered */
  await osm.placesIn(q, BOX, {fetch: empty, now: t0 + 60 * 60 * 1000});
  assert.strictEqual(empty.calls.length, 1, 'quiet areas should not be re-queried constantly');

  /* But re-checked the next day, because "200, zero elements" is exactly what
     a swallowed upstream timeout looks like — and what a region-limited mirror
     returns for the wrong continent. Trusting that for a month would leave a
     real neighbourhood permanently blank. */
  await osm.placesIn(q, BOX, {fetch: empty, now: t0 + osm.EMPTY_TTL_MS + 1000});
  assert.strictEqual(empty.calls.length, 2, 'an empty result must expire within a day');

  /* A result with actual places is trusted for the long TTL */
  const full = fakeOverpass(ELEMENTS);
  const t1 = t0 + osm.EMPTY_TTL_MS + 2000;
  await osm.placesIn(q, BOX, {fetch: full, now: t1});
  await osm.placesIn(q, BOX, {fetch: full, now: t1 + osm.EMPTY_TTL_MS + 1000});
  assert.strictEqual(full.calls.length, 1, 'a populated tile keeps the long TTL');
});
