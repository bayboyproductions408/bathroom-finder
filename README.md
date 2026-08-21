# Bathroom Finder

A worldwide, community-reviewed map of bathrooms — public toilets, the ones inside
restaurants and hotels, and private bathrooms people list for others to rent.

Version **v1.4.2** (`app/sw.js` → `APP_VERSION`).

## App stores

Store artwork, listing copy, Play Data Safety answers, Apple privacy labels and the
Android build steps are all in **STORE.md**. The Android project is scaffolded in
`android/` as a Trusted Web Activity. Both stores still need a public domain and a
developer account, and iOS needs a Mac — see LAUNCH.md.

## Testing on a phone

Scan `iphone-start-qr.png` or open **192.168.1.152/check.html** on the phone. That page
reports what actually works there — connection, location, offline mode, photos, storage,
backend — instead of leaving you to guess. Full walkthrough, including making location
and offline mode work on iOS, is in **IPHONE.md**.

## Run it

    node serve.js

    this computer        http://localhost:8080
    phone (no location)  http://192.168.1.152:8080
    phone (location ✓)   https://192.168.1.152:8444

Use the **https** address on a phone. Browsers only give geolocation to a secure
origin. The certificate is self-signed, so the phone warns once — tap **Advanced →
proceed**. Nothing was installed into your system trust store.

On the phone, use **Add to home screen**. It installs as a real app: own icon, no
browser chrome, and it opens and works with no signal.

## Test it

    node tests/run.js              57 checks — logic, service worker, page wiring
    node --test tests/api.test.js  26 checks — the shared backend
    node tools/release.js          pre-flight before shipping an update

    http://localhost:8080/tests.html    26 in-browser checks — moderation + payments

`release.js` runs the tests, verifies every file the service worker promises to cache
exists, checks the page's scripts are all cached, looks for leftover scratch files and
anything resembling a Stripe key, then `--bump` / `--minor` rolls the version.

## Shipping an update

    node tools/release.js --bump

That bumps `APP_VERSION`. Every installed copy notices the new service worker within
30 minutes (or on next open), shows **"A new version is ready"**, and swaps over when
the user taps. Nobody reinstalls anything.

## What the competition taught us

Looked at Flush, Toilet Finder, Bathroom Scout, Sit or Squat, LooLocator and Refuge
Restrooms, plus their reviews. Three things came out of it:

1. **Wrong pins nobody can fix** is the single loudest complaint across all of them —
   users report listings at the wrong address with no way to correct or remove them.
   So corrections here are first-class: **Report a problem** lets anyone move the pin,
   fix the hours, or flag a place as closed, private or non-existent, and it takes
   effect immediately. Two independent reports mark a listing disputed for everyone.
2. **Stale data.** Every listing shows its own age — "Confirmed today" through to
   "Not confirmed in months" — and stale or disputed ones carry a banner saying so.
   Trust is scored from reviews, photos, confirmations, detail and age, and you can
   sort by it.
3. **Offline is the feature people praise Flush for.** Everything loaded is cached, so
   a place you've been before draws instantly with no signal at all.

Users also asked repeatedly for the thing no app records: *where the bathroom actually
is inside the building*. That's a first-class field — "past the fish counter, unmarked
green door on the left".

## Finding things

- **Search** covers places already on the map (instant, ranked by name then distance)
  and every city and address on earth via Nominatim.
- **Search this area** — the map no longer refetches on every pan. Overpass is a free
  shared service and hammering it gets you throttled, which is what made the map feel
  broken. First view loads automatically; after that you're in control.
- **Open now** is real: `app/lib.js` parses OSM `opening_hours` — day ranges, comma
  lists, split lunch breaks, overnight windows, `off` overrides, `24/7`. It reads
  **100 of 101** real specs in central London; anything it can't read says "unknown"
  rather than guessing, because telling someone a locked bathroom is open is worse
  than saying nothing.
- **Clustering** keeps dense cities readable — 365 London places become 76 markers.
  Bathrooms are never clustered away; only background venues are.
- **Filters**: category, open now, free, step-free, baby changing, gender neutral,
  reviewed. **Sorts**: closest, open now, top rated, most trusted, toilets first.

## Layout

    app/
      index.html          shell
      styles.css          design tokens, light + dark
      lib.js              pure logic — hours, freshness, trust, clustering, search
      app.js              map, list, detail, reviews, corrections, listings, profile
      moderation.js       the photo pipeline
      rentals.js          booking lifecycle + payment client
      sw.js               service worker — offline shell, tiles, updates
      manifest.webmanifest, icon-*.png
      tests.html          in-browser test suite
      sync.js             client for the shared backend, with an offline outbox
      check.html          phone readiness diagnostics
      moderate.html       moderator console — the photo queue
    server/api.js         the shared backend (SQLite via node:sqlite)
    serve.js              http + https server, API mount, /ca.crt
    tests/run.js          logic test suite
    tests/api.test.js     backend test suite
    tools/release.js      pre-flight + version bump
    tools/make-icons.js   generates the PWA icons
    certs/                local CA + server cert (dev only, not for production)
    LAUNCH.md             what is left before real users can test
    IPHONE.md             getting it running on an iPhone
    prototype/            the original design mock
    qr.js                 dependency-free, self-verifying QR encoder

## The shared backend

`server/api.js` — SQLite through Node 24`s built-in driver, no dependencies. One
person writes a review, everyone sees it. Identity is an anonymous device token: no
email, no password, no personal data. Photos always arrive `pending` and a client
claiming otherwise cannot publish anything; a human decides at `/moderate.html`.
Writes made offline queue in the browser and upload when the connection returns.

## Photo moderation

Nothing is visible to anyone else until it passes: re-encode (strips EXIF and GPS) →
quality gates → nudity classifier (nsfwjs) → people detection (blazeface) → verdict.

**It fails closed** — if a model won't load, the photo is held, never published. Two
thresholds were tuned against real behaviour: face detection needs 0.92 confidence
(mirrors score ~0.85, and holding every ordinary photo makes the queue unreadable),
and a weak explicit score only counts when the benign signal is also weak (tiled rooms
carry a 2–5% explicit noise floor). Anyone can report a published photo, which pulls it
down instantly. Queue: Profile → Photo review.

## Renting a bathroom

    requested → accepted (hold placed, address + code released) → arrived → completed
    (captured); declined or cancelled voids the hold

Money logic is server-side. **Payments are simulated** and no field in this app accepts
a card number. Real Stripe test mode:

    STRIPE_SECRET_KEY=sk_test_... node serve.js

That branch is written but unrun — it needs an account only you can create.

## What is still missing

1. **A public URL.** The app runs on this machine over your wifi, so only people on
   your network can test. This is now the one hard blocker — see LAUNCH.md.
2. **Trust & safety for hosting** — identity checks, insurance, background checks,
   two-way blocking, a real route to report someone. None of it exists.
3. **Human moderation capacity** — the queue is built, the staff are not.
4. **Native app store builds** — this is an installable web app; the stores need a
   wrapper (Capacitor) or a rewrite.
5. **Real identity.** Users are anonymous device tokens — fine for a friendly test,
   not for a public launch, since sock puppets are possible.

## Attribution

Place data © OpenStreetMap contributors, [ODbL](https://www.openstreetmap.org/copyright).
Tiles by CARTO. Geocoding by Nominatim. Moderation models: nsfwjs and TensorFlow.js
blazeface, both MIT. Leaflet, BSD-2.
