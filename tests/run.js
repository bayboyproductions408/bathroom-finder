/* Headless tests for the pure logic.  Run:  node tests/run.js
   Exits non-zero on failure so it can gate a release.                    */
const L = require('../app/lib.js');

let pass = 0, fail = 0;
const results = [];
function ok(group, name, cond, detail){
  results.push({group, name, cond: !!cond, detail: detail || ''});
  cond ? pass++ : fail++;
}
const eq = (group, name, got, want) =>
  ok(group, name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, wanted ${JSON.stringify(want)}`);

/* fixed clock: Wednesday 2026-08-19, 14:30 local */
const WED_1430 = new Date(2026, 7, 19, 14, 30);
const WED_0300 = new Date(2026, 7, 19, 3, 0);
const SAT_1100 = new Date(2026, 7, 22, 11, 0);
const SUN_1900 = new Date(2026, 7, 23, 19, 0);

/* ---------- opening hours ---------- */
const H = (spec, when) => L.parseHours(spec, when).state;
ok('Opening hours', '24/7 is always open',            H('24/7', WED_0300) === 'open');
ok('Opening hours', 'inside a weekday window',        H('Mo-Fr 08:00-18:00', WED_1430) === 'open');
ok('Opening hours', 'before a weekday window',        H('Mo-Fr 16:00-18:00', WED_1430) === 'closed');
ok('Opening hours', 'after a weekday window',         H('Mo-Fr 08:00-12:00', WED_1430) === 'closed');
ok('Opening hours', 'weekday rule does not apply Sat',H('Mo-Fr 08:00-18:00', SAT_1100) === 'closed');
ok('Opening hours', 'Saturday rule applies',          H('Mo-Fr 08:00-18:00; Sa 09:00-13:00', SAT_1100) === 'open');
ok('Opening hours', 'explicit day off',               H('Mo-Su 09:00-17:00; We off', WED_1430) === 'closed');
ok('Opening hours', 'split lunch break — during',     H('Mo-Fr 08:00-12:00,13:00-17:00', WED_1430) === 'open');
ok('Opening hours', 'split lunch break — in the gap',
   L.parseHours('Mo-Fr 08:00-12:00,13:00-17:00', new Date(2026,7,19,12,30)).state === 'closed');
ok('Opening hours', 'comma day list',                 H('Tu,We,Th 09:00-17:00', WED_1430) === 'open');
ok('Opening hours', 'overnight window, after midnight',H('Mo-Su 22:00-02:00', WED_0300) === 'closed');
ok('Opening hours', 'overnight window, inside it',
   L.parseHours('Mo-Su 22:00-02:00', new Date(2026,7,19,1,0)).state === 'open');
ok('Opening hours', 'no day part means every day',    H('10:00-20:00', SUN_1900) === 'open');
ok('Opening hours', 'wraparound day range Sa-Su',     H('Sa-Su 10:00-20:00', SUN_1900) === 'open');
ok('Opening hours', 'garbage is unknown, never open', H('when the caretaker feels like it', WED_1430) === 'unknown');
ok('Opening hours', 'empty is unknown',               H('', WED_1430) === 'unknown');
ok('Opening hours', 'sunrise-sunset is unknown',      H('sunrise-sunset', WED_1430) === 'unknown');
ok('Opening hours', 'public holiday clause ignored',  H('Mo-Fr 08:00-18:00; PH off', WED_1430) === 'open');
eq('Opening hours', 'reports the closing time',       L.parseHours('Mo-Fr 08:00-18:00', WED_1430).until, '18:00');

/* ---------- freshness ---------- */
const now = Date.UTC(2026, 7, 19, 12, 0);
const day = 86400000;
eq('Freshness', 'no data at all',
   L.freshness({tags:{}}, {}, now).level, 'unverified');
eq('Freshness', 'confirmed an hour ago',
   L.freshness({tags:{}}, {confirms:[{at: now - 3600000}]}, now).level, 'fresh');
eq('Freshness', 'confirmed three weeks ago',
   L.freshness({tags:{}}, {confirms:[{at: now - 21*day}]}, now).level, 'ageing');
eq('Freshness', 'confirmed six months ago',
   L.freshness({tags:{}}, {confirms:[{at: now - 180*day}]}, now).level, 'stale');
eq('Freshness', 'two reports mark it disputed',
   L.freshness({tags:{}}, {reports:[{}, {}]}, now).level, 'disputed');
eq('Freshness', 'falls back to the OSM check_date',
   L.freshness({tags:{check_date:'2026-06-01'}}, {}, now).level, 'ageing');

/* ---------- trust ---------- */
const trustBare  = L.trustScore({tags:{}}, {}, now);
const trustGood  = L.trustScore({tags:{name:'X', opening_hours:'24/7', wheelchair:'yes'}},
                                {reviews:[{stars:5, photos:['a']}], confirms:[{at:now}]}, now);
const trustBad   = L.trustScore({tags:{name:'X'}}, {reports:[{}, {}]}, now);
ok('Trust', 'a reviewed, confirmed listing beats a bare import', trustGood > trustBare, `${trustGood} > ${trustBare}`);
ok('Trust', 'reported listings sink',                            trustBad < trustBare, `${trustBad} < ${trustBare}`);
ok('Trust', 'never negative',                                    trustBad >= 0, `${trustBad}`);

/* ---------- distance ---------- */
const london = {lat:51.5074, lng:-0.1278}, paris = {lat:48.8566, lng:2.3522};
const d = L.haversine(london, paris);
ok('Distance', 'London to Paris is about 344 km', Math.abs(d - 343500) < 4000, `${Math.round(d/1000)} km`);
ok('Distance', 'same point is zero', L.haversine(london, london) === 0);
eq('Distance', 'metres under 1 km', L.fmtDist(420), '420 m');
eq('Distance', 'km over 1 km', L.fmtDist(4200), '4.2 km');
eq('Distance', 'imperial feet', L.fmtDist(120, false), '394 ft');
eq('Distance', 'walk time rounds up', L.walkMin(80), 1);

/* ---------- clustering ---------- */
const pts = [];
for (let i = 0; i < 40; i++) pts.push({lat:51.5074 + i*0.00002, lng:-0.1278 + i*0.00002, score:i});
const far = {lat:51.6, lng:-0.2, score:99};
const clustered = L.cluster(pts.concat([far]), 14);
ok('Clustering', 'dense points collapse', clustered.length < 10, `${clustered.length} markers for 41 points`);
ok('Clustering', 'the distant point stays separate',
   clustered.some(c => c.type === 'point' && c.item.score === 99));
ok('Clustering', 'every point is accounted for',
   clustered.reduce((a,c) => a + (c.type === 'cluster' ? c.count : 1), 0) === 41);
ok('Clustering', 'a cluster leads with its best-scoring pin',
   clustered.filter(c => c.type === 'cluster').every(c => c.lead.score === Math.max(...c.items.map(i=>i.score))));
ok('Clustering', 'zooming in splits clusters apart',
   L.cluster(pts, 20).length > L.cluster(pts, 14).length);

/* ---------- search ranking ---------- */
const feat = n => ({name:n, sub:'Cafe'});
ok('Search', 'exact name wins',      L.scoreMatch(feat('Bell & Bean'), 'bell & bean') === 100);
ok('Search', 'prefix beats contains',
   L.scoreMatch(feat('Bell & Bean'), 'bell') > L.scoreMatch(feat('The Bell'), 'bell'));
ok('Search', 'category matches too',  L.scoreMatch(feat('Nowhere'), 'cafe') > 0);
ok('Search', 'nonsense scores zero',  L.scoreMatch(feat('Bell & Bean'), 'zzzz') === 0);

/* ---------- service worker routing ----------
   Service workers cannot be registered in the embedded preview browser, so
   the routing rules are asserted here instead: run sw.js in a sandbox with a
   stub `self` and check what it would cache.                              */
const vm = require('vm'), fs = require('fs'), path = require('path');
{
  const listeners = {};
  const sandbox = {
    self: {addEventListener:(k,fn)=>{ listeners[k] = fn; }, skipWaiting(){}, clients:{claim(){}}},
    caches:{open:async()=>({match:async()=>null, put(){}, keys:async()=>[], delete(){}}), keys:async()=>[]},
    fetch:async()=>({ok:true, clone(){return this;}}),
    location:{origin:'http://localhost:8080'},
    Response:function(){}, Request:function(){}, URL,
    console
  };
  sandbox.self.location = sandbox.location;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname,'..','app','sw.js'),'utf8'), sandbox);
  const R = sandbox.self.__routing;

  ok('Service worker', 'registers install, activate, fetch and message handlers',
     ['install','activate','fetch','message'].every(k => typeof listeners[k] === 'function'));
  ok('Service worker', 'map tiles are cached',
     R.isTile('https://basemaps.cartocdn.com/light_all/16/32/21.png'));
  ok('Service worker', 'moderation models are cached',
     R.isModel('https://cdn.jsdelivr.net/npm/nsfwjs@4.4.0/dist/browser/nsfwjs.min.js'));
  ok('Service worker', 'payment calls are NEVER cached',
     R.isAPI('http://localhost:8080/api/pay/authorize') && !R.isTile('http://localhost:8080/api/pay/authorize'));
  ok('Service worker', 'live OSM queries are never cached',
     R.isAPI('https://overpass-api.de/api/interpreter') && R.isAPI('https://nominatim.openstreetmap.org/search?q=x'));
  ok('Service worker', 'the app shell itself is not treated as API',
     !R.isAPI('http://localhost:8080/app.js') && !R.isTile('http://localhost:8080/app.js'));
  ok('Service worker', 'shell list covers every local script the page loads',
     ['./app.js','./lib.js','./moderation.js','./rentals.js','./styles.css','./index.html']
       .every(f => R.SHELL_FILES.includes(f)),
     R.SHELL_FILES.join(' '));
  ok('Service worker', 'has a version to roll updates from', /^v\d+\.\d+\.\d+$/.test(R.APP_VERSION), R.APP_VERSION);
}

/* ---------- the page loads everything it needs ---------- */
{
  const html = fs.readFileSync(path.join(__dirname,'..','app','index.html'),'utf8');
  for (const f of ['lib.js','moderation.js','rentals.js','app.js'])
    ok('Page wiring', `index.html loads ${f}`, html.includes(`src="${f}"`));
  ok('Page wiring', 'manifest is linked', html.includes('manifest.webmanifest'));
  const mf = JSON.parse(fs.readFileSync(path.join(__dirname,'..','app','manifest.webmanifest'),'utf8'));
  ok('Page wiring', 'manifest icons exist on disk',
     mf.icons.every(i => fs.existsSync(path.join(__dirname,'..','app',i.src))),
     mf.icons.map(i=>i.src).join(' '));
}

/* ---------- report ---------- */
const groups = [...new Set(results.map(r => r.group))];
for (const g of groups){
  console.log('\n' + g);
  for (const r of results.filter(x => x.group === g))
    console.log(`  ${r.cond ? 'ok  ' : 'FAIL'} ${r.name}${r.cond ? '' : '  — ' + r.detail}`);
}
console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
