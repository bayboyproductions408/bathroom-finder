/* Prove the map still fills when our own backend is slow or unreachable, and
   that it does not wait for it.

     node tools/verify-map-fallback.js [baseUrl]

   Why this exists: the map has two sources — our own cache-backed API, and
   OpenStreetMap directly if that fails. The fallback is the kind of path that
   is never exercised until the day it matters, so it is worth driving on
   purpose. The degraded run hangs every call to our API and checks the map
   still fills from Overpass.

   It reports how long each took rather than failing on a threshold. The
   numbers move with Overpass's mood — measured directly it answers in seven to
   ten seconds and rate-limits under load — and a check that fails because a
   volunteer service was busy teaches you to ignore it.                      */
'use strict';
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const BASE = process.argv[2] || 'https://bayboyproductions408.github.io/bathroom-finder/';
const PORT = 9450;

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome'
].find(p => { try { return fs.existsSync(p); } catch (e) { return false; } });

const sleep = ms => new Promise(r => setTimeout(r, ms));

function cdp(wsUrl){
  const ws = new WebSocket(wsUrl);
  const pending = new Map();
  let id = 0;
  const ready = new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = ev => {
    let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
    const p = pending.get(m.id);
    if (!p) return;
    pending.delete(m.id);
    m.error ? p.rej(new Error(m.error.message)) : p.res(m.result);
  };
  return {ready,
    send(method, params = {}){
      return new Promise((res, rej) => {
        const n = ++id; pending.set(n, {res, rej});
        ws.send(JSON.stringify({id: n, method, params}));
        setTimeout(() => { if (pending.delete(n)) rej(new Error(method + ' timed out')); }, 90000);
      });
    },
    close(){ try { ws.close(); } catch (e) {} }};
}

const results = [];
const check = (name, pass, detail) => {
  results.push(pass);
  console.log(`  ${pass ? 'ok  ' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};

async function run(label, {hangBackend}){
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'bf-map-'));
  const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run',
    '--no-default-browser-check', '--hide-scrollbars', '--mute-audio',
    `--user-data-dir=${profile}`, `--remote-debugging-port=${PORT}`, 'about:blank'], {stdio: 'ignore'});

  let target = null;
  for (let i = 0; i < 40 && !target; i++){
    await sleep(500);
    try {
      const list = await fetch(`http://127.0.0.1:${PORT}/json/list`).then(r => r.json());
      target = list.find(t => t.type === 'page');
    } catch (e) {}
  }
  if (!target){ chrome.kill(); throw new Error('Chrome never came up'); }

  const c = cdp(target.webSocketDebuggerUrl);
  await c.ready;
  await c.send('Page.enable');
  await c.send('Runtime.enable');

  /* Start from nothing: no POI cache, no consent sheet. A first-ever open is
     the case that matters, and a warm cache would hide the problem. */
  let boot = `try { localStorage.clear();
      localStorage.setItem('bf.ads.consent.v1', JSON.stringify({personalised:false, at:Date.now()}));
    } catch(e){}`;
  if (hangBackend){
    /* Make every call to our own API stall. Overpass is untouched, so if the
       map fills at all it filled from the direct route.

       It must honour the abort signal. A promise that simply never settles is
       not a stalled request — it is one no timeout can kill, which is not a
       thing that happens on a real network. Stubbing it that way made this
       report "never recovers" when the app recovers fine; the bug was in the
       test. */
    boot += `
      window.__backendCalls = 0;
      const realFetch = window.fetch.bind(window);
      window.fetch = (input, init) => {
        const u = typeof input === 'string' ? input : (input && input.url) || '';
        if (/\\/api\\/v1\\/osm/.test(u)){
          window.__backendCalls++;
          return new Promise((_, reject) => {
            const sig = init && init.signal;
            if (sig){
              if (sig.aborted) return reject(new DOMException('aborted', 'AbortError'));
              sig.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
            }
          });
        }
        return realFetch(input, init);
      };`;
  }
  await c.send('Page.addScriptToEvaluateOnNewDocument', {source: boot});
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

    const out = await evaluate(`(async () => {
      const wait = ms => new Promise(r => setTimeout(r, ms));
      const q = document.getElementById('q');
      q.value = 'Trafalgar Square, London';
      q.dispatchEvent(new Event('input', {bubbles:true}));
      q.dispatchEvent(new KeyboardEvent('keydown', {key:'Enter', bubbles:true}));
      const res = document.getElementById('results');
      for (let i = 0; i < 60; i++){
        await wait(250);
        const hit = res && !res.hidden && res.querySelector('[data-lat]');
        if (hit){ hit.click(); break; }
      }
      const began = Date.now();
      /* The degraded path has to outlast the backend's own 20s abort before
         Overpass is even asked, so poll well past that or the run reports a
         failure that is really just impatience. */
      for (let i = 0; i < 150; i++){
        await wait(400);
        const t = document.getElementById('sheet-count').textContent;
        const m = t.match(/(\\d+)\\s+places/);
        if (m && Number(m[1]) > 0)
          return {places:Number(m[1]), ms:Date.now()-began, backendCalls:window.__backendCalls};
      }
      return {places:0, ms:Date.now()-began, backendCalls:window.__backendCalls,
              text:document.getElementById('sheet-count').textContent};
    })()`);

    console.log(`\n${label}`);
    check('the map fills with places',
          out.places > 0, `${out.places} places in ${(out.ms/1000).toFixed(1)}s`);
    if (hangBackend){
      check('the backend really was called and really did hang',
            out.backendCalls > 0, 'calls=' + out.backendCalls);
      console.log(`        (fell back to OpenStreetMap in ${(out.ms/1000).toFixed(1)}s)`);
    }
  } finally {
    c.close(); chrome.kill();
    try { fs.rmSync(profile, {recursive: true, force: true}); } catch (e) {}
  }
}

(async () => {
  if (!CHROME){ console.error('Chrome not found'); process.exit(1); }
  await run('normal — our backend answers', {hangBackend: false});
  await run('degraded — our backend never answers', {hangBackend: true});

  const failed = results.filter(r => !r).length;
  console.log(`\n${results.length - failed} passed, ${failed} failed`);
  if (failed) process.exit(1);
})().catch(e => { console.error('could not run:', e.message); process.exit(1); });
