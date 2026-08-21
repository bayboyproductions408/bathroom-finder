/* Creates a strong moderator token and writes it to .env (git-ignored).
     node tools/make-admin-token.js  [--force]

   Run this before putting the server on a public URL. The default token is
   written down in this repo, so leaving it in place means anyone who finds
   your URL can approve photos, block people and read tester feedback.      */
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const ENV = path.join(__dirname, '..', '.env');

let current = '';
try { current = fs.readFileSync(ENV, 'utf8'); } catch(e){}

if (/^ADMIN_TOKEN=.+/m.test(current) && !process.argv.includes('--force')){
  console.log('\n.env already has an ADMIN_TOKEN. Use --force to replace it.');
  console.log('Replacing it locks out anyone currently in the moderator console.\n');
  process.exit(0);
}

const token = crypto.randomBytes(32).toString('base64url');
const next = /^ADMIN_TOKEN=.*/m.test(current)
  ? current.replace(/^ADMIN_TOKEN=.*/m, 'ADMIN_TOKEN=' + token)
  : (current ? current.replace(/\s*$/, '\n') : '') + 'ADMIN_TOKEN=' + token + '\n';

fs.writeFileSync(ENV, next);
console.log('\nModerator token written to ' + ENV);
console.log('\n  ' + token + '\n');
console.log('Paste it into /moderate.html. Restart the server to pick it up.\n');
