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

## The one decision that is yours

**Data does not survive a restart.** Render's free tier has no persistent disk,
so every deploy or sleep-wake wipes the SQLite file. That is fine for trying the
app; it is not fine the moment a real tester writes a review they expect to last.

Three ways out:

| Option | Cost | Work |
|---|---|---|
| **Turso** — SQLite as a service, free tier, no card | $0 | ~2 hours; the backend is isolated in `server/api.js` |
| **Render disk** | $7/mo | 5 minutes, a toggle |
| **Fly.io volume** | free allowance, card on file | ~1 hour |

**Recommendation: Turso.** It keeps the whole thing free and the storage layer is
already behind one file. Say the word and I will write the adapter; you would only
need to create the account and paste a connection URL.

Do this **before** inviting testers. Losing the first fifty reviews is the kind of
thing people do not come back from.

---

## Remaining before App Store submission

1. **Durable storage** — above.
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
