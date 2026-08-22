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

## Durable storage: code done, one step is yours

Render's free tier wipes the database on every restart — verified, not assumed:
reviews went from 2 to 0 after one restart.

**The fix is written and tested.** Storage now sits behind `server/db.js` with two
interchangeable backings: a local file for development, and **Turso** — hosted
SQLite, free tier, no card — in production. Every query in the backend was
converted to async so the two cannot drift apart.

Verified before shipping:

- All 45 backend tests pass against the local driver **and** against the real
  libSQL driver — same tests, both backings, including photo blobs and the
  duplicate-review guard.
- A new durability suite writes a review, closes the database, reopens it, and
  confirms the review, its rating, the device's identity token and the duplicate
  guard all survived a restart.
- Migration works on a database created before this change: a real one on disk
  here, missing the newer `local_id` column, was upgraded on boot without loss.

**Your one step:** create a free Turso account and paste two values into Render's
Environment tab — `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`. Step by step in
`DEPLOY.md`. The token is a credential; it goes into Render and nowhere else.

Until those exist the server still runs, still on the wipe-on-restart file, and
says so on its first line of log output. If the variables are set but wrong it
refuses to start rather than silently falling back — a quiet fallback would look
like a clean deploy and lose everything at the next restart.

The per-device re-upload safety net stays in place underneath, so a contribution
survives even a total server loss, as long as the device that wrote it comes back.

Do this **before** inviting testers. Losing the first fifty reviews is the kind of
thing people do not come back from.

---

## Remaining before App Store submission

1. **Turso variables** — above; a few minutes in two browser tabs.
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
