# Getting a free public URL

You need one to test on a phone properly, and you need one before either app
store will take the app. All of this is free and none of it asks for a card.

The code is already committed locally and ready to push.

---

## Why not just use your wifi

The LAN address works only when your phone is on the same network, and it cannot
get a certificate any phone trusts without you installing one. A real URL removes
your computer, your router and your certificate from the problem entirely —
and it is the same URL the stores need. Do this once and everything downstream
gets easier.

I also tried a free SSH tunnel (localhost.run) so you could skip hosting. Something
on this machine's network blocks `*.lhr.life` — curl, Node and the browser all
failed TLS to it while the rest of the internet was fine. Rather than hand you
another URL that might not load, host it properly.

---

## Render — free, no card, runs this code unchanged

**1. Put the code on GitHub**

Create an empty repo at github.com/new (private is fine), then:

    git remote add origin https://github.com/<you>/bathroom-finder.git
    git branch -M main
    git push -u origin main

**2. Deploy**

- render.com → sign up (free, GitHub login, no card)
- **New → Blueprint** → pick the repo → it reads `render.yaml` and fills everything in
- Create. First deploy takes a couple of minutes.

You get `https://bathroom-finder-xxxx.onrender.com` with a real certificate.

**3. Get your moderator token**

`render.yaml` tells Render to generate a strong one. Dashboard → your service →
**Environment** → copy `ADMIN_TOKEN`. That is what logs you into `/moderate.html`.

**4. Test it**

Open `https://<your-url>/check.html` on the iPhone. Everything should be green:
https, location, offline mode, photos, storage, shared database. Then **Share →
Add to Home Screen** in Safari.

### Two things about Render's free tier

- **It sleeps after 15 minutes idle.** The next request takes ~30–60s to wake it.
  Fine for testing; warn your testers so they don't think it's broken.
- **The disk is not persistent.** SQLite lives in `data/`, which is wiped on every
  restart and deploy — so reviews will vanish when it sleeps. Fine for a first
  hands-on test, not fine for collecting real data from real testers.

### Making the data survive, still free

When you want durability, the cheapest real option is **Turso** — SQLite as a
service, free tier, no card. The backend is deliberately isolated in
`server/api.js`, so this is a contained change: swap the `node:sqlite` calls for
Turso's client and keep every route identical. Say the word and I'll do it.

Alternatives if you'd rather not: **Fly.io** (small persistent volume, needs a card
on file even on free allowances) or a **$4–5/month VPS** (full control, keeps
working, no sleeping).

---

## Other free hosts that work with this code

| Host | Free? | Persistent data | Notes |
|---|---|---|---|
| **Render** | yes, no card | no (paid disk) | Recommended start. Sleeps when idle. |
| **Koyeb** | yes | no | Similar, does not sleep as aggressively |
| **Railway** | trial credit | yes | Runs out, then paid |
| **Fly.io** | allowance | yes, volumes | Wants a card on file |
| Vercel / Netlify / Pages | yes | **no server** | Will not run this — no long-lived Node process |

---

## After it is live

1. Point the Android build at it — `twaHost` in `android/gradle.properties` and
   `asset_statements` in `android/app/src/main/res/values/strings.xml`
2. `node tools/make-assetlinks.js`, commit, redeploy so
   `https://<host>/.well-known/assetlinks.json` is live
3. `cd android && gradlew bundleRelease` and upload the `.aab` to Play
4. Add the URL as the privacy policy and support link in both store listings

Full store details are in STORE.md.
