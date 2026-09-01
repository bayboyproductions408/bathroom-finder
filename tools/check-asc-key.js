/* Fail fast if the App Store Connect API key will not authenticate.

     APPSTORE_KEY_ID=... APPSTORE_ISSUER_ID=... APPSTORE_PRIVATE_KEY=... \
       node tools/check-asc-key.js

   Why this runs before anything expensive: the key is used at the very end of
   the job, to upload the archive. A revoked or mistyped key therefore costs a
   full macOS build first — billed at ten times the rate of a Linux one — and
   then fails with an authentication error from xcodebuild that reads like a
   signing problem, which is a different and much longer hunt.

   This is not hypothetical. Two of the three keys on this team were revoked
   between 2026-08-27 and 2026-09-01, including the one recorded as the CI key,
   and nothing would have reported that until the next release attempt died
   eight minutes in.

   A key can authenticate and still lack the role for a given write, so this
   only claims what it checks: that the key is live and can read the account.  */
'use strict';
const crypto = require('node:crypto');

const KEY_ID = process.env.APPSTORE_KEY_ID;
const ISSUER = process.env.APPSTORE_ISSUER_ID;
let KEY = process.env.APPSTORE_PRIVATE_KEY;

const missing = [
  !KEY_ID && 'APPSTORE_KEY_ID',
  !ISSUER && 'APPSTORE_ISSUER_ID',
  !KEY && 'APPSTORE_PRIVATE_KEY'
].filter(Boolean);
if (missing.length){
  console.error('::error::missing ' + missing.join(', ') + ' — set them in the repository secrets');
  process.exit(1);
}

/* A paste that loses the BEGIN/END armour is the single most common way this
   secret arrives broken, so rebuild it rather than failing on it. */
if (!/BEGIN PRIVATE KEY/.test(KEY))
  KEY = `-----BEGIN PRIVATE KEY-----\n${KEY.replace(/\s+/g, '').match(/.{1,64}/g).join('\n')}\n-----END PRIVATE KEY-----\n`;

const b64u = o => Buffer.from(JSON.stringify(o)).toString('base64url');

(async () => {
  let token;
  try {
    const now = Math.floor(Date.now() / 1000);
    const signing = `${b64u({alg: 'ES256', kid: KEY_ID, typ: 'JWT'})}.` +
                    `${b64u({iss: ISSUER, iat: now, exp: now + 600, aud: 'appstoreconnect-v1'})}`;
    const sig = crypto.sign('sha256', Buffer.from(signing), {key: KEY, dsaEncoding: 'ieee-p1363'});
    token = `${signing}.${sig.toString('base64url')}`;
  } catch (e){
    console.error(`::error::APPSTORE_PRIVATE_KEY is not a usable ES256 key (${e.message}). ` +
                  'Paste the whole .p8 file, BEGIN and END lines included.');
    process.exit(1);
  }

  const res = await fetch('https://api.appstoreconnect.apple.com/v1/apps?limit=1',
                          {headers: {Authorization: 'Bearer ' + token}});

  if (res.status === 401){
    console.error(`::error::App Store Connect rejected key ${KEY_ID} (401). It has been revoked, ` +
                  'or the key id and issuer id do not belong together. Create a new key with the ' +
                  'App Manager role at App Store Connect > Users and Access > Integrations, then ' +
                  'update APPSTORE_KEY_ID and APPSTORE_PRIVATE_KEY in the repository secrets.');
    process.exit(1);
  }
  if (!res.ok){
    console.error(`::error::App Store Connect returned ${res.status} for key ${KEY_ID}: ` +
                  (await res.text()).slice(0, 300));
    process.exit(1);
  }

  console.log(`App Store Connect key ${KEY_ID} authenticates.`);
})().catch(e => {
  console.error('::error::could not reach App Store Connect: ' + e.message);
  process.exit(1);
});
