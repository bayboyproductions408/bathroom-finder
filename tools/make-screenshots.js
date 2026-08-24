/* App Store / Play screenshots, captured from the real running app.

     node tools/make-screenshots.js                 (against the live site)
     node tools/make-screenshots.js http://localhost:8080

   Drives headless Chrome over the DevTools Protocol using Node's built-in
   WebSocket — no puppeteer, no npm install, consistent with the rest of this
   repo. Device metrics are set through Emulation rather than the window size,
   so the output is exactly the pixel dimensions Apple asks for even though no
   monitor here is 2796px tall.

   Why script it instead of taking photos on the phone: these regenerate after
   any UI change, they are identical every run, and each store size comes from
   the same set of states so the listings match each other.

   Sizes:
     6.7"  1290x2796   iPhone 15 Pro Max   (App Store, required)
     6.5"  1242x2688   iPhone 11 Pro Max   (App Store, required)
     Play  1080x1920                       (Google Play phone)             */
'use strict';
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const BASE = process.argv[2] || 'https://bayboyproductions408.github.io/bathroom-finder/';
const OUT  = path.join(__dirname, '..', 'store', 'screenshots');
const PORT = 9333;

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome'
].find(p => { try { return fs.existsSync(p); } catch(e){ return false; } });

/* Apple rejects a screenshot that is one pixel off, so these are exact.
   scale is the device pixel ratio: css * scale = the required pixel size. */
const DEVICES = [
  {tag:'6.7', css:[430, 932], scale:3},   // 1290 x 2796
  {tag:'6.5', css:[414, 896], scale:3},   // 1242 x 2688
  {tag:'play', css:[360, 640], scale:3}   // 1080 x 1920
];

/* Places with genuinely dense OSM toilet data, so the map is never empty.
   Each is reached by typing into the app's own search box and picking the
   first result — the same path a user takes, so the screenshot cannot show
   a state the app can't actually reach. */
const SHOTS = [
  {name:'1-london',  query:'Trafalgar Square, London', wait:11000},
  {name:'2-newyork', query:'Bryant Park, New York',    wait:11000},
  {name:'3-seattle', query:'Pike Place Market, Seattle', wait:11000}
];

/* ---------- minimal CDP client over the built-in WebSocket ---------- */
function cdp(wsUrl){
  const ws = new WebSocket(wsUrl);
  const pending = new Map();
  let id = 0;
  const ready = new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = ev => {
    let msg; try { msg = JSON.parse(ev.data); } catch(e){ return; }
    const p = pending.get(msg.id);
    if (!p) return;
    pending.delete(msg.id);
    msg.error ? p.rej(new Error(msg.error.message)) : p.res(msg.result);
  };
  return {
    ready,
    send(method, params = {}){
      return new Promise((res, rej) => {
        const n = ++id;
        pending.set(n, {res, rej});
        ws.send(JSON.stringify({id:n, method, params}));
        setTimeout(() => { if (pending.delete(n)) rej(new Error(method + ' timed out')); }, 60000);
      });
    },
    close(){ try { ws.close(); } catch(e){} }
  };
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function main(){
  if (!CHROME){ console.error('Chrome not found — install it or edit the CHROME list.'); process.exit(1); }
  fs.mkdirSync(OUT, {recursive:true});

  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'bf-shots-'));
  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--hide-scrollbars', '--mute-audio',
    `--user-data-dir=${profile}`,
    `--remote-debugging-port=${PORT}`,
    'about:blank'
  ], {stdio:'ignore'});

  /* wait for the debugging endpoint rather than sleeping a fixed amount */
  let target = null;
  for (let i = 0; i < 40 && !target; i++){
    await sleep(500);
    try {
      const list = await fetch(`http://127.0.0.1:${PORT}/json/list`).then(r => r.json());
      target = list.find(t => t.type === 'page');
    } catch(e){ /* not up yet */ }
  }
  if (!target){ chrome.kill(); throw new Error('Chrome DevTools endpoint never came up'); }

  const c = cdp(target.webSocketDebuggerUrl);
  await c.ready;
  await c.send('Page.enable');
  await c.send('Runtime.enable');

  /* Answer the ad-consent prompt before the app ever asks, so it does not sit
     over half the screenshot. Recording "contextual only" is the same choice a
     privacy-minded user makes, so nothing here misrepresents the app — and it
     runs on every navigation, before the page's own scripts. */
  await c.send('Page.addScriptToEvaluateOnNewDocument', {source: `
    try {
      localStorage.setItem('bf.ads.consent.v1',
        JSON.stringify({personalised:false, at:Date.now()}));
    } catch(e){}
  `});

  const made = [], skipped = [];
  try {
    for (const dev of DEVICES){
      const [w, h] = dev.css;
      const px = `${w * dev.scale}x${h * dev.scale}`;

      await c.send('Emulation.setDeviceMetricsOverride', {
        width: w, height: h, deviceScaleFactor: dev.scale,
        mobile: true, screenWidth: w, screenHeight: h
      });
      await c.send('Emulation.setTouchEmulationEnabled', {enabled:true, maxTouchPoints:5});
      await c.send('Emulation.setUserAgentOverride', {
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 '
                 + '(KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
      });

      for (const shot of SHOTS){
        await c.send('Page.navigate', {url: BASE});
        await sleep(3500);                       // shell, service worker, Leaflet

        /* Drive the app's own search box. `map` is module-scoped, not a
           global, and that is the right design — so rather than exporting it
           just to take a picture, do what a user does: type, press Enter,
           tap the first result. */
        const {result} = await c.send('Runtime.evaluate', {awaitPromise:true, returnByValue:true, expression: `
          (async () => {
            const wait = ms => new Promise(r => setTimeout(r, ms));
            const q = document.getElementById('q');
            if (!q) return 'no search box';

            q.value = ${JSON.stringify(shot.query)};
            q.dispatchEvent(new Event('input', {bubbles:true}));
            q.dispatchEvent(new KeyboardEvent('keydown', {key:'Enter', bubbles:true}));

            /* geocoding is a network call; poll rather than guess a delay */
            const results = document.getElementById('results');
            for (let i = 0; i < 60; i++){
              await wait(250);
              const hit = results && !results.hidden && results.querySelector('[data-lat]');
              if (hit){ hit.click(); return 'picked: ' + hit.textContent.trim().slice(0, 60); }
            }
            return 'no search result after 15s';
          })()`});
        if (typeof result.value === 'string' && !result.value.startsWith('picked')){
          console.log(`       note: ${result.value}`);
        }

        /* Wait for the map to actually have data in it. Overpass rate-limits
           under repeated requests, and without this gate the run happily
           captures "Nothing in view yet" over an empty map and reports
           success because the pixel dimensions were right. */
        const {result: loaded} = await c.send('Runtime.evaluate', {awaitPromise:true, returnByValue:true, expression: `
          (async () => {
            const wait = ms => new Promise(r => setTimeout(r, ms));
            const head = document.getElementById('sheet-count');
            for (let i = 0; i < 60; i++){
              const t = head ? head.textContent : '';
              if (/\\d+\\s+places?\\s+in\\s+view/.test(t)) return t.trim();
              await wait(1000);
            }
            return 'TIMEOUT: ' + (head ? head.textContent.trim() : 'no header');
          })()`});

        if (String(loaded.value).startsWith('TIMEOUT')){
          console.log(`  SKIP ${dev.tag}-${shot.name}: map never loaded (${loaded.value})`);
          skipped.push(`${dev.tag}-${shot.name}`);
          continue;
        }

        await sleep(2500);                       // let the last tiles paint

        /* The install banner is a browser affordance, not part of the app the
           store is reviewing, and Apple rejects screenshots containing it.

           Toasts go too. "Loading bathrooms nearby..." is a transient status
           that happened to be on screen when the shutter fell — it sat across
           the middle of the previous London shot. A store screenshot showing
           a loading message makes a working app look like it is still
           thinking. The data is already in by this point; the gate above
           waited for it. */
        await c.send('Runtime.evaluate', {returnByValue:true, expression: `
          (() => {
            let n = 0;
            document.querySelectorAll('#btn-install, .install-btn, #consent, .consent')
              .forEach(e => { e.remove(); n++; });
            /* Emptying the container is not enough: the app raises a fresh
               toast while the map settles, so one reappears in the gap
               before the shutter. Hide the container for good instead. */
            if (!document.getElementById('shotcss')){
              const st = document.createElement('style');
              st.id = 'shotcss';
              st.textContent = '#toasts{display:none !important}';
              document.head.appendChild(st);
              n++;
            }
            const t = document.getElementById('toasts');
            if (t) t.innerHTML = '';
            return n;
          })()`});
        await sleep(400);

        const {data} = await c.send('Page.captureScreenshot', {format:'png', captureBeyondViewport:false});
        const file = path.join(OUT, `${dev.tag}-${shot.name}.png`);
        fs.writeFileSync(file, Buffer.from(data, 'base64'));

        const buf = fs.readFileSync(file);
        const dims = buf.readUInt32BE(16) + 'x' + buf.readUInt32BE(20);
        const ok = dims === px;
        made.push({file: path.basename(file), dims, ok});
        console.log(`  ${ok ? 'ok  ' : 'BAD '} ${path.basename(file).padEnd(22)} ${dims}${ok ? '' : '  expected ' + px}`);
      }
    }
  } finally {
    c.close();
    chrome.kill();
    try { fs.rmSync(profile, {recursive:true, force:true}); } catch(e){}
  }

  if (skipped.length){
    console.error(`
${skipped.length} skipped because the map never loaded (Overpass is rate-limiting):`);
    skipped.forEach(x => console.error(`  ${x}`));
    console.error("Re-run in a few minutes; already-written files are kept.");
  }
  const bad = made.filter(m => !m.ok);
  console.log(`\n${made.length} screenshots written to store/screenshots`);
  if (bad.length){ console.error(`${bad.length} had the wrong dimensions`); process.exit(1); }
}

main().catch(err => { console.error(err); process.exit(1); });
