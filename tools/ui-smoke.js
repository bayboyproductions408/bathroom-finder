/* Opens the app's screens in a real browser and checks each one rendered.

     node tools/ui-smoke.js                    against the live site
     node tools/ui-smoke.js http://localhost:8080

   Why this exists: alternativeHTML called accessState() when the function is
   named accessOf. renderDetail threw before building any HTML, so tapping a
   bathroom did nothing — no rating, no reviews, no photos, no directions —
   and it shipped. Nothing caught it. Node never parses app.js, the unit
   tests only load lib.js, and the simulator smoke test opens the map and
   never taps anything.

   So this taps things. It drives the same headless Chrome over the DevTools
   Protocol that the screenshot tool uses, and asserts that each screen both
   opens and contains what it is supposed to contain. A screen that throws
   renders nothing, which is exactly what this measures.                   */
'use strict';
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const args = process.argv.slice(2);
/* --prove deliberately breaks the place page, to demonstrate that the check
   below actually detects a broken one. A test nobody has watched fail is
   not evidence of anything — that is how the accessState typo shipped. */
const PROVE = args.includes('--prove');
const BASE = args.find(a => !a.startsWith('--')) || 'https://bayboyproductions408.github.io/bathroom-finder/';
const PORT = 9444;

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome'
].find(p => { try { return fs.existsSync(p); } catch(e){ return false; } });

const sleep = ms => new Promise(r => setTimeout(r, ms));

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

const results = [];
const check = (name, pass, detail) => {
  results.push({name, pass, detail});
  console.log(`  ${pass ? 'ok  ' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};

async function main(){
  if (!CHROME){ console.error('Chrome not found'); process.exit(1); }
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'bf-ui-'));
  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--hide-scrollbars', '--mute-audio',
    `--user-data-dir=${profile}`, `--remote-debugging-port=${PORT}`, 'about:blank'
  ], {stdio:'ignore'});

  let target = null;
  for (let i = 0; i < 40 && !target; i++){
    await sleep(500);
    try {
      const list = await fetch(`http://127.0.0.1:${PORT}/json/list`).then(r => r.json());
      target = list.find(t => t.type === 'page');
    } catch(e){}
  }
  if (!target){ chrome.kill(); throw new Error('Chrome never came up'); }

  const c = cdp(target.webSocketDebuggerUrl);
  await c.ready;
  await c.send('Page.enable');
  await c.send('Runtime.enable');

  /* Any uncaught exception is a failure in its own right — that is precisely
     how the detail panel broke. */
  const errors = [];
  await c.send('Runtime.addBinding', {name: '__bfErr'}).catch(() => {});
  await c.send('Page.addScriptToEvaluateOnNewDocument', {source: `
    try { localStorage.setItem('bf.ads.consent.v1', JSON.stringify({personalised:false, at:Date.now()})); } catch(e){}
    window.__errors = [];
    addEventListener('error', e => window.__errors.push(String(e.message)));
    addEventListener('unhandledrejection', e => window.__errors.push('unhandled: ' + e.reason));
  `});

  await c.send('Emulation.setDeviceMetricsOverride', {
    width: 414, height: 896, deviceScaleFactor: 2, mobile: true});

  const evaluate = async expression => {
    const {result} = await c.send('Runtime.evaluate', {
      awaitPromise: true, returnByValue: true, expression});
    return result.value;
  };

  try {
    await c.send('Page.navigate', {url: BASE});
    await sleep(4000);

    /* 1. the shell */
    check('app boots', await evaluate("!!document.getElementById('sheet')"));

    /* 2. load somewhere with real data, the way a user does */
    const picked = await evaluate(`(async () => {
      const wait = ms => new Promise(r => setTimeout(r, ms));
      const q = document.getElementById('q');
      q.value = 'Trafalgar Square, London';
      q.dispatchEvent(new Event('input', {bubbles:true}));
      q.dispatchEvent(new KeyboardEvent('keydown', {key:'Enter', bubbles:true}));
      const res = document.getElementById('results');
      for (let i = 0; i < 60; i++){
        await wait(250);
        const hit = res && !res.hidden && res.querySelector('[data-lat]');
        if (hit){ hit.click(); return true; }
      }
      return false;
    })()`);
    check('search returns somewhere to go', picked === true);

    const count = await evaluate(`(async () => {
      const wait = ms => new Promise(r => setTimeout(r, ms));
      for (let i = 0; i < 50; i++){
        await wait(600);
        const t = document.getElementById('sheet-count').textContent;
        if (/\\d+\\s+places/.test(t)) return t.trim();
      }
      return 'TIMEOUT';
    })()`);
    check('map loads places', count !== 'TIMEOUT', count);

    if (PROVE){
      /* haversine comes from lib.js via Object.assign(window, LIB), so app.js
         resolves it through the global — replacing it throws inside
         renderDetail exactly the way the real bug did. */
      await evaluate("window.haversine = () => { throw new Error('deliberate break'); }; 'broken'");
      console.log('  (--prove: renderDetail has been sabotaged on purpose)');
    }

    /* 3. THE ONE THAT MATTERS: tap a place and see its page */
    const detail = await evaluate(`(async () => {
      const wait = ms => new Promise(r => setTimeout(r, ms));
      const row = document.querySelector('#sheet-list [data-id]')
               || document.querySelector('#sheet-list button, #sheet-list .row');
      if (!row) return {ok:false, why:'no row to tap'};
      row.click();
      await wait(1200);
      const panel = document.getElementById('panel-detail');
      const body  = document.getElementById('detail-body');
      return {
        ok: !!panel && panel.dataset.open === 'true',
        html: body ? body.innerHTML.length : 0,
        hasReview: !!body && /data-act="review"/.test(body.innerHTML),
        hasDirections: !!body && /data-act="directions"/.test(body.innerHTML),
        errors: (window.__errors || []).slice(0, 3)
      };
    })()`);
    check('tapping a place opens its page', detail && detail.ok === true,
          detail ? (detail.why || (detail.html + ' chars of content')) : 'no result');
    check('the page can be rated', !!(detail && detail.hasReview));
    check('the page offers directions', !!(detail && detail.hasDirections));
    if (detail && detail.errors && detail.errors.length){
      check('no uncaught errors on the place page', false, detail.errors.join(' | '));
    } else {
      check('no uncaught errors on the place page', true);
    }

    /* 4. the other panels open at all */
    for (const [tab, panel] of [['saved','panel-saved'], ['profile','panel-profile']]){
      const open = await evaluate(`(async () => {
        const wait = ms => new Promise(r => setTimeout(r, ms));
        document.querySelector('.tab[data-go="${tab}"]').click();
        await wait(700);
        const p = document.getElementById('${panel}');
        return !!p && p.dataset.open === 'true' && p.textContent.trim().length > 20;
      })()`);
      check(`${tab} panel opens`, open === true);
    }

    const pageErrors = await evaluate('JSON.stringify(window.__errors || [])');
    const errs = JSON.parse(pageErrors || '[]');
    check('no uncaught errors anywhere', errs.length === 0, errs.slice(0,3).join(' | '));
  } finally {
    c.close();
    chrome.kill();
    try { fs.rmSync(profile, {recursive:true, force:true}); } catch(e){}
  }

  const failed = results.filter(r => !r.pass);
  console.log('');
  console.log(`${results.length - failed.length} passed, ${failed.length} failed`);
  if (failed.length) process.exit(1);
}

main().catch(e => { console.error('\nui-smoke could not run:', e.message); process.exit(1); });
