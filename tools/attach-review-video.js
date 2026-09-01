/* Attach a demo recording to App Review Information for the version that is
   about to be submitted.

     node tools/attach-review-video.js path/to/demo.mp4

   Needs APPSTORE_KEY_ID / APPSTORE_ISSUER_ID / APPSTORE_PRIVATE_KEY for a key
   with App Manager rights. The CI key is Developer-role and gets a 403 here.

   Why this rather than Resolution Center: Apple asked for the recording, and
   an attachment on the version travels with the submission itself, so it is in
   front of the reviewer when they open it instead of sitting in a message
   thread they may read after forming a view. Replying in Resolution Center as
   well costs nothing and is worth doing; this is the copy that cannot be
   missed.

   Upload is the same three-step handshake the screenshots use: reserve, PUT
   the bytes exactly as the reservation instructs, then commit with an MD5 so
   the far end can prove it received what was sent.                          */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const KEY_ID = process.env.APPSTORE_KEY_ID;
const ISSUER = process.env.APPSTORE_ISSUER_ID;
let KEY = process.env.APPSTORE_PRIVATE_KEY;
const FILE = process.argv[2];

if (!FILE){
  console.error('usage: node tools/attach-review-video.js <file>');
  process.exit(2);
}
if (!KEY_ID || !ISSUER || !KEY){
  console.error('set APPSTORE_KEY_ID, APPSTORE_ISSUER_ID and APPSTORE_PRIVATE_KEY first');
  process.exit(2);
}
if (!/BEGIN PRIVATE KEY/.test(KEY))
  KEY = `-----BEGIN PRIVATE KEY-----\n${KEY.replace(/\s+/g, '').match(/.{1,64}/g).join('\n')}\n-----END PRIVATE KEY-----\n`;

const b64u = o => Buffer.from(JSON.stringify(o)).toString('base64url');
function token(){
  const now = Math.floor(Date.now() / 1000);
  const signing = `${b64u({alg: 'ES256', kid: KEY_ID, typ: 'JWT'})}.` +
                  `${b64u({iss: ISSUER, iat: now, exp: now + 900, aud: 'appstoreconnect-v1'})}`;
  const sig = crypto.sign('sha256', Buffer.from(signing), {key: KEY, dsaEncoding: 'ieee-p1363'});
  return `${signing}.${sig.toString('base64url')}`;
}
async function api(p, opts = {}){
  const res = await fetch('https://api.appstoreconnect.apple.com' + p, {
    ...opts,
    headers: {Authorization: 'Bearer ' + token(), 'Content-Type': 'application/json', ...(opts.headers || {})}
  });
  const text = await res.text();
  let body; try { body = JSON.parse(text); } catch (e) { body = text; }
  if (!res.ok){ const e = new Error(`${res.status} ${p}`); e.body = body; throw e; }
  return body;
}

/* Apple's own guidance is that a review attachment should be a short clip.
   Warn loudly rather than discovering the limit after a long upload. */
const SOFT_LIMIT = 50 * 1024 * 1024;

(async () => {
  const buf = fs.readFileSync(FILE);
  const name = path.basename(FILE);
  console.log(`${name} — ${(buf.length / 1024 / 1024).toFixed(1)} MB`);
  if (buf.length > SOFT_LIMIT)
    console.log('  warning: over 50 MB. If this is rejected, trim the clip or drop the capture resolution.');

  /* Find the version that is actually in flight rather than hardcoding an id
     that goes stale the moment a version is created or renamed. */
  const APP = process.env.ASC_APP_ID || '6804091512';
  const vs = await api(`/v1/apps/${APP}/appStoreVersions?limit=10`);
  const version = vs.data.find(v => ['PREPARE_FOR_SUBMISSION', 'DEVELOPER_REJECTED', 'REJECTED',
                                    'METADATA_REJECTED', 'WAITING_FOR_REVIEW'].includes(v.attributes.appStoreState));
  if (!version){
    console.error('no version in an editable state; nothing to attach to');
    process.exit(1);
  }
  console.log(`version ${version.attributes.versionString} (${version.attributes.appStoreState})`);

  const rd = await api(`/v1/appStoreVersions/${version.id}/appStoreReviewDetail`);
  const detailId = rd.data.id;

  /* One attachment is the point. Replace whatever is there so a re-run after a
     better take does not leave the old clip in front of the reviewer. */
  const have = await api(`/v1/appStoreReviewDetails/${detailId}/appStoreReviewAttachments`);
  for (const a of have.data){
    await api(`/v1/appStoreReviewAttachments/${a.id}`, {method: 'DELETE'});
    console.log(`  removed previous attachment ${a.attributes.fileName}`);
  }

  const res = await api('/v1/appStoreReviewAttachments', {
    method: 'POST',
    body: JSON.stringify({data: {
      type: 'appStoreReviewAttachments',
      attributes: {fileName: name, fileSize: buf.length},
      relationships: {appStoreReviewDetail: {data: {type: 'appStoreReviewDetails', id: detailId}}}
    }})
  });
  const id = res.data.id;
  const ops = res.data.attributes.uploadOperations || [];
  if (!ops.length) throw new Error('no upload operations returned');
  console.log(`  reserved, ${ops.length} chunk(s)`);

  let sent = 0;
  for (const op of ops){
    const headers = {};
    for (const h of op.requestHeaders || []) headers[h.name] = h.value;
    const r = await fetch(op.url, {
      method: op.method, headers,
      body: buf.subarray(op.offset, op.offset + op.length)
    });
    if (!r.ok) throw new Error(`chunk upload failed: ${r.status} ${await r.text()}`);
    sent += op.length;
    process.stdout.write(`\r  uploaded ${(sent / 1024 / 1024).toFixed(1)} MB`);
  }
  process.stdout.write('\n');

  await api(`/v1/appStoreReviewAttachments/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({data: {type: 'appStoreReviewAttachments', id,
      attributes: {uploaded: true, sourceFileChecksum: crypto.createHash('md5').update(buf).digest('hex')}}})
  });

  /* Read it back. A 201 means Apple accepted the reservation, not the file. */
  const after = await api(`/v1/appStoreReviewDetails/${detailId}/appStoreReviewAttachments`);
  console.log('');
  for (const a of after.data){
    const st = a.attributes.assetDeliveryState || {};
    console.log(`  ${a.attributes.fileName}  ${a.attributes.fileSize} bytes  state=${st.state}`);
    if ((st.errors || []).length){
      console.log('  ERRORS: ' + JSON.stringify(st.errors));
      process.exit(1);
    }
  }
  if (!after.data.length){
    console.error('nothing attached after upload');
    process.exit(1);
  }
  console.log('\nattached to App Review Information.');
})().catch(e => {
  const status = String(e.message || '').match(/^(\d{3})/);
  if (status && status[1] === '401'){
    console.error('\nThe API key was rejected (401) — it has been revoked, or the key id and');
    console.error('issuer id do not belong together.');
  } else if (status && status[1] === '403'){
    console.error('\nThe key authenticates but is not allowed to write (403). Attaching a review');
    console.error('attachment needs the App Manager role; a Developer-role key can only read.');
  }
  if (status && (status[1] === '401' || status[1] === '403')){
    console.error('\nYou do not need this tool to get the video to Apple. In App Store Connect:');
    console.error('  Distribution > App Review Information > Attachment > upload the file,');
    console.error('which is the same slot this writes to and needs no key at all.');
    process.exit(1);
  }
  console.error('ERR', e.message, JSON.stringify(e.body || '').slice(0, 600));
  process.exit(1);
});
