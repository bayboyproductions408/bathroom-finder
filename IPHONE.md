# Testing on an iPhone

## Start here

Scan **iphone-start-qr.png**, or type this into Safari on the phone:

    192.168.1.152/check.html

That page tells you what actually works on that phone — connection, location,
offline mode, photos, storage, and whether it reached the shared database. Use it
whenever something misbehaves instead of guessing.

The phone must be on the same wifi as this computer, and `node serve.js` must be
running.

## If the page does not load at all

The phone cannot reach this computer. In order of likelihood:

1. Phone is on **cellular**, not wifi. Turn wifi on.
2. Phone is on a **different network** — a guest SSID, or a separate 2.4/5GHz name.
3. The router has **client isolation** on, which stops wifi devices reaching wired
   ones. Spectrum routers often ship with this enabled. Either turn it off in the
   router settings, or host the app publicly (see LAUNCH.md).

## Getting location and offline mode working

Both need https, and iOS is strict: it will not register a service worker over a
certificate it does not trust. So install this machine's certificate on the phone.

1. In Safari on the phone, open `192.168.1.152/ca.crt`
2. iOS says a profile was downloaded → **Settings → Profile Downloaded → Install**
3. **Settings → General → About → Certificate Trust Settings** → switch on
   "Bathroom Finder Dev CA"
4. Now open **https://192.168.1.152** — no warning, and location, offline mode and
   Add to Home Screen all work

**What this means:** you are telling that iPhone to trust certificates issued by this
computer. Only do it on your own test devices, and remove it when you are done —
same Settings screen, or delete the profile under Settings → General → VPN & Device
Management. The private key never leaves this machine, but treat it seriously.

You can skip all of this. Over plain http everything works except location, offline
mode and installing to the home screen.

## Install it properly

In **Safari** (not Chrome — iOS only allows this from Safari): **Share → Add to Home
Screen**. It then runs full screen with its own icon, and works with no signal.

## iPhone-specific things already handled

- Inputs are 16px, so Safari does not zoom in every time you tap a field
- Pinch zoom is allowed again (it was disabled, which is an accessibility problem)
- No grey flash on tap, no double-tap zoom on buttons
- Safe areas respected around the notch and home indicator
- HEIC photos: decoded via `createImageBitmap`, which keeps a 12-megapixel photo from
  spiking memory. If a phone still cannot read one, the message says how to switch the
  camera to "Most Compatible"
- The keyboard no longer covers the field you are typing in

## Known iOS limits

- **Chrome and Firefox on iPhone are Safari underneath.** Add to Home Screen only
  works from Safari.
- **Private Browsing blocks local storage**, so saved bathrooms and drafts will not
  persist. Use a normal tab.
- iOS may evict the offline cache if the phone is short on space and the app has not
  been opened for a while.
