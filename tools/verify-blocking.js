/* Drive the real block/unblock flow in a browser against a locally seeded
   review, because production has no review on the place the smoke test opens
   and a check that cannot run is not a check. */
'use strict';
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const BASE = process.argv[2] || 'http://127.0.0.1:8099/';
const PLACE = process.argv[3] || 'osm:relation/3962877';
const PORT = 9448;

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'
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
        setTimeout(() => { if (pending.delete(n)) rej(new Error(method + ' timed out')); }, 60000);
      });
    },
    close(){ try { ws.close(); } catch (e) {} }};
}

const results = [];
const check = (name, pass, detail) => {
  results.push(pass);
  console.log(`  ${pass ? 'ok  ' : 'FAIL'}  ${name}${!pass && detail ? '  — ' + detail : ''}`);
};

(async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'bf-blk-'));
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
  await c.send('Page.addScriptToEvaluateOnNewDocument', {source:
    `try { localStorage.setItem('bf.ads.consent.v1', JSON.stringify({personalised:false, at:Date.now()})); } catch(e){}`});
  await c.send('Emulation.setDeviceMetricsOverride', {width: 414, height: 896, deviceScaleFactor: 2, mobile: true});

  const ev = async expression => {
    const {result} = await c.send('Runtime.evaluate', {awaitPromise: true, returnByValue: true, expression});
    return result.value;
  };

  try {
    await c.send('Page.navigate', {url: BASE});
    await sleep(4500);

    /* go to the seeded place the way a person would: search, then tap its row */
    const opened = await ev(`(async () => {
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
      for (let i = 0; i < 60; i++){
        await wait(600);
        const row = document.querySelector('#sheet-list button.row[data-open="${PLACE}"]');
        if (row){ row.click(); await wait(1500); break; }
      }
      const p = document.getElementById('panel-detail');
      const ids = Array.from(document.querySelectorAll('#sheet-list button.row[data-open]')).slice(0,8).map(b=>b.dataset.open);
      return {open: !!p && p.dataset.open === 'true',
              reviews: document.querySelectorAll('#detail-body .review').length,
              count: document.getElementById('sheet-count').textContent, ids};
    })()`);
    check('the seeded place opens with its review', !!(opened && opened.open && opened.reviews > 0),
          JSON.stringify(opened));

    const menu = await ev(`(async () => {
      const wait = ms => new Promise(r => setTimeout(r, ms));
      const m = document.querySelector('#detail-body .rmenu[data-rmenu]');
      if (!m) return {ok:false, why:'no ⋮ on the review'};
      const before = document.querySelectorAll('#detail-body .review').length;
      m.click(); await wait(800);
      const modal = document.getElementById('modal');
      const text = modal ? modal.innerText : '';
      return {ok:true, before,
              offersReport: /report this review/i.test(text),
              offersBlock: /block/i.test(text)};
    })()`);
    check('the review menu offers Report', !!(menu && menu.offersReport), JSON.stringify(menu));
    check('the review menu offers Block', !!(menu && menu.offersBlock), JSON.stringify(menu));

    const blocked = await ev(`(async () => {
      const wait = ms => new Promise(r => setTimeout(r, ms));
      const b = document.querySelector('#modal [data-rm="block"]');
      if (!b) return {ok:false, why:'no block button'};
      b.click(); await wait(1500);
      return {ok: document.querySelectorAll('#detail-body .review').length === 0,
              left: document.querySelectorAll('#detail-body .review').length,
              stored: (JSON.parse(localStorage.getItem('bf.v2')||'{}').blocked||[]).length};
    })()`);
    check('blocking hides the review', !!(blocked && blocked.ok), JSON.stringify(blocked));
    check('the block is persisted', !!(blocked && blocked.stored === 1), JSON.stringify(blocked));

    const undone = await ev(`(async () => {
      const wait = ms => new Promise(r => setTimeout(r, ms));
      document.querySelector('.tab[data-go="profile"]').click();
      await wait(1000);
      const btn = document.querySelector('#panel-profile [data-unblock]');
      if (!btn) return {ok:false, why:'no unblock control in Profile'};
      btn.click(); await wait(900);
      return {ok: (JSON.parse(localStorage.getItem('bf.v2')||'{}').blocked||[]).length === 0,
              left: document.querySelectorAll('#panel-profile [data-unblock]').length};
    })()`);
    check('unblocking from Profile restores them', !!(undone && undone.ok), JSON.stringify(undone));
  } finally {
    c.close(); chrome.kill();
    try { fs.rmSync(profile, {recursive: true, force: true}); } catch (e) {}
  }

  const failed = results.filter(r => !r).length;
  console.log(`\n${results.length - failed} passed, ${failed} failed`);
  if (failed) process.exit(1);
})().catch(e => { console.error('could not run:', e.message); process.exit(1); });
