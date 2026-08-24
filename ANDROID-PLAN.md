# Android: the TWA path is a dead end here

Checked before building anything, because the failure would only have shown up
after a Play upload.

## What is wrong

`android/` is a Trusted Web Activity. A TWA only becomes a real app — no browser
URL bar, no "this is a website" look — if Android can verify Digital Asset
Links. Android reads that file from **the domain root and nowhere else**:

| URL | Result |
|---|---|
| `bayboyproductions408.github.io/.well-known/assetlinks.json` | **404** — the only path Android checks |
| `bayboyproductions408.github.io/bathroom-finder/.well-known/assetlinks.json` | 200 — served, and ignored |
| `bayboyproductions408.github.io/` | 404 — no root Pages site exists |

The app is a GitHub Pages *project* site, so it lives under `/bathroom-finder/`.
The domain root belongs to a repo named `bayboyproductions408.github.io`, which
does not exist. So the asset links cannot be served where Android will look.

Also still unset: `twaHost` in `android/gradle.properties` is
`bathroomfinder.example.com`, a placeholder domain.

An unverified TWA shows a browser address bar and is, functionally, a website in
a wrapper — the exact thing Play and Apple both reject.

## Two ways out

**A. Build Android with Capacitor, like iOS.** `@capacitor/android` is already a
dependency. This produces a genuine native app: no asset links, no domain
requirement, native geolocation and camera, and the same "not a wrapped website"
argument that the iOS build already makes. It also means one pipeline shape for
both stores instead of two unrelated ones.

**B. Keep the TWA and serve the asset links properly.** Needs either a custom
domain, or a new repo literally named `bayboyproductions408.github.io` whose
only job is to serve `/.well-known/assetlinks.json`. Then set `twaHost` to the
real host and run `tools/make-assetlinks.js`.

**Recommendation: A.** B works, but it spends a repo and a domain decision to
end up with a weaker app than Capacitor gives for free, and it leaves the
wrapped-website rejection risk in place.

## What Android still needs either way

1. The keystore as four secrets — `ANDROID_KEYSTORE_BASE`,
   `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`.
   The keystore already exists locally at `android/upload-keystore.jks` with its
   passwords in `android/keystore.properties`; both are git-ignored, so they
   have to be added to the repo secrets by hand.
2. A Play Console app record. The account exists (**Bay Boy Productions**,
   personal) and holds one other app. Nothing has been created for this one yet —
   deliberately, since creating it before the build path works would only be
   tidy-looking.
3. Play's Data Safety form and IARC content rating. Answers are drafted in
   `STORE.md`, and the location answers there were corrected on 2026-08-22 to
   match what the app actually transmits.
4. **Check the testing requirement.** Personal Play accounts created after
   November 2023 must run a closed test with 12 testers for 14 days before a
   production release. Whether it applies here depends on when this account was
   created; Play states it on the app dashboard once an app exists. If it does
   apply, Android production is at least two weeks out no matter what the build
   does, and that should shape the launch plan rather than surprise it.

## Meanwhile

The PWA is installable today at
https://bayboyproductions408.github.io/bathroom-finder/ and behaves like an app
on Android as well as iOS — home screen icon, offline, full screen. It is not a
Play listing, but it is a real way to put the app in someone's hands now.
