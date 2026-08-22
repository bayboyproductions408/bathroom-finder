# Making money from this

You asked for massive ad revenue. I've built the ad system, and I'm going to show
you the arithmetic on it, because the number is going to disappoint you and it is
better to know now than after you've designed the whole product around it.

Then I'll show you the line that actually pays, which is already built too.

---

## Why banner ads will not make you rich here

Ad revenue = impressions × eCPM ÷ 1000. For a small, non-gaming app, eCPM runs
roughly **$1–5** — call it $3 with mostly US traffic.

Now the impressions. This is not a game people scroll for an hour. Someone opens
it, finds a bathroom, and leaves. Realistically **2–4 sessions per user per month**,
and one ad slot per session.

| Monthly active users | Impressions/month | Ad revenue at $3 eCPM |
|---|---|---|
| 100 | 300 | **$0.90** |
| 1,000 | 3,000 | **$9** |
| 10,000 | 30,000 | **$90** |
| 100,000 | 300,000 | **$900** |

To clear **$1,000 a month from ads alone you need roughly 110,000 monthly actives.**
That is a genuinely large consumer app. Every bathroom-finder app in the stores
combined probably doesn't have that.

And ads cost you things:
- **iOS App Tracking Transparency.** Only ~20–30% of people allow tracking, and
  non-personalised ads earn far less. Halve the numbers above for iPhone.
- **Privacy labels change.** Adding an ad network means disclosing data collection
  and sharing on both stores — the clean "collects almost nothing" position I wrote
  into STORE.md is itself an asset, and ad networks spend it.
- **Consent screens** in the EU and UK, which is friction on first launch.

Ads are worth having as filler. They are not a business.

---

## What actually pays: sponsored listings

A café near a station does not care about your impressions. It cares that someone
standing 200 metres away, who needs a bathroom **right now**, walks through its door —
because most of them buy a coffee while they're there.

That is worth real money to them, and it is priced per business, not per thousand
views:

| Sponsors in one city | At $30/month each | Monthly |
|---|---|---|
| 10 | $300 | **$300** |
| 50 | $1,500 | **$1,500** |
| 200 | $6,000 | **$6,000** |

**Fifty small businesses in one city beats a hundred thousand users of banner ads.**
And you can sign the first ten with a few hundred users, because you're selling
footfall, not reach. For comparison, a Yelp ad package runs businesses $300+/month;
$30 is an easy yes.

This is built. Campaigns are geofenced (a London café cannot advertise in New York —
there's a test for it), billed per impression and per click, and stop dead when the
budget is spent.

### How to sign the first ten

1. Pick **one** dense area — a transit hub, a high street, a park with bad facilities.
2. Open the app there and look at which venues already show up as "bathroom unknown".
   Those businesses already get people wandering in to ask.
3. Walk in and say: *"People are already coming in here asking to use your bathroom.
   I run the app they're using. For $30 a month I'll list you as the recommended stop
   nearby, and they'll buy a coffee on the way through."*
4. Give the first five a free month. You need the case study more than the $150.
5. Track it — the moderator console shows their impressions, clicks and CTR. That
   report is what renews them.

The pitch form is in the app under **Profile → Advertise your business**, and
enquiries land in the moderator console.

---

## The other lines, ranked

**2. Plus subscription — $1.99/month or $5.99/year.** Utility apps convert at 1–3%.
At 1,000 actives that's about $120/year — small now, compounding later, and it costs
nothing to run. Apple and Google take 15–30%. Built, minus billing.

**3. Bathroom rentals — 15% of each booking.** The most novel line and the hardest:
it needs hosts, guests, trust and safety, and insurance before a single dollar is
real. Built as a prototype. Don't count on it this year.

**4. Data licensing.** Aggregated accessibility data — which facilities are step-free,
which have changing tables — is genuinely valuable to councils, transit authorities and
disability organisations. Slow, B2B, but high margin and it doesn't touch personal data.
Worth remembering once the map is dense.

---

## What you actually need to break even

| Cost | Amount |
|---|---|
| Apple Developer | $99/year |
| Google Play | $25 once |
| Hosting | $0 free tier, ~$60/year for something that doesn't sleep |
| **Total year one** | **~$185** |

**Six sponsored listings at $30/month covers your entire year in the first month.**
That's the whole target. Not a hundred thousand users — six shopkeepers.

---

## The rule I built the ad system around

There is no interstitial, nothing over the map, and the first thing in the list is
always a real bathroom. The sponsored slot sits at position six.

That is not squeamishness, it's arithmetic. Someone who opens this app in genuine
urgency and gets a full-screen ad uninstalls it, and one uninstall costs more than
the thousand impressions you'd have shown them. The audience is the asset; the ads
are rent collected on it. Wreck the first and there's nothing to collect.

Every paid placement is labelled "Sponsored". Undisclosed advertising breaks FTC
rules and both stores' policies — and here it would also break the one thing that
makes the app worth using, which is that the recommendation is honest.

---

## In order, what I'd do next

1. **Deploy** (DEPLOY.md) — nothing earns anything on your laptop.
2. **Get 100 real users in one city.** Sponsors need an audience to be worth anything.
3. **Sign five free sponsors** and produce a report showing their clicks.
4. **Convert them to $30/month**, and use that report to sign the next twenty.
5. **Turn on a real ad network** once you're past ~10,000 actives, when the filler
   revenue finally exceeds the compliance cost of having it.
6. **Plus subscription** at the same time, so the people who hate ads can pay to
   remove them — that revenue is usually similar to what the ads earned from them.
