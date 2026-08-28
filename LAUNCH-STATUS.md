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

**Privacy labels as published** (10 data types). *Data Used to Track You:*
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

Version **1.6.7**, build **29**, is attached, and every field App Store Connect
gates on has been read back off the API and passes: build VALID and not expired,
export compliance answered, review contact and notes present, no demo account
needed, description, keywords, support and marketing URLs, and screenshots at
both 6.5 and 6.7 inches.

Apple's reply was **Guideline 2.1, Information Needed** — not a defect. Six of
the seven things they asked for are in *App Review Information → Notes*.

The seventh cannot be done from here:

> **A screen recording, on a physical device, running current iOS.** It has to
> start with the app launching and walk the core features, and because this app
> has them it must also show the location prompt, the App Tracking Transparency
> prompt, writing a review, adding a photo, and the Report control.

Install build 29 from TestFlight and film about two minutes. Then
`node tools/attach-review-video.js <file>` puts it on the submission itself,
where the reviewer sees it rather than in a message thread. The shot list and a
ready-to-send Resolution Center reply are both in APP-REVIEW-REPLY.md.

**What the audit caught.** Reading the submission back rather than trusting
memory turned up five problems. The version record still said 1.6.4 and had no
subtitle. Only 6.5-inch screenshots existed, so Apple was upscaling them for
every modern iPhone. And the app was telling Apple two untrue things: the
advertising enquiry posted a metre-accurate position while the privacy label
said precise location is never collected, and the privacy page claimed we could
not contact you when that same form collects an email address. The label now
declares Contact Info: Email Address and Phone Number — Apple's optional
disclosure rule excludes anything used for the developer's own marketing, which
this is — and build 29 is the first binary where the code, the privacy page and
the App Store label all say the same thing.

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
