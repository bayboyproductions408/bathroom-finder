/* Download the App Store provisioning profile for this app from Apple, using
   the App Store Connect API key the workflow already has.

     node tools/fetch-profile.js <output-path>

   Why fetch rather than store it as a secret: a .mobileprovision is not
   sensitive — a copy ships inside every signed build — and one held in a
   secret silently goes stale when it is regenerated or the certificate rolls.
   Pulling the live one each build means the CI never signs with a profile
   that Apple no longer recognises.

   Reads APPSTORE_KEY_ID, APPSTORE_ISSUER_ID and APPSTORE_PRIVATE_KEY from the
   environment. Prints the profile's name and expiry, never key material.   */
'use strict';
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const BUNDLE = 'com.bathroomfinder.app';
const OUT = process.argv[2];
if (!OUT){ console.error('usage: node tools/fetch-profile.js <output-path>'); process.exit(1); }

const KEY_ID = process.env.APPSTORE_KEY_ID;
const ISSUER = process.env.APPSTORE_ISSUER_ID;
let   KEY    = process.env.APPSTORE_PRIVATE_KEY || '';

if (!KEY_ID || !ISSUER || !KEY){
  console.error('APPSTORE_KEY_ID, APPSTORE_ISSUER_ID and APPSTORE_PRIVATE_KEY must all be set');
  process.exit(1);
}

/* Same two repairs the workflow applies when writing the key to disk: a paste
   from a Windows clipboard carries CRLF, and a paste that grabbed only the
   base64 body has lost its PEM header and footer. */
KEY = KEY.replace(/\r/g, '').trim();
if (!KEY.includes('BEGIN PRIVATE KEY')){
  const body = KEY.replace(/\s+/g, '').match(/.{1,64}/g).join('\n');
  KEY = `-----BEGIN PRIVATE KEY-----\n${body}\n-----END PRIVATE KEY-----\n`;
}

const b64u = o => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o))
  .toString('base64').replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');

function token(){
  const key = crypto.createPrivateKey(KEY);
  const now = Math.floor(Date.now()/1000);
  const signing = `${b64u({alg:'ES256', kid:KEY_ID, typ:'JWT'})}.`
                + `${b64u({iss:ISSUER, iat:now, exp:now+600, aud:'appstoreconnect-v1'})}`;
  const sig = crypto.sign('sha256', Buffer.from(signing), {key, dsaEncoding:'ieee-p1363'});
  return `${signing}.${sig.toString('base64').replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_')}`;
}

async function main(){
  const res = await fetch(
    'https://api.appstoreconnect.apple.com/v1/profiles?limit=200&include=bundleId',
    {headers:{Authorization:'Bearer ' + token()}});

  if (res.status !== 200){
    console.error(`App Store Connect returned ${res.status}`);
    console.error((await res.text()).slice(0, 400));
    process.exit(1);
  }

  const j = await res.json();
  const bundleName = new Map((j.included || [])
    .filter(i => i.type === 'bundleIds')
    .map(i => [i.id, i.attributes.identifier]));

  const mine = j.data.filter(p =>
    p.attributes.profileType === 'IOS_APP_STORE' &&
    p.attributes.profileState === 'ACTIVE' &&
    bundleName.get(p.relationships.bundleId.data.id) === BUNDLE);

  if (!mine.length){
    console.error(`No ACTIVE App Store profile for ${BUNDLE}.`);
    console.error('Profiles the key can see:');
    for (const p of j.data){
      console.error(`  ${p.attributes.name} — ${bundleName.get(p.relationships.bundleId.data.id) || '?'}`);
    }
    process.exit(1);
  }

  /* If several exist, take the one that expires last */
  mine.sort((a, b) => String(b.attributes.expirationDate).localeCompare(a.attributes.expirationDate));
  const p = mine[0].attributes;

  fs.mkdirSync(path.dirname(OUT), {recursive:true});
  fs.writeFileSync(OUT, Buffer.from(p.profileContent, 'base64'));
  console.log(`profile: ${p.name} (${p.uuid})`);
  console.log(`expires: ${String(p.expirationDate).slice(0,10)}`);
  console.log(`written: ${OUT} (${fs.statSync(OUT).size} bytes)`);

  /* the archive step needs the name to sign with */
  if (process.env.GITHUB_ENV){
    fs.appendFileSync(process.env.GITHUB_ENV, `PROFILE_NAME=${p.name}\nPROFILE_UUID=${p.uuid}\n`);
  }
}
main().catch(e => { console.error(e.message); process.exit(1); });
