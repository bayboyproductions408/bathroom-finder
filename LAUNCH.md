# Getting Bathroom Finder in front of testers

The honest state of things, what is blocking, and what only you can do.

---

## The blocker that just cleared

Until now every review lived on the device that wrote it. Ten testers would have
produced ten private apps and no shared map — nothing worth testing.

There is now a real backend (`server/api.js`, SQLite via Node's built-in driver, no
dependencies). One tester writes a review, every other tester sees it. Verified end to
end: a review posted from a curl "device" appeared in the app, and a review posted in
the app appeared on the server with the rating averaged across both.

That leaves **one** hard blocker before strangers can test: the app runs on your
computer, on your wifi. It needs a public address.

---

## Step 1 — Put it somewhere public  ← you have to do this part

I cannot create accounts, so pick a host and I will do the rest of the work.

| Option | Cost | Effort | Notes |
|---|---|---|---|
| **Render / Railway / Fly.io** | free tier | low | Runs Node *and* keeps SQLite on a disk. Best fit — the app works as-is. |
| **A small VPS** (Hetzner, DigitalOcean) | ~$5/mo | medium | Full control, you manage updates and TLS. |
| **Cloudflare Tunnel from this machine** | free | lowest | Your computer stays the server. Fine for a first handful of testers, useless if the machine sleeps. |
| Vercel / Netlify | free | — | **Not suitable as-is**: no persistent disk, so SQLite cannot live there. Would need Postgres and a rewrite of the storage layer. |

**My recommendation: Render.** Free, runs Node directly, gives you a persistent disk
and https and a URL like `bathroomfinder.onrender.com` — which also fixes geolocation,
because real https is what phones require.

What I need from you: an account on one of those, and a go-ahead. Then I write the
deploy config, set `ADMIN_TOKEN`, and hand you the URL and a QR.

## Step 2 — Before anyone outside your household uses it

- [ ] **Change `ADMIN_TOKEN`.** It defaults to `dev-moderator-token`. Anyone who
      guesses it can approve photos. Set a real one as an environment variable.
- [ ] **Publish the privacy policy and terms.** Drafts are in `PRIVACY.md` and
      `TERMS.md`. They are drafts written by me, not legal advice — have someone
      qualified look before you rely on them.
- [ ] **Decide who moderates and how fast.** Photos sit invisible until a human
      approves them at `/moderate.html`. If nobody watches that queue, testers upload
      photos and nothing ever appears. **Commit to a response time or turn photos off.**
- [ ] **Back up the database.** It is one file: `data/bathroomfinder.db`.
- [ ] **Turn off the sample host listings** if testers might mistake them for real
      bathrooms they can rent.

## Step 3 — Run the test

**Aim for 5–10 people in one city.** A worldwide map with three scattered testers shows
nobody anything; ten people in one town produces a map that actually looks alive, which
is the only way to learn whether the idea works.

Ask each tester to do these, in this order:

1. Open the link, add it to their home screen.
2. Find a bathroom near them — did the map show anything useful?
3. Rate one they have actually used, with a photo.
4. Add one that is missing.
5. Report something wrong — a bad pin, wrong hours.
6. **Then look again the next day** and see whether other people's contributions showed
   up. That is the whole product.

The four questions worth answering:

- Did they find a bathroom they could actually use?
- Did they contribute without being asked twice?
- Did anything they saw turn out to be wrong?
- Would they open it again next week?

Feedback comes back through **Profile → Send feedback**, and lands in the moderator
console under "Tester feedback" with the screen they were on.

## Step 4 — Watch these numbers

`/moderate.html` shows testers, reviews, photos, awaiting-review, confirmations, open
reports, places added, feedback. The two that matter early:

- **Contributions per tester.** Under ~1, the community model does not work yet.
- **Awaiting review.** If it grows, moderation is the bottleneck, not the app.

## Step 5 — App stores, later

This is an installable web app, which is enough for testing and probably enough for a
first public launch. The stores need a wrapper (Capacitor) plus a developer account
each ($99/yr Apple, $25 once Google), review, store listings and screenshots. Do not
start this until people have used the web version and told you it is worth it.

Apple in particular rejects apps that are "just a website" — you would need to justify
the native build with location, camera and offline behaviour, all of which this has.

---

## Known gaps, stated plainly

- **Anyone can write anything.** Identity is an anonymous device token — no email, no
  verification. Fine for a friendly test, not for a public launch. Sock puppets are
  possible; the two-different-people rule on retiring a place is the only real defence.
- **Moderation is one person with a web page.** No queue SLA, no appeals, no repeat
  offender tracking.
- **Renting bathrooms is a mock.** Payments are simulated. Do not let real strangers
  into a real home on the strength of it — there is still no identity check, insurance
  or way to report a person.
- **No email**, so there is no way to reach a tester back, no password reset, and
  nothing to recover if they clear their browser data.
- **Data loss is possible.** Clearing browser data on a device loses that device's
  token and its identity, though its contributions stay on the server.
