/* Writes the backend URL into app/config.js at build time.
     API_BASE=https://example.com node tools/set-api-base.js

   Deliberately a file rather than an inline `node -e` in the workflow: the
   inline version interpolated through the shell and shipped the literal
   text "$API_BASE" to production, while the deploy still reported success. */
const fs = require('fs'), path = require('path');

const base = (process.env.API_BASE || '').trim().replace(/\/+$/, '');
const platform = process.env.CAP_PLATFORM || 'web';
const file = path.join(__dirname, '..', 'app', 'config.js');

if (!base){
  console.log('No API_BASE set — building in solo mode, nothing will be shared.');
  process.exit(0);
}
if (!/^https?:\/\/[^\s'"]+$/.test(base)){
  console.error(`API_BASE does not look like a URL: ${base}`);
  process.exit(1);
}

let s = fs.readFileSync(file, 'utf8');
const before = s;
s = s.replace(/apiBase: '[^']*'/, `apiBase: '${base}'`)
     .replace(/build: '[^']*'/, `build: '${platform}'`);

if (s === before){
  console.error('config.js did not contain an apiBase line to replace.');
  process.exit(1);
}
fs.writeFileSync(file, s);

/* prove it, rather than trusting the replace */
const after = fs.readFileSync(file, 'utf8');
if (!after.includes(`apiBase: '${base}'`)){
  console.error('apiBase was not written correctly.');
  process.exit(1);
}
console.log(`backend: ${base}  (build: ${platform})`);
