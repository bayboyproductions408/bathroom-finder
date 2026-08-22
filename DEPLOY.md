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

### One thing about Render's free tier

**It sleeps after 15 minutes idle.** The next request takes ~30–60s to wake it.
Fine for testing; warn your testers so they don't think it's broken.

Its disk is also wiped on every restart — which is why the data lives somewhere
else now. That is the next section, and it is the one step you have to do
yourself.

---

## Making the data survive — Turso (free, no card)

Without this, every deploy and every sleep-wake deletes all reviews. The code is
already written and tested; it switches on when these two variables exist.

**1. Create the database** — at [turso.tech](https://turso.tech), sign up (GitHub
sign-in works) and create a database. The free tier is 5 GB, 500 M row reads and
10 M writes a month; no card is asked for. Any name is fine.

**2. Copy the two values** Turso shows you:

- the **database URL**, which looks like `libsql://something.turso.io`
- an **auth token**, a long string

**3. Put them into Render** — Dashboard → your service → **Environment** → *Add
environment variable*, twice:

| Key | Value |
|---|---|
| `TURSO_DATABASE_URL` | the `libsql://…` URL |
| `TURSO_AUTH_TOKEN` | the token |

Save. Render redeploys on its own.

**4. Confirm it took.** The deploy log's first line says which storage it picked:

```
storage: turso (durable)
```

If it instead says `local file (WIPED ON RESTART …)`, the variables did not
arrive — check the spelling of the key names.

The token is a credential: paste it straight into Render and nowhere else. It
does not belong in the repository, and I have not asked you to show it to me.

**What the server does if the URL is set but the connection fails:** it stops,
loudly, saying whether the client is missing or the credentials are wrong. It
deliberately does **not** fall back to the local disk — that would look like a
successful deploy and quietly throw away everything written before the next
restart.

### Verifying durability yourself

```bash
npm test
```

The `durability` suite writes a review, closes the database, reopens it and
checks the review, the rating, the device's identity token and the duplicate
guard all survived. It runs against the same libSQL driver production uses.

### If you would rather not use Turso

**Render disk** — $7/month, a toggle in the dashboard, no code change. Or
**Fly.io** volumes (free allowance, but a card on file).

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
