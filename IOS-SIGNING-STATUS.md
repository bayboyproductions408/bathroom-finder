# iOS TestFlight — where the build actually stands

Nine runs. The app now **compiles and archives successfully**; the only failing
step is the final export, and the reason is understood.

## What each run taught

| Run | Failed at | Real cause |
|---|---|---|
| 1 | 37s, `invalidPEMDocument` | the key secret had no `BEGIN`/`END` lines — only the base64 body was pasted |
| 2–3 | key check | diagnostic added; secret measured at 203 bytes / 4 lines vs the file's 257 / 6 |
| 4 | "requires a development team" | no `DEVELOPMENT_TEAM` anywhere in the repo |
| 5 | "no devices to generate a profile" | automatic signing was asking for a **development** profile, which needs registered devices |
| 6 | Pods "conflicting provisioning settings" | a command-line `CODE_SIGN_IDENTITY` applies to *every* target, and the CocoaPods targets sign for development |
| 7 | `UMPConsentStatus has been renamed` | `@capacitor-community/admob` 6.2 vs User Messaging Platform 3.x |
| 8 | **archive OK (31s)**, export failed | cloud signing refused |
| 9 | same | same — not fixed by swapping to the App Manager key |

Everything above run 8 is fixed and committed. The archive genuinely builds.

## The remaining blocker, precisely

```
error: exportArchive: Cloud signing permission error
error: exportArchive: No signing certificate "iOS Distribution" found
error: exportArchive: No profiles for 'com.bathroomfinder.app' were found
```

Queried against the App Store Connect API, the account actually holds:

- **Certificates** — `DISTRIBUTION` (Apple Distribution: Dominic Hecht) and
  `IOS_DISTRIBUTION`, both valid into 2027. A distribution certificate exists.
- **Profiles** — `IOS_APP_STORE` profiles for Flappy Birdies, Holdback and
  NutriScan. **None for `com.bathroomfinder.app`.**

So the certificate is fine. What is missing is a provisioning profile for this
bundle id, and the runner has no signing identity in its keychain. Xcode's
cloud signing would create both, and is being refused permission — swapping
from the Developer-role key to the App Manager key did not change that.

## The fix: copy what already works

`FlappyBirdies/.github/workflows/ios-release.yml` ships to TestFlight from
GitHub Actions on this same Apple team, and it does **not** use cloud signing.
It signs manually:

```bash
echo -n "$IOS_P12_BASE64" | base64 --decode -o cert.p12
security create-keychain … && security import cert.p12 -P "$IOS_P12_PASSWORD" …
cp profile.mobileprovision ~/Library/MobileDevice/Provisioning\ Profiles/
```

That is the proven path. To use it here, three things are needed:

**1. A provisioning profile for `com.bathroomfinder.app`.** Creatable through
the API against the existing distribution certificate — a script is written and
ready (`scratchpad/mkprofile.js`) but running it needs permission, because it
reads the `.p8` and creates a resource in the Apple account. It can equally be
made in two clicks at
[developer.apple.com → Profiles](https://developer.apple.com/account/resources/profiles/list):
*App Store Connect* distribution profile, bundle id `com.bathroomfinder.app`,
the *Apple Distribution* certificate, name it `Bathroom Finder App Store`.

**2. The distribution certificate as a secret.** It is already on disk at
`dev-tools/ios-signing/flappy-birdies/ios_distribution.p12`, and already lives
in the Flappy Birdies repo as `IOS_P12_BASE64` / `IOS_P12_PASSWORD`. GitHub
never reveals a secret's value, so it has to be added to this repo separately.
A `.p12` contains a private key, so that paste is yours.

**3. The workflow rewritten** to import the keychain and sign manually instead
of relying on cloud signing — a direct port of the Flappy Birdies step.

## Already fixed and committed

- PEM armour rebuilt if a paste drops the header/footer
- `TEAM_ID: 87836YN962`, read from the API rather than transcribed
- archive runs unsigned so the Pods targets stop conflicting
- native AdMob plugin dropped (broken upstream against UMP 3; shows no ads in
  TestFlight regardless, and the sponsored-listing slot is untouched)
- credentials verified independently by signing a JWT and calling the API —
  both keys return HTTP 200, so authentication was never the problem

---

## Where the signing material lives (2026-08-24)

Both keys are on this machine only. Neither is in the repository, and neither
should ever be.

| What | Where |
|---|---|
| iOS distribution certificate | `dev-tools/ios-signing/flappy-birdies/ios_distribution.p12` |
| …its password | `p12_password.txt` beside it |
| App Store Connect API keys | `AuthKey_399645T965.p8` (Developer) and `~/Downloads/AuthKey_AGJ7NZ5M93.p8` (App Manager) |
| **Android upload keystore** | **`dev-tools/android-signing/bathroom-finder/upload-keystore.jks`** |
| …its passwords and alias | `keystore.properties` beside it — alias `bathroomfinder-upload` |

The Android keystore was previously only inside `android/`, which is generated
and wiped by `npx cap add android`. It survived that once because it had been
copied to a temp folder first, which is not a plan. It now lives in dev-tools
next to the iOS material, and `android/` holds a working copy.

**Losing the upload keystore means losing the ability to update the app on Play
once it is published.** Back up `dev-tools/android-signing/` somewhere off this
machine before the first Play release, not after.
