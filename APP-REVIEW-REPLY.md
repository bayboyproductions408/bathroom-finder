# Getting Bathroom Finder through App Review

Apple did not find a defect. Their reply was **Guideline 2.1 — Information
Needed**, the standard request on a first submission. Everything they asked for
is now in place except one thing that has to happen on a phone.

Version **1.6.8**, build **30**, is attached and ready. Every field App Store
Connect gates on has been read back off the API and passes.

---

## The one step that needs you

**A screen recording, on a physical device, running current iOS.**

Apple's requirements, as they stated them:

- on a **real device**, not the simulator
- starts with **launching the app**
- shows the **typical user flow through the core features**

They listed four categories to include *if the app has them*. Two apply and two
do not:

| Their category | This app |
|---|---|
| Account registration, login, deletion | **None.** No account, no sign-in — worth saying in the reply so its absence does not look like an omission |
| Paid content, purchases, subscriptions | **None.** No in-app purchases; the subscription and rental features are flagged off and unreachable |
| User-generated content, **including reporting and blocking** | **Yes** — writing a review, adding a photo, reporting, and blocking |
| Prompts for sensitive data or capabilities | **Yes** — location, camera or photo library, and App Tracking Transparency. All three must appear |

The camera prompt is easy to miss because it only fires when you actually add a
photo, and blocking did not exist until today. Both are on the list below.

### Film build 30

Its TestFlight note says *FILM THIS ONE*. Older builds are still installed and
look almost identical, so check the number — their notes now say not to film
them. Build 30 is the only one with the block control, and the only one where
the code, the in-app privacy page and the App Store privacy label all agree.

### A two-minute run that covers everything

Record with iOS Screen Recording from Control Centre. No narration needed.

1. **Launch from the home screen.** Let the location prompt appear — tap Allow.
   The map fills with the places around you.
2. **Let the tracking prompt appear.** Answer either way; both are valid. Just
   don't tap past it before it shows.
3. **Drag the list sheet up**, scroll it, drag it back down. This is the core
   interaction — list and map are one screen.
4. **Tap a place.** Its page opens: rating, reviews, access, and how to find it
   inside.
5. **Write a review.** Stars and a line of text. Submit it.
6. **Add a photo.** This is where the photo permission prompt appears — let it.
   Show that it says the photo is held for review rather than appearing
   instantly; that is the 1.2 filtering requirement, visible.
7. **Open "Report a problem"** on that place and show the reasons. You do not
   have to submit it.
8. **Tap the ⋮ beside a reviewer's name** and show both options — *Report this
   review* and *Block*. Tap **Block**: the review disappears. Then go to
   **Profile → Blocked people** and tap **Unblock** to show it is reversible.
   This is the reporting-and-blocking pair Apple asked to see.
9. **Search "Starbucks"**, then **"pizza"** — this shows business search, not
   just cities.

Step 8 needs a review to exist. If the place you are on has none, write one
yourself in step 5 and block your own account — it demonstrates the mechanism
just as well.

Stop the recording. Two minutes is plenty.

### Then attach it

Attach it yourself, in App Store Connect:

> **Distribution → App Review Information → Attachment**, and upload the file.

That is the slot that travels with the submission, so the recording is in front
of the reviewer when they open it rather than sitting in a message thread.

There is a tool that does the same thing over the API,
`node tools/attach-review-video.js <file>`, but as of 1 September it cannot:
**two of the three App Store Connect API keys on this account were revoked**,
and the one still alive is read-only. The tool now detects that and tells you
to use the screen above. If you make a new App Manager key it will work again;
either route puts the file in the same place.

### The Resolution Center reply, ready to send

Paste this into the App Review message thread once the video is attached:

> Thank you for the detailed request.
>
> **1. Screen recording.** Attached to App Review Information on version 1.6.8
> (build 30), captured on a physical iPhone running the current iOS. It begins
> with launching the app and shows the typical flow: the location permission
> prompt, the App Tracking Transparency prompt, the map and the list of places,
> opening a place, writing a review, adding a photo (including the photo
> permission prompt and the notice that the photo is held for review before
> anyone else can see it), reporting a review, blocking its author and
> unblocking them again, and searching for a business by name.
>
> On the categories you listed: the app has **no account registration, login or
> deletion** — there is no sign-in of any kind and it is fully usable the moment
> it opens — and **no paid content, purchases or subscriptions**, so neither
> flow appears in the recording. User-generated content and the sensitive-data
> prompts are both shown.
>
> On reporting and blocking specifically: every review carries a control beside
> the reviewer's name offering *Report this review*, which goes to a moderator,
> and *Block*, which immediately hides everything that person has written or
> photographed and is reversible under Profile → Blocked people. Photos are
> additionally held in a human review queue and are not visible to anyone else
> until approved.
>
> **2 to 7.** These are in the Notes field of App Review Information: the
> devices and operating systems tested, what the app does and for whom, how to
> reach every feature (no credentials or sample files are needed), the external
> services it uses, regional differences (there are none — it behaves
> identically everywhere, only the OpenStreetMap coverage varies), and the
> third-party material it relies on (OpenStreetMap under ODbL and CARTO
> basemaps, both attributed in the app and on the listing).
>
> Please let me know if anything else would help.

---

## Already done — you do not need to write any of this

Items 2 to 7 of Apple's request are in **App Review Information → Notes**
(3,773 characters), read back off the API to confirm the write landed.

## What the audit found and fixed

Reading the submission back, and then reading what the app actually renders,
turned up seven things. Three were metadata. Four were the app saying something
untrue or missing something Apple asks for.

- **The version record said 1.6.4 and had no subtitle.** It is 1.6.8 now, and
  the subtitle reads *Find a bathroom, fast*.
- **Only 6.5-inch screenshots were on file**, so Apple was upscaling them for
  every modern iPhone. The 6.7-inch set (1290×2796) is uploaded alongside.
- **The privacy label declared Contact Info: Name only.** The advertising
  enquiry form collects an email address or phone number, and Apple's optional
  disclosure rule excludes anything used for the developer's own advertising or
  marketing — which this is. Both are now published, linked to identity, not
  used for tracking.
- **The app sent a precise position with that enquiry** while the label said
  precise location is never collected. Rounded to the same ~1 km the sponsor
  lookup uses.
- **The privacy page said "Contact details. We could not email you if we
  tried."** False once that form existed.
- **There was no way to block anybody.** Apple's letter names "content
  reporting and blocking mechanisms" among what the video must show, and the
  app had only reporting — of the listing, not of a person. Every review now
  offers Report and Block, and blocking hides that person everywhere,
  reversibly.
- **The app told people nothing was uploaded.** The review list said reviews
  were "stored on this device only — there is no server yet", and Profile said
  "Nothing is uploaded". Both were true before the Turso backend went live.
  Someone could have written something personal believing it was private.

Also checked, and passing:

- report and block are reachable, block hides the person, unblock restores them
  (`node tools/verify-blocking.js` against a seeded local server, 6 checks)
- the 1.2 controls are reachable and nothing dead is on sale
  (`node tools/ugc-controls-check.js`, 9 checks)
- the place page opens without throwing (`node tools/ui-smoke.js`, 10 checks)
- 62 logic, 48 backend and 5 durability checks green

## What happens after the video

1. Attach the recording under **App Review Information → Attachment**.
2. In App Store Connect → **Distribution → App Review**, open the submission
   marked *Unresolved Issues* and paste the reply above into **Reply to App
   Review**.
3. On the same page, click **Resubmit to App Review**. The rejected item there
   tracks the current version, so it will carry build 30; a reply on its own
   does not restart the review.

Review is usually 24–48 hours from that point.
