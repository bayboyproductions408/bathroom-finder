# Reply to App Review — Guideline 2.1, Information Needed

Apple did not find a defect. This is the standard information request for a
first submission. Paste items 2–7 below into **Reply to App Review**, and
attach the screen recording for item 1.

Also paste the same text into **App Review Information → Notes** so future
submissions do not get asked again.

---

## 1. Screen recording — Dom has to film this

Apple's requirements, exactly:

- On a **physical device**, running the **latest iOS**
- Starts with **launching the app**
- Shows the **typical user flow through the core features**
- Must include, because this app has them:
  - the **location permission prompt** (appears on launch)
  - the **App Tracking Transparency prompt** (appears before any ad)
  - **user-generated content** — writing a review, adding a photo
  - **content reporting and blocking** — the Report control on a listing,
    review or photo

Build **1.6.3 (26)** is already in TestFlight. Install from there and film.

Suggested two-minute run:
1. Launch. Allow location. The map fills with places around you.
2. Let the ATT prompt appear; answer it either way.
3. Pull the list sheet up, scroll it, drag it back down.
4. Tap a place → its page: rating, reviews, "how to find it inside".
5. Write a review. Add a photo. Show the photo goes to review, not live.
6. Open **Report a problem** on that listing — this is the 1.2 requirement.
7. Search "Starbucks", then search "pizza", to show business search.

No account, no login, no paid content — so nothing to demonstrate there.

---

## 2. Devices and operating systems tested

> Bathroom Finder 1.6.3 (build 26) was tested on iPhone via TestFlight on the
> current release of iOS, and in the iOS Simulator on the latest iPhone
> runtime available on macOS 15 with Xcode 26. Every build additionally runs
> an automated launch check that installs the app on a simulator, grants
> location, launches it, verifies the process survives, and verifies the app
> renders a non-blank screen before the build is accepted.

*(Fill in the exact iPhone model and iOS version you film on — Apple asks for
specifics and it should match the recording.)*

---

## 3. What the app does, and for whom

> Bathroom Finder is a map of public bathrooms and of the bathrooms inside
> ordinary businesses — cafés, shops, hotels, stations, libraries.
>
> The problem it solves: a map can tell you a bathroom exists, but not
> whether you can actually get into it. This app records what the last
> person found — is it unlocked, is there a fee, is there a keypad code, is
> it customers-only, how clean was it, and where in the building it actually
> is ("past the fish counter, unmarked green door on the left").
>
> Target audience: general audience, adults and families. It is particularly
> useful to people who need to plan around bathroom access — parents with
> young children, older people, people with IBD, Crohn's or a colostomy, and
> anyone in an unfamiliar city.
>
> There is no account and no sign-in. The app is fully usable the moment it
> opens.

---

## 4. Setting up and reaching the main features

> No setup, no credentials, no sample files are required. There is no login
> of any kind.
>
> - **On launch** the app asks for location and centres the map on you. If
>   location is declined it still works — search any city by name.
> - **The list** of places is the sheet at the bottom. Drag it up by its
>   header for the full list, drag it down for the map.
> - **A place page** opens by tapping any row in the list or any map pin.
>   Ratings, reviews, photos, opening hours and directions are all there.
> - **Contributing** — "Write a review" and "Add photo" are on that page.
>   "Add a bathroom here" is the + button on the map.
> - **Reporting** — every listing, review and photo has a Report control on
>   the place page. Reported photos are hidden immediately, before any
>   moderator sees them.
> - **Moderation** — photos pass an on-device content check and are then held
>   in a human review queue. Nothing a user uploads is visible to anyone else
>   until a moderator approves it. Moderators can block a contributor, which
>   withdraws their content and prevents further posts.

---

## 5. External services used

> - **OpenStreetMap / Overpass API** (overpass-api.de) — the source of the
>   places and bathrooms shown on the map. Data © OpenStreetMap contributors,
>   licensed ODbL, attributed in the app.
> - **Nominatim** (nominatim.openstreetmap.org) — search, for turning a typed
>   place or business name into a location.
> - **CARTO basemaps** (basemaps.cartocdn.com) — the map tiles, attributed in
>   the app.
> - **Our own backend** (bathroom-finder.onrender.com) — stores reviews,
>   photos, moderation state and sponsored listings. Hosted on Render, with
>   the database on Turso.
> - **Google AdMob** — serves the banner ad. On iOS the App Tracking
>   Transparency prompt is shown first; declining gives non-personalised ads.
> - **Leaflet** (unpkg.com) and **Google Fonts** — map rendering library and
>   typefaces.
>
> No authentication service, no payment processor, and no AI service is used.
> There are no in-app purchases and no subscriptions.

---

## 6. Regional differences

> The app functions identically in every region. There is no
> region-restricted content, no regional pricing, and no feature that is
> enabled or disabled by territory. The only difference a user sees is the
> map data itself, which comes from OpenStreetMap and is denser in some
> places than others.

---

## 7. Regulated industry / third-party material

> The app does not operate in a regulated industry.
>
> Map data is OpenStreetMap, used under the Open Database Licence and
> attributed in the app and on the listing. Map tiles are CARTO's free
> basemap service, attributed as their terms require. No other third-party
> protected material is included.

---

## One decision for Dom before replying

`app/app.js` lists a second Overpass mirror as a fallback:

    https://maps.mail.ru/osm/tools/overpass/api/interpreter

It is a legitimate public OpenStreetMap mirror, and it is only used when the
main Overpass instance is rate-limiting. But it is Russian-hosted, and item 5
requires disclosing every external service. Two options:

1. **Disclose it** — add it to the list above. Honest, and it is only a map
   data mirror.
2. **Remove it** — the backend cache now serves most requests, so the
   fallback matters far less than it did. One line, one rebuild.

Removing it is the simpler story to tell App Review. Say which and it is done.
