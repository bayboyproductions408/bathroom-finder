/* Fails if the app changed but the service worker version did not.

     node tools/check-version-bump.js                  previous commit vs HEAD
     node tools/check-version-bump.js <base>           <base> vs HEAD
     node tools/check-version-bump.js <base> <head>    any two commits

   Why this exists: the app shell is served cache-first, and the cache is
   named after APP_VERSION in app/sw.js. If that string does not change, a
   returning user keeps the old app.js and styles.css — and because sw.js
   itself is unchanged, the browser never looks for a new worker either, so
   no "Update ready" prompt appears.

   That failed silently three commits in a row: auto-loading the map,
   locating on open, and the draggable sheet all reached GitHub Pages and
   none of them reached anyone already running the app. Everything looked
   deployed, because the files on the server really had changed.

   A human reading a diff cannot see this. A script can.                    */
'use strict';
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');

const base = process.argv[2] || 'HEAD~1';
const head = process.argv[3] || 'HEAD';

const git = (...args) => execFileSync('git', args, {encoding:'utf8'}).trim();

let changed;
try {
  changed = git('diff', '--name-only', base, head).split('\n').filter(Boolean);
} catch (err){
  console.log(`could not diff ${base}..${head} — skipping (first commit, or shallow clone)`);
  process.exit(0);
}

/* Only the files the service worker actually caches. Docs, tools and tests
   can change all they like without a version bump. */
const SHELL = /^app\/.*\.(js|css|html)$/;
const touched = changed.filter(f => SHELL.test(f) && f !== 'app/sw.js');

if (!touched.length){
  console.log('no cached app files changed — no bump needed');
  process.exit(0);
}

const versionIn = text => {
  const m = text.match(/APP_VERSION\s*=\s*'([^']+)'/);
  return m ? m[1] : null;
};

const before = versionIn(git('show', `${base}:app/sw.js`));
const after  = versionIn(head === 'HEAD' ? fs.readFileSync('app/sw.js', 'utf8')
                                         : git('show', `${head}:app/sw.js`));

console.log(`comparing ${base}..${head}`);
console.log('app files changed:');
for (const f of touched) console.log('  ' + f);
console.log(`APP_VERSION: ${before} -> ${after}`);

if (!after){
  console.error('\ncould not read APP_VERSION out of app/sw.js at all.');
  process.exit(1);
}
if (before === after){
  console.error(`\n::error::app/ changed but APP_VERSION is still ${after}.`);
  console.error('Anyone already running the app keeps the cached copy and will never see this.');
  console.error('Run: node tools/release.js --bump');
  process.exit(1);
}
console.log('\nok — returning users will be offered this update');
