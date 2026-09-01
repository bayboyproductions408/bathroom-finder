# Launch status

Live now, free, no card anywhere:

| | |
|---|---|
| **App** | https://bayboyproductions408.github.io/bathroom-finder/ |
| **Backend** | https://bathroom-finder.onrender.com |
| **Moderator** | /moderate.html (token in Render → Environment) |
| **Privacy / Terms / Support** | /privacy.html · /terms.html · /support.html |
| **Repo** | github.com/bayboyproductions408/bathroom-finder |
| **App Store record** | "Bathroom Finder Nearby" · `com.bathroomfinder.app` |

---

## Done and verified in production

- Shared database — a review written on one device appears on another
- On-device photo moderation, human review queue, user blocking
- Offline support, install to home screen, live update prompt
- Sponsored listings with geofencing, impression/click billing, budget cutoff
- Privacy, terms and support pages published and linked from Profile

## Durable storage: DONE, live in production

Render's free tier wipes its disk on every restart — verified, not assumed:
reviews went from 2 to 0 after one restart. That is fixed.

Storage sits behind `server/db.js` with two interchangeable backings: a local
file for development, and **Turso** — hosted SQLite, free tier, no card — in
production. Every query in the backend was converted to async so the two cannot
drift apart.

**Live configuration**

| | |
|---|---|
| Database | `bathroom-finder` on Turso, org `domhecht` |
| Region | AWS US West (Oregon) — deliberately the same region as the Render service, so a query is a few ms instead of a cross-country round trip |
| Engine | classic libSQL, *not* the TursoDB Rust rewrite — the tests were run against libSQL, and launch day is the wrong time to change engines |
| Switch | `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN` in Render → Environment |

**Verified, in this order:**

1. All 45 backend tests pass against the local driver **and** against the real
   libSQL driver — same tests, both backings, including photo blobs and the
   duplicate-review guard.
2. A durability suite writes a review, closes the database, reopens it, and
   confirms the review, its rating, the device's identity token and the
   duplicate guard all survived.
3. Migration works on a database predating this change — a real one on disk
   here, missing the `local_id` column, was upgraded on boot without loss.
4. **In production:** wrote a review, then hit *Restart service* in Render — the
   precise event that used to destroy data — and read it back intact
   afterwards. Rating and count survived with it.

`/api/v1/health` now reports it, so this never has to be taken on trust:

```json
{"ok":true,"storage":"turso","durable":true,"tursoReady":true}
```

If the URL is ever set but wrong, the server refuses to start rather than
falling back to disk. A silent fallback looks like a clean deploy and then
throws away everything at the next restart.

The per-device re-upload safety net stays in place underneath, so a contribution
survives even a total server loss, as long as the device that wrote it comes back.

**Housekeeping:** verification left one review by user *Durability Probe* on a
fake place at 0°, −160° (open Pacific). No real user can reach it — places load
by map bounds — but it does count in the moderator dashboard totals. Remove it
whenever you like by blocking that user in `/moderate.html`.

---

## App Store submission checklist

App Store Connect record: **Bathroom Finder Nearby**, Apple ID `6804091512`.

### Done

| | |
|---|---|
| Durable storage | Turso, verified against a real service restart |
| Screenshots | 9 generated at exact store sizes by `node tools/make-screenshots.js`; the 6.5" and 6.7" sets (3 each) are uploaded and COMPLETE |
| Age rating | Completed. Apple calculates **4+** — 172 countries, A12 Brazil, ALL Korea, 00+ Vietnam |
| Privacy policy URL | Set to the published page; all three legal pages return 200 |
| App Privacy labels | Completed and **published** to the product page |
| Content Rights | Declared — the app uses OpenStreetMap and CARTO, both attributed |
| `APPSTORE_KEY_ID` | In the repo's Actions secrets |
| `APPSTORE_ISSUER_ID` | In the repo's Actions secrets, with the correct `92a3` |

**Privacy labels as published** (10 data types, updated 2026-08-27). *Data Used to Track You:*
Identifiers (Device ID) and Usage Data (Advertising Data) — both because of
AdMob. *Data Linked to You:* Contact Info — Email Address and Phone Number, from
the advertising enquiry form, for App Functionality and the developer's own
advertising or marketing, not for tracking. *Data Not Linked to You:* Name,
Coarse Location, Photos or Videos, Customer Support, Other User Content, User
ID. Purposes are App Functionality throughout, except Coarse Location, Device ID
and Advertising Data, which are Third-Party Advertising.

Email and phone were added on 2026-08-27. They had been missing, and Apple's
optional-disclosure exemption does not cover them: it excludes any data used for
the developer's own advertising or marketing, and the whole point of that form
is that we contact the business about a paid listing.

### Three things that turned out not to be blockers

- **EU trader status** is already **Active** for 27 countries. The Digital
  Services Act banner on the Apps list is boilerplate Apple shows every
  developer, not an outstanding action on this account.
- **AdMob verification** is not pending. It reads: *"You may need to verify some
  personal information once your earnings reach the verification threshold."*
  There is nothing to verify until money is actually owed. The payments account
  (AdSense, United States) exists and shows no warnings.
- **Agreements, bank account and W-9** are all active already.

### What iOS is waiting on

Version **1.6.8**, build **30**, is attached, and every field App Store Connect
gates on reads back green off the API: build VALID and not expired, export
compliance answered, review contact and 3,773 characters of notes, no demo
account needed, description, keywords, support and marketing URLs, and
screenshots at both 6.5 and 6.7 inches.

Apple's reply was **Guideline 2.1, Information Needed** — not a defect. Six of
the seven things they asked for are in *App Review Information → Notes*.

The seventh cannot be done from here:

> **A screen recording, on a physical device, running current iOS.** It has to
> start with the app launching and walk the core features, and because this app
> has them it must also show the location, photo and App Tracking Transparency
> prompts, writing a review, adding a photo, and **reporting and blocking**.

Install build 30 from TestFlight and film about two minutes, then attach it
under **App Review Information → Attachment** so it travels with the submission
rather than sitting in a message thread. (There is a tool for this, but it
needs a write-capable API key and there is not one right now — see the section
on the revoked keys below.) The nine-shot list and a ready-to-send Resolution
Center reply are both in APP-REVIEW-REPLY.md.

**What the audit caught.** Reading the submission back, and then reading what
the app actually renders, turned up seven problems. The version record still
said 1.6.4 with no subtitle, and only 6.5-inch screenshots existed. The privacy
label declared Contact Info: Name only, while the advertising enquiry form
collects an email or phone — Apple's optional-disclosure exemption does not
cover it, because it excludes anything used for the developer's own marketing.
That same form posted a metre-accurate position while the label said precise
location is never collected, and privacy.html claimed we could not contact you.
There was **no way to block anyone**, which Apple's letter explicitly asks the
video to show. And the app told people their reviews were "stored on this
device only — there is no server yet" and that "Nothing is uploaded", both of
which stopped being true when the Turso backend went live; somebody could have
written something personal believing it was private.

Build 30 is the first binary where the code, the in-app privacy page and the
App Store privacy label all say the same thing, and the first with a blocking
mechanism to film.

---

## Google Play submission

Play record: **Bathroom Finder Nearby**, `com.bathroomfinder.app`, developer
account 6952509614571178776.

### Done

| | |
|---|---|
| Content rating | IARC questionnaire completed. Comes out **ESRB Teen**, Brazil 12+, descriptor *Users Interact* — the honest consequence of declaring user-generated content as primary and publicly shared |
| Target audience | 18 and over. The "restrict minors" option was deliberately left off: blocking teens from downloading a bathroom map costs reach for no policy benefit |
| Advertising ID | Declared **yes**, purposes Advertising and Fraud prevention — true only because the Android build now actually ships the ad SDK, see below |
| Government apps | No |
| Financial features | None |
| Health apps | None |
| Data safety | Completed against the code rather than from memory, see the table below |
| App category | Maps & Navigation |
| Contact details | The same support address the app itself publishes, plus the site |
| Store listing | Name, short and full description, 512px icon, 1024×500 feature graphic, three 1080×1920 phone screenshots. AI asset declaration: not labelled — the artwork is drawn by `tools/make-store-assets.js`, a hand-written PNG encoder, and the screenshots are real captures |

**Data safety, as declared.** Approximate location, collected *and* shared, for
app functionality and advertising. Precise location: **not collected** — the GPS
fix sorts results on-device and never leaves the phone. Name, email address,
phone number and user IDs: collected, not shared, optional. Photos and
user-generated content: collected, not shared, optional. App interactions:
collected, required. Device or other IDs: collected and shared with Google,
required. Everything is encrypted in transit; there is no account; the deletion
route is the privacy page.

Filling that form is what surfaced two real bugs, both now fixed and pushed —
see the commits. The Android build had been shipping with the ad SDK stripped
out by the workflow and with fine location undeclared, and the advertising
enquiry was posting a metre-accurate position next to the sender's email.

### What Play is waiting on

The setup checklist is complete and the console no longer lists an outstanding
declaration. *Send app for review* is still locked, because there is no release
yet, and that needs two things only you can do:

1. **Four repository secrets**, so the Android workflow can sign the bundle:
   `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`,
   `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`. Without them the build still
   runs, but produces an unsigned bundle that Play will not accept.
   `node tools/make-keystore.js` creates the key if it does not exist yet.

2. **Twelve closed testers, opted in for fourteen consecutive days.** This is a
   personal-account rule and it gates production for every app on the account —
   Flappy Birdies is stuck on the same requirement with one tester. Recruit
   twelve people once and they clear all three apps. The details, including the
   difference between *invited* and *opted in*, are in CLOSED-TEST-RECRUITING.md.


## Two App Store Connect keys were revoked (found 1 September)

Checked because five days had passed, not because anything complained.

| Key | Status on 1 Sept |
|---|---|
| `399645T965` — recorded as the CI key | **401, revoked** |
| `AGJ7NZ5M93` — App Manager, used for metadata writes | **401, revoked** |
| `QFU8S63X4U` | authenticates, but **read-only** (403 on any write) |

Signing material is untouched and was checked separately: the iOS Distribution
and Apple Distribution certificates are valid to August 2027, and the
*Bathroom Finder App Store* provisioning profile is ACTIVE to 2027-08-21. Only
the API keys went.

**What this does not break.** Build 30 is already uploaded, attached and valid,
so the current submission needs no key at all. The recording is attached
through the App Store Connect UI, and the reply and resubmission happen there
too.

**What it does break.** The next iOS build cannot upload, because the workflow
authenticates with the revoked key. That would previously have shown up as an
authentication failure from `xcodebuild` at the end of a full macOS build —
billed at ten times a Linux minute, and worded like a signing problem, which is
a much longer hunt. `tools/check-asc-key.js` now runs as the first step of the
iOS workflow and fails in about five seconds with the actual reason. Verified
against all three keys: the revoked ones produce the error, the live one passes.

**To fix it** — yours, because it is a credential: create a key with the **App
Manager** role at App Store Connect → Users and Access → Integrations, then set
`APPSTORE_KEY_ID` and `APPSTORE_PRIVATE_KEY` in the repository secrets. Keep the
`.p8` beside the others in `dev-tools/ios-signing/` so local tooling works too.
That also restores `tools/attach-review-video.js`, which currently detects the
403 and points at the UI instead.

## One thing worth deciding before launch: the cold start

Measured against production, not guessed:

| | |
|---|---|
| Backend already awake | **0.27s** |
| Backend asleep (first request of the day) | **12.4s** |
| Backend unreachable entirely | ~24s, recovering via OpenStreetMap |

Render's free tier spins a service down after fifteen minutes idle. A returning
user never notices, because up to 1,500 places are cached on the device for
fourteen days and drawn before any network call. The person who notices is the
one opening the app for the first time — and an App Store reviewer is, by
definition, exactly that person. Twelve seconds of empty map is not broken, but
it can read as broken.

Three options, and this one is yours because two of them touch your money or
your quota:

1. **Accept it.** The app works, the status line says "Loading bathrooms
   nearby…", and every subsequent open is instant. Costs nothing.
2. **Keep the service awake** with a scheduled ping. Free in GitHub Actions on
   a public repo, but Render's free plan allows **750 instance-hours a month**
   and staying awake all month uses about **744**. That is 99% of the
   allowance, and any other free service on the account would push it over —
   at which point things get suspended, which is far worse than a slow first
   load. A narrower window (say 14 hours a day, ~434 hours) is the safer shape
   if you want this.
3. **Pay Render \$7/month** for an instance that never sleeps. This is the
   real fix. I have not enabled it — nothing gets billed to you without you
   saying so.

What I did **not** do: I wrote a change to race our backend against
OpenStreetMap after a short grace period, then measured Overpass at seven to
ten seconds — against a twelve second cold start. The race would have gained
almost nothing while sending a second request to a volunteer service that
already returns 429 under load. Reverted. `node tools/verify-map-fallback.js`
drives both paths if you want to re-measure.

## Revenue, honestly

The arithmetic is in `MONETIZATION.md` and has not changed: banner ads on an app this
size earn single-digit dollars a month. **Sponsored listings are the line that pays** —
six local businesses at $30/month covers your entire year one cost of ~$185.

The ad system is built with deliberate restraint: no interstitials, nothing over the
map, the first result is always a real bathroom, and every paid placement is labelled.
That is not squeamishness. One uninstall costs more than the thousand impressions you
would have shown, and sponsors are only worth anything if people still use the app.

Sell the first five sponsors for free in exchange for a case study, then price at $30.
The walk-in script is in `MONETIZATION.md`.
