/* Service worker — the app shell works offline, and updates roll out
   without anyone reinstalling anything.

   Bump APP_VERSION to ship an update. Clients notice the new worker,
   show "Update ready", and swap over on tap.                          */
const APP_VERSION = 'v1.6.8';
const SHELL = `shell-${APP_VERSION}`;
const TILES = 'tiles-v1';
const MODELS = 'models-v1';

const SHELL_FILES = [
  './', './index.html', './styles.css', './config.js', './lib.js', './app.js',
  './moderation.js', './rentals.js', './sync.js', './ads.js', './admob.js', './manifest.webmanifest',
  './check.html', './privacy.html', './terms.html', './support.html', './legal.css', './legal.js',
  './icon-192.png', './icon-512.png',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const cache = await caches.open(SHELL);
    /* addAll fails the whole install if one request fails; the CDN files
       are allowed to miss without bricking the update */
    await Promise.allSettled(SHELL_FILES.map(f => cache.add(new Request(f, {cache:'reload'}))));
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('shell-') && k !== SHELL).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', e => {
  if (e.data === 'skipWaiting') self.skipWaiting();
  if (e.data === 'version') e.source.postMessage({type:'version', version:APP_VERSION});
});

const isTile  = u => /basemaps\.cartocdn\.com|tile\.openstreetmap\.org/.test(u);
const isModel = u => /cdn\.jsdelivr\.net\/npm\/(nsfwjs|@tensorflow)/.test(u);
/* live data and anything to do with money must never be served from a cache */
const isAPI   = u => /\/api\//.test(u) || /overpass|nominatim/.test(u);

/* exposed so tests/run.js can assert the routing rules headlessly */
self.__routing = {isTile, isModel, isAPI, APP_VERSION, SHELL_FILES};

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = req.url;

  /* never cache live data or payments */
  if (isAPI(url)) return;

  /* map tiles: serve from cache first so a previously-seen area still draws
     with no signal, and cap the cache so it cannot grow without limit */
  if (isTile(url)){
    e.respondWith((async () => {
      const cache = await caches.open(TILES);
      const hit = await cache.match(req);
      if (hit){
        fetch(req).then(r => r.ok && cache.put(req, r.clone())).catch(()=>{});
        return hit;
      }
      try {
        const res = await fetch(req);
        if (res.ok){
          cache.put(req, res.clone());
          trim(TILES, 900);
        }
        return res;
      } catch(err){
        return new Response('', {status:504});
      }
    })());
    return;
  }

  /* moderation models: big, versioned, never change — cache hard */
  if (isModel(url)){
    e.respondWith((async () => {
      const cache = await caches.open(MODELS);
      const hit = await cache.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) cache.put(req, res.clone());
      return res;
    })());
    return;
  }

  /* config.js says where the backend lives. Cache-first would pin an old
     backend URL on every returning visitor until the version changed, so
     this one file is network-first with the cache only as a fallback. */
  if (/\/config\.js(\?|$)/.test(url)){
    e.respondWith((async () => {
      const cache = await caches.open(SHELL);
      try {
        const res = await fetch(req, {cache:'no-store'});
        if (res.ok) cache.put(req, res.clone());
        return res;
      } catch(err){
        const hit = await cache.match(req, {ignoreSearch:true});
        return hit || new Response("window.BF_CONFIG={apiBase:'',build:'web'};window.apiURL=p=>p;",
                                   {headers:{'Content-Type':'text/javascript'}});
      }
    })());
    return;
  }

  /* app shell: cache first, refresh in the background */
  e.respondWith((async () => {
    const cache = await caches.open(SHELL);
    const hit = await cache.match(req, {ignoreSearch:true});
    const net = fetch(req).then(res => {
      if (res.ok && new URL(url).origin === location.origin) cache.put(req, res.clone());
      return res;
    }).catch(() => null);
    if (hit) return hit;
    const res = await net;
    if (res) return res;
    if (req.mode === 'navigate'){
      const shell = await cache.match('./index.html');
      if (shell) return shell;
    }
    return new Response('Offline', {status:503, headers:{'Content-Type':'text/plain'}});
  })());
});

async function trim(name, max){
  const cache = await caches.open(name);
  const keys = await cache.keys();
  if (keys.length <= max) return;
  for (const k of keys.slice(0, keys.length - max)) await cache.delete(k);
}
