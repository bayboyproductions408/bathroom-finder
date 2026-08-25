/* =====================================================================
   Bathroom Finder — real map build
   Map tiles: CARTO basemaps (OpenStreetMap data)
   Bathrooms & venues: OpenStreetMap via the Overpass API
   Place search: OpenStreetMap Nominatim
   Reviews, photos, saves, listings: this device (localStorage) — no backend yet
   ===================================================================== */
'use strict';

/* ---------- what ships in 1.0 ----------
   Two features are built and working as prototypes, and both take a payment
   that is not connected to anything. Renting shows simulated cards ("Visa
   ****4242"), says "payment held" and "Payment taken", and moves no money.
   Plus grants itself by writing localStorage and its own button read "Turn
   Plus off (test build)".

   App Review rejects demos, betas and placeholder functionality under
   Guideline 2.1, and a fake card-payment screen is the clearest example of
   it there is. Neither is deleted — the code and its tests stay exactly
   where they are. The doors are shut until the billing behind them is real,
   which is a one-line change here.                                        */
const FEATURES = { rentals: false, plus: false };
/* ads.js loads before this file, so it cannot see the const directly. It
   only reads the flag at render time, by which point this has run. */
window.BF_FEATURES = FEATURES;

/* ---------- icons ---------- */
const I = {
  star:f=>`<svg viewBox="0 0 24 24" width="14" height="14" fill="${f?'currentColor':'none'}" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="m12 3.8 2.5 5.1 5.6.8-4.05 3.95.96 5.6L12 16.6l-5.01 2.65.96-5.6L3.9 9.7l5.6-.8L12 3.8Z"/></svg>`,
  starN:(f,s)=>`<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="${f?'currentColor':'none'}" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="m12 3.8 2.5 5.1 5.6.8-4.05 3.95.96 5.6L12 16.6l-5.01 2.65.96-5.6L3.9 9.7l5.6-.8L12 3.8Z"/></svg>`,
  check:`<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="m4 12.5 5.2 5.2L20 6.5"/></svg>`,
  x:`<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>`,
  back:`<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5 8 12l7 7"/></svg>`,
  nav:`<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 11 18-8-8 18-2.2-7.8L3 11Z"/></svg>`,
  camera:`<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h3l1.6-2.4h6.8L17 8h3v12H4V8Z"/><circle cx="12" cy="13.4" r="3.6"/></svg>`,
  pen:`<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L20 8l-4-4L4 16v4Z"/><path d="m14.5 5.5 4 4"/></svg>`,
  flag:`<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 21V4M5 4h12l-2.2 3.5L17 11H5"/></svg>`,
  clock:`<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>`,
  coin:`<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/><path d="M14.4 9.2A2.6 2.6 0 0 0 12 8c-1.4 0-2.5.9-2.5 2s1.1 2 2.5 2 2.5.9 2.5 2-1.1 2-2.5 2a2.6 2.6 0 0 1-2.4-1.2M12 6.4v11.2"/></svg>`,
  wheelchair:`<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="3.8" r="1.8"/><path d="M11 7v6h5l2.5 6"/><path d="M15.6 14.4A5.6 5.6 0 1 1 8 10.2"/></svg>`,
  baby:`<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="7.5" r="3.8"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0"/></svg>`,
  gender:`<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="13" r="4.6"/><path d="M12 8.4V2.6M9.4 4.6h5.2"/></svg>`,
  lock:`<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4.5" y="10.5" width="15" height="9.5" rx="2.4"/><path d="M8 10.5V7.6a4 4 0 0 1 8 0v2.9"/></svg>`,
  unlock:`<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4.5" y="10.5" width="15" height="9.5" rx="2.4"/><path d="M8 10.5V7.6a4 4 0 0 1 7.4-2.1"/></svg>`,
  home:`<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 11.2 12 4.5l8 6.7"/><path d="M6.4 10.2V19h11.2v-8.8"/></svg>`,
  people:`<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.2"/><path d="M3 19a6 6 0 0 1 12 0"/><path d="M16 5.4a3.2 3.2 0 0 1 0 5.2M17.6 19a6 6 0 0 0-2-4.5"/></svg>`,
  sparkle:`<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5 13.9 9l5.6 2-5.6 2-1.9 5.5L10.1 13 4.5 11l5.6-2L12 3.5Z"/></svg>`,
  info:`<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8h.01"/></svg>`,
  shield:`<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5 5 6.2v5.3c0 4.3 2.9 7.5 7 9 4.1-1.5 7-4.7 7-9V6.2L12 3.5Z"/></svg>`,
  plus:`<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>`,
  share:`<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M12 3 8 7M12 3l4 4"/><path d="M6 12H4.5v8h15v-8H18"/></svg>`,
  card:`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="5" width="19" height="14" rx="2.6"/><path d="M2.5 9.6h19"/></svg>`,
  bubbleAlt:`<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 15a3 3 0 0 1-3 3H9l-4.5 3.2V7a3 3 0 0 1 3-3h9.5a3 3 0 0 1 3 3v8Z"/></svg>`,
  eye:`<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="3.2"/></svg>`
};

/* ---------- categories ---------- */
const CATS = {
  toilets: {label:'Public toilets', color:'var(--open)',  icon:I.unlock},
  food:    {label:'Food & drink',   color:'var(--code)',  icon:I.people},
  lodging: {label:'Hotels',         color:'var(--ask)',   icon:I.home},
  shop:    {label:'Shops',          color:'#7C6BB5',      icon:I.people},
  health:  {label:'Health',         color:'#C0455F',      icon:I.shield},
  leisure: {label:'Things to do',   color:'#2F7CB8',      icon:I.sparkle},
  fuel:    {label:'Gas stations',   color:'#C2591F',      icon:I.nav},
  civic:   {label:'Civic',          color:'#3F8F8A',      icon:I.shield},
  host:    {label:'Rentable',       color:'var(--host)',  icon:I.home}
};
const ATTRS = {
  open:   {label:'Open now',       test:f=>openState(f).state === 'open'},
  free:   {label:'Free',           test:f=>f.tags.fee === 'no' || f.tags.fee === undefined && f.cat === 'toilets'},
  wheel:  {label:'Step-free',      test:f=>f.tags.wheelchair === 'yes'},
  baby:   {label:'Baby changing',  test:f=>f.tags.changing_table === 'yes'},
  neutral:{label:'Gender neutral', test:f=>f.tags.unisex === 'yes' || f.tags['toilets:unisex'] === 'yes'},
  rated:  {label:'Reviewed',       test:f=>(community(f.id).reviews || []).length > 0}
};
/* hours come from OSM, but a community correction overrides them */
function openState(f){
  const c = community(f.id);
  const spec = c.hours || (f.tags && f.tags.opening_hours) || f.hours;
  return parseHours(spec);
}

/* ---------- tiny helpers ---------- */
const el = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[<>&"]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c]));
const AV = ['#0F7B72','#B8770B','#3A6EA5','#8A4FA8','#B23A2E','#1B8A4B','#C2591F','#4A5FA8'];
const avColor = s => AV[[...String(s)].reduce((a,c)=>a+c.charCodeAt(0),0) % AV.length];
const initials = n => String(n).trim().split(/\s+/).map(w=>w[0]).slice(0,2).join('').toUpperCase();
/* haversine, walkMin, parseHours, freshness, trustScore, cluster and
   scoreMatch all come from lib.js, which the node test runner also loads */
/* haversine, fmtDist, walkMin, parseHours, freshness, trustScore, cluster and
   scoreMatch all come from lib.js, which the node test runner also loads.
   showDist applies the user's metric/imperial choice on top of fmtDist.   */
const showDist = m => fmtDist(m, store.profile.units !== 'imperial');
function timeAgo(ts){
  const s = (Date.now()-ts)/1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s/60)} min ago`;
  if (s < 86400) return `${Math.floor(s/3600)} h ago`;
  return `${Math.floor(s/86400)} d ago`;
}
function starsHTML(v, size){
  let out = `<span class="stars" aria-label="${v} out of 5">`;
  for (let i=1;i<=5;i++)
    out += `<span style="color:${v >= i-0.25 ? 'var(--star)' : 'var(--line)'}">${I.starN(v >= i-0.25, size)}</span>`;
  return out + '</span>';
}

/* ---------- store ---------- */
const DEFAULT_STORE = {community:{}, saved:[], local:[], hosts:[], requests:[], bookings:[], photos:{}, mine:[],
                       profile:{name:'You', handle:'@you', payMethod:'sim_visa'}, seeded:false, theme:null};
let store = structuredClone(DEFAULT_STORE);
try { const raw = localStorage.getItem('bf.v2'); if (raw) store = Object.assign(structuredClone(DEFAULT_STORE), JSON.parse(raw)); } catch(e){}
let saveWarned = false;
function save(){
  try { localStorage.setItem('bf.v2', JSON.stringify(store)); }
  catch(e){
    if (!saveWarned){ saveWarned = true; toast('Storage is full — delete some photos to keep saving', I.flag); }
  }
}
const community = id => (store.community[id] = store.community[id] ||
  {reviews:[], confirms:[], reports:[], status:null, hours:null, indoor:null, moved:null});

/* ---------- state ---------- */
const features = new Map();
const state = {cats:new Set(['toilets','food','lodging','shop','fuel','civic',
                             ...(FEATURES.rentals ? ['host'] : [])]), attrs:new Set(),
               sort:'dist', center:null, me:null, sel:null, dropMode:null, panel:null, listCache:[],
               sponsors:[], currentAd:null, listSignature:null};
const fetched = [];

/* ---------- theme ---------- */
function applyTheme(t){
  document.documentElement.setAttribute('data-theme', t);
  store.theme = t; save();
  if (tiles) { tiles.setUrl(t === 'dark' ? TILE_DARK : TILE_LIGHT); }
  document.querySelector('meta[name=theme-color]').setAttribute('content', t === 'dark' ? '#0B1211' : '#0F7B72');
}
const prefersDark = window.matchMedia('(prefers-color-scheme: dark)');

/* ---------- map ---------- */
const TILE_LIGHT = 'https://basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
const TILE_DARK  = 'https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
let map, tiles, markerLayer, hostRings, meMarker;

/* Where the map was when the app was last closed. A returning user should not
   have to watch the globe spin in from zoom 2 while the GPS fix lands. */
function lastView(){
  try {
    const v = JSON.parse(localStorage.getItem('bf.lastview') || 'null');
    if (v && Number.isFinite(v.lat) && Number.isFinite(v.lng) && Number.isFinite(v.z)) return v;
  } catch(e){}
  return null;
}
function rememberView(){
  if (!map) return;
  try {
    const c = map.getCenter();
    localStorage.setItem('bf.lastview',
      JSON.stringify({lat:+c.lat.toFixed(5), lng:+c.lng.toFixed(5), z:map.getZoom()}));
  } catch(e){}
}

function initMap(){
  const last = lastView();
  map = L.map('map', {zoomControl:false, worldCopyJump:true, minZoom:2, maxZoom:19,
                      preferCanvas:false, attributionControl:true})
        .setView(last ? [last.lat, last.lng] : [20, 0], last ? last.z : 2);
  tiles = L.tileLayer(document.documentElement.getAttribute('data-theme') === 'dark' ? TILE_DARK : TILE_LIGHT, {
    maxZoom:19, detectRetina:true,
    attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
  }).addTo(map);
  markerLayer = L.layerGroup().addTo(map);
  hostRings = L.layerGroup().addTo(map);
  map.on('moveend', () => { state.center = map.getCenter(); rememberView(); scheduleLoad(); renderList(); });
  map.on('zoomend', () => { scheduleLoad(); renderMarkers(); });
  state.center = map.getCenter();
}

/* ---------- Overpass ---------- */
/* Both of these send Access-Control-Allow-Origin, which a browser needs.
   Several popular Overpass mirrors (kumi.systems, osm.jp) do not, so they
   fail CORS and can never serve as a fallback from a web app — checked,
   not assumed. When the main instance returns 429 the second one takes over. */
const ENDPOINTS = ['https://overpass-api.de/api/interpreter',
                   'https://maps.mail.ru/osm/tools/overpass/api/interpreter'];
let loadTimer = null, loading = false;

/* Load whatever the user is looking at, once they stop moving.

   This was first-view-only, with a "Search this area" button for everything
   after, because every pan meant another Overpass query and Overpass
   throttles hard enough to make the map feel broken. That constraint is
   gone: the backend keeps its own cache of places keyed by tile, so a view
   already seen — or one merely overlapping it — is a database read costing
   no upstream call at all.

   Three things keep this from becoming a request per pixel:
     - the debounce fires once, after movement stops, so a flick across
       several blocks is one load and not twenty
     - boundsCovered() drops any view already held, so panning back and
       forth over the same streets asks for nothing
     - loadArea serialises on `loading`, so a fast pan cannot put two
       queries in flight at once                                          */
const IDLE_MS = 650;
let loadFailed = false;
function scheduleLoad(force){
  clearTimeout(loadTimer);
  loadTimer = setTimeout(() => loadArea(!force), force ? 0 : IDLE_MS);
}
function updateSearchHere(){
  const btn = el('search-here');
  if (!btn || !map) return;
  /* Only shown when the automatic load could not do it. Without the
     loadFailed condition this would flash on every single pan, in the gap
     between the map stopping and the places arriving. */
  const need = loadFailed && map.getZoom() >= 13 && !boundsCovered(map.getBounds().pad(0.05));
  btn.hidden = !need || !!state.dropMode;
}
function boundsCovered(b){
  return fetched.some(f => f.contains(b));
}
async function loadArea(auto){
  if (!map) return;
  /* Only say this when the user actually asked. Auto-load runs every time
     the map settles, and at world zoom that would put "Zoom in to load
     bathrooms" on screen constantly while someone is simply panning. */
  if (map.getZoom() < 13){ if (!auto) status('Zoom in to load bathrooms', 2600); renderList(); return; }
  const b = map.getBounds().pad(0.15);
  if (boundsCovered(b)) { renderList(); updateSearchHere(); return; }
  el('search-here').hidden = true;
  /* A request is already in flight. Don't fire a second one, but don't drop
     this view either — re-check once the current load finishes, or the area
     the user panned to never loads at all. */
  if (loading){ clearTimeout(loadTimer); loadTimer = setTimeout(loadArea, 1200); renderList(); return; }
  const s = b.getSouth().toFixed(5), w = b.getWest().toFixed(5), n = b.getNorth().toFixed(5), e = b.getEast().toFixed(5);
  const bbox = `(${s},${w},${n},${e})`;
  /* Two separate result sets so a dense high street can never crowd the
     actual public toilets out of the response.

     The venue set is deliberately broad: nearly every business has a
     bathroom, and the only way anyone can tell you the one in the hardware
     store is behind the paint counter is if the hardware store is on the map
     to begin with. So fetch shops, offices and healthcare wholesale rather
     than curating a list of "likely" categories — a curated list is exactly
     how the useful, unglamorous places get left off.

     ["name"] on every clause is what keeps this affordable. Unnamed nodes are
     overwhelmingly street furniture, and nobody looks for a bathroom in a
     thing with no name. */
  const query =
    `[out:json][timeout:30];` +
    `(nwr["amenity"="toilets"]${bbox};)->.t;.t out center 300;` +
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
    `)->.v;.v out center 700;`;

  loading = true; status('Loading bathrooms nearby…');
  let data = null, lastErr = null;

  /* Ask our own backend first. It keeps a shared cache of what Overpass has
     already answered, so a block someone else looked at this month costs
     nothing and comes back instantly. Overpass is run by volunteers on
     donated hardware — pointing every user's browser straight at it is both
     unreliable for them and rude to it.

     If our backend is unreachable the code below still goes to Overpass
     directly, exactly as before, so this can only ever make things better. */
  try {
    const r = await fetch(apiURL(`/api/v1/osm?bbox=${s},${w},${n},${e}`), {
      signal: AbortSignal.timeout(20000)
    });
    if (r.ok){
      const j = await r.json();
      /* Only treat this as the answer if it actually is one. The backend
         replies 200 with stale:true and an empty list when it could not reach
         upstream and had nothing cached — accepting that would leave the user
         staring at a blank map while a perfectly good direct route to
         OpenStreetMap goes untried. A stale answer WITH places is still worth
         having; a stale empty one is not an answer at all. */
      if (Array.isArray(j.places) && (j.places.length || !j.stale)){
        loading = false;
        el('status').style.pointerEvents = 'none';
        fetched.push(b);
        if (fetched.length > 40) fetched.splice(0, 20);
        let n2 = 0;
        for (const p of j.places){
          if (!features.has(p.id)){ features.set(p.id, {...p, source:'osm'}); n2++; }
        }
        cacheFeatures();
        loadFailed = false;
        renderMarkers(); renderList(); updateSearchHere();
        status(j.stale ? 'Map data is busy — showing the last known map'
                       : n2 ? `${n2} places loaded` : 'No mapped places in view', 2200);
        return;
      }
    }
  } catch(err){
    console.info('backend map cache unavailable, asking OpenStreetMap directly:', err.message);
  }

  for (const url of ENDPOINTS){
    /* Overpass is a free shared service and throttles hard at busy times.
       Without a timeout a single slow request wedges the whole map. */
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20000);
    const slow = setTimeout(() => status('Map data is slow right now — still trying…'), 5000);
    try {
      const res = await fetch(url, {method:'POST', body:'data=' + encodeURIComponent(query),
                                    headers:{'Content-Type':'application/x-www-form-urlencoded'},
                                    signal:ctrl.signal});
      if (res.status === 429 || res.status === 504) throw new Error('busy (' + res.status + ')');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      data = await res.json();
      break;
    } catch(err){ lastErr = err; console.warn('Overpass failed:', url, err.message); }
    finally { clearTimeout(timer); clearTimeout(slow); }
  }
  loading = false;
  if (!data){
    /* Auto-load could not deliver this view, so give the user something to
       press. This is the only path that reveals the button now. */
    loadFailed = true;
    updateSearchHere();
    const busy = lastErr && /busy|abort/i.test(lastErr.message);
    const haveCached = [...features.values()].some(f => map.getBounds().contains([f.lat, f.lng]));
    status(haveCached ? 'Map data is busy — showing what you loaded before'
                      : busy ? 'OpenStreetMap is busy — tap to try again'
                             : 'Could not reach map data — tap to retry', 6000);
    el('status').onclick = () => { el('status').onclick = null; loadArea(); };
    el('status').style.pointerEvents = 'auto';
    return;
  }
  el('status').style.pointerEvents = 'none';
  loadFailed = false;

  fetched.push(b);
  if (fetched.length > 40) fetched.splice(0, 20);
  let added = 0;
  for (const elm of data.elements || []){
    const f = fromOSM(elm);
    if (f && !features.has(f.id)){ features.set(f.id, f); added++; }
  }
  status(added ? `${added} places loaded` : 'No mapped places in view', 2200);
  seedSamplesNear(map.getCenter());
  cacheFeatures();
  renderMarkers(); renderList(); updateSearchHere();
}
function fromOSM(e){
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
            'police','fire_station','information'].includes(t.amenity)
             || t.tourism === 'information' || t.office) cat = 'civic';
  else if (t.shop) cat = 'shop';
  /* Anything named that came back from the venue query is a place a person
     could walk into and ask. Dropping it because it does not match a known
     tag is how the map ends up missing exactly the odd little shop that turns
     out to have the only unlocked bathroom on the street. */
  else if (t.name) cat = 'shop';
  if (!cat) return null;

  const kindName = t.amenity === 'toilets' ? 'Public toilets'
    : (t.shop || t.amenity || t.tourism || t.leisure || t.office || t.healthcare || 'Business')
        .replace(/_/g,' ');
  return {id:`osm:${e.type}/${e.id}`, source:'osm', cat, lat, lng,
          name:t.name || (cat === 'toilets' ? 'Public toilets' : kindName.replace(/^./,c=>c.toUpperCase())),
          sub:kindName.replace(/^./,c=>c.toUpperCase()), tags:t};
}

/* ---------- shared data ----------------------------------------------
   The server is the source of truth for community data; the local copy is
   the offline cache. A merge never deletes something the server has not
   seen yet, because it may still be sitting in the outbox.              */
const placePayload = f => ({id:f.id, source:f.source || 'osm', cat:f.cat, lat:f.lat, lng:f.lng,
                            name:f.name, sub:f.sub, tags:f.tags || {}});
function mergeCommunity(id, bundle){
  if (!bundle) return;
  const c = community(id);
  c.reviews = (bundle.reviews || []).map(r => ({
    user:r.user, localId:r.localId, stars:r.stars, text:r.text, tags:r.tags || [], sub:r.sub,
    at:r.at, photos:[], remote:true
  }));
  c.confirms = (bundle.confirms || []).slice().reverse();
  c.reports  = bundle.reports || [];
  const corr = bundle.corrections || {};
  if (corr.hours  !== undefined) c.hours  = corr.hours;
  if (corr.indoor !== undefined) c.indoor = corr.indoor;
  if (corr.moved  !== undefined) c.moved  = corr.moved;
  /* remote photos render straight from the API, and only approved ones
     are ever served to anyone but their owner */
  for (const p of bundle.photos || []){
    if (!store.photos[p.id])
      store.photos[p.id] = {id:p.id, remote:true, data:Sync.photoURL(p.id), state:p.state,
                            by:p.by, at:Date.now(), featureId:id, reports:[], reasons:[]};
    else store.photos[p.id].state = p.state;
  }
  const shown = (bundle.photos || []).map(p => p.id);
  if (shown.length){
    if (!c.reviews.length) c.reviews.push({user:'the community', stars:0, at:Date.now(), photoOnly:true, photos:shown, remote:true});
    else c.reviews[0].photos = shown;
  }
}
/* after any successful write, take the server's version of the truth */
function afterPush(res){
  if (!res || res.queued) return;
  if (res.community){ mergeCommunity(res.community.id || state.sel, res.community); save(); }
  if (state.panel === 'detail' && state.sel) renderDetail(state.sel, true);
  renderList(); renderMarkers(); updateSyncBadge();
}
/* Everything this device wrote, kept so it can be restored if the server
   loses it. The free hosting tier has no persistent disk, so a restart wipes
   the database — without this, a tester's contributions vanish for good. */
function rememberMine(entry){
  store.mine = store.mine || [];
  if (!store.mine.some(m => m.localId === entry.localId)) store.mine.push(entry);
  if (store.mine.length > 500) store.mine = store.mine.slice(-500);
  save();
}
async function restoreMine(){
  if (!Sync.online || !(store.mine || []).length) return 0;
  let restored = 0;
  for (const m of store.mine){
    const c = store.community[m.placeId];
    const onServer = c && (c.reviews || []).some(r => r.localId === m.localId);
    if (onServer) continue;
    /* only try for places currently loaded, so this cannot become a
       thundering herd on every launch */
    const f = findFeature(m.placeId);
    if (!f) continue;
    try {
      const res = await Sync.review({place:placePayload(f), stars:m.stars, text:m.text,
        tags:m.tags, sub:m.sub, localId:m.localId, at:m.at, userName:store.profile.name});
      if (res && !res.queued && !res.duplicate) restored++;
    } catch(err){ /* leave it for next time */ }
  }
  if (restored){
    save();
    toast(`Restored ${restored} of your contribution${restored===1?'':'s'}`, I.check);
  }
  return restored;
}

async function pushReview(f, stars, text, tags, sub, photoIds){
  const localId = 'lr_' + Date.now().toString(36) + Math.random().toString(36).slice(2,8);
  rememberMine({localId, placeId:f.id, stars, text, tags, sub, at:Date.now()});
  try {
    const res = await Sync.review({place:placePayload(f), stars, text, tags, sub,
                                   localId, userName:store.profile.name});
    afterPush(res);
    /* photos ride along after the review, each one still pending until a
       moderator clears it — the server never trusts the device verdict */
    for (const pid of photoIds || []){
      const rec = store.photos[pid];
      if (!rec || rec.remote || rec.state === 'rejected') continue;
      await Sync.photo({place:placePayload(f), dataUrl:rec.data, reviewId:res && res.id,
                        clientVerdict:rec.state, scores:rec.scores, faces:rec.faces, reasons:rec.reasons});
    }
    updateSyncBadge();
  } catch(err){ console.warn('review sync failed', err); toast('Saved here — will upload when connected', I.clock); }
}
function updateSyncBadge(){
  const b = el('syncbadge');
  if (!b) return;
  const n = Sync.pending;
  if (!Sync.checked){ b.hidden = true; return; }
  if (!Sync.online){ b.hidden = false; b.className = 'syncbadge off'; b.textContent = 'Solo mode — not shared'; return; }
  if (n){ b.hidden = false; b.className = 'syncbadge queued'; b.textContent = `${n} waiting to upload`; return; }
  b.hidden = true;
}

async function pullShared(){
  if (!Sync.online || !map) return;
  try {
    const data = await Sync.pullArea(map.getBounds().pad(0.2));
    if (!data) return;
    for (const p of data.places || [])
      if (!features.has(p.id)) features.set(p.id, {...p, source:p.source || 'osm', shared:true});
    for (const [id, bundle] of Object.entries(data.community || {})) mergeCommunity(id, bundle);
    save(); renderMarkers(); renderList();
    if (state.panel === 'detail' && state.sel) renderDetail(state.sel, true);
    restoreMine();
  } catch(err){ console.warn('sync pull failed', err); }
}

/* ---------- POI cache ----------------------------------------------------
   Overpass is free and rate-limits hard, and phones lose signal in exactly
   the places you need a bathroom. Everything loaded is kept locally, so a
   place you have been before draws instantly and still works with no data.
   Stored trimmed — only the tags the app actually reads.                  */
const POI_CACHE_KEY = 'bf.poi.v1';
const POI_TTL = 14 * 86400000;
const KEEP_TAGS = ['amenity','tourism','shop','leisure','office','healthcare','brand',
  'name','opening_hours','fee','charge','wheelchair',
                   'changing_table','unisex','access','operator','check_date','toilets','toilets:access'];
function cacheFeatures(){
  try {
    const slim = [];
    for (const f of features.values()){
      const tags = {};
      for (const k of KEEP_TAGS) if (f.tags[k] != null) tags[k] = f.tags[k];
      slim.push([f.id, f.cat, +f.lat.toFixed(6), +f.lng.toFixed(6), f.name, f.sub, tags]);
      if (slim.length >= 1500) break;
    }
    localStorage.setItem(POI_CACHE_KEY, JSON.stringify({at:Date.now(), items:slim}));
  } catch(e){ /* quota — the cache is a nicety, never a requirement */ }
}
function hydrateCache(){
  try {
    const raw = localStorage.getItem(POI_CACHE_KEY);
    if (!raw) return 0;
    const {at, items} = JSON.parse(raw);
    if (!items || Date.now() - at > POI_TTL){ localStorage.removeItem(POI_CACHE_KEY); return 0; }
    for (const [id, cat, lat, lng, name, sub, tags] of items)
      if (!features.has(id)) features.set(id, {id, source:'osm', cached:true, cat, lat, lng, name, sub, tags});
    return items.length;
  } catch(e){ return 0; }
}

/* ---------- local features (added + hosted) ---------- */
function localFeatures(){
  const out = [];
  for (const l of store.local) out.push({...l, source:'local', tags:l.tags || {}});
  /* Rented bathrooms are only real if renting is on. Leaving them on the map
     with the flow switched off would put pins on the map that dead-end when
     tapped, which is worse than not showing them at all. */
  if (FEATURES.rentals)
    for (const h of store.hosts) out.push({...h, source:'host', cat:'host', tags:h.tags || {}});
  return out;
}
function allFeatures(){ return [...features.values(), ...localFeatures()]; }

/* privacy: host pins are offset deterministically until a request is accepted */
function hostDisplayPoint(h){
  const seed = [...h.id].reduce((a,c)=>a+c.charCodeAt(0), 0);
  const ang = (seed % 360) * Math.PI/180, r = 60 + (seed % 70);   // 60–130 m
  return {lat: h.lat + (r*Math.cos(ang))/111320,
          lng: h.lng + (r*Math.sin(ang))/(111320*Math.cos(h.lat*Math.PI/180))};
}
function seedSamplesNear(center){
  /* These are invented listings — made-up hosts, made-up prices — dropped a
     couple of hundred metres from wherever the user actually is. They exist
     to make the rental flow demonstrable. With renting off they would be
     fabricated places presented on the map as real ones, so they must not
     be created at all. */
  if (!FEATURES.rentals) return;
  if (store.seeded || !center) return;
  const names = [
    {name:'Ground-floor guest bath', host:'Ana', price:2, note:'Right by the front door, you never come through the living room. Clean towel every time.'},
    {name:'Shopfront staff bathroom', host:'Deniz', price:1, note:'Behind the counter of my shop. Just ask for the key — I keep it on a hook by the till.'},
    {name:'Garden studio bathroom', host:'Marcus', price:3, note:'Separate entrance from the side gate. Step-free, wide door, baby changing mat available.'}
  ];
  names.forEach((n, i) => {
    const ang = (i*137) * Math.PI/180, r = 220 + i*160;
    store.hosts.push({
      id:'host:sample' + i, kind:'host', sample:true, name:n.name, hostName:n.host,
      lat: center.lat + (r*Math.cos(ang))/111320,
      lng: center.lng + (r*Math.sin(ang))/(111320*Math.cos(center.lat*Math.PI/180)),
      price:n.price, currency:'$', hours:'8:00 – 21:00', note:n.note,
      amen:['Step-free entry','Soap & towels'].slice(0, i === 2 ? 2 : 1), photos:[], created:Date.now()
    });
  });
  store.seeded = true; save();
}

/* ---------- markers ---------- */
function pinHTML(color, label, dimmed){
  return `<div class="mk${dimmed ? ' mk-closed' : ''}"><svg width="30" height="38" viewBox="-16 -48 32 50">
    <path d="M0 4c-8.6 0-15.6 6.9-15.6 15.4C-15.6 30 0 46 0 46s15.6-16 15.6-26.6C15.6 10.9 8.6 4 0 4Z" transform="translate(0,-46)" fill="${color}" stroke="#fff" stroke-width="2.4"/>
    <circle cx="0" cy="-26.6" r="8.4" fill="#fff" opacity=".95"/>
    <text class="mk-label" x="0" y="-23.4" text-anchor="middle" fill="${color}">${label}</text>
  </svg></div>`;
}
function ratingOf(f){
  const rs = community(f.id).reviews || [];
  if (!rs.length) return null;
  return Math.round((rs.reduce((a,r)=>a+r.stars,0)/rs.length)*10)/10;
}
function accessOf(f){
  const t = f.tags || {};
  if (f.cat === 'host') return {cls:'host', label:`${f.currency||'$'}${f.price}/use`, icon:I.home};
  const c = community(f.id);
  if (c.status === 'locked') return {cls:'locked', label:'Reported locked', icon:I.lock};
  if (t.access === 'private' || t.access === 'no') return {cls:'locked', label:'Private', icon:I.lock};
  if (f.cat === 'toilets'){
    if (t.fee === 'yes') return {cls:'code', label:t.charge ? `Fee ${t.charge}` : 'Fee', icon:I.coin};
    if (t.access === 'customers') return {cls:'ask', label:'Customers only', icon:I.people};
    return {cls:'open', label:'Public', icon:I.unlock};
  }
  if (t.toilets === 'yes' || t['toilets:access'] === 'yes') return {cls:'open', label:'Has toilets', icon:I.unlock};
  if (t['toilets:access'] === 'customers') return {cls:'ask', label:'Customers only', icon:I.people};
  return {cls:'ghost', label:'Unknown — add it', icon:I.info};
}
function passesFilters(f){
  if (!state.cats.has(f.cat)) return false;
  for (const a of state.attrs) if (!ATTRS[a].test(f)) return false;
  return true;
}
const cssVar = v => v.startsWith('var(')
  ? getComputedStyle(document.documentElement).getPropertyValue(v.slice(4,-1)).trim() : v;
function pinColor(f){
  if (f.cat === 'host') return cssVar('var(--host)');
  const a = accessOf(f).cls;
  if (a === 'locked') return cssVar('var(--locked)');
  if (a === 'code')   return cssVar('var(--code)');
  if (f.cat !== 'toilets' && f.source !== 'local') return cssVar(CATS[f.cat].color);
  return cssVar('var(--open)');
}
/* where a pin actually sits: a community correction wins over the import */
function pointOf(f){
  if (f.cat === 'host') return hostDisplayPoint(f);
  const moved = community(f.id).moved;
  return moved ? {lat:moved.lat, lng:moved.lng} : {lat:f.lat, lng:f.lng};
}
function renderMarkers(){
  if (!markerLayer) return;
  markerLayer.clearLayers(); hostRings.clearLayers();
  const b = map.getBounds().pad(0.3);
  const zoom = map.getZoom();

  /* everything visible, scored so clusters lead with the best pin and the
     cap can only ever drop background venues */
  const shown = [];
  for (const f of allFeatures()){
    if (!passesFilters(f)) continue;
    const pt = pointOf(f);
    if (!b.contains([pt.lat, pt.lng])) continue;
    const primary = f.cat === 'toilets' || f.cat === 'host' || f.source === 'local';
    shown.push({...pt, f, primary, score: (primary ? 1000 : 0) + trustScore(f, community(f.id))});
  }
  shown.sort((x,y) => y.score - x.score);

  /* Primary pins are never clustered away — a bathroom you can see is the
     point of the app. Background venues cluster so a city stays readable. */
  const primaries = shown.filter(p => p.primary).slice(0, 250);
  const venues    = shown.filter(p => !p.primary).slice(0, 400);

  for (const p of primaries){
    const f = p.f, isHost = f.cat === 'host';
    const col = pinColor(f), rating = ratingOf(f);
    const label = isHost ? (f.currency||'$')+f.price : (rating != null ? rating.toFixed(1) : 'WC');
    const closed = openState(f).state === 'closed';
    const m = L.marker([p.lat, p.lng], {icon:L.divIcon({html:pinHTML(col, label, closed),
      className:'', iconSize:[30,38], iconAnchor:[15,38]}), riseOnHover:true,
      keyboard:true, alt:f.name});
    if (isHost) hostRings.addLayer(L.circle([p.lat, p.lng],
      {radius:130, color:col, weight:1.2, fillColor:col, fillOpacity:.10}));
    m.on('click', () => openDetail(f.id));
    markerLayer.addLayer(m);
  }

  for (const c of cluster(venues, zoom, 74)){
    if (c.type === 'point'){
      const f = c.item.f;
      const m = L.circleMarker([c.lat, c.lng], {radius:6.5, color:'#fff', weight:2, opacity:.9,
        fillColor:pinColor(f), fillOpacity:.95, alt:f.name});
      m.on('click', () => openDetail(f.id));
      markerLayer.addLayer(m);
    } else {
      const m = L.marker([c.lat, c.lng], {icon:L.divIcon({
        html:`<div class="clusterdot"><b class="num">${c.count}</b></div>`,
        className:'', iconSize:[34,34], iconAnchor:[17,17]}), alt:`${c.count} places`});
      m.on('click', () => map.setView([c.lat, c.lng], Math.min(19, zoom + 2)));
      markerLayer.addLayer(m);
    }
  }

  if (state.me){
    if (meMarker) map.removeLayer(meMarker);
    meMarker = L.marker([state.me.lat, state.me.lng], {icon:L.divIcon({html:'<div class="me-dot" style="width:16px;height:16px"></div>', className:'', iconSize:[16,16], iconAnchor:[8,8]}), interactive:false}).addTo(map);
  }
}

/* ---------- list ---------- */
const LIST_CAP = 120;
function listFeatures(){
  const origin = state.me || map.getCenter();
  const b = map.getBounds();
  const list = allFeatures()
    .filter(f => passesFilters(f))
    .filter(f => b.contains([f.lat, f.lng]))
    .map(f => ({f, d: haversine(origin, {lat:f.lat, lng:f.lng})}));
  const openRank = x => openState(x.f).state === 'open' ? 0 : 1;
  const sorters = {
    dist:(a,b)=>a.d-b.d,
    rating:(a,b)=>(ratingOf(b.f)||0)-(ratingOf(a.f)||0) || a.d-b.d,
    toilets:(a,b)=>(a.f.cat==='toilets'?0:1)-(b.f.cat==='toilets'?0:1) || a.d-b.d,
    open:(a,b)=>openRank(a)-openRank(b) || a.d-b.d,
    trusted:(a,b)=>trustScore(b.f, community(b.f.id))-trustScore(a.f, community(a.f.id)) || a.d-b.d
  };
  const sorted = list.sort(sorters[state.sort] || sorters.dist);
  /* The list is capped for the sake of phones, but the count in the header
     should describe the map, not the cap. Now that every business in view is
     fetched, "120 places in view" over a busy high street is simply wrong. */
  state.listTotal = sorted.length;
  return sorted.slice(0, LIST_CAP);
}
function hoursChip(f){
  const h = openState(f);
  if (h.state === 'open')   return `<span class="hours open">Open${h.until ? ` · to ${h.until}` : ''}</span>`;
  if (h.state === 'closed') return `<span class="hours closed">Closed${h.opensAt ? ` · opens ${h.opensAt}` : ''}</span>`;
  return '';
}
function rowHTML({f, d}){
  const acc = accessOf(f), rating = ratingOf(f), reviews = (community(f.id).reviews||[]).length;
  const saved = store.saved.includes(f.id);
  const col = CATS[f.cat].color;
  const fresh = freshness(f, community(f.id));
  return `<button class="row" data-open="${esc(f.id)}">
    <span class="ico" style="background:color-mix(in srgb, ${col} 16%, transparent); color:${col}">${CATS[f.cat].icon}</span>
    <span>
      <h3>${esc(f.name)}</h3>
      <span class="meta">
        ${rating != null ? `<span class="rating-inline"><b class="num">${rating.toFixed(1)}</b>${starsHTML(rating,11)}<span class="num">(${reviews})</span></span>`
                         : `<span style="color:var(--ink-3)">No reviews yet</span>`}
        ${hoursChip(f)}
      </span>
      <span class="meta"><span class="pill ${acc.cls}">${acc.icon}${esc(acc.label)}</span>${f.sample ? '<span class="pill ghost">Sample</span>' : ''}
        ${fresh.level === 'disputed' ? `<span class="pill locked">${I.flag}Disputed</span>`
          : fresh.level === 'stale' ? `<span class="freshdot stale" title="${esc(fresh.label)}"></span>` : ''}</span>
    </span>
    <span class="tail">
      <span class="dist num">${showDist(d)}</span>
      <span class="dist num" style="font-weight:400">${walkMin(d)} min</span>
      <span class="savebtn" role="button" tabindex="0" data-save="${esc(f.id)}" aria-pressed="${saved}" aria-label="Save">${I.star(saved)}</span>
    </span>
  </button>`;
}
/* A paid placement, always labelled. It sits inside the list rather than
   floating over the map, because covering the map is what makes people
   delete an app they opened in a hurry. */
function adHTML(ad){
  if (!ad) return '';
  const sponsored = ad.kind === 'sponsored';
  return `<div class="adslot ${sponsored ? 'sponsored' : 'house'}" data-ad="${esc(ad.id)}" data-adkind="${esc(ad.kind)}">
    <div class="adlabel">${sponsored ? 'Sponsored' : 'From Bathroom Finder'}</div>
    <div class="adbody">
      <h3>${esc(sponsored ? ad.headline : ad.title)}</h3>
      <p>${esc(ad.body || '')}</p>
      ${sponsored && ad.distance != null ? `<span class="addist num">${showDist(ad.distance)} away · ${esc(ad.business)}</span>` : ''}
    </div>
    <button class="minibtn adcta" data-adcta="${esc(ad.id)}">${esc(ad.cta || 'Open')}</button>
  </div>`;
}
function wireAd(root){
  const el2 = root.querySelector('[data-ad]');
  if (!el2) return;
  const id = el2.dataset.ad, kind = el2.dataset.adkind;
  /* count the impression once it has actually been on screen */
  if (kind === 'sponsored' && 'IntersectionObserver' in window){
    const io = new IntersectionObserver(entries => {
      for (const e of entries) if (e.isIntersecting){
        io.disconnect();
        fetch(apiURL('/api/v1/sponsors/impression'), {method:'POST',
          headers:{'Content-Type':'application/json'}, body:JSON.stringify({id})}).catch(()=>{});
      }
    }, {threshold:0.6});
    io.observe(el2);
  }
  const cta = root.querySelector('[data-adcta]');
  if (cta) cta.addEventListener('click', e => {
    e.stopPropagation();
    if (kind === 'sponsored'){
      fetch(apiURL('/api/v1/sponsors/click'), {method:'POST',
        headers:{'Content-Type':'application/json'}, body:JSON.stringify({id})}).catch(()=>{});
      const s = (state.sponsors || []).find(x => x.id === id);
      if (s) map.setView([s.lat, s.lng], 17);
      toast('Showing ' + (s ? s.business : 'the sponsor'), I.nav);
    } else {
      const action = (Ads.HOUSE.find(h => h.id === id) || {}).action;
      if (action === 'sponsor') openAdvertise();
      else if (action === 'plus') openPlus();
      else if (action === 'add') startDropMode('add', pt => openAddForm(pt));
    }
  });
}

function renderList(){
  const rows = listFeatures();
  state.listCache = rows;
  const head = el('sheet-count');
  if (map.getZoom() < 13) head.textContent = 'Zoom in to load bathrooms';
  else if (!rows.length) head.textContent = 'Nothing in view yet';
  else {
    const total = state.listTotal || rows.length;
    head.textContent = total === rows.length
      ? `${total} place${total === 1 ? '' : 's'} in view`
      : `${total} places in view · nearest ${rows.length}`;
  }
  /* One slot, after the first handful of results — never above them. The
     first thing on screen is always a real bathroom. */
  let body;
  if (!rows.length){
    body = `<div class="empty"><h3>${map.getZoom() < 13 ? 'Pick a place to start' : 'Nothing here yet'}</h3>
       <p>${map.getZoom() < 13 ? 'Search a city above, or tap the crosshair to jump to where you are.'
         : 'No mapped bathrooms in this view. If you know one, add it — you will be the first.'}</p></div>`;
  } else {
    const html = rows.map(rowHTML);
    if (state.currentAd && html.length > 2)
      html.splice(Math.min(Ads.LIST_EVERY, html.length), 0, adHTML(state.currentAd));
    body = html.join('');
  }
  /* Background syncs call this every few seconds. Rebuilding the list when
     nothing changed yanks the scroll position out from under whoever is
     reading it — and quietly destroys the ad's viewability tracking, so
     nothing ever bills. Skip identical renders, and keep the scroll. */
  const list = el('sheet-list');
  const signature = [
    rows.map(r => r.f.id).join(','),
    state.currentAd && state.currentAd.id,
    state.sort, [...state.cats].join(''), [...state.attrs].join(''),
    store.saved.join(','), Ads.isPlus() ? 'plus' : ''
  ].join('|');
  if (signature === state.listSignature && list.children.length) return;
  state.listSignature = signature;

  const keepScroll = list.scrollTop;
  list.innerHTML = body;
  list.scrollTop = keepScroll;
  wireRows(list);
  wireAd(list);
  const sc = el('savecount');
  sc.textContent = store.saved.length; sc.hidden = store.saved.length === 0;
}
function wireRows(root){
  root.querySelectorAll('[data-open]').forEach(r => r.addEventListener('click', e => {
    if (e.target.closest('[data-save]')) return;
    openDetail(r.dataset.open);
  }));
  root.querySelectorAll('[data-save]').forEach(s => {
    const go = e => { e.stopPropagation(); toggleSave(s.dataset.save); };
    s.addEventListener('click', go);
    s.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); go(e); }});
  });
}
function toggleSave(id){
  const i = store.saved.indexOf(id);
  if (i >= 0){ store.saved.splice(i,1); toast('Removed from Saved', I.x); }
  else { store.saved.push(id); toast('Saved', I.star(true)); }
  save(); renderList(); renderSaved(); if (state.panel === 'detail') renderDetail(state.sel, true);
}

/* ---------- detail ---------- */
function findFeature(id){
  return features.get(id) || localFeatures().find(f => f.id === id) || null;
}
const TAG_ROWS = [
  ['opening_hours', I.clock,      v => `Hours <b>${esc(v)}</b>`],
  ['charge',        I.coin,       v => `Charge <b>${esc(v)}</b>`],
  ['wheelchair',    I.wheelchair, v => `Wheelchair access <b>${esc(v)}</b>`],
  ['changing_table',I.baby,       v => `Baby changing <b>${esc(v)}</b>`],
  ['unisex',        I.gender,     v => v === 'yes' ? 'Gender neutral <b>yes</b>' : null],
  ['access',        I.lock,       v => `Access <b>${esc(v)}</b>`],
  ['operator',      I.people,     v => `Operated by <b>${esc(v)}</b>`],
  ['check_date',    I.check,      v => `Last checked on OpenStreetMap <b>${esc(v)}</b>`]
];
function renderDetail(id, keepScroll){
  const f = findFeature(id);
  if (!f) return;
  const body = el('detail-body');
  const prev = keepScroll ? body.scrollTop : 0;
  const c = community(f.id);
  const acc = accessOf(f), rating = ratingOf(f);
  const saved = store.saved.includes(f.id);
  const origin = state.me || map.getCenter();
  const d = haversine(origin, {lat:f.lat, lng:f.lng});
  const photos = c.reviews.flatMap(r => visiblePhotos(r.photos, r.user))
                          .concat(visiblePhotos(f.photos, f.hostName || 'the host'));
  const isHost = f.cat === 'host';
  const fresh = freshness(f, c);
  const hours = openState(f);
  const subAvg = k => {
    const v = c.reviews.filter(r => r.sub && r.sub[k] != null).map(r => r.sub[k]);
    return v.length ? v.reduce((a,b)=>a+b,0)/v.length : null;
  };

  body.innerHTML = `
  <div class="hero">
    ${photos.length ? `<div class="strip">${photos.map((ph,i)=>`<button data-photo="${i}">${ph.state==='pending'?`<span class="pendingtag">${I.shield} Only you can see this until it is checked</span>`:''}<img src="${ph.src}" alt="Photo of ${esc(f.name)}"></button>`).join('')}</div>`
      : `<div class="hero-empty">${I.camera}<span>No photos yet — yours would be the first</span></div>`}
    <div class="hero-nav">
      <button class="circbtn ${photos.length?'onphoto':''}" data-close-panel aria-label="Back">${I.back}</button>
      <button class="circbtn ${photos.length?'onphoto':''}" data-act="save" aria-label="Save" style="${saved?'color:var(--star)':''}">${I.star(saved)}</button>
    </div>
  </div>

  <div class="detail-head">
    <h1>${esc(f.name)}</h1>
    <div class="kind">${esc(isHost ? `Private bathroom hosted by ${f.hostName||'a neighbour'}` : f.sub || CATS[f.cat].label)}
      · <span class="num">${showDist(d)}</span> · ${walkMin(d)} min walk</div>
    <div class="ratingline">
      ${rating != null ? `<span class="big num">${rating.toFixed(1)}</span>${starsHTML(rating,16)}
        <span style="font-size:12.5px;color:var(--ink-2)" class="num">${c.reviews.length} review${c.reviews.length===1?'':'s'}</span>`
        : `<span class="pill ghost">${I.sparkle} Not rated yet</span>`}
      ${f.sample ? '<span class="pill ghost">Sample listing</span>' : ''}
    </div>
  </div>

  ${fresh.level === 'disputed' || fresh.level === 'stale' ? `
    <div class="alert ${fresh.level}">
      ${fresh.level === 'disputed' ? I.flag : I.clock}
      <span>${fresh.level === 'disputed'
        ? `People have reported this listing as wrong (${c.reports.length} report${c.reports.length===1?'':'s'}). Treat it with suspicion.`
        : `${esc(fresh.label)}. It may well have changed — if you go, tell everyone what you find.`}</span>
    </div>` : ''}

  <div class="statuscard">
    <div class="top">
      <span class="pill ${acc.cls}">${acc.icon}${esc(acc.label)}</span>
      ${hours.state !== 'unknown'
        ? `<span class="hours ${hours.state}">${hours.state === 'open' ? 'Open now' : 'Closed now'}${hours.until ? ` · to ${hours.until}` : hours.opensAt ? ` · opens ${hours.opensAt}` : ''}</span>`
        : `<span class="hours unknown">Hours unknown</span>`}
    </div>
    <div class="freshrow ${fresh.level}">
      <span class="freshdot ${fresh.level}"></span>
      <span>${esc(fresh.label)}</span>
      ${c.moved ? '<span class="pill ghost">Pin corrected</span>' : ''}
      ${c.hours ? '<span class="pill ghost">Hours corrected</span>' : ''}
    </div>
    ${isHost ? `
      <p class="note">${esc(f.note || '')}</p>
      <div class="osmrow" style="border-top:none">${I.coin}<span><b>${f.currency||'$'}${f.price}</b> per visit · ${esc(f.hours||'hours not set')}</span></div>
      <div class="osmrow">${I.shield}<span>Exact address is hidden until the host accepts. The circle on the map is approximate.</span></div>
      <button class="btn" data-act="book" style="margin-top:4px">${I.home} Request access</button>
    ` : `
      ${f.cat === 'toilets'
        ? `<p class="note">Mapped as a public toilet on OpenStreetMap.${f.tags.fee === 'yes' ? ' There is a fee to use it.' : ''}</p>`
        : `<p class="note">This is a ${esc((f.sub||'place').toLowerCase())}. Nobody has recorded its bathroom yet — if you have been in, you know more than the map does.</p>`}
      ${TAG_ROWS.map(([k, ico, fmt]) => { const v = f.tags[k]; if (!v) return ''; const txt = fmt(v); return txt ? `<div class="osmrow">${ico}<span>${txt}</span></div>` : ''; }).join('')}
      ${c.indoor ? `<div class="osmrow">${I.nav}<span>Getting to it: <b>${esc(c.indoor)}</b></span></div>` : ''}
      <div class="confirmrow">
        <span class="q">Is it open and usable right now?</span>
        <button class="minibtn yes" data-confirm="open">${I.check} Yes</button>
        <button class="minibtn no" data-confirm="locked">${I.x} Locked</button>
      </div>
      <div class="fixrow">
        <button class="linkbtn" data-act="indoor">${I.nav} ${c.indoor ? 'Update' : 'Add'} how to find it inside</button>
        <button class="linkbtn" data-act="report">${I.flag} Report a problem</button>
      </div>
    `}
  </div>

  <div class="actionrow">
    <button class="action" data-act="directions">${I.nav}<span>Directions</span></button>
    <button class="action" data-act="review">${I.pen}<span>Review</span></button>
    <button class="action" data-act="photo">${I.camera}<span>Add photo</span></button>
    <button class="action" data-act="save" aria-pressed="${saved}">${I.star(saved)}<span>${saved?'Saved':'Save'}</span></button>
  </div>

  ${c.reviews.length ? `
  <div class="section">
    <h2>Community ratings</h2>
    <div class="card scores">
      ${[['clean','Cleanliness'],['privacy','Privacy'],['supplies','Supplies']].map(([k,lbl])=>{
        const v = subAvg(k);
        return `<div class="score"><span>${lbl}</span><span class="bar"><i style="width:${v?v/5*100:0}%"></i></span><b class="num">${v?v.toFixed(1):'–'}</b></div>`;
      }).join('')}
    </div>
  </div>` : ''}

  ${photos.length ? `
  <div class="section">
    <h2>Photos</h2>
    <div class="photogrid">${photos.slice(0,6).map((ph,i)=>`<button data-photo="${i}" class="${ph.state==='pending'?'photo-pending':''}"><img src="${ph.src}" alt=""></button>`).join('')}</div>
  </div>` : ''}

  <div class="section" style="padding-bottom:26px">
    <h2>Reviews <span class="more" data-act="review">Write a review</span></h2>
    <div class="card" style="padding:4px 14px 12px">
      ${c.reviews.length ? c.reviews.map((r,i)=>`
        <article class="review">
          <div class="rhead">
            <div class="avatar" style="background:${avColor(r.user)}">${esc(initials(r.user))}</div>
            <div style="flex:1"><div class="rname">${esc(r.user)}</div><div class="rmeta">${timeAgo(r.at)}</div></div>
            ${starsHTML(r.stars,14)}
          </div>
          ${r.text ? `<p class="rbody">${esc(r.text)}</p>` : ''}
          ${(r.tags||[]).length ? `<div class="rtags">${r.tags.map(t=>`<span class="rtag">${esc(t)}</span>`).join('')}</div>` : ''}
          ${visiblePhotos(r.photos, r.user).length ? `<div class="rphotos">${visiblePhotos(r.photos, r.user).map((ph,j)=>`<button data-rphoto="${i}|${j}" class="${ph.state==='pending'?'photo-pending':''}"><img src="${ph.src}" alt=""></button>`).join('')}</div>` : ''}
        </article>`).join('')
        : `<div class="empty" style="padding:26px 10px"><h3>No reviews yet</h3>
           <p>Tell the next person what it is actually like in there.</p>
           <button class="minibtn" data-act="review">${I.pen} Write the first review</button></div>`}
    </div>
    <p style="font-size:11.5px;color:var(--ink-3);line-height:1.55;margin:14px 2px 0">
      Place data from OpenStreetMap contributors. Reviews and photos you add are stored on this device only —
      there is no server yet, so nobody else can see them.
    </p>
  </div>`;

  body.scrollTop = prev;
  body.querySelectorAll('[data-close-panel]').forEach(b => b.addEventListener('click', closePanel));
  body.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', () => {
    const a = b.dataset.act;
    if (a === 'save') toggleSave(f.id);
    else if (a === 'review') openReview(f);
    else if (a === 'photo') pickPhotos(f);
    else if (a === 'book') openBooking(f);
    else if (a === 'report') openReport(f);
    else if (a === 'indoor'){
      openModal(`<h2>How do you find it inside?</h2>
        <p class="lede">The single most useful thing you can add. “Past the fish counter, unmarked green door on the left.”</p>
        <div class="field"><textarea class="input" id="in-text" placeholder="Which floor, which corridor, do you need to ask anyone…">${esc(c.indoor || '')}</textarea></div>
        <button class="btn" id="in-save">Save</button>`);
      el('in-save').addEventListener('click', () => {
        const t = el('in-text').value.trim();
        const screen = Moderation.screenText(t);
        if (!screen.ok){ toast(screen.reasons[0], I.shield); return; }
        c.indoor = t || null; c.confirms.push({at:Date.now(), status:'indoor'});
        Sync.correction({place:placePayload(f), kind:'indoor', value:t || null}).then(afterPush).catch(()=>{});
        save(); closeModal(); renderDetail(f.id, true); toast('Saved — that helps a lot', I.check);
      });
    }
    else if (a === 'directions'){
      const p = pointOf(f);
      const from = state.me ? `&from=${state.me.lat}%2C${state.me.lng}` : "";
      window.open(`https://www.openstreetmap.org/directions?engine=fossgis_osrm_foot${from}&to=${p.lat}%2C${p.lng}`, "_blank", "noopener");
    }
  }));
  body.querySelectorAll('[data-confirm]').forEach(b => b.addEventListener('click', () => {
    const v = b.dataset.confirm;
    c.status = v === 'locked' ? 'locked' : 'open';
    c.confirms.push({at:Date.now(), status:c.status});
    Sync.confirm({place:placePayload(f), status:c.status}).then(afterPush).catch(()=>{});
    save(); renderDetail(f.id, true); renderMarkers(); renderList();
    toast(v === 'locked' ? 'Marked as locked — thanks' : 'Confirmed open — thanks', I.check);
  }));
  body.querySelectorAll('[data-photo]').forEach(b => b.addEventListener('click', () => {
    const ph = photos[+b.dataset.photo]; if (ph) openLightbox(ph.src, ph.who, f.name, ph.id, ph.state);
  }));
  body.querySelectorAll('[data-rphoto]').forEach(b => b.addEventListener('click', () => {
    const [i,j] = b.dataset.rphoto.split('|').map(Number);
    const ph = visiblePhotos(c.reviews[i].photos, c.reviews[i].user)[j];
    if (ph) openLightbox(ph.src, ph.who, f.name, ph.id, ph.state);
  }));
}
function openDetail(id){
  state.sel = id;
  renderDetail(id);
  openPanel('detail');
  const f = findFeature(id);
  if (f) map.panTo([f.lat, f.lng], {animate:true});
}

/* ---------- photos: nothing is visible until it clears moderation ---------- */
const photoRec = pid => store.photos[pid] || null;
/* a photo is public only when approved; you can always see your own, marked */
function visiblePhotos(ids, fallbackWho){
  const out = [];
  for (const entry of ids || []){
    if (typeof entry === 'string' && entry.startsWith('data:')){   // pre-moderation data
      out.push({src:entry, who:fallbackWho, state:'approved'}); continue;
    }
    const rec = photoRec(entry);
    if (!rec) continue;
    const mine = rec.by === store.profile.name;
    if (rec.state === 'approved') out.push({src:rec.data, who:rec.by, state:'approved', id:rec.id});
    else if (rec.state === 'pending' && mine) out.push({src:rec.data, who:rec.by, state:'pending', id:rec.id});
  }
  return out;
}
function pendingCount(){ return Object.values(store.photos).filter(p => p.state === 'pending').length; }

/* runs a batch of files through Moderation, returns the ids that may be kept */
async function screenAndStore(files, featureId, onStatus){
  const kept = [], rejected = [];
  let i = 0;
  for (const file of files){
    i++;
    onStatus && onStatus(`Checking photo ${i} of ${files.length}…`);
    let res;
    try { res = await Moderation.screenPhoto(file, onStatus); }
    catch(err){ console.warn(err); res = {verdict:'pending', dataUrl:null, reasons:['The check could not run']}; }
    if (!res.dataUrl){ rejected.push(res.reasons[0] || 'Could not read that image'); continue; }
    if (res.verdict === 'rejected'){ rejected.push(res.reasons[0]); continue; }
    const pid = 'ph_' + Date.now().toString(36) + Math.random().toString(36).slice(2,6);
    store.photos[pid] = {id:pid, data:res.dataUrl, state:res.verdict, scores:res.scores || null,
                         faces:res.faces, reasons:res.reasons, by:store.profile.name,
                         at:Date.now(), featureId, reports:[]};
    kept.push(pid);
  }
  save();
  return {kept, rejected};
}
function pickPhotos(f){
  const input = document.createElement('input');
  input.type = 'file'; input.accept = 'image/*'; input.multiple = true;
  input.addEventListener('change', async () => {
    const files = [...input.files].slice(0,3);
    if (!files.length) return;
    openModal(`<h2>Checking your photos</h2>
      <p class="lede" id="mod-status">Getting ready…</p>
      <div class="modbar"><i></i></div>
      <p style="font-size:11.5px;color:var(--ink-3);line-height:1.55;margin-top:14px">
        Location data is stripped from every photo, and the check runs on your phone — the image is not uploaded anywhere to be scanned.</p>`);
    const {kept, rejected} = await screenAndStore(files, f.id, m => { const s = el('mod-status'); if (s) s.textContent = m; });
    closeModal();
    if (kept.length){
      const c = community(f.id);
      c.reviews.unshift({user:store.profile.name, at:Date.now(), stars:0, text:'', tags:[], photos:kept, photoOnly:true});
      save(); renderDetail(f.id, true); renderMarkers();
    }
    reportModerationResult(kept, rejected);
  });
  input.click();
}
function reportModerationResult(kept, rejected){
  const held = kept.filter(pid => store.photos[pid].state === 'pending').length;
  const live = kept.length - held;
  if (live) toast(`${live} photo${live===1?'':'s'} published`, I.camera);
  if (held) toast(`${held} photo${held===1?' is':'s are'} waiting on a human check`, I.shield);
  if (rejected.length) openModal(`<h2>${rejected.length} photo${rejected.length===1?' was':'s were'} not accepted</h2>
    <p class="lede">Nothing was posted. Here is why:</p>
    <div class="card" style="margin-bottom:14px">${rejected.map(r=>`<p style="margin:0 0 8px;font-size:13px;line-height:1.55">${esc(r)}</p>`).join('')}</div>
    <button class="btn" onclick="closeModal()">Got it</button>`);
}

/* ---------- review composer ---------- */
function openReview(f){
  let stars = 0, tags = new Set(), sub = {clean:0, privacy:0, supplies:0}, shots = [], pendingNotice = false;
  const tagList = ['Spotless','Actually unlocked','Bring your own paper','No wait','Hard to find','Gender neutral','Step-free','Needs restocking'];
  openModal(`
    <h2>Rate this bathroom</h2>
    <p class="lede">${esc(f.name)}</p>
    <div class="field"><span>Overall</span><div class="starpick" id="sp">${[1,2,3,4,5].map(n=>`<button data-star="${n}" aria-label="${n} stars" style="color:var(--line)">${I.starN(false,32)}</button>`).join('')}</div></div>
    ${[['clean','Cleanliness'],['privacy','Privacy'],['supplies','Supplies']].map(([k,l])=>`
      <div class="field"><span>${l}</span><div class="starpick sub" data-sub="${k}">${[1,2,3,4,5].map(n=>`<button data-n="${n}" aria-label="${n}" style="color:var(--line)">${I.starN(false,22)}</button>`).join('')}</div></div>`).join('')}
    <div class="field"><span>Tags</span><div class="chiprow" style="flex-wrap:wrap; box-shadow:none">${tagList.map(t=>`<button class="chip" data-tag="${t}" aria-pressed="false">${t}</button>`).join('')}</div></div>
    <div class="field"><span>Your review</span>
      <textarea class="input" id="rtext" placeholder="What should the next person know before they walk over?"></textarea>
      <span class="warn" id="rtext-warn" hidden></span>
      <span class="hint">Keep out phone numbers, emails and addresses — reviews are public.</span></div>
    <button class="btn secondary" id="rphoto" style="margin-bottom:10px">${I.camera} <span id="rphoto-label">Add photos</span></button>
    <p style="font-size:11.5px;color:var(--ink-3);line-height:1.5;margin:0 0 12px">
      ${I.shield} Photos are checked on your phone for explicit content and for people in shot before anyone else can see them.</p>
    <button class="btn" id="rpost">Post review</button>
  `);
  const m = el('modal');
  m.querySelectorAll('[data-star]').forEach(b => b.addEventListener('click', () => {
    stars = +b.dataset.star;
    m.querySelectorAll('[data-star]').forEach(x => { const on = +x.dataset.star <= stars;
      x.style.color = on ? 'var(--star)' : 'var(--line)'; x.innerHTML = I.starN(on, 32); });
  }));
  m.querySelectorAll('.sub').forEach(row => row.querySelectorAll('[data-n]').forEach(b => b.addEventListener('click', () => {
    sub[row.dataset.sub] = +b.dataset.n;
    row.querySelectorAll('[data-n]').forEach(x => { const on = +x.dataset.n <= sub[row.dataset.sub];
      x.style.color = on ? 'var(--star)' : 'var(--line)'; x.innerHTML = I.starN(on, 22); });
  })));
  m.querySelectorAll('[data-tag]').forEach(t => t.addEventListener('click', () => {
    const on = t.getAttribute('aria-pressed') === 'true';
    t.setAttribute('aria-pressed', String(!on));
    on ? tags.delete(t.dataset.tag) : tags.add(t.dataset.tag);
  }));
  el('rphoto').addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/*'; input.multiple = true;
    input.addEventListener('change', async () => {
      const label = el('rphoto-label');
      const files = [...input.files].slice(0,3);
      if (!files.length) return;
      const {kept, rejected} = await screenAndStore(files, f.id, m => { if (label) label.textContent = m; });
      shots.push(...kept);
      pendingNotice = kept.some(pid => store.photos[pid].state === 'pending');
      if (label) label.textContent = shots.length ? `${shots.length} photo${shots.length===1?'':'s'} attached${pendingNotice?' · some await review':''}` : 'Add photos';
      if (rejected.length) toast(rejected[0], I.shield);
    });
    input.click();
  });
  el('rpost').addEventListener('click', () => {
    if (!stars){ toast('Pick a star rating first', I.star(false)); return; }
    const text = el('rtext').value.trim();
    const screen = Moderation.screenText(text);
    if (!screen.ok){
      const warn = el('rtext-warn');
      if (warn){ warn.textContent = screen.reasons[0]; warn.hidden = false; }
      toast(screen.reasons[0], I.shield);
      return;
    }
    community(f.id).reviews.unshift({user:store.profile.name, at:Date.now(), stars,
      text, tags:[...tags], photos:shots, sub});
    save(); closeModal(); renderDetail(f.id, true); renderMarkers(); renderList(); renderProfile();
    toast(pendingNotice ? 'Review posted — photos await review' : 'Review posted', I.check);
    pushReview(f, stars, text, [...tags], sub, shots);
  });
}

/* ---------- host a bathroom ---------- */
function renderHostForm(){
  const mine = store.hosts.filter(h => !h.sample);
  el('host-body').innerHTML = `
    <div class="section">
      <div class="card" style="background:var(--host-soft); border-color:transparent; display:flex; gap:11px; align-items:flex-start">
        <span style="color:var(--host); flex:0 0 auto">${I.home}</span>
        <p style="margin:0; font-size:12.5px; line-height:1.55; color:var(--ink-2)">
          Have a bathroom people could use — at home, in your shop, at your café? List it, set a price, and stay in control of who comes in.
          <b style="color:var(--ink)">Your exact address stays hidden</b> until you accept a request.</p>
      </div>
    </div>
    ${mine.length ? `<div class="section"><h2>Your listings</h2><div class="card" style="padding:4px 12px">
      ${mine.map(h=>`<button class="row" data-open="${esc(h.id)}" style="padding-left:0;padding-right:0">
        <span class="ico" style="background:var(--host-soft); color:var(--host)">${I.home}</span>
        <span><h3>${esc(h.name)}</h3><span class="meta"><span class="pill host">${h.currency}${h.price}/use</span><span>${esc(h.hours||'')}</span></span></span>
        <span class="tail"><span class="dist">${(community(h.id).reviews||[]).length} reviews</span></span></button>`).join('')}
    </div></div>` : ''}
    <div class="section" style="padding-bottom:30px">
      <h2>${mine.length ? 'Add another' : 'Create a listing'}</h2>
      <div class="field"><span>What is it?</span>
        <input class="input" id="h-name" placeholder="e.g. Ground-floor guest bathroom"></div>
      <div class="field"><span>Your name</span><input class="input" id="h-host" placeholder="First name is enough" value="${esc(store.profile.name === 'You' ? '' : store.profile.name)}"></div>
      <div class="pricerow">
        <div class="field"><span>Price per visit</span><input class="input num" id="h-price" type="number" min="0" step="0.5" value="2"></div>
        <div class="field"><span>Currency</span>
          <select class="input" id="h-cur"><option>$</option><option>£</option><option>€</option><option>¥</option><option>₹</option><option>R$</option></select></div>
      </div>
      <div class="field"><span>When can people come?</span><input class="input" id="h-hours" placeholder="e.g. 8:00 – 21:00, weekdays" value="8:00 – 21:00"></div>
      <div class="field"><span>What should they know?</span>
        <textarea class="input" id="h-note" placeholder="Where the entrance is, whether there are stairs, house rules…"></textarea></div>
      <div class="field"><span>Features</span>
        <div class="chiprow" id="h-amen" style="flex-wrap:wrap; box-shadow:none">
          ${['Step-free entry','Soap & towels','Baby changing','Gender neutral','Separate entrance','Menstrual products'].map(a=>`<button class="chip" data-amen="${a}" aria-pressed="false">${a}</button>`).join('')}
        </div></div>
      <div class="field"><span>House rules</span>
        <textarea class="input" id="h-rules" placeholder="e.g. no smoking, shoes off, please don't ring the bell after 9pm"></textarea>
        <span class="hint">Shown to a guest before they can request.</span></div>
      <div class="field"><span>If they cancel</span>
        <div class="seg wrap" id="h-cancel">
          <button aria-pressed="true" data-p="free">Free anytime</button>
          <button aria-pressed="false" data-p="1h">Free up to 1 hour before</button>
        </div>
        <span class="hint">Until you accept, nothing is held either way.</span></div>
      <div class="field"><span>Photos</span>
        <button class="btn secondary" id="h-photo">${I.camera} <span id="h-photo-label">Add photos</span></button>
        <span class="hint">Photos of your bathroom go through the same check as everyone else&rsquo;s — and anything with a person in it is held for review.</span></div>
      <div class="field"><span>Where is it?</span>
        <span class="hint">We use the middle of the map. Pan the map behind this screen to your address first, or tap below to place it precisely.</span>
        <button class="btn secondary" id="h-place">${I.nav} Place it on the map</button></div>
      <div class="card safety" style="margin-bottom:14px">
        <span style="color:var(--accent); flex:0 0 auto">${I.shield}</span>
        <p><b>Before you would really do this.</b> Payments, holds, arrival codes and payouts all work
        in this build. Identity verification, insurance, background checks and a 24/7 line to report
        someone <b>do not exist yet</b> — and you should not let a stranger into your home on the strength
        of a prototype. Listings stay on this device.</p>
      </div>
      <button class="btn" id="h-submit">${I.plus} Publish listing</button>
    </div>`;

  let shots = [], amen = new Set(), coords = null, cancelPolicy = 'free';
  el('host-body').querySelectorAll('[data-amen]').forEach(b => b.addEventListener('click', () => {
    const on = b.getAttribute('aria-pressed') === 'true';
    b.setAttribute('aria-pressed', String(!on));
    on ? amen.delete(b.dataset.amen) : amen.add(b.dataset.amen);
  }));
  el('host-body').querySelectorAll('#h-cancel button').forEach((b,i,arr) => b.addEventListener('click', () => {
    arr.forEach(x => x.setAttribute('aria-pressed','false')); b.setAttribute('aria-pressed','true');
    cancelPolicy = b.dataset.p;
  }));
  el('h-photo').addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/*'; input.multiple = true;
    input.addEventListener('change', async () => {
      const label = el('h-photo-label');
      const files = [...input.files].slice(0,3);
      if (!files.length) return;
      const {kept, rejected} = await screenAndStore(files, 'listing', m => { if (label) label.textContent = m; });
      shots.push(...kept);
      if (label) label.textContent = shots.length ? `${shots.length} attached` : 'Add photos';
      if (rejected.length) toast(rejected[0], I.shield);
    });
    input.click();
  });
  el('h-place').addEventListener('click', () => {
    closePanel();
    startDropMode('host', pt => { coords = pt; openPanel('host'); toast('Location set — finish the listing', I.check); });
  });
  el('host-body').querySelectorAll('[data-open]').forEach(b => b.addEventListener('click', () => { closePanel(); openDetail(b.dataset.open); }));
  el('h-submit').addEventListener('click', () => {
    const name = el('h-name').value.trim();
    if (!name){ el('h-name').focus(); toast('Give your listing a name', I.flag); return; }
    const pt = coords || map.getCenter();
    const h = {id:'host:' + Date.now(), kind:'host', cat:'host', name,
      hostName:el('h-host').value.trim() || store.profile.name,
      lat:pt.lat, lng:pt.lng, price:Math.max(0, +el('h-price').value || 0), currency:el('h-cur').value,
      hours:el('h-hours').value.trim(), note:el('h-note').value.trim(), amen:[...amen], photos:shots,
      rules:el('h-rules').value.trim(), cancelPolicy, created:Date.now()};
    store.hosts.push(h);
    if (el('h-host').value.trim()) store.profile.name = el('h-host').value.trim();
    save(); renderHostForm(); renderMarkers(); renderList(); renderProfile();
    closePanel(); map.setView([h.lat, h.lng], Math.max(map.getZoom(), 16));
    toast('Listing published on your map', I.home);
  });
}
function feeBreakdown(price, cur){
  const fee = Math.round(price * PLATFORM_FEE * 100)/100;
  return `<div class="breakdown">
      <div><span>Bathroom visit</span><b class="num">${cur}${price.toFixed(2)}</b></div>
      <div><span>Service fee</span><b class="num">${cur}${fee.toFixed(2)}</b></div>
      <div class="total"><span>You pay</span><b class="num">${cur}${(price+fee).toFixed(2)}</b></div>
      <div class="payout"><span>${esc('Host receives')}</span><b class="num">${cur}${(price - fee).toFixed(2)}</b></div>
    </div>`;
}
const PLATFORM_FEE = 0.15;

function openBooking(f){
  const cur = f.currency || '$';
  const methods = Rentals.PAY_METHODS;
  let method = store.profile.payMethod || methods[0].id;
  openModal(`
    <h2>Request access</h2>
    <p class="lede">${esc(f.name)} · hosted by ${esc(f.hostName || 'a neighbour')}</p>
    <div class="field"><span>When?</span>
      <div class="seg" id="b-when"><button aria-pressed="true">Right now</button><button aria-pressed="false">Within an hour</button><button aria-pressed="false">Later today</button></div></div>
    <div class="field"><span>Anything the host should know?</span>
      <textarea class="input" id="b-note" placeholder="e.g. travelling with a toddler, need step-free access"></textarea></div>
    <div class="field"><span>Pay with</span>
      <div class="methods" id="b-methods">
        ${methods.map(m=>`<button class="method" data-m="${m.id}" aria-pressed="${m.id===method}">
          <span class="mlogo">${m.kind === 'wallet' ? I.coin : I.card}</span>
          <span><b>${m.label}</b>${m.tail ? `<span class="num"> ····&thinsp;${m.tail}</span>` : ''}</span>
          <span class="mcheck">${I.check}</span></button>`).join('')}
      </div>
      <span class="hint">Simulated methods. This app has no field that accepts a real card number — with a payment provider connected, their own secure form appears here instead.</span></div>
    ${feeBreakdown(f.price, cur)}
    <div class="card safety">
      <span style="color:var(--accent); flex:0 0 auto">${I.shield}</span>
      <p>
        <b>Nothing is charged now.</b> If the host accepts, your method is put on hold and only
        charged once you are actually let in. Decline or cancel and the hold is released.
        The exact address stays hidden until they accept.</p>
    </div>
    <button class="btn" id="b-send">Send request</button>`);
  let when = 'Right now';
  el('modal').querySelectorAll('#b-when button').forEach((b,i,arr) => b.addEventListener('click', () => {
    arr.forEach(x => x.setAttribute('aria-pressed','false')); b.setAttribute('aria-pressed','true'); when = b.textContent;
  }));
  el('modal').querySelectorAll('[data-m]').forEach(b => b.addEventListener('click', () => {
    el('modal').querySelectorAll('[data-m]').forEach(x => x.setAttribute('aria-pressed','false'));
    b.setAttribute('aria-pressed','true'); method = b.dataset.m;
  }));
  el('b-send').addEventListener('click', () => {
    store.profile.payMethod = method;
    const b = Rentals.create(store, f, {when, note:el('b-note').value.trim(), methodId:method});
    save(); closeModal(); renderProfile(); renderBookings();
    toast('Request sent to the host', I.check);
    openBookingDetail(b.id);
  });
}

/* ---------- one booking, from either side ---------- */
function openBookingDetail(bid){
  const b = store.bookings.find(x => x.id === bid);
  if (!b) return;
  renderBookingDetail(b);
  openPanel('booking');
}
function renderBookingDetail(b){
  const s = Rentals.GUEST_STATE[b.status] || {pill:'ghost', label:b.status, note:''};
  const cur = b.currency || '$';
  const listing = findFeature(b.listingId);
  const iAmHost = listing && (listing.hostName === store.profile.name || (listing.sample && store.hosts.some(h=>h.id===b.listingId)));
  el('booking-body').innerHTML = `
    <div class="detail-head">
      <span class="pill ${s.pill}">${s.label}</span>
      <h1 style="margin-top:10px">${esc(b.listingName)}</h1>
      <div class="kind">Hosted by ${esc(b.hostName)} · ${esc(b.when)} · requested ${timeAgo(b.created)}</div>
    </div>

    <div class="statuscard">
      <p class="note">${s.note}</p>
      ${b.status === 'accepted' || b.status === 'arrived' ? `
        <div class="codebox-lg">
          <span class="label">Arrival code</span>
          <b class="num">${b.arrivalCode}</b>
          <span class="hint">Give this to the host at the door</span>
        </div>
        <div class="osmrow">${I.home}<span>Address revealed: <b>${b.lat.toFixed(5)}, ${b.lng.toFixed(5)}</b> — tap Directions below</span></div>` : ''}
      ${b.paymentId ? `<div class="osmrow">${I.coin}<span>${b.status === 'completed'
          ? `Charged <b>${cur}${(b.price + (b.fee||0)).toFixed(2)}</b> · receipt <b>${esc(b.receipt||'')}</b>`
          : `On hold: <b>${cur}${(b.price + (b.fee||0)).toFixed(2)}</b> — not taken yet`}</span></div>` : ''}
      ${b.note ? `<div class="osmrow">${I.bubbleAlt}<span>Your note: “${esc(b.note)}”</span></div>` : ''}
    </div>

    ${b.status === 'accepted' ? `
      <div class="section"><h2>When you get there</h2>
        <div class="card">
          <button class="btn" data-b="directions" style="margin-bottom:10px">${I.nav} Directions to the door</button>
          <button class="btn secondary" data-b="share">${I.share} Tell someone where I am going</button>
        </div>
      </div>` : ''}

    ${b.status === 'completed' && !(b.ratings||{}).guest ? `
      <div class="section"><h2>How was it?</h2>
        <div class="card">
          <div class="starpick" id="b-rate">${[1,2,3,4,5].map(n=>`<button data-n="${n}" style="color:var(--line)">${I.starN(false,30)}</button>`).join('')}</div>
          <textarea class="input" id="b-rtext" style="margin-top:12px" placeholder="Anything worth saying about the host?"></textarea>
          <button class="btn" data-b="rate" style="margin-top:10px">Submit rating</button>
        </div>
      </div>` : ''}

    ${(b.ratings||{}).guest ? `<div class="section"><h2>Your rating</h2><div class="card">
      ${starsHTML(b.ratings.guest.stars,16)}<p class="rbody">${esc(b.ratings.guest.text||'')}</p></div></div>` : ''}

    <div class="section"><h2>What happened</h2>
      <div class="card activity">
        ${b.events.slice().reverse().map(e=>`<div class="act">
          <span class="aicon">${{requested:I.bubbleAlt, accepted:I.check, declined:I.x, arrived:I.home,
              completed:I.coin, cancelled:I.x, rated:I.star(true)}[e.type] || I.info}</span>
          <p>${{requested:'You asked the host', accepted:'Host accepted · payment held',
                declined:'Host declined · nothing held', arrived:'You arrived and gave the code',
                completed:'Visit finished · payment taken', cancelled:'Cancelled · hold released',
                rated:'Rating left'}[e.type] || e.type}</p>
          <time>${timeAgo(e.at)}</time></div>`).join('')}
      </div>
    </div>

    <div class="section" style="padding-bottom:30px">
      ${['requested','accepted'].includes(b.status)
        ? `<button class="btn secondary" data-b="cancel" style="color:var(--locked)">Cancel this request</button>` : ''}
      ${b.status === 'arrived' ? `<button class="btn" data-b="complete">${I.check} The host let me in — finish and pay</button>` : ''}
      ${b.status === 'accepted' ? `<button class="btn" data-b="code" style="margin-top:10px">I am at the door</button>` : ''}
      <p style="font-size:11.5px;color:var(--ink-3);line-height:1.55;margin:14px 2px 0">
        Payments run in simulation on this device. Nothing is charged, and no card details exist anywhere in this app.</p>
    </div>`;

  el('booking-body').querySelectorAll('[data-b]').forEach(btn => btn.addEventListener('click', async () => {
    const a = btn.dataset.b;
    try {
      if (a === 'cancel'){ await Rentals.cancel(store, b, 'guest'); save(); toast('Cancelled — hold released', I.check); }
      else if (a === 'code') promptArrival(b);
      else if (a === 'complete'){
        const {payment} = await Rentals.complete(store, b);
        save(); toast(`Paid ${b.currency}${(b.price + (b.fee||0)).toFixed(2)} · receipt ${payment.receipt}`, I.coin);
      }
      else if (a === 'directions') window.open(`https://www.openstreetmap.org/directions?to=${b.lat}%2C${b.lng}`, '_blank', 'noopener');
      else if (a === 'share'){
        const text = `I'm using a bathroom listed on Bathroom Finder at ${b.lat.toFixed(4)}, ${b.lng.toFixed(4)}, hosted by ${b.hostName}. Booking ${b.id}.`;
        if (navigator.share) navigator.share({title:'Where I am', text}).catch(()=>{});
        else { navigator.clipboard && navigator.clipboard.writeText(text); toast('Copied — paste it to whoever you like', I.share); }
        return;
      }
      else if (a === 'rate'){
        const stars = +(el('booking-body').dataset.rate || 0);
        if (!stars){ toast('Pick a rating first', I.star(false)); return; }
        Rentals.rate(store, b, 'guest', stars, el('b-rtext').value.trim());
        save(); toast('Thanks — that helps the next guest', I.check);
      }
      renderBookingDetail(b); renderProfile(); renderBookings();
    } catch(err){ toast(String(err.message || err), I.flag); }
  }));
  const rate = el('b-rate');
  if (rate) rate.querySelectorAll('[data-n]').forEach(x => x.addEventListener('click', () => {
    el('booking-body').dataset.rate = x.dataset.n;
    rate.querySelectorAll('[data-n]').forEach(y => {
      const on = +y.dataset.n <= +x.dataset.n;
      y.style.color = on ? 'var(--star)' : 'var(--line)'; y.innerHTML = I.starN(on, 30);
    });
  }));
}
function promptArrival(b){
  openModal(`<h2>At the door</h2>
    <p class="lede">Give the host your arrival code, then type it here to confirm you are in.</p>
    <div class="codebox-lg" style="margin-bottom:16px"><span class="label">Your code</span><b class="num">${b.arrivalCode}</b></div>
    <div class="field"><span>Confirm the code</span><input class="input num" id="ar-code" inputmode="numeric" maxlength="4" placeholder="4 digits"></div>
    <button class="btn" id="ar-go">Confirm arrival</button>`);
  el('ar-go').addEventListener('click', () => {
    const r = Rentals.arrive(store, b, el('ar-code').value);
    if (!r.ok){ toast(r.error, I.flag); return; }
    save(); closeModal(); renderBookingDetail(b); renderProfile();
    toast('Confirmed — finish up when you are done', I.check);
  });
}

/* ---------- guest's bookings list ---------- */
function renderBookings(){
  const list = store.bookings.slice().reverse();
  el('bookings-body').innerHTML = list.length ? `<div style="padding:8px 12px">${list.map(b=>{
    const s = Rentals.GUEST_STATE[b.status] || {pill:'ghost', label:b.status};
    return `<button class="row" data-booking="${b.id}">
      <span class="ico" style="background:var(--host-soft); color:var(--host)">${I.home}</span>
      <span><h3>${esc(b.listingName)}</h3>
        <span class="meta"><span class="pill ${s.pill}">${s.label}</span><span>${timeAgo(b.created)}</span></span></span>
      <span class="tail"><span class="dist num">${b.currency}${b.price.toFixed(2)}</span></span></button>`;
  }).join('')}</div>`
  : `<div class="empty">${I.home}<h3>No visits yet</h3><p>When you request access to someone&rsquo;s bathroom, it shows up here with its arrival code and receipt.</p></div>`;
  el('bookings-body').querySelectorAll('[data-booking]').forEach(b =>
    b.addEventListener('click', () => openBookingDetail(b.dataset.booking)));
}

/* ---------- host console ---------- */
function renderHostConsole(){
  const mine = store.hosts.filter(h => !h.sample);
  const myIds = new Set(store.hosts.map(h => h.id));         // sample listings included so the flow is testable
  const incoming = store.bookings.filter(b => myIds.has(b.listingId)).slice().reverse();
  const earned = incoming.filter(b => b.status === 'completed').reduce((a,b) => a + (b.payout || 0), 0);
  const pending = incoming.filter(b => b.status === 'requested').length;

  el('console-body').innerHTML = `
    <div class="stats">
      <div class="stat"><b class="num">${mine.length}</b><span>Listings</span></div>
      <div class="stat"><b class="num">${pending}</b><span>To answer</span></div>
      <div class="stat"><b class="num">$${earned.toFixed(2)}</b><span>Earned</span></div>
    </div>
    <div class="section">
      <div class="card safety">
        <span style="color:var(--accent); flex:0 0 auto">${I.shield}</span>
        <p>You are seeing both sides here because this is one device. In the real thing the guest and the
        host are different people on different phones, and identity checks would run before either could book.</p>
      </div>
    </div>
    <div class="section" style="padding-bottom:30px">
      <h2>Requests</h2>
      ${incoming.length ? `<div class="card" style="padding:4px 12px">${incoming.map(b=>{
        const s = Rentals.GUEST_STATE[b.status] || {pill:'ghost', label:b.status};
        return `<div class="review">
          <div class="rhead">
            <div class="avatar" style="background:${avColor(b.guestName)}">${esc(initials(b.guestName))}</div>
            <div style="flex:1"><div class="rname">${esc(b.guestName)}</div>
              <div class="rmeta">${esc(b.listingName)} · ${esc(b.when)} · ${timeAgo(b.created)}</div></div>
            <span class="pill ${s.pill}">${s.label}</span>
          </div>
          ${b.note ? `<p class="rbody">“${esc(b.note)}”</p>` : ''}
          ${b.status === 'completed' ? `<p class="rbody" style="color:var(--ink-2)">Paid out <b class="num">${b.currency}${(b.payout||0).toFixed(2)}</b> after the ${Math.round(PLATFORM_FEE*100)}% service fee · receipt ${esc(b.receipt||'')}</p>` : ''}
          ${b.status === 'requested' ? `<div class="rfoot" style="display:flex;gap:8px;margin-top:11px">
              <button class="minibtn yes" data-accept="${b.id}">${I.check} Accept</button>
              <button class="minibtn no" data-decline="${b.id}">${I.x} Decline</button>
            </div>` : ''}
          ${b.status === 'arrived' ? `<div class="rfoot" style="margin-top:11px">
              <button class="minibtn yes" data-finish="${b.id}">${I.check} They are in — take payment</button></div>` : ''}
          ${b.status === 'accepted' ? `<p class="rbody" style="color:var(--ink-2)">Waiting for them to arrive. Their code is <b class="num">${b.arrivalCode}</b>.</p>` : ''}
        </div>`;
      }).join('')}</div>`
      : `<div class="empty">${I.bubbleAlt}<h3>No requests yet</h3><p>When someone asks to use a bathroom you list, it lands here for you to accept or decline.</p></div>`}
    </div>`;

  const act = async (id, fn, msg) => {
    const b = store.bookings.find(x => x.id === id);
    try { await fn(b); save(); renderHostConsole(); renderBookings(); renderProfile(); toast(msg, I.check); }
    catch(err){ toast(String(err.message || err), I.flag); }
  };
  el('console-body').querySelectorAll('[data-accept]').forEach(x => x.addEventListener('click', () =>
    act(x.dataset.accept, async b => { await Rentals.accept(store, b); }, 'Accepted — payment held, address shared')));
  el('console-body').querySelectorAll('[data-decline]').forEach(x => x.addEventListener('click', () =>
    act(x.dataset.decline, async b => { Rentals.decline(store, b); }, 'Declined — nothing was held')));
  el('console-body').querySelectorAll('[data-finish]').forEach(x => x.addEventListener('click', () =>
    act(x.dataset.finish, async b => { await Rentals.complete(store, b); }, 'Payment taken — payout queued')));
}

/* ---------- add a bathroom (drop a pin) ---------- */
function startDropMode(kind, cb){
  state.dropMode = {kind, cb};
  el('crosshair').hidden = false; el('dropbar').hidden = false;
  el('sheet').dataset.state = 'hidden';
}
function endDropMode(){
  state.dropMode = null;
  el('crosshair').hidden = true; el('dropbar').hidden = true;
  el('sheet').dataset.state = 'peek';
}
function openAddForm(pt){
  openModal(`
    <h2>Add a bathroom</h2>
    <p class="lede">Dropped at ${pt.lat.toFixed(5)}, ${pt.lng.toFixed(5)}</p>
    <div class="field"><span>Name</span><input class="input" id="a-name" placeholder="e.g. Market Square public toilets"></div>
    <div class="field"><span>What kind of place?</span>
      <div class="seg wrap" id="a-cat">
        <button aria-pressed="true" data-c="toilets">Public toilet</button>
        <button aria-pressed="false" data-c="food">Café / restaurant</button>
        <button aria-pressed="false" data-c="shop">Shop</button>
        <button aria-pressed="false" data-c="civic">Library / civic</button>
      </div></div>
    <div class="field"><span>How do you get in?</span>
      <div class="seg wrap" id="a-acc">
        <button aria-pressed="true" data-a="open">Anyone can</button>
        <button aria-pressed="false" data-a="fee">There is a fee</button>
        <button aria-pressed="false" data-a="customers">Customers only</button>
        <button aria-pressed="false" data-a="locked">Locked / ask staff</button>
      </div></div>
    <div class="field"><span>Anything else?</span><textarea class="input" id="a-note" placeholder="Where exactly it is, door codes, opening times…"></textarea></div>
    <button class="btn" id="a-save">${I.plus} Add to the map</button>`);
  let cat = 'toilets', acc = 'open';
  el('modal').querySelectorAll('#a-cat button').forEach((b,i,arr) => b.addEventListener('click', () => {
    arr.forEach(x=>x.setAttribute('aria-pressed','false')); b.setAttribute('aria-pressed','true'); cat = b.dataset.c; }));
  el('modal').querySelectorAll('#a-acc button').forEach((b,i,arr) => b.addEventListener('click', () => {
    arr.forEach(x=>x.setAttribute('aria-pressed','false')); b.setAttribute('aria-pressed','true'); acc = b.dataset.a; }));
  el('a-save').addEventListener('click', () => {
    const name = el('a-name').value.trim();
    if (!name){ el('a-name').focus(); toast('Give it a name', I.flag); return; }
    const tags = {};
    if (acc === 'fee') tags.fee = 'yes';
    if (acc === 'customers') tags.access = 'customers';
    if (acc === 'locked') tags.access = 'private';
    if (cat === 'toilets') tags.amenity = 'toilets';
    const f = {id:'local:' + Date.now(), cat, name, sub:'Added by you', lat:pt.lat, lng:pt.lng,
               tags, note:el('a-note').value.trim(), created:Date.now()};
    store.local.push(f); save(); closeModal();
    Sync.place({place:placePayload(f)}).then(afterPush).catch(()=>{});
    renderMarkers(); renderList(); renderProfile();
    toast('Added — thanks for mapping it', I.check);
    openDetail(f.id);
  });
}

/* ---------- saved & profile ---------- */
function renderSaved(){
  const origin = state.me || (map ? map.getCenter() : {lat:0,lng:0});
  const rows = store.saved.map(id => findFeature(id)).filter(Boolean)
    .map(f => ({f, d:haversine(origin, {lat:f.lat, lng:f.lng})}));
  el('saved-body').innerHTML = rows.length
    ? `<div style="padding:8px 12px">${rows.map(rowHTML).join('')}</div>`
    : `<div class="empty">${I.starN(false,26)}<h3>No saved bathrooms yet</h3>
       <p>Star anything on the map and it lands here — the one near work, the one that is always clean, the one to avoid.</p></div>`;
  wireRows(el('saved-body'));
  const missing = store.saved.length - rows.length;
  if (missing > 0) el('saved-body').insertAdjacentHTML('beforeend',
    `<p style="font-size:11.5px;color:var(--ink-3);padding:4px 18px 20px;line-height:1.5">${missing} saved place${missing===1?' is':'s are'} outside the area currently loaded — pan the map there to see ${missing===1?'it':'them'} again.</p>`);
}
function renderProfile(){
  const reviews = Object.values(store.community).flatMap(c => c.reviews.filter(r => r.user === store.profile.name));
  const photos = reviews.reduce((a,r)=>a+(r.photos||[]).length, 0);
  const confirms = Object.values(store.community).reduce((a,c)=>a+c.confirms.length, 0);
  const points = reviews.length*60 + photos*25 + confirms*10 + store.local.length*120 + store.hosts.filter(h=>!h.sample).length*150;
  const level = Math.max(1, Math.floor(points/500) + 1);
  el('profile-body').innerHTML = `
    <div class="profile-hero">
      <div class="avatar" style="background:${avColor(store.profile.name)}">${esc(initials(store.profile.name))}</div>
      <div style="flex:1">
        <h2>${esc(store.profile.name)}</h2>
        <div style="font-size:12.5px;color:var(--ink-2);margin-top:3px">Level ${level} · <span class="num">${points}</span> points</div>
      </div>
      <button class="minibtn" id="p-rename">Edit</button>
    </div>
    <div class="stats">
      <div class="stat"><b class="num">${reviews.length}</b><span>Reviews</span></div>
      <div class="stat"><b class="num">${photos}</b><span>Photos</span></div>
      <div class="stat"><b class="num">${store.saved.length}</b><span>Saved</span></div>
    </div>
    <div class="stats" style="margin-top:8px">
      <div class="stat"><b class="num">${store.local.length}</b><span>Added</span></div>
      <div class="stat"><b class="num">${store.hosts.filter(h=>!h.sample).length}</b><span>Listings</span></div>
      <div class="stat"><b class="num">${confirms}</b><span>Confirmations</span></div>
    </div>
    ${!FEATURES.rentals ? '' : `
    <div class="section">
      <h2>Renting</h2>
      <div class="card" style="padding:4px 14px">
        <button class="row navrow" data-nav="bookings">
          <span class="ico" style="background:var(--host-soft); color:var(--host)">${I.home}</span>
          <span><h3>Your visits</h3><span class="meta">Requests, arrival codes and receipts</span></span>
          <span class="tail"><span class="dist num">${store.bookings.length}</span></span></button>
        <button class="row navrow" data-nav="console">
          <span class="ico" style="background:var(--accent-soft); color:var(--accent)">${I.people}</span>
          <span><h3>Host console</h3><span class="meta">Answer requests and take payment</span></span>
          <span class="tail"><span class="dist num">${store.bookings.filter(b=>b.status==='requested').length}</span></span></button>
      </div>
    </div>`}
    <div class="section">
      <h2>Safety</h2>
      <div class="card" style="padding:4px 14px">
        <button class="row navrow" data-nav="moderation">
          <span class="ico" style="background:var(--accent-soft); color:var(--accent)">${I.shield}</span>
          <span><h3>Photo review queue</h3><span class="meta">${pendingCount() ? `${pendingCount()} waiting on a decision` : 'Nothing waiting'}</span></span>
          <span class="tail"><span class="dist num">${pendingCount()}</span></span></button>
      </div>
    </div>
    <div class="section">
      <h2>Support the app</h2>
      <div class="card" style="padding:4px 14px">
        ${!FEATURES.plus ? '' : `
        <button class="row navrow" data-nav="plus">
          <span class="ico" style="background:var(--accent-soft); color:var(--accent)">${I.sparkle}</span>
          <span><h3>Bathroom Finder Plus</h3><span class="meta">${Ads.isPlus() ? 'Active — no ads' : 'Remove ads, offline city packs'}</span></span>
          <span class="tail">${I.back}</span></button>`}
        <button class="row navrow" data-nav="advertise">
          <span class="ico" style="background:var(--code-soft); color:var(--code)">${I.coin}</span>
          <span><h3>Advertise your business</h3><span class="meta">Reach people looking for a bathroom nearby</span></span>
          <span class="tail">${I.back}</span></button>
      </div>
    </div>
    <div class="section">
      <h2>Help improve the app</h2>
      <div class="card" style="padding:4px 14px">
        <button class="row navrow" data-nav="feedback">
          <span class="ico" style="background:var(--code-soft); color:var(--code)">${I.bubbleAlt}</span>
          <span><h3>Send feedback</h3><span class="meta">Anything broken, confusing or missing</span></span>
          <span class="tail">${I.back}</span></button>
      </div>
      <p style="font-size:11.5px;color:var(--ink-3);line-height:1.55;margin:10px 2px 0">
        ${Sync.online ? 'Connected — what you add is shared with everyone using the app.'
                      : 'No connection to the shared database, so your contributions stay on this device for now.'}
      </p>
    </div>
    <div class="section">
      <h2>Your data</h2>
      <div class="card">
        <p style="margin:0 0 12px; font-size:12.5px; line-height:1.6; color:var(--ink-2)">
          Everything you add lives in this browser. Nothing is uploaded, and clearing your browser data erases it.
          A shared, worldwide database is the next thing to build.</p>
        <button class="btn secondary" id="p-export">Export my data as a file</button>
        <button class="btn secondary" id="p-reset" style="margin-top:8px; color:var(--locked)">Erase everything on this device</button>
      </div>
    </div>
    <div class="section">
      <h2>About</h2>
      <div class="card" style="padding:4px 14px">
        <a class="row navrow" href="support.html" style="text-decoration:none; color:inherit">
          <span class="ico" style="background:var(--surface-2); color:var(--ink-2)">${I.info}</span>
          <span><h3>Help &amp; contact</h3><span class="meta">Report something, or tell us what broke</span></span>
          <span class="tail">${I.back}</span></a>
        <a class="row navrow" href="privacy.html" style="text-decoration:none; color:inherit">
          <span class="ico" style="background:var(--surface-2); color:var(--ink-2)">${I.shield}</span>
          <span><h3>Privacy</h3><span class="meta">Your exact location stays on your phone</span></span>
          <span class="tail">${I.back}</span></a>
        <a class="row navrow" href="terms.html" style="text-decoration:none; color:inherit">
          <span class="ico" style="background:var(--surface-2); color:var(--ink-2)">${I.bubbleAlt}</span>
          <span><h3>Terms</h3><span class="meta">What this app is and is not</span></span>
          <span class="tail">${I.back}</span></a>
      </div>
    </div>
    <div class="section" style="padding-bottom:30px">
      <h2>Credits</h2>
      <div class="card"><p style="margin:0; font-size:12px; line-height:1.6; color:var(--ink-2)">
        Places and bathroom data &copy; <b>OpenStreetMap</b> contributors, licensed ODbL.
        Map tiles by <b>CARTO</b>. Search by <b>Nominatim</b>. Routing links open OpenStreetMap.</p></div>
    </div>`;
  el('profile-body').querySelectorAll('[data-nav]').forEach(b => b.addEventListener('click', () => {
    const n = b.dataset.nav;
    /* Guarded as well as hidden: a stale rendered panel or a keyboard path
       should not be able to reach a flow the build does not ship. */
    if (n === 'bookings' && FEATURES.rentals){ renderBookings(); openPanel('bookings'); }
    else if (n === 'console' && FEATURES.rentals){ renderHostConsole(); openPanel('console'); }
    else if (n === 'moderation'){ renderModeration(); openPanel('moderation'); }
    else if (n === 'feedback') openFeedback();
    else if (n === 'plus' && FEATURES.plus) openPlus();
    else if (n === 'advertise') openAdvertise();
  }));
  el('p-rename').addEventListener('click', () => {
    openModal(`<h2>What should we call you?</h2>
      <p class="lede">Shown on the reviews you write.</p>
      <div class="field"><input class="input" id="p-name" value="${esc(store.profile.name)}" placeholder="Your name"></div>
      <button class="btn" id="p-save">Save</button>`);
    el('p-save').addEventListener('click', () => {
      const v = el('p-name').value.trim(); if (v) store.profile.name = v;
      save(); closeModal(); renderProfile(); toast('Name updated', I.check);
    });
  });
  el('p-export').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(store, null, 1)], {type:'application/json'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'bathroom-finder-data.json'; a.click();
    setTimeout(()=>URL.revokeObjectURL(a.href), 4000);
    toast('Exported', I.check);
  });
  el('p-reset').addEventListener('click', () => {
    openModal(`<h2>Erase everything?</h2>
      <p class="lede">Your reviews, photos, saves and listings on this device will be gone. This cannot be undone.</p>
      <button class="btn" id="p-really" style="background:var(--locked); color:#fff">Erase everything</button>
      <button class="btn secondary" id="p-nope" style="margin-top:8px">Keep my data</button>`);
    el('p-nope').addEventListener('click', closeModal);
    el('p-really').addEventListener('click', () => {
      store = structuredClone(DEFAULT_STORE); save(); closeModal();
      renderMarkers(); renderList(); renderProfile(); renderSaved(); renderHostForm();
      toast('Everything erased', I.check);
    });
  });
}

/* ---------- money ----------------------------------------------------- */
async function refreshSponsors(){
  if (!map || Ads.isPlus()) return;
  const c = map.getCenter();
  /* Two decimal places, ~1.1km. Sponsors are geofenced by neighbourhood, so
     this is all the precision the feature needs — and it matters, because the
     map centres on you when you tap the crosshair. At five decimals this
     request was sending a metre-accurate fix of where someone is standing to
     an ad endpoint, which is not what "ads based on the part of the map you
     are looking at" means to the person reading it. */
  const lat = c.lat.toFixed(2), lng = c.lng.toFixed(2);
  try {
    const r = await fetch(apiURL(`/api/v1/sponsors?lat=${lat}&lng=${lng}`));
    if (!r.ok) return;
    const {sponsors} = await r.json();
    state.sponsors = sponsors || [];
    Ads.setSponsors(state.sponsors);
  } catch(e){ /* ads must never break the map */ }
  await refreshAd();
}
async function refreshAd(){
  try { state.currentAd = await Ads.slot({origin: state.me || (map && map.getCenter())}); }
  catch(e){ state.currentAd = null; }
}

/* The pitch to a business. This is the revenue line that is actually worth
   selling — local intent beats a banner by an order of magnitude. */
function openAdvertise(){
  const c = map ? map.getCenter() : null;
  openModal(`
    <h2>Put your business in front of people looking for a bathroom</h2>
    <p class="lede">They are already nearby, already looking, and about to walk into
    somebody's premises. It might as well be yours — most people buy something.</p>
    <div class="card" style="margin-bottom:16px">
      <p style="margin:0 0 10px; font-size:13px; line-height:1.6"><b>How it works.</b> Your
      listing appears in the nearby list, clearly marked as sponsored, only to people
      within walking distance of you. You pay per thousand views or per tap.</p>
      <p style="margin:0; font-size:12.5px; line-height:1.6; color:var(--ink-2)">
      We will not bury a closer, cleaner, free bathroom underneath a paid one. The
      sponsored slot sits below real results, because an app people stop trusting is
      worth nothing to advertise on.</p>
    </div>
    <div class="field"><span>Business name</span><input class="input" id="ad-biz" placeholder="e.g. Bell &amp; Bean Coffee"></div>
    <div class="field"><span>How do we reach you?</span>
      <input class="input" id="ad-contact" placeholder="Email or phone">
      <span class="hint">Only used to reply about advertising.</span></div>
    <div class="field"><span>Anything you want to say?</span>
      <textarea class="input" id="ad-note" placeholder="Where you are, opening hours, what you would want the listing to say"></textarea></div>
    <button class="btn" id="ad-send">Send enquiry</button>
    <p style="font-size:11.5px;color:var(--ink-3);line-height:1.55;margin:14px 2px 0">
      Nothing is charged and nothing goes live until we have spoken.</p>`);
  el('ad-send').addEventListener('click', async () => {
    const business = el('ad-biz').value.trim(), contact = el('ad-contact').value.trim();
    if (!business || !contact){ toast('Name and a way to reach you, please', I.flag); return; }
    try {
      const r = await fetch(apiURL('/api/v1/lead'), {method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({business, contact, note:el('ad-note').value.trim(),
                              lat:c && c.lat, lng:c && c.lng})});
      if (!r.ok) throw new Error((await r.json()).error);
      closeModal(); toast('Thanks — we will be in touch', I.check);
    } catch(err){ toast(String(err.message || 'Could not send that'), I.flag); }
  });
}

function openPlus(){
  /* Unreachable while FEATURES.plus is false — the nav row is not rendered
     and the dispatch is guarded. Guarded here too so that stays true if
     someone wires up a new caller without reading the flag. */
  if (!FEATURES.plus) return;
  const plus = Ads.isPlus();
  openModal(`
    <h2>Bathroom Finder Plus</h2>
    <p class="lede">${plus ? 'You have Plus. Thank you — it is what keeps this running.'
      : 'A few pounds a year, and the app stops needing advertisers.'}</p>
    <div class="card" style="margin-bottom:14px">
      ${[['No ads at all','The sponsored slot disappears'],
         ['Offline city packs','Download a whole city before you travel'],
         ['Filters that stick','Step-free, baby changing, gender neutral — remembered'],
         ['Early access','New features before everyone else']]
        .map(([t,d]) => `<div class="osmrow" style="border-top:none">${I.check}<span><b>${t}</b> — ${d}</span></div>`).join('')}
    </div>
    ${plus ? `<button class="btn secondary" id="plus-off">Turn Plus off (test build)</button>`
           : `<button class="btn" id="plus-on">Try it — free while we are testing</button>`}
    <p style="font-size:11.5px;color:var(--ink-3);line-height:1.55;margin:14px 2px 0">
      Billing is not connected in this build, so nothing is charged. On the stores this
      would be an in-app subscription, which Apple and Google take 15–30% of.</p>`);
  const on = el('plus-on'), off = el('plus-off');
  if (on) on.addEventListener('click', () => {
    try { localStorage.setItem('bf.plus','1'); } catch(e){}
    state.currentAd = null; if (typeof AdMobNative !== 'undefined') AdMobNative.hideBanner();
    closeModal(); renderList(); renderProfile();
    toast('Plus is on — no more ads', I.sparkle);
  });
  if (off) off.addEventListener('click', () => {
    try { localStorage.removeItem('bf.plus'); } catch(e){}
    closeModal(); refreshAd().then(renderList); renderProfile();
    toast('Plus turned off', I.check);
  });
}

/* Asked once, before any personalised ad runs. Saying no is a real choice
   that leaves only contextual ads — not a dark pattern that nags. */
function maybeAskConsent(){
  if (Ads.consentAsked() || Ads.isPlus()) return;
  setTimeout(() => {
    if (state.panel || el('modal').dataset.open === 'true') return;
    openModal(`
      <h2>Ads in this app</h2>
      <p class="lede">Bathroom Finder is free, and sponsored listings from nearby
      businesses are how it stays free.</p>
      <div class="card" style="margin-bottom:14px">
        <p style="margin:0;font-size:13px;line-height:1.6">You can allow ads to be
        personalised using an advertising identifier, or keep them
        <b>contextual only</b> — based on the part of the map you are looking at, and
        nothing else. Your exact position is never sent — choosing a sponsor uses the
        map area rounded to about a kilometre.</p>
      </div>
      <button class="btn" id="c-no">Keep ads contextual</button>
      <button class="btn secondary" id="c-yes" style="margin-top:8px">Allow personalised ads</button>`);
    el('c-no').addEventListener('click', () => { Ads.setConsent(false); closeModal(); });
    el('c-yes').addEventListener('click', () => { Ads.setConsent(true); closeModal(); });
  }, 20000);   // not on first launch — let someone find a bathroom first
}

/* ---------- tester feedback ---------- */
function openFeedback(){
  openModal(`
    <h2>What went wrong?</h2>
    <p class="lede">Anything at all — a bug, something confusing, something missing.
    We get the message plus which screen you were on. Nothing else.</p>
    <div class="field">
      <textarea class="input" id="fb-text" style="min-height:120px"
        placeholder="e.g. the map jumped back when I searched, or I could not tell if it was open"></textarea>
    </div>
    <button class="btn" id="fb-send">Send</button>
    <p style="font-size:11.5px;color:var(--ink-3);line-height:1.55;margin:14px 2px 0">
      ${Sync.online ? 'Goes straight to whoever is running this test.'
                    : 'No connection right now — this will be sent when you are back online.'}</p>`);
  el('fb-send').addEventListener('click', async () => {
    const text = el('fb-text').value.trim();
    if (text.length < 3){ toast('Tell us a little more', I.flag); return; }
    closeModal();
    const res = await Sync.feedback({text, userName:store.profile.name,
      context:{screen:state.panel || 'map', zoom:map && map.getZoom(),
               online:navigator.onLine, version:'v1.4.0'}});
    toast(res && res.queued ? 'Saved — will send when you are online' : 'Thank you — sent', I.check);
    updateSyncBadge();
  });
}

/* ---------- report a problem ----------
   Every competitor's reviews complain about pins in the wrong place with no
   way to fix them, and about listings that closed years ago. So corrections
   are first-class here: they change what everyone sees, immediately.      */
const PROBLEMS = [
  {id:'moved',   label:'The pin is in the wrong place', hint:'You will place it correctly on the map'},
  {id:'closed',  label:'It is permanently closed',      hint:'Two reports and it stops being listed'},
  {id:'noexist', label:'There is no bathroom here',     hint:'For places wrongly listed as having one'},
  {id:'hours',   label:'The opening hours are wrong',   hint:'Give the correct hours'},
  {id:'private', label:'It is not open to the public',  hint:'Staff only, customers only, or locked'}
];
function openReport(f){
  openModal(`
    <h2>Report a problem</h2>
    <p class="lede">${esc(f.name)}</p>
    <div class="toggle-list">
      ${PROBLEMS.map(p=>`<button class="problem" data-p="${p.id}">
        <span><b>${p.label}</b><span>${p.hint}</span></span>
        <span class="chev">${I.back}</span></button>`).join('')}
    </div>
    <p style="font-size:11.5px;color:var(--ink-3);line-height:1.55;margin:16px 2px 0">
      Corrections take effect straight away for you, and count towards the listing for everyone else.
      Two independent reports retire a listing.</p>`);
  el('modal').querySelectorAll('[data-p]').forEach(b => b.addEventListener('click', () => {
    const kind = b.dataset.p;
    closeModal();
    if (kind === 'moved'){
      closePanel();
      startDropMode('move', pt => {
        const c = community(f.id);
        c.moved = {lat:pt.lat, lng:pt.lng, at:Date.now()};
        Sync.correction({place:placePayload(f), kind:'moved', value:{lat:pt.lat, lng:pt.lng}}).then(afterPush).catch(()=>{});
        c.reports.push({kind:'moved', at:Date.now()});
        save(); renderMarkers(); renderList(); openDetail(f.id);
        toast('Pin moved — thank you, that fixes it for you', I.check);
      });
      return;
    }
    if (kind === 'hours'){
      openModal(`<h2>What are the real hours?</h2>
        <p class="lede">${esc(f.name)}</p>
        <div class="field"><span>Opening hours</span>
          <input class="input" id="fix-hours" placeholder="e.g. Mo-Fr 08:00-18:00; Sa 09:00-13:00"
                 value="${esc(community(f.id).hours || (f.tags && f.tags.opening_hours) || '')}">
          <span class="hint">Same format OpenStreetMap uses. <b>24/7</b> works too.</span>
          <span class="warn" id="fix-warn" hidden></span></div>
        <button class="btn" id="fix-save">Save hours</button>`);
      el('fix-save').addEventListener('click', () => {
        const v = el('fix-hours').value.trim();
        const parsed = parseHours(v);
        if (v && parsed.state === 'unknown' && !/sunrise|sunset/.test(v)){
          const w = el('fix-warn');
          w.textContent = 'We could not read that. Try something like "Mo-Fr 08:00-18:00" or "24/7".';
          w.hidden = false; return;
        }
        community(f.id).hours = v || null;
        Sync.correction({place:placePayload(f), kind:'hours', value:v || null}).then(afterPush).catch(()=>{});
        community(f.id).confirms.push({at:Date.now(), status:'hours'});
        save(); closeModal(); renderDetail(f.id, true); renderList(); renderMarkers();
        toast('Hours updated', I.clock);
      });
      return;
    }
    const c = community(f.id);
    c.reports.push({kind, at:Date.now(), by:store.profile.name});
    Sync.report({place:placePayload(f), targetType:'place', kind}).then(afterPush).catch(()=>{});
    if (kind === 'closed' || kind === 'noexist') c.status = 'locked';
    if (kind === 'private') c.status = 'private';
    save(); renderDetail(f.id, true); renderMarkers(); renderList();
    const n = c.reports.length;
    toast(n >= 2 ? 'Reported — that is two, so it is now flagged for everyone'
                 : 'Reported — thank you', I.flag);
  }));
}

/* ---------- moderation queue ----------
   Stands in for the review team. On a real launch this is not a screen in the
   app — it is a staffed queue, and photos wait here until someone clears them. */
function renderModeration(){
  const all = Object.values(store.photos).sort((a,b)=>b.at-a.at);
  const pending = all.filter(p => p.state === 'pending');
  const decided = all.filter(p => p.state !== 'pending');
  const card = p => {
    const f = findFeature(p.featureId);
    const ex = p.scores ? ((p.scores.porn||0)+(p.scores.hentai||0)) : null;
    return `<div class="modcard">
      <img src="${p.data}" alt="Photo awaiting review">
      <div class="modmeta">
        <b>${esc(f ? f.name : 'Unknown place')}</b>
        <span>${esc(p.by)} · ${timeAgo(p.at)}</span>
        ${p.scores ? `<span class="num">explicit ${(ex*100).toFixed(1)}% · suggestive ${((p.scores.sexy||0)*100).toFixed(1)}%${p.faces>0?` · ${p.faces} face${p.faces===1?'':'s'}`:''}</span>` : '<span>no automatic scores</span>'}
        ${(p.reasons||[]).map(r=>`<span class="why">${esc(r)}</span>`).join('')}
        ${p.reports.length ? `<span class="why" style="color:var(--locked)">${p.reports.length} report${p.reports.length===1?'':'s'} from users</span>` : ''}
        ${p.state === 'pending'
          ? `<div class="modbtns"><button class="minibtn yes" data-approve="${p.id}">${I.check} Publish</button>
             <button class="minibtn no" data-reject="${p.id}">${I.x} Reject</button></div>`
          : `<span class="pill ${p.state === 'approved' ? 'open' : 'locked'}">${p.state === 'approved' ? 'Published' : 'Rejected'}</span>`}
      </div>
    </div>`;
  };
  el('moderation-body').innerHTML = `
    <div class="section">
      <div class="card safety">
        <span style="color:var(--accent); flex:0 0 auto">${I.shield}</span>
        <p>Every photo is checked on the device before it goes anywhere: location data stripped, explicit
        content classified, and people detected. Anything the checker is unsure about — or that anyone
        reports — waits here. <b>Nothing is published on the strength of a check that did not run.</b></p>
      </div>
    </div>
    <div class="section">
      <h2>Waiting for a decision <span class="more num">${pending.length}</span></h2>
      ${pending.length ? pending.map(card).join('') : `<div class="card"><p style="margin:0;font-size:13px;color:var(--ink-2)">Nothing waiting. Photos land here when the automatic check is unsure, when someone is in shot, or when a user reports one.</p></div>`}
    </div>
    ${decided.length ? `<div class="section" style="padding-bottom:30px"><h2>Already decided</h2>${decided.map(card).join('')}</div>` : ''}`;

  el('moderation-body').querySelectorAll('[data-approve]').forEach(b => b.addEventListener('click', () => {
    store.photos[b.dataset.approve].state = 'approved'; save(); renderModeration(); renderProfile();
    if (state.sel) renderDetail(state.sel, true);
    toast('Published', I.check);
  }));
  el('moderation-body').querySelectorAll('[data-reject]').forEach(b => b.addEventListener('click', () => {
    store.photos[b.dataset.reject].state = 'rejected'; save(); renderModeration(); renderProfile();
    if (state.sel) renderDetail(state.sel, true);
    toast('Rejected — it stays hidden', I.shield);
  }));
}

/* ---------- search (Nominatim) ---------- */
let searchTimer = null;
async function doSearch(q){
  if (q.trim().length < 2){ el('results').hidden = true; return; }

  /* Places already loaded answer instantly and are what people usually mean
     — "the library", "bell & bean" — so show those above the geocoder. */
  const origin = state.me || map.getCenter();
  const local = allFeatures()
    .map(f => ({f, s: scoreMatch(f, q), d: haversine(origin, pointOf(f))}))
    .filter(x => x.s > 0)
    .sort((a,b) => b.s - a.s || a.d - b.d)
    .slice(0, 5);
  const localHTML = local.map(x => `<button data-feature="${esc(x.f.id)}">
      <b>${esc(x.f.name)}</b><span>${esc(x.f.sub || CATS[x.f.cat].label)} · ${showDist(x.d)} away</span></button>`).join('');
  if (localHTML){
    el('results').innerHTML = `<div class="reshead">On the map</div>` + localHTML +
      `<div class="reshead">Searching everywhere…</div>`;
    el('results').hidden = false;
    el('results').querySelectorAll('[data-feature]').forEach(b => b.addEventListener('click', () => {
      el('results').hidden = true; el('q').blur();
      openDetail(b.dataset.feature);
    }));
  }
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&q=${encodeURIComponent(q)}`,
                            {headers:{'Accept':'application/json'}});
    const list = await res.json();
    const places = Array.isArray(list) ? list : [];
    el('results').innerHTML =
      (localHTML ? `<div class="reshead">On the map</div>` + localHTML : '') +
      (places.length
        ? `<div class="reshead">Places</div>` + places.map(r => {
            const parts = r.display_name.split(', ');
            return `<button data-lat="${r.lat}" data-lon="${r.lon}"><b>${esc(parts[0])}</b><span>${esc(parts.slice(1,4).join(', '))}</span></button>`;
          }).join('')
        : (localHTML ? '' : `<button disabled style="color:var(--ink-3)">Nothing found for “${esc(q)}”</button>`));
    el('results').hidden = false;
    el('results').querySelectorAll('[data-feature]').forEach(b => b.addEventListener('click', () => {
      el('results').hidden = true; el('q').blur(); openDetail(b.dataset.feature);
    }));
    el('results').querySelectorAll('button[data-lat]').forEach(b => b.addEventListener('click', () => {
      el('results').hidden = true; el('q').blur();
      map.setView([+b.dataset.lat, +b.dataset.lon], 16);
      scheduleLoad(true);                       // jumping somewhere new should just load it
    }));
  } catch(e){ status('Search is unavailable right now', 3000); }
}

/* ---------- locate ----------
   Browsers only hand over location on a secure origin. Over plain http on a
   LAN that request is refused before the user ever sees a permission prompt,
   so say so plainly instead of showing a generic failure.                   */
let watchId = null, accuracyRing = null;
function explainInsecure(){
  const host = location.hostname;
  openModal(`<h2>Your browser will not share location here</h2>
    <p class="lede">This page is on <b>${esc(location.protocol)}//${esc(host)}</b>. Browsers only give a page
    your location over <b>https</b> (or on localhost), so the request is refused before you are even asked.</p>
    <div class="card" style="margin-bottom:14px">
      <p style="margin:0 0 10px;font-size:13px;line-height:1.6"><b>To use location on this phone:</b></p>
      <p style="margin:0 0 8px;font-size:13px;line-height:1.6">Open the <b>https</b> address the server printed
      — same machine, port 8443. Your phone will warn that the certificate is not trusted because this computer
      made it; tap <b>Advanced → proceed</b>. Location then works normally.</p>
      <p style="margin:0;font-size:12px;line-height:1.55;color:var(--ink-2)">Everything else works fine here —
      search any city and the map, listings and reviews all behave the same.</p>
    </div>
    <button class="btn" onclick="closeModal()">Got it</button>`);
}
function stopWatch(){
  if (watchId != null){ navigator.geolocation.clearWatch(watchId); watchId = null; }
  el('btn-locate').dataset.on = 'false';
  status('', 0);
}
function locate(){
  if (!navigator.geolocation){ toast('This browser has no location support — search a city instead', I.flag); return; }
  if (watchId != null){ stopWatch(); toast('Stopped following you', I.nav); return; }
  if (!window.isSecureContext){ explainInsecure(); return; }

  status('Finding you…');
  el('btn-locate').dataset.on = 'true';
  let first = true;
  watchId = navigator.geolocation.watchPosition(
    pos => {
      state.me = {lat:pos.coords.latitude, lng:pos.coords.longitude, acc:pos.coords.accuracy};
      if (first){ map.setView([state.me.lat, state.me.lng], 16); first = false;
                  status(`Found you — accurate to about ${Math.round(pos.coords.accuracy)} m`, 3200); }
      if (accuracyRing) map.removeLayer(accuracyRing);
      if (pos.coords.accuracy && pos.coords.accuracy > 25)
        accuracyRing = L.circle([state.me.lat, state.me.lng], {radius:pos.coords.accuracy,
          color:'#3A6EA5', weight:1, fillColor:'#3A6EA5', fillOpacity:.08}).addTo(map);
      renderMarkers(); renderList();
    },
    err => {
      stopWatch();
      if (err.code === 1) toast('Location permission was denied — you can turn it back on in browser settings', I.flag);
      else if (err.code === 3) toast('Took too long to get a fix — try again outdoors', I.flag);
      else toast('Could not get your location — search your city instead', I.flag);
      console.warn('geolocation', err);
    },
    {enableHighAccuracy:true, timeout:12000, maximumAge:15000}
  );
}

/* Ask for location the moment the app opens, and go straight there.

   Opening on the world view and waiting for a tap on the crosshair put three
   actions between launch and seeing anything useful: open, tap, approve. The
   app is about what is around you right now, so it asks immediately.

   This cannot become a dialog on every launch. A browser remembers a denial
   and will not re-prompt, and on iOS the system asks once per install. Where
   the Permissions API exists we check first and stay silent if the answer is
   already no, so a user who declined is not handed an error toast they did
   not ask for on every visit. */
async function autoLocate(){
  if (!navigator.geolocation || !window.isSecureContext) return;
  try {
    if (navigator.permissions && navigator.permissions.query){
      const p = await navigator.permissions.query({name:'geolocation'});
      if (p.state === 'denied') return;
    }
  } catch(e){ /* Permissions API is optional — fall through and just ask */ }
  locate();
}

/* ---------- chrome: panels, modal, toast, sheet ---------- */
function openPanel(name){
  state.panel = name;
  document.querySelectorAll('.panel').forEach(p => p.dataset.open = String(p.id === 'panel-' + name));
  document.querySelectorAll('.tab').forEach(t => {
    if (t.dataset.go === name) t.setAttribute('aria-current','page'); else t.removeAttribute('aria-current');
  });
}
function closePanel(){
  state.panel = null;
  document.querySelectorAll('.panel').forEach(p => p.dataset.open = 'false');
  document.querySelectorAll('.tab').forEach(t => {
    if (t.dataset.go === 'map') t.setAttribute('aria-current','page'); else t.removeAttribute('aria-current');
  });
}
function openModal(html){
  el('modal').innerHTML = '<div class="grab"></div>' + html;
  el('modal').dataset.open = 'true'; el('veil').dataset.open = 'true';
}
function closeModal(){ el('modal').dataset.open = 'false'; el('veil').dataset.open = 'false'; }
function openLightbox(src, who, place, pid, pstate){
  const rec = pid ? photoRec(pid) : null;
  el('lightbox').innerHTML = `
    <div class="lbtop"><button class="circbtn onphoto" id="lbclose" aria-label="Close">${I.x}</button>
      <span style="font-size:12.5px;font-weight:600">${esc(place)}</span>
      <button class="circbtn onphoto" id="lbflag" aria-label="Report photo">${I.flag}</button></div>
    <div class="lbstage"><img src="${src}" alt="Photo of ${esc(place)}"></div>
    <div class="lbcap">
      Added by ${esc(who)}. Location data was stripped before it was stored.
      ${pstate === 'pending' ? '<br><b>Only you can see this.</b> It is waiting for a person to check it.' : ''}
      ${rec && rec.scores ? `<br><span style="opacity:.75">Automatic check: explicit ${(((rec.scores.porn||0)+(rec.scores.hentai||0))*100).toFixed(1)}%, suggestive ${((rec.scores.sexy||0)*100).toFixed(1)}%${rec.faces > 0 ? `, ${rec.faces} face${rec.faces===1?'':'s'} detected` : ''}</span>` : ''}
    </div>`;
  el('lightbox').dataset.open = 'true';
  el('lbclose').addEventListener('click', () => el('lightbox').dataset.open = 'false');
  el('lbflag').addEventListener('click', () => {
    el('lightbox').dataset.open = 'false';
    if (rec){
      rec.reports.push({at:Date.now(), by:store.profile.name});
      rec.state = 'pending';                       // pulled down immediately, then reviewed
      rec.reasons = [`Reported by a user (${rec.reports.length} report${rec.reports.length===1?'':'s'})`];
      save();
      if (state.sel) renderDetail(state.sel, true);
      toast('Taken down and queued for review', I.shield);
    } else toast('Reported', I.flag);
  });
}
let statusTimer = null;
function status(msg, ms){
  const s = el('status');
  clearTimeout(statusTimer);
  if (!msg){ s.dataset.on = 'false'; return; }
  s.textContent = msg; s.dataset.on = 'true';
  if (ms) statusTimer = setTimeout(() => s.dataset.on = 'false', ms);
}
function toast(msg, icon){
  const t = document.createElement('div');
  t.className = 'toast'; t.innerHTML = (icon || I.check) + `<span>${msg}</span>`;
  el('toasts').appendChild(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 250); }, 2500);
}
/* The sheet is positioned above the tab bar, and the tab bar's height
   depends on the device's safe area — 69px on a plain screen, more on a
   notched phone. Measure it rather than guessing, and again on rotate. */
function syncTabBarHeight(){
  const bar = document.querySelector('.tabbar');
  if (!bar) return;
  const h = Math.round(bar.getBoundingClientRect().height);
  if (h > 0) document.documentElement.style.setProperty('--tabbar-h', h + 'px');
}

function initSheet(){
  syncTabBarHeight();
  /* A resize listener is not enough: the bar's height also changes when the
     safe area resolves, when a tab is hidden, or when fonts finish loading,
     none of which fire resize. Watching the element itself catches all of
     them — a stale value here leaves the sheet floating above the bar or
     tucked behind it. */
  if (window.ResizeObserver){
    const bar = document.querySelector('.tabbar');
    if (bar) new ResizeObserver(syncTabBarHeight).observe(bar);
  } else {
    window.addEventListener('resize', syncTabBarHeight);
    window.addEventListener('orientationchange', () => setTimeout(syncTabBarHeight, 250));
  }

  const sheet = el('sheet'), grab = el('grab'), list = el('sheet-list');
  const head = sheet.querySelector('.sheet-head');
  const peekPx = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sheet-peek')) || 210;
  const maxT = () => sheet.offsetHeight - peekPx();

  /* Three resting places, as translateY in pixels: fully up, halfway, and
     peeking. Two was not enough — peek shows about one row, so reading the
     list meant either a tap that swallowed the whole map or scrolling a
     150px window. */
  const stops = () => { const m = maxT(); return {full:0, half:m * 0.45, peek:m}; };
  const nearest = t => {
    const {full, half, peek} = stops();
    if (t <= (full + half) / 2) return 'full';
    if (t <= (half + peek) / 2) return 'half';
    return 'peek';
  };
  const curT = () => stops()[sheet.dataset.state] ?? stops().peek;
  const next = st => st === 'peek' ? 'half' : st === 'half' ? 'full' : 'peek';

  let dragging = false, startY = 0, startT = 0, moved = 0, lastT = 0, fromList = false;

  function begin(e, viaList){
    dragging = true; fromList = !!viaList;
    moved = 0; startY = e.clientY; startT = curT(); lastT = startT;
    sheet.classList.add('dragging');
  }

  function startFromChrome(e){
    /* The sort control is a button and must stay one. */
    if (e.target.closest('button') && !e.target.closest('#grab')) return;
    begin(e, false);
    try { grab.setPointerCapture && grab.setPointerCapture(e.pointerId); } catch(err){}
  }
  grab.addEventListener('pointerdown', startFromChrome);
  head.addEventListener('pointerdown', startFromChrome);

  /* Pulling down while the list is already at its top lowers the sheet, the
     way a native sheet behaves. Without this the only way back down is the
     handle, and the sheet feels stuck once it is up. */
  list.addEventListener('pointerdown', e => { if (list.scrollTop <= 0) begin(e, true); });

  window.addEventListener('pointermove', e => {
    if (!dragging) return;
    const dy = e.clientY - startY;
    moved = Math.abs(dy);
    /* A drag that began in the list may only pull the sheet down. Pushing up
       from there should scroll the list, so hand the gesture back. */
    if (fromList && dy < 0){
      dragging = false; fromList = false;
      sheet.classList.remove('dragging'); sheet.style.transform = '';
      return;
    }
    if (moved > 4 && e.cancelable) e.preventDefault();
    lastT = Math.min(Math.max(startT + dy, 0), maxT());
    sheet.style.transform = `translateY(${lastT}px)`;
  }, {passive:false});

  const up = () => {
    if (!dragging) return;
    dragging = false;
    sheet.classList.remove('dragging');
    sheet.style.transform = '';
    if (moved >= 6) sheet.dataset.state = nearest(lastT);
    else if (!fromList) sheet.dataset.state = next(sheet.dataset.state);
    fromList = false;
  };
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);

  grab.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); sheet.dataset.state = next(sheet.dataset.state); }
  });
}
function renderChips(){
  /* "Rentable" filters the map down to rented bathrooms, which do not exist
     in a build with renting switched off — an empty filter that always
     returns nothing reads as a broken app. */
  const shown = Object.entries(CATS).filter(([k]) => k !== 'host' || FEATURES.rentals);
  const cats = shown.map(([k,v]) =>
    `<button class="chip" data-cat="${k}" aria-pressed="${state.cats.has(k)}"><span class="dot" style="background:${v.color}"></span>${v.label}</button>`).join('');
  const attrs = Object.entries(ATTRS).map(([k,v]) =>
    `<button class="chip" data-attr="${k}" aria-pressed="${state.attrs.has(k)}">${v.label}</button>`).join('');
  el('chips').innerHTML = cats + attrs;
  /* The tab is static markup in index.html, so it has to be removed here
     rather than simply not rendered. */
  if (!FEATURES.rentals){
    const hostTab = document.querySelector('.tab[data-go="host"]');
    if (hostTab) hostTab.hidden = true;
  }
  el('chips').querySelectorAll('[data-cat]').forEach(c => c.addEventListener('click', () => {
    const k = c.dataset.cat;
    state.cats.has(k) ? state.cats.delete(k) : state.cats.add(k);
    c.setAttribute('aria-pressed', String(state.cats.has(k)));
    renderMarkers(); renderList();
  }));
  el('chips').querySelectorAll('[data-attr]').forEach(c => c.addEventListener('click', () => {
    const k = c.dataset.attr;
    state.attrs.has(k) ? state.attrs.delete(k) : state.attrs.add(k);
    c.setAttribute('aria-pressed', String(state.attrs.has(k)));
    renderMarkers(); renderList();
  }));
}

/* ---------- boot ---------- */
function boot(){
  if (typeof L === 'undefined'){
    document.body.innerHTML = '<div style="padding:40px;font-family:system-ui;line-height:1.6">' +
      '<h1>Map library did not load</h1><p>Leaflet is fetched from unpkg.com. Check this device&rsquo;s internet connection and reload.</p></div>';
    return;
  }
  applyTheme(store.theme || (prefersDark.matches ? 'dark' : 'light'));
  initMap(); initSheet(); renderChips();
  const cached = hydrateCache();          // draw what we already know before any network call
  renderList(); renderProfile(); renderSaved(); renderHostForm();
  if (cached) renderMarkers();

  el('btn-theme').addEventListener('click', () =>
    applyTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'));
  el('btn-locate').addEventListener('click', locate);
  /* Do this after the listeners exist, so the status and crosshair states
     the fix drives are already wired up when it lands. */
  autoLocate();
  el('btn-add').addEventListener('click', () => startDropMode('add', pt => openAddForm(pt)));
  el('drop-cancel').addEventListener('click', endDropMode);
  el('drop-confirm').addEventListener('click', () => {
    const cb = state.dropMode && state.dropMode.cb, pt = map.getCenter();
    endDropMode(); if (cb) cb(pt);
  });
  el('q').addEventListener('input', e => {
    el('q-clear').hidden = !e.target.value;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => doSearch(e.target.value), 450);
  });
  el('q').addEventListener('keydown', e => { if (e.key === 'Enter'){ e.preventDefault(); clearTimeout(searchTimer); doSearch(e.target.value); }});
  el('q-clear').addEventListener('click', () => { el('q').value = ''; el('q-clear').hidden = true; el('results').hidden = true; });
  el('btn-sort').addEventListener('click', () => {
    const order = ['dist','open','rating','trusted','toilets'];
    state.sort = order[(order.indexOf(state.sort)+1) % order.length];
    el('sort-label').textContent = {dist:'Closest', open:'Open now', rating:'Top rated', trusted:'Most trusted', toilets:'Toilets first'}[state.sort];
    renderList(); el('sheet').dataset.state = 'full';
  });
  document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => {
    const go = t.dataset.go;
    if (go === 'map'){ closePanel(); el('sheet').dataset.state = 'peek'; }
    else if (go === 'list'){ closePanel(); el('sheet').dataset.state = 'full'; }
    else if (go === 'saved'){ renderSaved(); openPanel('saved'); }
    else if (go === 'profile'){ renderProfile(); openPanel('profile'); }
    else if (go === 'host' && FEATURES.rentals){ renderHostForm(); openPanel('host'); }
  }));
  document.querySelectorAll('[data-close-panel]').forEach(b => b.addEventListener('click', closePanel));
  el('veil').addEventListener('click', closeModal);
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (el('lightbox').dataset.open === 'true') el('lightbox').dataset.open = 'false';
    else if (el('modal').dataset.open === 'true') closeModal();
    else if (state.dropMode) endDropMode();
    else if (state.panel) closePanel();
  });
  prefersDark.addEventListener('change', e => { if (!store.theme) applyTheme(e.matches ? 'dark' : 'light'); });

  el('search-here').addEventListener('click', () => loadArea(false));
  window.addEventListener('online',  () => { setOffline(false); });
  window.addEventListener('offline', () => { setOffline(true); });
  setOffline(!navigator.onLine);

  /* deep links from the installed app's shortcuts */
  const go = new URLSearchParams(location.search).get('go');
  if (go === 'locate') setTimeout(locate, 400);
  if (go === 'add') setTimeout(() => startDropMode('add', pt => openAddForm(pt)), 400);

  registerWorker();
  startSync();
  if (typeof AdMobNative !== 'undefined') AdMobNative.start();
  refreshSponsors().then(() => renderList());
  map.on('moveend', () => { clearTimeout(sponsorTimer); sponsorTimer = setTimeout(refreshSponsors, 1500); });
  maybeAskConsent();
  status('Search a city, or tap the crosshair to find bathrooms near you', 5200);
}

async function startSync(){
  const up = await Sync.check();
  updateSyncBadge();
  if (!up){
    console.info('No backend — running solo. Reviews stay on this device.');
    return;
  }
  try { await Sync.ensureIdentity(store.profile.name); } catch(e){}
  const sent = await Sync.flush();
  if (sent) toast(`${sent} contribution${sent===1?'':'s'} uploaded`, I.check);
  updateSyncBadge();
  await pullShared();
  map.on('moveend', () => { clearTimeout(pullTimer); pullTimer = setTimeout(pullShared, 900); });
  window.addEventListener('online', async () => {
    if (await Sync.check()){ const n = await Sync.flush(); if (n) toast(`${n} uploaded`, I.check); pullShared(); }
    updateSyncBadge();
  });
}
let pullTimer = null, sponsorTimer = null;

function setOffline(off){
  el('offline').hidden = !off;
  if (off) status('You are offline — showing what was already loaded', 4000);
}

/* ---------- install & update ----------
   A new version rolls out without anyone reinstalling: the worker downloads
   in the background and the user taps once to take it.                     */
let deferredInstall = null;
function registerWorker(){
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
  navigator.serviceWorker.register('./sw.js').then(reg => {
    reg.addEventListener('updatefound', () => {
      const fresh = reg.installing;
      if (!fresh) return;
      fresh.addEventListener('statechange', () => {
        if (fresh.state === 'installed' && navigator.serviceWorker.controller) offerUpdate(fresh);
      });
    });
    setInterval(() => reg.update().catch(()=>{}), 30*60*1000);
  }).catch(err => console.warn('service worker failed', err));

  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return; reloading = true; location.reload();
  });
}
function offerUpdate(worker){
  const t = document.createElement('div');
  t.className = 'toast update';
  t.innerHTML = `${I.sparkle}<span>A new version is ready</span><button class="minibtn">Update</button>`;
  t.querySelector('button').addEventListener('click', () => { worker.postMessage('skipWaiting'); t.remove(); });
  el('toasts').appendChild(t);
}
/* remember a dismissal so the prompt does not follow people around */
const installDismissed = () => { try { return localStorage.getItem('bf.install.no') === '1'; } catch(e){ return false; } };
window.addEventListener('beforeinstallprompt', e => {
  if (installDismissed()) return;
  e.preventDefault();
  deferredInstall = e;
  const b = el('btn-install');
  if (b) b.hidden = false;
});

boot();
