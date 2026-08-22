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

1. ~~**Durable storage**~~ — done, verified in production against a real restart.
2. **Screenshots** — 6.7" (1290×2796) and 6.5" (1242×2688), 3–10 each. Take them on
   the installed app on your iPhone; the phone's own screenshot is exactly right.
   Lead with the map, then a detail page, then the review screen.
3. **Rename** if you want — the store record is "Bathroom Finder Nearby" because the
   plain name was taken. Changeable until first submission.
4. **Data safety + age rating** — answers written out in `STORE.md`; they need typing
   into App Store Connect.
5. **TestFlight** — add the three secrets and run the workflow. See `IOS-TESTFLIGHT.md`.
6. **Guideline 4.2** — the build must use native location/camera, which Capacitor does.
   Review notes are drafted in `STORE.md`.

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
