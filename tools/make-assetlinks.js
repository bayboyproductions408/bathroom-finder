/* Digital Asset Links — the handshake that lets the Android app open your
   site with no browser chrome. Without it a TWA falls back to showing a URL
   bar, which looks broken and fails Play review expectations.

     node tools/make-assetlinks.js                    read the keystore, write the file
     node tools/make-assetlinks.js <SHA256_FINGERPRINT>   if you already have it

   The result goes to app/.well-known/assetlinks.json and is served at
   https://<your-host>/.well-known/assetlinks.json                          */
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
/* find keytool: an explicit JAVA_HOME wins, then the JDK sitting in dev-tools,
   then whatever is on PATH */
const findKeytool = () => {
  const fsx = require('fs'), px = require('path');
  if (process.env.JAVA_HOME){
    const c = px.join(process.env.JAVA_HOME, 'bin', 'keytool.exe');
    if (fsx.existsSync(c)) return c;
  }
  const base = 'C:/Dom/Claude/dev-tools/jdk17';
  if (fsx.existsSync(base)) for (const d of fsx.readdirSync(base)){
    const c = px.join(base, d, 'bin', 'keytool.exe');
    if (fsx.existsSync(c)) return c;
  }
  return 'keytool';
};
const KEYTOOL = findKeytool();
const PACKAGE = 'com.bathroomfinder.app';

let fingerprint = process.argv[2];

if (!fingerprint){
  const propsFile = path.join(ROOT, 'android', 'keystore.properties');
  if (!fs.existsSync(propsFile)){
    console.error('\nNo fingerprint given and android/keystore.properties does not exist.');
    console.error('Create the upload key first:  node tools/make-keystore.js\n');
    process.exit(1);
  }
  const props = Object.fromEntries(fs.readFileSync(propsFile, 'utf8').split('\n')
    .filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0,i).trim(), l.slice(i+1).trim()]; }));
  const storePath = path.isAbsolute(props.storeFile) ? props.storeFile : path.join(ROOT, 'android', props.storeFile);
  try {
    const out = execFileSync(KEYTOOL, ['-list', '-v', '-keystore', storePath,
      '-alias', props.keyAlias, '-storepass', props.storePassword], {encoding:'utf8'});
    const m = out.match(/SHA256:\s*([A-F0-9:]+)/i);
    if (!m) throw new Error('no SHA256 line in keytool output');
    fingerprint = m[1];
  } catch(err){
    console.error('Could not read the keystore:', err.message);
    process.exit(1);
  }
}

fingerprint = fingerprint.trim().toUpperCase();
if (!/^([A-F0-9]{2}:){31}[A-F0-9]{2}$/.test(fingerprint)){
  console.error('\nThat does not look like a SHA-256 fingerprint (32 colon-separated hex pairs).');
  console.error('Got: ' + fingerprint + '\n');
  process.exit(1);
}

const doc = [{
  relation: ['delegate_permission/common.handle_all_urls'],
  target: {namespace:'android_app', package_name:PACKAGE, sha256_cert_fingerprints:[fingerprint]}
}];

const dir = path.join(ROOT, 'app', '.well-known');
fs.mkdirSync(dir, {recursive:true});
fs.writeFileSync(path.join(dir, 'assetlinks.json'), JSON.stringify(doc, null, 2));

console.log(`\nWrote app/.well-known/assetlinks.json`);
console.log(`  package     ${PACKAGE}`);
console.log(`  fingerprint ${fingerprint}`);
console.log(`\nIt must be reachable at https://<your-host>/.well-known/assetlinks.json`);
console.log(`before the app will open without a browser bar.`);
console.log(`\nIMPORTANT: if you use Play App Signing (the default, and recommended),`);
console.log(`Google re-signs your app with THEIR key. After your first upload, copy the`);
console.log(`SHA-256 from Play Console → Setup → App signing and re-run:`);
console.log(`  node tools/make-assetlinks.js <that fingerprint>\n`);
