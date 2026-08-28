# Getting Bathroom Finder through App Review

Apple did not find a defect. Their reply was **Guideline 2.1 — Information
Needed**, the standard request on a first submission. Everything they asked for
is now in place except one thing that has to happen on a phone.

Version **1.6.7**, build **29**, is attached and ready. Everything else on the
submission has been read back off the App Store Connect API and passes.

---

## The one step that needs you

**A screen recording, on a physical device, running current iOS.**

Apple's requirements, as they stated them:

- on a **real device**, not the simulator
- starts with **launching the app**
- shows the **typical user flow through the core features**

Apple listed four categories to include *if the app has them*. Two apply here
and two do not:

| Their category | This app |
|---|---|
| Account registration, login, deletion | **None.** No account, no sign-in — say so in the reply rather than leaving them to wonder why it is missing |
| Paid content, purchases, subscriptions | **None.** No in-app purchases; the subscription and rental features are flagged off and unreachable |
| User-generated content, **including reporting and blocking** | **Yes** — writing a review, adding a photo, and the Report control |
| Prompts for sensitive data or capabilities | **Yes** — location, camera or photo library, and App Tracking Transparency. All three must appear |

The camera or photo-library prompt is easy to forget because it only fires when
you actually add a photo. Apple lists it explicitly, so do not skip step 6.

### Film build 29

Its TestFlight note says *FILM THIS ONE*. Builds 27 and 28 are still installed
and look identical, so check the number before you record — their notes now say
not to film them.

They are not interchangeable. Build 27 sent a metre-accurate position to the
server when an advertising enquiry was submitted, which our own privacy label
says never happens. Build 28 fixed that but still carried a privacy page
claiming we cannot contact you, which stopped being true the moment that form
existed. Build 29 is the first one where the binary, the privacy page and the
App Store privacy label all say the same thing. Filming an older build and
submitting 29 would also mean the video does not match the binary, which is its
own reason for another round.

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
6. **Add a photo.** Show that it says it is going for review rather than
   appearing instantly — that is the 1.2 filtering requirement, visible.
7. **Open "Report a problem"** on that place and show the reasons. You do not
   have to submit it.
8. **Search "Starbucks"**, then **"pizza"** — this shows business search, not
   just cities.

Stop the recording. Two minutes is plenty; shorter is fine if all eight appear.

### Then send it to me

Save the file anywhere and tell me the path:

```bash
node tools/attach-review-video.js "path/to/your-recording.mp4"
```

That attaches it to **App Review Information** on version 1.6.7, so it is in
front of the reviewer when they open the submission rather than sitting in a
message thread. I will confirm it reads back as delivered.

### The Resolution Center reply, ready to send

Paste this into the App Review message thread once the video is attached:

> Thank you for the detailed request.
>
> **1. Screen recording.** Attached to App Review Information on version 1.6.7
> (build 29), captured on a physical iPhone running the current iOS. It begins
> with launching the app and shows the typical flow: the location permission
> prompt, the App Tracking Transparency prompt, the map and the list of places,
> opening a place, writing a review, adding a photo (including the photo
> permission prompt and the notice that the photo is held for review before
> anyone else can see it), the "Report a problem" control and its reasons, and
> searching for a business by name.
>
> On the categories you listed: the app has **no account registration, login or
> deletion** — there is no sign-in of any kind and it is fully usable the moment
> it opens — and **no paid content, purchases or subscriptions**, so neither
> flow appears in the recording. User-generated content and the sensitive-data
> prompts are both shown.
>
> On blocking: reviews and photos are one-way contributions to a place, so there
> is no user-to-user surface. Objectionable contributors are blocked by a
> moderator, which withdraws their content and prevents further posts; every
> photo is also held in a human review queue before it is visible to anyone.
> Reporting is available in-app on any listing, review or photo.
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
(3,521 characters), which is where their message asked for them. Read back off
the API to confirm the write landed, not assumed.

They cover: devices and OS tested; what the app does and for whom; how to reach
every feature with no account or demo credentials; the external services used;
regional differences (none); and regulated-industry / third-party material
(OpenStreetMap and CARTO, both attributed).

## What the audit found and fixed

Reading the submission back rather than trusting memory turned up five things.
Three were metadata, two were the app telling Apple something untrue.

- **The version record said 1.6.4 and had no subtitle.** It is 1.6.7 now, so
  the corrected build can attach, and the subtitle reads *Find a bathroom,
  fast*. Thirty characters under the app name is the only other place the
  listing gets to say what it is.
- **Only 6.5-inch screenshots were on file**, so Apple was upscaling them for
  every modern iPhone. The 6.7-inch set (1290×2796) is uploaded alongside.
- **The privacy label declared Contact Info: Name only.** The advertising
  enquiry form collects an email address or phone number. Apple's own optional
  disclosure rule excludes anything used for the developer's advertising or
  marketing, which this is, so it had to be declared. Email Address and Phone
  Number are now published, linked to identity, not used for tracking.
- **The app sent a precise position with that enquiry** — the map centre
  unrounded, next to the sender's email — while the label said precise location
  is never collected. Rounded to the same ~1 km the sponsor lookup uses.
- **The privacy page said "Contact details. We could not email you if we
  tried."** Flatly false once that form existed. Rewritten to say what actually
  happens, in the one place it happens.

Also checked, and passing, against the deployed app:

- the report control opens and offers reasons; review and photo contributions
  are reachable (`node tools/ugc-controls-check.js`, 9 checks)
- no subscription or rental surface a reviewer could see but not buy, which
  would be a 3.1.1 rejection on its own
- the place page opens without throwing (`node tools/ui-smoke.js`, 10 checks)
- 62 logic, 45 backend and 5 durability checks green

## What happens after the video

1. I attach the recording and confirm it reads back as delivered.
2. In App Store Connect → **Distribution → App Review**, open the submission
   marked *Unresolved Issues* and paste the reply above into **Reply to App
   Review**.
3. On the same page, click **Resubmit to App Review**. The rejected item there
   already reads *iOS App 1.6.7 — 1.6.7 (29)*, so it will carry build 29; a
   reply on its own does not restart the review.

Review is usually 24–48 hours from that point.

## The one residual risk, stated plainly

Apple's list says "user-generated content, including content reporting **and
blocking** mechanisms". This app has reporting in-app; blocking is done by a
moderator rather than by users, because reviews are one-way contributions to a
place and there is no user-to-user surface to block from. That is a normal
shape for a review app and it is what the submission notes already describe,
and Apple did not raise 1.2 in this rejection — but it is the part of the reply
most open to a follow-up question, which is why the draft above addresses it
head-on instead of waiting to be asked.
