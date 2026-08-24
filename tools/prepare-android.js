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

/* ---- 4. permissions -----------------------------------------------------
   The Geolocation and Camera plugins declare their own permissions and those
   merge in automatically. What does NOT merge is the coarse-location fallback
   some devices need when precise is denied, so state it explicitly. */
const MANIFEST = path.join(APP, 'src', 'main', 'AndroidManifest.xml');
if (fs.existsSync(MANIFEST)){
  let m = fs.readFileSync(MANIFEST, 'utf8');
  const want = ['android.permission.ACCESS_COARSE_LOCATION', 'android.permission.INTERNET'];
  let added = 0;
  for (const p of want){
    if (!m.includes(p)){
      m = m.replace('</manifest>', `    <uses-permission android:name="${p}" />\n</manifest>`);
      added++;
    }
  }
  if (added) fs.writeFileSync(MANIFEST, m);
  console.log(`manifest: ${added} permission(s) added`);
}
