/* Put "What to Test" on a TestFlight build.

     BUILD_NUMBER=22 NOTES="what changed" node tools/set-testflight-notes.js

   Needs APPSTORE_KEY_ID, APPSTORE_ISSUER_ID and APPSTORE_PRIVATE_KEY, the
   same three the upload step already uses.

   Why this exists: the workflow has always had a "What testers should know
   about this build" input, and it was never wired to anything. Every build
   reached TestFlight with empty notes, so four consecutive uploads showed up
   as an identical "1.5.0" with nothing to tell them apart — which is exactly
   what a tester means by "I can't see the newest version".

   A build appears in App Store Connect a little after the upload finishes, so
   this polls rather than assuming it is already there.                     */
'use strict';
const crypto = require('node:crypto');

const KEY_ID = process.env.APPSTORE_KEY_ID;
const ISSUER = process.env.APPSTORE_ISSUER_ID;
const BUILD  = process.env.BUILD_NUMBER;
const NOTES  = (process.env.NOTES || '').trim();
const APP    = process.env.APP_ID || '6804091512';
let KEY = process.env.APPSTORE_PRIVATE_KEY || '';

if (!KEY_ID || !ISSUER || !KEY){
  console.error('APPSTORE_KEY_ID, APPSTORE_ISSUER_ID and APPSTORE_PRIVATE_KEY must be set');
  process.exit(1);
}
if (!BUILD){ console.error('BUILD_NUMBER must be set'); process.exit(1); }
if (!NOTES){ console.log('no NOTES given — nothing to write'); process.exit(0); }

/* The secret is sometimes stored without its PEM armour. */
if (!/BEGIN PRIVATE KEY/.test(KEY)){
  KEY = '-----BEGIN PRIVATE KEY-----\n'
      + KEY.replace(/\s+/g, '').match(/.{1,64}/g).join('\n')
      + '\n-----END PRIVATE KEY-----\n';
}

const b64u = o => Buffer.from(JSON.stringify(o)).toString('base64url');
function token(){
  const now = Math.floor(Date.now() / 1000);
  const signing = `${b64u({alg:'ES256', kid:KEY_ID, typ:'JWT'})}.`
                + `${b64u({iss:ISSUER, iat:now, exp:now + 600, aud:'appstoreconnect-v1'})}`;
  /* ieee-p1363, not DER — Apple rejects the DER encoding Node uses by default. */
  const sig = crypto.sign('sha256', Buffer.from(signing), {key:KEY, dsaEncoding:'ieee-p1363'});
  return `${signing}.${sig.toString('base64url')}`;
}

async function api(path, opts = {}){
  const res = await fetch('https://api.appstoreconnect.apple.com' + path, {
    ...opts,
    headers: {Authorization: 'Bearer ' + token(), 'Content-Type': 'application/json', ...(opts.headers || {})}
  });
  const text = await res.text();
  let body; try { body = JSON.parse(text); } catch { body = text; }
  if (!res.ok){
    const e = new Error(`${res.status} ${path} ${JSON.stringify(body).slice(0, 300)}`);
    e.status = res.status;
    throw e;
  }
  return body;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  let build = null;
  for (let i = 1; i <= 30 && !build; i++){
    const r = await api(`/v1/builds?filter[app]=${APP}&filter[version]=${BUILD}&limit=1`);
    build = r.data[0];
    if (!build){ console.log(`build ${BUILD} not on App Store Connect yet (${i}/30)`); await sleep(20000); }
  }
  if (!build){
    console.log('::warning::build never appeared — leaving the notes unset rather than failing the upload');
    return;
  }
  console.log(`build ${BUILD} is ${build.id} (${build.attributes.processingState})`);

  const locs = await api(`/v1/builds/${build.id}/betaBuildLocalizations`);
  const existing = locs.data.find(l => l.attributes.locale === 'en-US');

  if (existing){
    await api(`/v1/betaBuildLocalizations/${existing.id}`, {
      method: 'PATCH',
      body: JSON.stringify({data: {type:'betaBuildLocalizations', id: existing.id,
        attributes: {whatsNew: NOTES}}})
    });
    console.log('updated the existing en-US notes');
  } else {
    await api('/v1/betaBuildLocalizations', {
      method: 'POST',
      body: JSON.stringify({data: {type:'betaBuildLocalizations',
        attributes: {locale:'en-US', whatsNew: NOTES},
        relationships: {build: {data: {type:'builds', id: build.id}}}}})
    });
    console.log('created en-US notes');
  }

  const after = await api(`/v1/builds/${build.id}/betaBuildLocalizations`);
  const got = (after.data.find(l => l.attributes.locale === 'en-US') || {attributes:{}}).attributes.whatsNew;
  console.log('what testers will now see:');
  console.log('  ' + (got || '(still empty)'));
})().catch(e => {
  /* Never fail a good upload over release notes. */
  console.log('::warning::could not set TestFlight notes: ' + e.message);
});
