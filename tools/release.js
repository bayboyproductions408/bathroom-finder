/* Pre-flight for shipping an update.
     node tools/release.js            check only
     node tools/release.js --bump     check, then bump the patch version
     node tools/release.js --minor    check, then bump the minor version

   Bumping APP_VERSION in sw.js is what actually rolls an update out: every
   running copy notices the new worker, shows "Update ready", and swaps over
   when the user taps. Nobody reinstalls anything.                          */
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SW   = path.join(ROOT, 'app', 'sw.js');
const problems = [], notes = [];

/* 1. tests must pass */
try {
  execFileSync(process.execPath, [path.join(ROOT, 'tests', 'run.js')], {stdio:'pipe'});
  notes.push('logic tests pass');
} catch (err){
  problems.push('logic tests FAIL — run node tests/run.js');
}
try {
  execFileSync(process.execPath, ['--test', path.join(ROOT, 'tests', 'api.test.js')], {stdio:'pipe'});
  notes.push('backend tests pass');
} catch (err){
  problems.push('backend tests FAIL — run node --test tests/api.test.js');
}

/* the moderator token must not still be the default once this is reachable */
if (!process.env.ADMIN_TOKEN)
  notes.push('ADMIN_TOKEN is unset — the moderator console will accept "dev-moderator-token". Set a real one before deploying.');

/* the legal pages have to exist and be filled in */
for (const doc of ['PRIVACY.md', 'TERMS.md']){
  const p = path.join(ROOT, doc);
  if (!fs.existsSync(p)) problems.push(`${doc} is missing`);
  else if (fs.readFileSync(p, 'utf8').includes('_Add a contact address'))
    notes.push(`${doc} still has no contact address in it`);
}

/* 2. every file the worker promises to cache must exist */
const sw = fs.readFileSync(SW, 'utf8');
const version = (sw.match(/APP_VERSION\s*=\s*'([^']+)'/) || [])[1];
if (!version) problems.push('sw.js has no APP_VERSION');
const shell = (sw.match(/SHELL_FILES\s*=\s*\[([\s\S]*?)\]/) || ['',''])[1];
for (const m of shell.matchAll(/'\.\/([^']+)'/g)){
  if (m[1] && !fs.existsSync(path.join(ROOT, 'app', m[1])))
    problems.push(`sw.js caches ./${m[1]} but that file does not exist`);
}

/* 3. every local script the page loads should be in the shell list */
const html = fs.readFileSync(path.join(ROOT, 'app', 'index.html'), 'utf8');
for (const m of html.matchAll(/<script src="(?!http)([^"]+)"/g))
  if (!shell.includes(`./${m[1]}`)) problems.push(`index.html loads ${m[1]} but sw.js will not cache it`);
for (const m of html.matchAll(/<link[^>]+href="(?!http)([^"]+\.css)"/g))
  if (!shell.includes(`./${m[1]}`)) problems.push(`index.html loads ${m[1]} but sw.js will not cache it`);

/* 4. the native build must not ship pointing at a dead backend */
{
  const cfg = fs.readFileSync(path.join(ROOT,'app','config.js'),'utf8');
  const m = cfg.match(/apiBase: '([^']*)'/);
  const build = (cfg.match(/build: '([^']*)'/) || [])[1];
  if (build && build !== 'web' && !(m && m[1]))
    problems.push('app/config.js is set to a native build but has no apiBase — nothing shared would work');
  if (m && m[1] && build === 'web')
    notes.push('app/config.js has apiBase set (' + m[1] + ') while marked as a web build — fine locally, but the web app normally uses same-origin');
}

/* the store requires reachable privacy, terms and support pages */
for (const page of ['privacy.html','terms.html','support.html']){
  const p = path.join(ROOT,'app',page);
  if (!fs.existsSync(p)) problems.push(`app/${page} is missing — the App Store listing requires a reachable ${page.replace('.html','')} page`);
  else if (!shell.includes('./'+page)) notes.push(page + ' is not cached for offline use');
}
notes.push('legal pages are published at /privacy.html, /terms.html, /support.html');

/* 5. things that must not ship */
for (const f of fs.readdirSync(path.join(ROOT, 'app')))
  if (f.startsWith('_')) problems.push(`app/${f} looks like a leftover scratch file`);
if (fs.existsSync(path.join(ROOT, 'ledger.json'))) notes.push('ledger.json exists (dev payment records) — delete before a real deploy');
if (!fs.existsSync(path.join(ROOT, 'certs', 'cert.pem'))) notes.push('no certs/ — https disabled, phones will refuse geolocation');

/* 6. secrets */
const secret = /sk_live_|sk_test_[A-Za-z0-9]{10,}/;
for (const dir of ['app', 'tools', '.']){
  const d = path.join(ROOT, dir);
  for (const f of fs.readdirSync(d)){
    const p = path.join(d, f);
    if (!fs.statSync(p).isFile() || !/\.(js|html|json|webmanifest)$/.test(f)) continue;
    if (p === __filename) continue;                     // the scanner's own pattern is not a leak
    if (secret.test(fs.readFileSync(p, 'utf8'))) problems.push(`${dir}/${f} contains something that looks like a Stripe key`);
  }
}

console.log(`\nBathroom Finder — release check   (version ${version || '??'})\n`);
notes.forEach(n => console.log('  note  ' + n));
problems.forEach(p => console.log('  BLOCK ' + p));

if (problems.length){
  console.log(`\n${problems.length} problem${problems.length===1?'':'s'} — not ready to ship.\n`);
  process.exit(1);
}

const bump = process.argv.includes('--bump'), minor = process.argv.includes('--minor');
if (bump || minor){
  const [maj, min, pat] = version.replace(/^v/,'').split('.').map(Number);
  const next = minor ? `v${maj}.${min+1}.0` : `v${maj}.${min}.${pat+1}`;
  fs.writeFileSync(SW, sw.replace(/APP_VERSION\s*=\s*'[^']+'/, `APP_VERSION = '${next}'`));
  console.log(`\n  bumped ${version} → ${next}`);
  console.log(`  every running copy will offer this update within 30 minutes, or on next open.\n`);
} else {
  console.log(`\n  ready to ship. Use --bump (or --minor) to roll it out.\n`);
}
