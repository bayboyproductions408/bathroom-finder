/* Assert the four things Guideline 1.2 requires are actually reachable in the
   shipped app, and that the App Review Notes do not promise a control the user
   interface does not have.

     node tools/ugc-controls-check.js                   against the live site
     node tools/ugc-controls-check.js http://localhost:8080

   Why this exists separately from ui-smoke.js: ui-smoke asks "does the place
   page render", which is a question about crashes. This asks "can a reviewer
   FIND the report control", which is a question about acceptance. Apple
   rejects under 1.2 when any of filtering, reporting, blocking or a published
   contact is missing, and the reply we are about to send tells them all four
   exist. Claiming it in writing and not checking it is how the last round of
   this went wrong.                                                          */
'use strict';
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const BASE = process.argv[2] || 'https://bayboyproductions408.github.io/bathroom-finder/';
const PORT = 9446;

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
    let msg; try { msg = JSON.parse(ev.data); } catch (e) { return; }
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
        ws.send(JSON.stringify({id: n, method, params}));
        setTimeout(() => { if (pending.delete(n)) rej(new Error(method + ' timed out')); }, 60000);
      });
    },
    close(){ try { ws.close(); } catch (e) {} }
  };
}

const results = [];
const check = (name, pass, detail) => {
  results.push({name, pass});
  /* Only show the detail when it failed. A "why" string printed next to an
     ok is read as a warning, and this file exists to be read quickly. */
  console.log(`  ${pass ? 'ok  ' : 'FAIL'}  ${name}${!pass && detail ? '  — ' + detail : ''}`);
};

async function main(){
  if (!CHROME){ console.error('Chrome not found'); process.exit(1); }
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'bf-ugc-'));
  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--hide-scrollbars', '--mute-audio',
    `--user-data-dir=${profile}`, `--remote-debugging-port=${PORT}`, 'about:blank'
  ], {stdio: 'ignore'});

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
  await c.send('Page.addScriptToEvaluateOnNewDocument', {source: `
    try { localStorage.setItem('bf.ads.consent.v1', JSON.stringify({personalised:false, at:Date.now()})); } catch(e){}
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

    /* get to a place page the way a reviewer would */
    await evaluate(`(async () => {
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
    await evaluate(`(async () => {
      const wait = ms => new Promise(r => setTimeout(r, ms));
      for (let i = 0; i < 50; i++){
        await wait(600);
        if (/\\d+\\s+places/.test(document.getElementById('sheet-count').textContent)) return true;
      }
      return false;
    })()`);
    const opened = await evaluate(`(async () => {
      const wait = ms => new Promise(r => setTimeout(r, ms));
      const row = document.querySelector('#sheet-list button.row[data-open]');
      if (!row) return {ok:false, why:'no button.row[data-open]',
                        count:(document.getElementById('sheet-count')||{}).textContent,
                        kids:document.querySelectorAll('#sheet-list > *').length};
      row.click();
      await wait(1500);
      const p = document.getElementById('panel-detail');
      return {ok: !!p && p.dataset.open === 'true',
              why: p ? ('panel dataset.open=' + p.dataset.open) : 'no #panel-detail'};
    })()`);
    check('a place page opens', !!(opened && opened.ok), opened ? JSON.stringify(opened) : 'no result');

    const html = await evaluate(`document.getElementById('detail-body').innerHTML`);

    /* 1.2 (ii) reporting — the control a reviewer must be able to find */
    check('report control on the place page', /data-act="report"/.test(html),
          'no data-act="report" in the detail body');

    /* contributing — what the video has to show being written */
    check('write a review control', /data-act="review"/.test(html));
    check('add photo control', /data-act="photo"/.test(html));

    /* the report sheet must actually open and offer reasons */
    const report = await evaluate(`(async () => {
      const wait = ms => new Promise(r => setTimeout(r, ms));
      const b = document.querySelector('#detail-body [data-act="report"]');
      if (!b) return {ok:false, why:'no report button'};
      b.click();
      await wait(900);
      const modal = document.getElementById('modal');
      const open = !!modal && modal.dataset.open === 'true';
      const text = modal ? modal.innerText : '';
      return {ok:open, chars:text.length, reasons:/wrong|gone|closed|offensive|does not exist|inappropriate/i.test(text)};
    })()`);
    check('the report sheet opens', !!(report && report.ok), report && report.why);
    check('the report sheet offers reasons', !!(report && report.reasons),
          report && report.chars ? report.chars + ' chars shown' : '');

    /* 1.2 (iii) blocking. Apple's rejection letter names "content reporting and
       blocking mechanisms" among the things the demo video must show, so this
       has to be findable from a review, not buried in a settings screen. Drive
       it the way a person would: open the menu, block, confirm the review is
       gone, then confirm it can be undone.

       Most OSM places have no reviews yet, so against production there is
       usually nothing to block. Skip loudly rather than failing: a red cross
       that means "no data here" trains you to ignore red crosses. To exercise
       it for real, seed a review on a local server and point this at that. */
    const hasReview = await evaluate(`document.querySelectorAll('#detail-body .review').length`);
    if (!hasReview){
      console.log('  skip  blocking — this place has no reviews to block');
      console.log('        (seed one against a local server to exercise it: see scratchpad/verify-blocking.js)');
    } else {
    const block = await evaluate(`(async () => {
      const wait = ms => new Promise(r => setTimeout(r, ms));
      const menu = document.querySelector('#detail-body .rmenu[data-rmenu]');
      if (!menu) return {ok:false, why:'no per-review menu control'};
      const before = document.querySelectorAll('#detail-body .review').length;
      menu.click();
      await wait(800);
      const modal = document.getElementById('modal');
      const text = modal ? modal.innerText : '';
      const offersReport = /report this review/i.test(text);
      const offersBlock  = /\\bblock\\b/i.test(text);
      const blockBtn = modal && modal.querySelector('[data-rm="block"]');
      if (!blockBtn) return {ok:false, why:'no block button in the sheet', offersReport, offersBlock, text:text.slice(0,120)};
      blockBtn.click();
      await wait(1200);
      const after = document.querySelectorAll('#detail-body .review').length;
      return {ok: offersReport && offersBlock && after < before,
              offersReport, offersBlock, before, after};
    })()`);
    check('a review offers report and block', !!(block && block.offersReport && block.offersBlock),
          block ? JSON.stringify(block) : 'no result');
    check("blocking actually hides that person's review",
          !!(block && block.ok), block ? JSON.stringify(block) : '');

    const undo = await evaluate(`(async () => {
      const wait = ms => new Promise(r => setTimeout(r, ms));
      document.querySelector('.tab[data-go="profile"]').click();
      await wait(900);
      const p = document.getElementById('panel-profile');
      const btn = p && p.querySelector('[data-unblock]');
      if (!btn) return {ok:false, why:'no unblock control in Profile'};
      btn.click();
      await wait(700);
      const left = document.querySelectorAll('#panel-profile [data-unblock]').length;
      return {ok: left === 0, left};
    })()`);
    check('blocking can be undone from Profile', !!(undo && undo.ok),
          undo ? JSON.stringify(undo) : '');
    }

    /* 3.1.1: a visible subscription or rental flow that takes no money through
       In-App Purchase is a rejection on its own. Both features are behind
       FEATURES flags that are off, and every entry point is guarded — but the
       guard is the claim, and this is the check. Read what the profile screen
       actually renders. */
    const commerce = await evaluate(`(async () => {
      const wait = ms => new Promise(r => setTimeout(r, ms));
      const tab = document.querySelector('.tab[data-go="profile"]');
      if (!tab) return {ok:false, why:'no profile tab'};
      tab.click();
      await wait(900);
      const p = document.getElementById('panel-profile');
      const text = p ? p.innerText : '';
      const offenders = ['Plus', 'Subscribe', 'Subscription', 'Rent out', 'Host console', 'Bookings']
        .filter(w => new RegExp('\\\\b' + w, 'i').test(text));
      const priced = /(\\$|£|€)\\s?\\d/.test(text);
      return {ok: offenders.length === 0 && !priced, offenders, priced,
              flags: JSON.stringify(window.BF_FEATURES || null)};
    })()`);
    check('no dead subscription or rental surface on profile',
          !!(commerce && commerce.ok),
          commerce ? JSON.stringify(commerce) : 'no result');
    check('both paid features are flagged off',
          !!(commerce && /"rentals":false/.test(commerce.flags) && /"plus":false/.test(commerce.flags)),
          commerce ? commerce.flags : '');

    /* 1.2 (iv) a published contact address, reachable from inside the app */
    const support = await evaluate(`(async () => {
      const wait = ms => new Promise(r => setTimeout(r, ms));
      const r = await fetch('support.html').then(x => x.text()).catch(() => '');
      return {found: /data-support-email/.test(r) || /@/.test(r), len: r.length};
    })()`);
    check('a support page exists with a contact', !!(support && support.found),
          support ? support.len + ' bytes' : 'not fetched');
  } finally {
    c.close();
    chrome.kill();
    try { fs.rmSync(profile, {recursive: true, force: true}); } catch (e) {}
  }

  const failed = results.filter(r => !r.pass);
  console.log('');
  console.log(`${results.length - failed.length} passed, ${failed.length} failed`);
  if (failed.length){
    console.log('');
    console.log('An App Review reply that claims these exist would be inaccurate.');
    process.exit(1);
  }
}

main().catch(e => { console.error('\nugc-controls-check could not run:', e.message); process.exit(1); });
