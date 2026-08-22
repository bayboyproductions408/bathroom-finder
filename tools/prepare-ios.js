/* Patches the generated iOS project with things Capacitor does not set and
   Apple will reject you for missing.
     node tools/prepare-ios.js
   Runs on the macOS CI box after `npx cap add ios`.                       */
const fs = require('fs'), path = require('path');

const ROOT = path.join(__dirname, '..');
const PLIST = path.join(ROOT, 'ios', 'App', 'App', 'Info.plist');

/* The native app serves its own files from capacitor://localhost, so every
   API call needs an absolute URL. Without this the app launches, shows the
   map, and silently fails to reach the shared backend. */
const API_BASE = process.env.API_BASE || '';
{
  const cfg = path.join(ROOT, 'app', 'config.js');
  const platform = process.env.CAP_PLATFORM || 'ios';
  let s = fs.readFileSync(cfg, 'utf8');
  s = s.replace(/apiBase: '[^']*'/, `apiBase: '${API_BASE}'`)
       .replace(/build: '[^']*'/, `build: '${platform}'`);
  fs.writeFileSync(cfg, s);
  if (!API_BASE){
    console.warn('\n!! API_BASE is not set. The app will build and run, but nothing');
    console.warn('!! shared will work — no reviews from other people, no photos.');
    console.warn('!! Set API_BASE to your deployed URL and rebuild.\n');
  } else {
    console.log(`Backend for this build: ${API_BASE}`);
  }
}

if (!fs.existsSync(PLIST)){
  console.error('No Info.plist yet — run `npx cap add ios` first.');
  process.exit(1);
}

/* Apple rejects generic permission strings. Each one has to say what the app
   does with the data and why the person benefits. */
const STRINGS = {
  NSLocationWhenInUseUsageDescription:
    'Bathroom Finder uses your location to show the bathrooms nearest to you and how far away they are. Your location stays on your device and is never uploaded.',
  NSCameraUsageDescription:
    'Take a photo of a bathroom to add to a review, so the next person knows what to expect before they walk over.',
  NSPhotoLibraryUsageDescription:
    'Choose a photo of a bathroom from your library to add to a review.',
  NSPhotoLibraryAddUsageDescription:
    'Save a photo of a bathroom back to your library.',
  /* Apple rejects an app that shows the tracking prompt without explaining
     it in plain language, and rejects tracking with no prompt at all. */
  NSUserTrackingUsageDescription:
    'Allow tracking and the ads in Bathroom Finder can be chosen for you, which earns more and keeps the app free. Say no and you will still see ads — just less relevant ones. Your location is never shared either way.'
};

/* AdMob refuses to start without its app id here, and the app crashes on
   launch if the key is missing entirely. */
const ADMOB_APP_ID = process.env.ADMOB_APP_ID || 'ca-app-pub-9072066961806430~1491102649';

let plist = fs.readFileSync(PLIST, 'utf8');
let added = 0;
for (const [key, value] of Object.entries(STRINGS)){
  if (plist.includes(`<key>${key}</key>`)){
    /* replace whatever is there — a stale string is as bad as none */
    plist = plist.replace(new RegExp(`(<key>${key}</key>\\s*<string>)[\\s\\S]*?(</string>)`),
                          `$1${value}$2`);
  } else {
    plist = plist.replace('</dict>\n</plist>', `\t<key>${key}</key>\n\t<string>${value}</string>\n</dict>\n</plist>`);
    added++;
  }
}

/* AdMob application identifier */
if (plist.includes('<key>GADApplicationIdentifier</key>')){
  plist = plist.replace(/(<key>GADApplicationIdentifier<\/key>\s*<string>)[\s\S]*?(<\/string>)/, `$1${ADMOB_APP_ID}$2`);
} else {
  plist = plist.replace('</dict>\n</plist>',
    `\t<key>GADApplicationIdentifier</key>\n\t<string>${ADMOB_APP_ID}</string>\n</dict>\n</plist>`);
  added++;
}
console.log(`AdMob app id: ${ADMOB_APP_ID}`);

/* SKAdNetwork identifiers let iOS attribute installs without tracking the
   user. Google's own network id is the minimum; more can be added from
   Google's published list to improve fill. */
if (!plist.includes('SKAdNetworkItems')){
  plist = plist.replace('</dict>\n</plist>',
    `\t<key>SKAdNetworkItems</key>\n\t<array>\n\t\t<dict>\n\t\t\t<key>SKAdNetworkIdentifier</key>\n\t\t\t<string>cstr6suwn9.skadnetwork</string>\n\t\t</dict>\n\t</array>\n</dict>\n</plist>`);
  added++;
}

/* Encryption declaration — without it App Store Connect asks every single
   upload. The app only uses standard https, which is exempt. */
if (!plist.includes('ITSAppUsesNonExemptEncryption')){
  plist = plist.replace('</dict>\n</plist>',
    `\t<key>ITSAppUsesNonExemptEncryption</key>\n\t<false/>\n</dict>\n</plist>`);
  added++;
}

/* Portrait only — the map and sheet are designed for it */
if (!plist.includes('UISupportedInterfaceOrientations')){
  plist = plist.replace('</dict>\n</plist>',
    `\t<key>UISupportedInterfaceOrientations</key>\n\t<array>\n\t\t<string>UIInterfaceOrientationPortrait</string>\n\t</array>\n</dict>\n</plist>`);
  added++;
}

fs.writeFileSync(PLIST, plist);
console.log(`Info.plist patched — ${added} key(s) added, permission strings set.`);

/* App icon: Capacitor ships a placeholder, and a placeholder icon on
   TestFlight looks broken. Drop ours in if the asset catalogue is there. */
const ICONSET = path.join(ROOT, 'ios', 'App', 'App', 'Assets.xcassets', 'AppIcon.appiconset');
const SOURCE = path.join(ROOT, 'store', 'appstore-icon-1024.png');
if (fs.existsSync(ICONSET) && fs.existsSync(SOURCE)){
  fs.copyFileSync(SOURCE, path.join(ICONSET, 'AppIcon-512@2x.png'));
  fs.writeFileSync(path.join(ICONSET, 'Contents.json'), JSON.stringify({
    images: [{filename:'AppIcon-512@2x.png', idiom:'universal', platform:'ios', size:'1024x1024'}],
    info: {author:'xcode', version:1}
  }, null, 2));
  console.log('App icon installed from store/appstore-icon-1024.png');
}
