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

## Remaining before App Store submission

App Store Connect record: **Bathroom Finder Nearby**, Apple ID `6804091512`.

### Done

1. ~~**Durable storage**~~ — Turso live, verified against a real restart.
2. ~~**Screenshots**~~ — 9 captured from the real running app at exact store
   sizes, in `store/screenshots`. Regenerate any time with
   `node tools/make-screenshots.js`.
3. ~~**Age rating**~~ — questionnaire completed, saved. Apple calculated **4+**
   (172 countries; A12 Brazil, ALL Korea, 00+ Vietnam). Declared: user-generated
   content **yes**, advertising **yes**, everything else none/no. Worth a second
   look at one judgement call — *Social Media* was answered **no**, on the basis
   that reviews attached to places are not a feed that amplifies content to many
   users. If Apple disagrees the fix is an edit, not a resubmission.
4. ~~**Privacy policy URL**~~ — set to the published page and saved. All three
   legal pages return 200.
5. ~~`APPSTORE_KEY_ID`~~ — added to the repo's Actions secrets.

### Yours — none of these can be done for you

6. **Two GitHub secrets.** Settings → Secrets and variables → Actions →
   *New repository secret*:

   | Name | Value |
   |---|---|
   | `APPSTORE_ISSUER_ID` | `3312781e-d649-4d7f-92a3-d19bb9151ec0` |
   | `APPSTORE_PRIVATE_KEY` | whole contents of `AuthKey_399645T965.p8`, BEGIN/END lines included |

   **Note the issuer ID carefully: `92a3`.** The value carried in the project
   notes had `92e3`, the identical one-character error that cost ten debug
   rounds on Flappy Birdies. This one is read straight off App Store Connect.
   The `.p8` is a private key, so it is yours to paste and no one else's.

7. **App Privacy nutrition labels.** App Privacy → *Get Started*. Answers are
   written out in `STORE.md` under "Apple — Privacy Nutrition Labels" — the
   short version is User Content, Identifiers and Name, all *Not Linked to You*,
   and **Identifiers used for tracking = yes** because of AdMob. That dialog
   would not open under automation; it takes about five minutes by hand.

8. **EU trader status.** App Store Connect is showing a Digital Services Act
   banner: trader status must be provided or apps are removed from the EU store.
   It wants your name, address and phone, so it has to be you.

9. **Content Rights** — App Information → Content Rights is still unset. It asks
   whether the app contains third-party content. It does: OpenStreetMap and
   CARTO, both attributed in-app and both appropriately licensed.

10. **AdMob payment details.** Still the gate on any ad revenue actually paying
    out. Payment and tax details are not something I will ever enter for you.

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
