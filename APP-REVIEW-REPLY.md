# Getting Bathroom Finder through App Review

Apple did not find a defect. Their reply was **Guideline 2.1 — Information
Needed**, which is the standard request on a first submission. Everything they
asked for is now in place except one thing that has to happen on a phone.

---

## The one step that needs you

**A screen recording, on a physical device, running current iOS.**

Apple's requirements, exactly as they stated them:

- on a **real device**, not the simulator
- starts with **launching the app**
- shows the **typical user flow through the core features**

Because this app has them, it also has to show:

| Must appear | Why Apple cares |
|---|---|
| The **location permission** prompt | They check the prompt is shown and the purpose string matches what the app does |
| The **App Tracking Transparency** prompt | Required before any tracking; a missing prompt is a rejection on its own |
| **Writing a review and adding a photo** | This is the user-generated content their 1.2 review is about |
| The **Report control** on a place | 1.2 requires a way to report content, and they look for it |

### Film build 28, not 27

Build **28 (v1.6.6)** is the one to record. Its TestFlight note says so.

Build 27 is still installable and looks identical, but it has a privacy bug
that would make our own submission notes untrue — see *What changed and why*
below. Filming 27 and submitting 28 would also mean the video does not match
the binary, which is exactly the kind of mismatch that starts another round.

### A two-minute run that covers everything

Record with iOS Screen Recording (Control Centre). No narration needed.

1. **Launch from the home screen.** Let the location prompt appear — tap Allow.
   The map fills with the places around you.
2. **Let the tracking prompt appear.** Answer it either way; both are valid.
   Just don't skip past it before it shows.
3. **Drag the list sheet up**, scroll it, drag it back down. This shows the
   list and the map are one screen, which is the core interaction.
4. **Tap a place.** Its page opens: rating, reviews, access, and "how to find
   it inside".
5. **Write a review.** Give it stars and a line of text. Submit it.
6. **Add a photo.** Take or choose one. Show that it says it is going for
   review rather than appearing instantly — that is the 1.2 filtering
   requirement being visible.
7. **Open "Report a problem"** on that same place and show the reasons list.
   You do not have to submit it.
8. **Search "Starbucks"**, then **"pizza"** — this shows business search, not
   just cities.

Stop the recording. Two minutes is plenty; shorter is fine if all eight appear.

### Then send it to me

Save the file anywhere and tell me the path. I will attach it to **App Review
Information** on version 1.6.6 with:

```bash
node tools/attach-review-video.js "path/to/your-recording.mp4"
```

That puts the recording on the submission itself, so it is in front of the
reviewer when they open it rather than sitting in a message thread. I will also
draft the Resolution Center reply to go with it.

---

## Already done — you do not need to write any of this

Items 2 to 7 of Apple's request are in **App Review Information → Notes**
(3,521 characters), which is where their message asked for them. Verified by
reading them back off the API, not by assuming the write landed.

They cover: devices and OS tested; what the app does and for whom; how to reach
every feature with no account or demo credentials; the external services used;
regional differences (none); and regulated-industry / third-party material
(OpenStreetMap and CARTO, both attributed).

## What the audit found and fixed

Reading the submission back rather than trusting memory turned up three things:

- **The version record said 1.6.4 and had no subtitle.** Renamed to 1.6.6 so
  the corrected build can attach, and the subtitle now reads *Find a bathroom,
  fast*. Thirty characters under the app name is the only other place the
  listing gets to say what it is.
- **Only 6.5-inch screenshots were on file.** Apple was upscaling those for
  every modern iPhone. The 6.7-inch set (1290×2796) is now uploaded too.
- **Build 27 contradicted our own privacy declaration.** The advertising
  enquiry form posted the map centre at full precision — a metre-accurate
  position — next to the sender's email address. Our privacy labels say precise
  location is never collected and the review notes say the precise position is
  never sent. Both were false for build 27. Fixed, and build 28 is the honest
  one.

Also checked, and passing, against the live app:

- the report control opens and offers reasons; review and photo contributions
  are reachable (`node tools/ugc-controls-check.js`)
- no subscription or rental surface a reviewer could see but not buy, which
  would be a 3.1.1 rejection by itself
- the place page opens without throwing (`node tools/ui-smoke.js`)
- 62 logic, 45 backend and 5 durability checks green

## What happens after the video

1. I attach the recording and confirm it reads back as delivered.
2. I draft the Resolution Center reply for you to send.
3. Submit for review — the version is in *Prepare for Submission*, so a reply
   alone will not restart it; it has to be submitted again.

Review is usually 24–48 hours from that point.
