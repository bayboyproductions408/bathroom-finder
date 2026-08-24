/* Fill the shared map cache from somewhere Overpass will actually answer.

     node tools/warm-cache.js                    warm the next batch of boxes
     node tools/warm-cache.js --list             show the boxes and exit
     node tools/warm-cache.js --limit 5          fewer boxes this run
     node tools/warm-cache.js --offset 12        start elsewhere in the list
     node tools/warm-cache.js --dry-run          fetch but do not post

   Why this exists: the backend cannot reach overpass-api.de. Render's egress
   to it fails at the network level — not a rate limit, a refusal — so the
   on-demand path can never populate the cache from production. A GitHub runner
   can reach it, so the fetching happens there and the result is posted in.

   Deliberately unhurried. Overpass is donated hardware and this is a bulk job
   with nobody waiting on it, so it takes one box at a time with a pause
   between, and gives up for the run rather than retrying hard.

   Needs API_BASE and ADMIN_TOKEN in the environment.                        */
'use strict';
const osm = require('../server/osm.js');

const API_BASE = (process.env.API_BASE || 'https://bathroom-finder.onrender.com').replace(/\/$/, '');
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';

const arg = (name, fallback) => {
  const i = process.argv.indexOf('--' + name);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const has = name => process.argv.includes('--' + name);

/* Cities to keep warm, and how far around the centre to cover. A box has to
   stay under the server's half-degree limit and under MAX_TILES, so a city is
   several boxes rather than one big one. Order matters: the top of this list
   is warmed first and most often. */
const CITIES = [
  {name:'Los Angeles',   lat: 34.0522, lng:-118.2437, rings:2},
  {name:'Encino',        lat: 34.1592, lng:-118.5010, rings:1},
  {name:'Santa Monica',  lat: 34.0195, lng:-118.4912, rings:1},
  {name:'San Francisco', lat: 37.7749, lng:-122.4194, rings:2},
  {name:'New York',      lat: 40.7580, lng: -73.9855, rings:2},
  {name:'Seattle',       lat: 47.6062, lng:-122.3321, rings:1},
  {name:'Chicago',       lat: 41.8781, lng: -87.6298, rings:1},
  {name:'Austin',        lat: 30.2672, lng: -97.7431, rings:1},
  {name:'London',        lat: 51.5074, lng:  -0.1278, rings:2}
];

/* 0.04 degrees a side: comfortably inside the server's limits, and about the
   area a person actually pans around in. */
const BOX = 0.04;

function boxesFor(city){
  const out = [];
  for (let dy = -city.rings; dy <= city.rings; dy++){
    for (let dx = -city.rings; dx <= city.rings; dx++){
      const lat = city.lat + dy * BOX, lng = city.lng + dx * BOX;
      out.push({
        city: city.name,
        s: +(lat - BOX / 2).toFixed(4), n: +(lat + BOX / 2).toFixed(4),
        w: +(lng - BOX / 2).toFixed(4), e: +(lng + BOX / 2).toFixed(4)
      });
    }
  }
  return out;
}

const ALL = CITIES.flatMap(boxesFor);

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function main(){
  if (has('list')){
    console.log(`${ALL.length} boxes across ${CITIES.length} cities:`);
    ALL.forEach((b, i) => console.log(`  ${String(i).padStart(3)}  ${b.city.padEnd(14)} ${b.s},${b.w},${b.n},${b.e}`));
    return;
  }

  const dry = has('dry-run');
  if (!dry && !ADMIN_TOKEN){
    console.error('ADMIN_TOKEN is not set — the warm endpoint will refuse this.');
    process.exit(1);
  }

  const limit = Number(arg('limit', 12));
  /* Cycle through the list across runs so a daily job eventually covers
     everything without ever asking Overpass for the whole lot at once. */
  const offset = Number(arg('offset', Math.floor(Date.now() / 86400000) * limit)) % ALL.length;

  const batch = [];
  for (let i = 0; i < Math.min(limit, ALL.length); i++) batch.push(ALL[(offset + i) % ALL.length]);

  console.log(`warming ${batch.length} of ${ALL.length} boxes (offset ${offset}) -> ${API_BASE}`);
  let okCount = 0, failCount = 0, placeCount = 0;

  for (const box of batch){
    const label = `${box.city} ${box.s},${box.w}`;
    try {
      const elements = await osm.askOverpass(box.s, box.w, box.n, box.e);
      const places = elements.map(osm.classify).filter(Boolean);
      placeCount += places.length;

      if (dry){
        console.log(`  dry  ${label.padEnd(30)} ${places.length} places`);
      } else {
        const res = await fetch(`${API_BASE}/api/v1/osm/warm`, {
          method:'POST',
          headers:{'Content-Type':'application/json', 'X-Admin-Token': ADMIN_TOKEN},
          body: JSON.stringify({s:box.s, w:box.w, n:box.n, e:box.e, places})
        });
        if (!res.ok) throw new Error(`warm endpoint said ${res.status}: ${(await res.text()).slice(0,120)}`);
        const j = await res.json();
        console.log(`  ok   ${label.padEnd(30)} ${places.length} places -> ${j.stored} stored, ${j.tiles} tiles`);
      }
      okCount++;
    } catch(err){
      failCount++;
      console.log(`  fail ${label.padEnd(30)} ${err.message}`);
    }
    /* Pace it. Nobody is waiting, and Overpass is a donation. */
    await sleep(4000);
  }

  console.log(`\n${okCount} ok, ${failCount} failed, ${placeCount} places seen`);
  /* A partial run is a good run — some boxes warmed beats none, and failing
     the job would only send a red email about a cache that is still fine. */
  if (okCount === 0 && batch.length > 0){
    console.error('nothing warmed at all — is Overpass reachable from here?');
    process.exit(1);
  }
}
main().catch(e => { console.error(e); process.exit(1); });
