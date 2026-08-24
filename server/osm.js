/* =====================================================================
   OpenStreetMap places, fetched once and shared.

   Every client used to ask Overpass directly from the browser. Overpass is
   run by volunteers on donated hardware and rate-limits hard — during
   development it returned 504 twice in ten minutes for a single developer.
   With real users that becomes a map that half-loads, and a lot of traffic
   pointed at someone else's donation.

   So the server asks once and everyone shares the answer. A city block that
   a hundred people look at costs one Overpass query instead of a hundred.

   Cached by tile rather than by viewport, because no two viewports are ever
   the same rectangle but they overlap constantly. A tile is a fixed grid
   square, so overlapping views hit the same cache entries.
   ===================================================================== */
'use strict';

/* ~2.2km at the equator. Big enough that a phone-sized view is one to four
   tiles, small enough that a single Overpass query stays quick. */
const TILE = 0.02;
/* OSM changes slowly and a stale shop is far better than no map at all. */
const TTL_MS = 30 * 24 * 60 * 60 * 1000;
/* An empty answer is not trusted for anything like as long. Upstream can
   return "200, zero elements" for reasons that have nothing to do with the
   place being empty — a timeout swallowed server-side, or a mirror that only
   holds one country. Caching that for a month turns a transient hiccup into a
   neighbourhood that stays blank. A day is long enough to stop hammering a
   genuinely quiet area and short enough to self-heal. */
const EMPTY_TTL_MS = 24 * 60 * 60 * 1000;
/* A zoomed-out request could otherwise ask for hundreds of tiles at once. */
const MAX_TILES = 24;

/* Only general-purpose instances belong here, and each one was probed rather
   than assumed. kumi.systems, private.coffee and osm.jp all refused the
   connection outright from this network.

   overpass.osm.ch is deliberately absent despite answering HTTP 200: it is a
   Switzerland-only instance, so a Seattle query returns 200 with zero
   elements. A regional mirror in a fallback list is worse than no fallback,
   because "success, nothing here" is indistinguishable from an empty
   neighbourhood and gets cached as fact. */
const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter'
];

const tileKey = (lat, lng) =>
  `${Math.floor(lat / TILE)}_${Math.floor(lng / TILE)}`;

function tilesFor(s, w, n, e){
  const out = [];
  for (let y = Math.floor(s / TILE); y <= Math.floor(n / TILE); y++){
    for (let x = Math.floor(w / TILE); x <= Math.floor(e / TILE); x++){
      out.push(`${y}_${x}`);
      if (out.length > MAX_TILES) return out;
    }
  }
  return out;
}

/* The same shape the client's fromOSM produces, so the app does not care
   which side classified it. Kept deliberately close to app.js — if one
   changes the other should too. */
function classify(e){
  const lat = e.lat != null ? e.lat : e.center && e.center.lat;
  const lng = e.lon != null ? e.lon : e.center && e.center.lon;
  if (lat == null || lng == null) return null;
  const t = e.tags || {};
  let cat = null;
  if (t.amenity === 'toilets') cat = 'toilets';
  else if (['restaurant','cafe','fast_food','bar','pub','biergarten','food_court','ice_cream']
             .includes(t.amenity)) cat = 'food';
  else if (['hotel','hostel','guest_house','motel','camp_site','caravan_site'].includes(t.tourism)) cat = 'lodging';
  else if (t.amenity === 'fuel' || t.amenity === 'charging_station') cat = 'fuel';
  else if (['pharmacy','hospital','clinic','doctors','dentist','veterinary'].includes(t.amenity)
             || t.healthcare) cat = 'health';
  else if (['cinema','theatre','nightclub','casino','arts_centre'].includes(t.amenity)
             || ['museum','gallery','attraction','theme_park','zoo','aquarium'].includes(t.tourism)
             || t.leisure) cat = 'leisure';
  else if (['library','community_centre','townhall','post_office','marketplace','bank',
            'college','university','place_of_worship','social_facility','childcare',
            'police','fire_station'].includes(t.amenity)
             || t.tourism === 'information' || t.office) cat = 'civic';
  else if (t.shop) cat = 'shop';
  else if (t.name) cat = 'shop';
  if (!cat) return null;

  const kind = (t.amenity === 'toilets' ? 'Public toilets'
    : (t.shop || t.amenity || t.tourism || t.leisure || t.office || t.healthcare || 'Business'))
      .replace(/_/g, ' ');
  const title = kind.replace(/^./, c => c.toUpperCase());
  return {
    id: `osm:${e.type}/${e.id}`,
    cat, lat, lng,
    name: t.name || (cat === 'toilets' ? 'Public toilets' : title),
    sub: title,
    tags: t
  };
}

function buildQuery(s, w, n, e){
  const bbox = `(${s.toFixed(5)},${w.toFixed(5)},${n.toFixed(5)},${e.toFixed(5)})`;
  return `[out:json][timeout:40];` +
    `(nwr["amenity"="toilets"]${bbox};)->.t;.t out center 400;` +
    `(nwr["shop"]["name"]${bbox};` +
    ` nwr["office"]["name"]${bbox};` +
    ` nwr["healthcare"]["name"]${bbox};` +
    ` nwr["amenity"~"^(restaurant|cafe|fast_food|bar|pub|biergarten|food_court|ice_cream|fuel|` +
    `charging_station|library|community_centre|townhall|post_office|marketplace|pharmacy|bank|` +
    `cinema|theatre|nightclub|casino|arts_centre|hospital|clinic|doctors|dentist|veterinary|` +
    `college|university|place_of_worship|social_facility|childcare|police|fire_station)$"]["name"]${bbox};` +
    ` nwr["tourism"~"^(hotel|hostel|guest_house|motel|museum|gallery|attraction|theme_park|zoo|` +
    `aquarium|information|camp_site|caravan_site)$"]["name"]${bbox};` +
    ` nwr["leisure"~"^(fitness_centre|sports_centre|swimming_pool|bowling_alley|golf_course|` +
    `water_park|stadium|ice_rink|dance|adult_gaming_centre)$"]["name"]${bbox};` +
    `)->.v;.v out center 900;`;
}

async function askOverpass(s, w, n, e, fetchImpl = fetch){
  let lastErr = null;
  for (const url of ENDPOINTS){
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 45000);
    try {
      const res = await fetchImpl(url, {
        method: 'POST',
        body: 'data=' + encodeURIComponent(buildQuery(s, w, n, e)),
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          /* Overpass answers 406 to a request with no User-Agent, and asks
             that automated clients identify themselves. */
          'User-Agent': 'BathroomFinder/1.0 (+https://bayboyproductions408.github.io/bathroom-finder/)'
        },
        signal: ctrl.signal
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const j = await res.json();
      return j.elements || [];
    } catch(err){
      lastErr = err;
      console.warn('overpass failed:', url, err.message);
    } finally { clearTimeout(timer); }
  }
  throw lastErr || new Error('overpass unavailable');
}

/* Write classified places into the cache and mark the tiles as fetched.

   Shared by the live path and by the cache warmer, so a place stored ahead of
   time is byte-identical to one stored on demand. Takes already-classified
   places (nulls tolerated) rather than raw elements, so the warmer can run the
   same classify() in its own process and post something compact. */
async function storePlaces(q, {s, w, n, e}, places, nowMs = Date.now()){
  const seen = new Set();
  const rows = [];
  for (const p of places){
    if (!p || !p.id || seen.has(p.id)) continue;
    if (typeof p.lat !== 'number' || typeof p.lng !== 'number') continue;
    seen.add(p.id);
    rows.push([p.id, tileKey(p.lat, p.lng), p.cat || 'shop', p.lat, p.lng,
               String(p.name || 'Business').slice(0, 200),
               String(p.sub || '').slice(0, 120),
               JSON.stringify(p.tags || {}), nowMs]);
  }
  /* Chunked rather than one row at a time: against a networked database each
     statement is a round trip, and 400 of them is slower than the Overpass
     query that produced them. 100 keeps the parameter count well inside
     SQLite's limit. */
  if (q.poiPutMany){
    for (let i = 0; i < rows.length; i += 100) await q.poiPutMany(rows.slice(i, i + 100));
  } else {
    for (const r of rows) await q.poiPut.run(...r);
  }
  /* Mark every tile in the box fetched, including ones that came back empty.
     Without that, a quiet suburb is re-queried on every pan. */
  const tiles = tilesFor(s, w, n, e);
  for (const t of tiles) await q.tilePut.run(t, nowMs, seen.size);
  return {stored: rows.length, tiles: tiles.length};
}

/* Returns {places, cached, fetchedTiles, stale}.
   Never throws for an Overpass failure — a stale or partial map beats none,
   and the caller has no better answer to give the user. */
async function placesIn(q, {s, w, n, e}, opts = {}){
  const fetchImpl = opts.fetch || fetch;
  const nowMs = opts.now || Date.now();
  const tiles = tilesFor(s, w, n, e);
  const fresh = new Set();

  for (const t of tiles){
    const row = await q.tileGet.get(t);
    if (!row) continue;
    const ttl = row.count > 0 ? TTL_MS : EMPTY_TTL_MS;
    if ((nowMs - row.fetched) < ttl) fresh.add(t);
  }

  let fetchedTiles = 0, stale = false;
  if (fresh.size < tiles.length){
    try {
      const elements = await askOverpass(s, w, n, e, fetchImpl);
      const stored = await storePlaces(q, {s, w, n, e}, elements.map(classify), nowMs);
      fetchedTiles = tiles.length - fresh.size;
      void stored;
    } catch(err){
      /* Serve whatever is cached. Saying so lets the client tell the user the
         difference between "nothing here" and "could not reach the source". */
      stale = true;
      console.warn('overpass unavailable, serving cache:', err.message);
    }
  }

  /* Centre of the viewport, and how much to discount longitude at this
     latitude, so the LIMIT above trims the farthest places rather than
     whichever ones happen to sort first. */
  const cLat = (s + n) / 2, cLng = (w + e) / 2;
  const kx = Math.cos(cLat * Math.PI / 180) ** 2;
  const rows = await q.poisIn.all(
    Math.min(s,n), Math.max(s,n), Math.min(w,e), Math.max(w,e),
    cLat, cLat, cLng, cLng, kx);
  return {
    places: rows.map(r => ({
      id: r.id, source: 'osm', cat: r.cat, lat: r.lat, lng: r.lng,
      name: r.name, sub: r.sub, tags: JSON.parse(r.tags || '{}')
    })),
    cached: fresh.size,
    tiles: tiles.length,
    fetchedTiles,
    stale
  };
}

module.exports = { placesIn, storePlaces, classify, tilesFor, tileKey, buildQuery,
                   askOverpass, TILE, TTL_MS, EMPTY_TTL_MS, MAX_TILES };
