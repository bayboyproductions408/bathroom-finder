# Getting Bathroom Finder onto your iPhone via TestFlight

## First, how TestFlight actually works

**Nobody can email you a TestFlight build — not me, not anyone.** There is no file to
send. The flow is:

1. A build is uploaded to App Store Connect
2. You add an email address as a tester there
3. **Apple** emails that address an invitation
4. You tap it, and the TestFlight app installs the build

So your Hotmail address goes into App Store Connect as a tester, and Apple does the
emailing. I've built everything that gets a signed build up there; the last steps need
your Apple account, which only you can use.

## The problem this solves

Building an iOS app normally needs a Mac with Xcode, and you're on Windows. The
workflow in `.github/workflows/ios-testflight.yml` uses **GitHub's macOS runners** —
a rented Mac, free, that builds and uploads for you.

Free on a public repo. On a private repo, macOS minutes count 10× against the 2,000
free minutes a month; a build takes about 8 minutes, so roughly **25 builds a month
before it costs anything**.

---

## What you need to do

### 1. Deploy the backend first

Without it the app installs and shows the map, but no reviews, photos or anything
shared works. See DEPLOY.md — Render, free, about ten minutes.

Note the URL you get. You'll need it in step 4.

### 2. Push the code to GitHub

    git remote add origin https://github.com/<you>/bathroom-finder.git
    git branch -M main
    git push -u origin main

### 3. Create the app record in App Store Connect

- appstoreconnect.apple.com → **My Apps → +  → New App**
- Platform **iOS**, name **Bathroom Finder**
- Bundle ID **com.bathroomfinder.app** — if it isn't in the list, create it first at
  developer.apple.com → Certificates, Identifiers & Profiles → Identifiers, and enable
  **Access WiFi Information** off, nothing special needed
- SKU: anything, e.g. `bathroomfinder001`

### 4. Give GitHub the keys

**Settings → Secrets and variables → Actions.**

Under **Variables**:

| Name | Value |
|---|---|
| `API_BASE` | your deployed URL, e.g. `https://bathroom-finder-abc.onrender.com` |

Under **Secrets** — get these from App Store Connect → **Users and Access →
Integrations → App Store Connect API → +**. Choose the **App Manager** role. You can
download the `.p8` key **once**, so save it somewhere.

| Name | Value |
|---|---|
| `APPSTORE_ISSUER_ID` | the Issuer ID on that page |
| `APPSTORE_KEY_ID` | the key's ID |
| `APPSTORE_PRIVATE_KEY` | the whole `.p8` contents, including the BEGIN and END lines |

This key replaces your Apple ID password — there's no 2FA problem, and you can revoke
it from that same page whenever you want. **Do not paste it into a chat, including
this one.** It goes straight into GitHub's secrets field.

### 5. Run the build

GitHub → **Actions → iOS TestFlight → Run workflow**.

It runs the tests, builds, signs, and uploads. About 8–12 minutes. Xcode creates the
signing certificate through the API key, so there's nothing to configure by hand.

### 6. Add yourself as a tester

App Store Connect → your app → **TestFlight**:

- The build appears after 5–15 minutes of processing
- **Internal Testing → + → add your Hotmail address**, then add the build to that group
- Apple emails you. Install the TestFlight app, tap the invite, done.

Internal testers (up to 100, on your own team) need **no App Review**. External testing
needs a short review first, usually a day or two.

---

## What Apple will ask about

**Export compliance** — already answered in `Info.plist`
(`ITSAppUsesNonExemptEncryption = false`). The app only uses standard https, which is
exempt, so you won't be asked every upload.

**What to test** — put something specific in the TestFlight notes, e.g.
*"Find a bathroom near you, rate one, add one that's missing, and report a wrong pin.
Everything you add is shared with other testers."*

**Guideline 4.2** — this is the one that gets web-based apps rejected. It applies to
App Review for public release, not internal TestFlight, so it won't block you testing.
Before you submit for release, read the 4.2 section in STORE.md: the app needs to use
location, camera and offline properly to make the case, which it does.

---

## Things that commonly go wrong

**"No profiles found"** — the bundle ID in App Store Connect doesn't match
`com.bathroomfinder.app`. They must be identical.

**"Build number already used"** — every upload needs a higher `CFBundleVersion`. The
workflow uses the GitHub run number, which always increases, so this shouldn't happen.

**Build uploads but never appears** — check the email associated with your Apple
account for a rejection notice; missing permission strings are the usual cause, and
`tools/prepare-ios.js` sets all of them.

**App opens but has no data** — `API_BASE` wasn't set, or points somewhere the phone
can't reach. Open `https://<your-api-base>/api/v1/health` in Safari on the phone; it
should return `{"ok":true}`.

---

## Android, while you're there

`.github/workflows/android-build.yml` does the same on free Linux runners and produces
the `.aab` for Play. It needs your upload keystore as secrets — the file already exists
at `android/upload-keystore.jks`, and the base64 command is in the workflow's comments.
Play also needs the TWA to point at your deployed domain; see STORE.md.
