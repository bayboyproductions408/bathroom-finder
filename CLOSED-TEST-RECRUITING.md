# Getting 12 closed testers

Google will not let a personal developer account publish to production until
a closed test has run **with at least 12 testers opted in, for 14 consecutive
days**. The dashboard states it directly:

> Have at least 12 testers opted-in to your closed test — *0 testers currently opted-in*
> Run your closed test with at least 12 testers, for at least 14 days

## The one thing worth knowing first

**Flappy Birdies Deluxe is stuck on exactly the same requirement — it has
1 tester opted in.** It has been sitting there since it was published.

So this is not a Bathroom Finder problem, it is an account problem, and the
same twelve people clear it for **every** app on the account. Recruit once,
add the same email list to Bathroom Finder, Flappy Birdies and NutriScan.
That is three launches unblocked by one afternoon of asking.

## What a tester actually has to do

This is where it usually goes wrong. Being *invited* is not being *opted in*.
Each person must:

1. Have a **Google account** (the address you add must be the one they use on
   their phone or in Play on the web).
2. Open the **opt-in link** you send them and press **Become a tester**.
3. **Install the app from Google Play** using that same account.
4. **Stay opted in for the whole 14 days.** If someone opts out or is removed,
   the count drops and the clock does not simply continue — do not prune the
   list halfway through.

An Android phone is the normal case. Someone with only an iPhone can still
opt in through the web, but they cannot install, so they are not much use.

Aim for **14–15 people, not exactly 12.** Some will never press the button,
and finding that out on day 13 is painful.

## Message to send them

> I've built a free app called Bathroom Finder — it maps public bathrooms and
> tells you whether you can actually get into them: unlocked or not, free or
> not, and how clean the last person found it.
>
> Google won't let me publish it until 12 people have tested it for two weeks.
> Would you be one of them? It's genuinely two taps and then you can ignore it.
>
> 1. Send me the Gmail address you use on your Android phone
> 2. I'll send you a link — open it and press "Become a tester"
> 3. Install the app from the Play Store link on that page
>
> That's it. Leave it installed for two weeks and you've done the whole job.
> If you find a bathroom the map is missing, adding it takes about a minute.

## Where to find twelve people

In rough order of how well it tends to work:

- **People you actually know.** Family, friends, colleagues, group chats. This
  is the fastest and the only source where the 14 days are reliable, because
  you can nudge someone who forgot to press the button.
- **Any group you are already part of** — a Discord, a gym, a club, a work
  Slack. Asking somewhere you are already a member converts far better than
  asking strangers.
- **Communities that exist for this**, e.g. r/androidapps, r/AndroidAppTesting,
  r/alphaandbetausers. Read each one's rules first; several require a specific
  post format.

### On "tester exchange" groups

There are groups where developers test each other's apps to clear this
requirement. They work, and they are not against the rules in themselves.
Be aware of the trade: those testers install, never open the app again, and
give you no signal about whether the thing actually works. The 14 days exist
to catch broken apps, and using a group that way means you learn nothing
before launch. If you use one, get a few real users as well.

**Do not** create extra Google accounts to pad the number. That is exactly
what this rule was written to catch, and the penalty lands on the developer
account — which now has three apps on it.

## Once you have the addresses

Send them over and the rest is quick:

1. Create a reusable **email list** in Play Console so the same twelve attach
   to every app rather than being typed in three times.
2. Attach it to the Bathroom Finder closed testing track, and to Flappy
   Birdies at the same time.
3. Send everyone the opt-in link.
4. Watch the "testers currently opted-in" counter until it reads 12, and
   **note that date** — the 14 days count from when the twelfth person opts
   in, not from when you sent the invitations.
