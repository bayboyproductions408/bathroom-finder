/* Patches the generated Android project with the things Capacitor does not set.

     node tools/prepare-android.js

   Run after `npx cap add android` and before `cap sync`. The counterpart of
   tools/prepare-ios.js, and deliberately shaped the same way so the two
   pipelines read alike.

   Capacitor gives a working debug app. Three things are still missing for a
   Play release: a release signing config, a version that increments, and an
   icon that is not the Capacitor placeholder.                              */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const APP  = path.join(ROOT, 'android', 'app');
const GRADLE = path.join(APP, 'build.gradle');

if (!fs.existsSync(GRADLE)){
  console.error('No android/app/build.gradle — run `npx cap add android` first.');
  process.exit(1);
}

let g = fs.readFileSync(GRADLE, 'utf8');
let changed = 0;

/* ---- 1. release signing -------------------------------------------------
   Capacitor's template signs release builds with the debug key, which Play
   rejects. Read the real key out of keystore.properties if it is there, and
   fall back to unsigned rather than silently shipping a debug-signed bundle
   that fails at upload with a confusing message. */
if (!g.includes('signingConfigs')){
  const signing = `
def keystorePropsFile = rootProject.file("keystore.properties")
def keystoreProps = new Properties()
if (keystorePropsFile.exists()) {
    keystoreProps.load(new FileInputStream(keystorePropsFile))
}

android {
    signingConfigs {
        release {
            if (keystorePropsFile.exists()) {
                storeFile file(keystoreProps['storeFile'])
                storePassword keystoreProps['storePassword']
                keyAlias keystoreProps['keyAlias']
                keyPassword keystoreProps['keyPassword']
            }
        }
    }
}
`;
  /* put it before the existing android { } block so both merge */
  g = g.replace(/^android \{/m, signing.trim() + '\n\nandroid {');
  changed++;
}

if (!g.includes('signingConfig signingConfigs.release')){
  g = g.replace(/(buildTypes \{[\s\S]*?release \{)/m,
    `$1
            signingConfig keystorePropsFile.exists() ? signingConfigs.release : null`);
  changed++;
}

/* ---- 2. version ---------------------------------------------------------
   versionCode must increase on every upload or Play refuses the bundle. CI
   passes the run number, which is monotonic and free. versionName is the
   marketing version people see. */
const versionCode = process.env.ANDROID_VERSION_CODE || '1';
const versionName = require(path.join(ROOT, 'package.json')).version;

g = g.replace(/versionCode\s+\d+/, `versionCode ${versionCode}`);
g = g.replace(/versionName\s+"[^"]*"/, `versionName "${versionName}"`);

fs.writeFileSync(GRADLE, g);
console.log(`build.gradle: ${changed} block(s) added, version ${versionName} (${versionCode})`);

/* ---- 3. icon ------------------------------------------------------------
   Capacitor ships its own placeholder. A placeholder icon on a store listing
   reads as abandonware, so install the real one into every density. */
const SOURCE = path.join(ROOT, 'store', 'icon-512.png');
if (fs.existsSync(SOURCE)){
  const res = path.join(APP, 'src', 'main', 'res');
  let n = 0;
  for (const dir of fs.readdirSync(res).filter(d => d.startsWith('mipmap'))){
    for (const name of ['ic_launcher.png', 'ic_launcher_round.png', 'ic_launcher_foreground.png']){
      const target = path.join(res, dir, name);
      if (fs.existsSync(target)){ fs.copyFileSync(SOURCE, target); n++; }
    }
  }
  console.log(`icon: installed into ${n} file(s) from store/icon-512.png`);
} else {
  console.log('icon: store/icon-512.png missing — run tools/make-icons.js');
}

/* ---- 4. manifest --------------------------------------------------------
   Capacitor regenerates this file on every `cap add android`, so nothing here
   can be committed — it has to be re-applied on each build.

   The note that used to sit here said the Geolocation and Camera plugins
   "declare their own permissions and those merge in automatically". They do
   not. @capacitor/geolocation ships an AndroidManifest.xml holding an empty
   <manifest> element and nothing else, so the permissions are the app's own
   responsibility. Only coarse was being declared, which means every Android
   fix was accurate to a kilometre or two — on a screen whose entire job is
   answering "which of these is nearest", that is a wrong answer rather than
   a slightly vague one.

   AD_ID is required from Android 13 onward for an ads SDK to read the
   advertising identifier at all. Without it the id reads back as zeroes, and
   Play blocks any release whose Advertising ID declaration says the app uses
   one.

   APPLICATION_ID is not optional either: the Google Mobile Ads SDK throws
   during initialisation when the meta-data is missing, which on Android is a
   crash on launch, not a missing banner. iOS gets the same value through
   GADApplicationIdentifier in prepare-ios.js; this is its counterpart. */
const MANIFEST = path.join(APP, 'src', 'main', 'AndroidManifest.xml');

/* app/admob.js already carries the ids that ship inside the binary, so read
   them from there. One source of truth is what stops the manifest and the
   JavaScript drifting into the state where the id is set in one and an empty
   string in the other. */
function androidAdMobAppId(){
  if (process.env.ADMOB_ANDROID_APP_ID) return process.env.ADMOB_ANDROID_APP_ID;
  try {
    const js = fs.readFileSync(path.join(ROOT, 'app', 'admob.js'), 'utf8');
    const block = js.slice(js.indexOf('android: {'));
    const m = block.match(/appId:\s*'([^']*)'/);
    return m ? m[1] : '';
  } catch(e){ return ''; }
}

if (fs.existsSync(MANIFEST)){
  const ADMOB_APP_ID = androidAdMobAppId();
  let m = fs.readFileSync(MANIFEST, 'utf8');
  const want = [
    'android.permission.INTERNET',
    'android.permission.ACCESS_COARSE_LOCATION',
    'android.permission.ACCESS_FINE_LOCATION',
    'com.google.android.gms.permission.AD_ID'
  ];
  let added = 0;
  for (const p of want){
    if (!m.includes(p)){
      m = m.replace('</manifest>', '    <uses-permission android:name="' + p + '" />\n</manifest>');
      added++;
    }
  }

  if (ADMOB_APP_ID){
    if (m.includes('com.google.android.gms.ads.APPLICATION_ID')){
      m = m.replace(/(APPLICATION_ID"[\s\S]{0,80}?android:value=")[^"]*(")/, '$1' + ADMOB_APP_ID + '$2');
    } else {
      m = m.replace('</application>',
        '    <meta-data\n' +
        '            android:name="com.google.android.gms.ads.APPLICATION_ID"\n' +
        '            android:value="' + ADMOB_APP_ID + '" />\n' +
        '    </application>');
      added++;
    }
    console.log('manifest: AdMob app id ' + ADMOB_APP_ID);
  } else {
    /* Having no id yet is a supported state — admob.js falls back to the
       in-app sponsored slot — but shipping the SDK without the meta-data is
       not, so say so rather than quietly building something that crashes. */
    console.log('manifest: no Android AdMob app id set, APPLICATION_ID skipped');
  }

  fs.writeFileSync(MANIFEST, m);
  console.log('manifest: ' + added + ' entr(ies) added');

  /* Assert instead of trusting the replaces. A regex that silently misses
     here produces a bundle that crashes on launch, and that only shows up on
     a real device, days later, in a review queue. */
  const missing = want.filter(p => !m.includes(p));
  if (missing.length){
    console.error('::error::manifest is missing ' + missing.join(', '));
    process.exit(1);
  }
  if (ADMOB_APP_ID && !m.includes('android:value="' + ADMOB_APP_ID + '"')){
    console.error('::error::AdMob app id never reached the manifest');
    process.exit(1);
  }
}
