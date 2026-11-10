# Isla — mobile app (Android + iPhone)

**Isla** is the Pahuway Cafe app on Google Play and the App Store. It is a native shell (Capacitor 8) around the live site `https://pahuway-cafe.vercel.app`, with native push notifications, a native icon/splash and an offline screen.

| | |
|---|---|
| App name (under the icon) | **Isla** |
| App ID / bundle ID | `cafe.pahuway.isla` (permanent — cannot change after the first upload) |
| Who it's for | Customers order; staff and riders sign in to the same app |
| Min. versions | Android 7.0 (API 24) · iOS per Capacitor 8 / current Xcode |

## How updates work
- **Menu, prices, hours, zones, most fixes and new screens** → deploy the website as usual; every app user gets it on next open. **No store review.**
- **Native changes** (app icon/name, new native plugins, push setup, Capacitor upgrades) → build a new version with the workflows below and submit to the stores.

---

## Status

| Item | Status |
|---|---|
| Native Android + iOS projects, icon, splash, offline screen | ✅ Done (Android builds verified here; iOS compiles in CI) |
| Push notifications — new orders → staff, assignment → rider, status → customer | ✅ Built & tested (needs your Firebase + Apple keys to switch on) |
| In-app account deletion + privacy policy page (`/privacy`) — required by both stores | ✅ Done |
| Cloud builds: Android (debug APK / signed AAB, optional Play upload) and iPhone (compile check / TestFlight upload) | ✅ Done |
| Database migration `0002_mobile_app.sql` on your live Supabase | ⏳ I apply it after this PR is merged |
| Firebase project, upload key, Play Console listing | ⏳ **You** (steps 2–5) |
| Apple Developer enrollment, App Store listing | ⏳ **You** (steps 6–8) |

---

## Your steps, in order

### 1. Try the app on an Android phone (5 min, free)
1. GitHub → **Actions** → **Android app** → the latest run → **Artifacts** → download `isla-android-…` and unzip.
2. Copy `app-debug.apk` to an Android phone and open it (allow "install unknown apps" when asked).
   This test build works fully except push notifications (those need step 2).

### 2. Firebase — needed for Android push (10 min, free)
1. https://console.firebase.google.com → **Add project** → name `Isla` (Google Analytics: off).
2. **Add app → Android**, package name **`cafe.pahuway.isla`**, nickname `Isla`. Download **`google-services.json`**.
3. Project settings → **Service accounts** → **Generate new private key** → downloads a `.json` file.
4. Send them to the right places (never commit or paste them in chat):
   - GitHub repo → Settings → Secrets and variables → Actions → **New secret** `GOOGLE_SERVICES_JSON` = the base64 of `google-services.json`
     (Mac/Linux: `base64 -i google-services.json`; Windows PowerShell: `[Convert]::ToBase64String([IO.File]::ReadAllBytes("google-services.json"))`).
   - Vercel → Project → Settings → Environment Variables → `FIREBASE_SERVICE_ACCOUNT` = the full contents of the service-account `.json`.
5. Vercel → add `PUSH_WEBHOOK_SECRET` = any long random text (e.g. from a password generator). Tell me when done and I'll connect the database to it.

### 3. Android upload key (5 min, free)
Google signs the app for users; you keep an *upload key* to prove updates come from you. With Java installed (or ask me to generate one in a session):
```bash
keytool -genkeypair -v -keystore isla-upload.jks -alias isla -keyalg RSA -keysize 2048 -validity 10000
```
Keep `isla-upload.jks` and its password safe (password manager + a backup). Then add GitHub secrets:
`ANDROID_KEYSTORE_BASE64` (base64 of the file), `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` (= `isla`), `ANDROID_KEY_PASSWORD`.
If it's ever lost, Google Play support can reset an upload key — but that takes days.

### 4. Build the release
GitHub → Actions → **Android app** → **Run workflow** → version `1.0.0`, track `none`. Download the artifact: `app-release.aab` is for Google Play.

### 5. Google Play Console (1–2 h, then review 1–7 days)
1. https://play.google.com/console → **Create app**: name *Isla – Pahuway Cafe*, App, Free, default language English.
2. Fill **Store listing** (copy below), upload `mobile/assets/store-icon-512.png`, `mobile/assets/play-feature-graphic-1024x500.png` and 2–8 phone screenshots (`docs/screenshots/`).
3. **App content**: privacy policy URL `https://pahuway-cafe.vercel.app/privacy`; Data safety (answers below); Ads: no; Content rating questionnaire (food ordering → Everyone); Target audience 18+ (avoids the children's policy); Account deletion URL `https://pahuway-cafe.vercel.app/account`.
4. **Testing → Internal testing → Create release** → upload `app-release.aab` (the first upload must be manual) → add your own Gmail as a tester → install via the opt-in link.
5. New personal developer accounts must run a **closed test with at least 12 testers for 14 days** before production access. Recruit staff, riders and regular customers early.
6. Later releases: run the workflow with track `internal`/`production` after adding secret `PLAY_SERVICE_ACCOUNT_JSON` (Play Console → Setup → API access → service account with "Release manager").

### 6. Apple Developer Program (US$99/year; approval 1–2 days, longer for a business)
- **As an individual:** your name shows as the seller. Fastest.
- **As a business** (*Pahuway Cafe* shown as seller): needs a free **D-U-N-S number** (can take 1–2 weeks) and business registration.
Enroll at https://developer.apple.com/programs/enroll/.

### 7. Apple setup (30 min)
1. **App ID**: developer.apple.com → Identifiers → `+` → App ID `cafe.pahuway.isla`, capability **Push Notifications**.
2. **APNs key** (push): Keys → `+` → *Apple Push Notifications service* → download the `.p8` (once only). In Vercel add `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_PRIVATE_KEY` (contents of the `.p8`), `APNS_BUNDLE_ID=cafe.pahuway.isla`.
3. **App Store Connect app**: https://appstoreconnect.apple.com → My Apps → `+` → New App, iOS, name *Isla – Pahuway Cafe*, bundle ID `cafe.pahuway.isla`, SKU `isla-001`.
4. **API key for cloud builds**: App Store Connect → Users and Access → Integrations → **App Store Connect API** → generate key with role **App Manager**. Add GitHub secrets `APP_STORE_CONNECT_KEY_ID`, `APP_STORE_CONNECT_ISSUER_ID`, `APP_STORE_CONNECT_KEY_P8_BASE64` (base64 of the `.p8`), `APPLE_TEAM_ID`.

### 8. Build, TestFlight, submit (review usually 1–3 days)
1. GitHub → Actions → **iOS app** → Run workflow → version `1.0.0`, **upload ✓**. After ~20–30 min the build appears in App Store Connect → TestFlight.
2. Install via TestFlight on your iPhone and test (order, notifications, staff board).
3. Fill the App Store listing (copy below), App Privacy (answers below), screenshots (6.9" iPhone required), then **Submit for Review**.
4. In **App Review Information** provide a demo account (see *Review notes* below).

---

## Store listing copy

**Name:** Isla – Pahuway Cafe
**Subtitle (iOS, 30):** Coffee pickup & delivery
**Short description (Play, 80):** Order coffee, pastries & meals from Pahuway Cafe for pickup, dine-in or delivery.
**Category:** Food & Drink
**Keywords (iOS):** coffee,cafe,romblon,san agustin,latte,delivery,pickup,pastries,meals,order

**Full description:**
> Craving a Sea Salt Latte or an Adobo Rice Bowl? Order ahead from Pahuway Cafe in San Agustin, Romblon — no line, no waiting.
>
> • Browse the full menu with photos and prices
> • Customise your drink: hot or iced, sugar level, oat milk, extra shot
> • Pickup, dine-in pre-order, or delivery to your barangay
> • Order now or schedule a time
> • Pay cash or with GCash
> • Get a notification when your order is ready or on the way
> • No account needed — or sign up to save your address and see past orders
>
> Salamat po, and see you at the café! ☕

## Privacy answers

| Question (Play *Data safety* / Apple *App Privacy*) | Answer |
|---|---|
| Data collected | **Name, phone number, address** (order fulfilment); **email** (only with an account); **photos** (GCash payment screenshot, only if paying by GCash); **device push token** (if notifications allowed) |
| Purpose | App functionality (orders, delivery, payment verification, notifications). **Not** used for ads, analytics or tracking |
| Shared with third parties | No (Supabase, Vercel, Firebase/Apple act as service providers — not "sharing") |
| Linked to the user | Yes for account holders; guest orders are linked to the name/phone they enter |
| Tracking (Apple ATT) | **No tracking** |
| Encrypted in transit | Yes (HTTPS) |
| Users can request deletion | Yes — in-app *My account → Delete account*, or contact the café |
| Export compliance (iOS) | Standard encryption only — already declared in the app (`ITSAppUsesNonExemptEncryption = NO`) |

## Review notes (Apple) and risks

Apple sometimes rejects apps that are "just a website" (guideline 4.2). Isla is set up to pass by using native features: push notifications for order status (customers) and new orders/deliveries (staff/riders), a native offline screen, native splash/icon and status bar. Suggested **review notes**:

> Isla is the ordering app for Pahuway Cafe, a café in San Agustin, Romblon, Philippines. Customers can browse and order without an account (cash payment is fine for testing — the café will cancel test orders). After ordering, tap "Notify me" to receive native push notifications as the order is prepared and delivered. The staff and rider areas (/login) are for café employees; demo rider credentials are provided below.

Create a **demo rider** for Apple (Admin → Settings → Riders, e.g. `review@pahuway.cafe`) — never give reviewers the admin login. Expect a review question or two; reply in App Store Connect and resubmit (usually within a day).

Other notes:
- Ordering hours apply in the app too — submit for review while the store is open, or mention the hours in the notes.
- `server.url` (loading the live site) is a common Capacitor pattern; keep the website fast and reliable, since the app depends on it.

---

## Push notifications — how it works
1. When the app opens `/admin` or `/rider`, it asks for notification permission and saves the device token linked to the signed-in staff member. Signing out unlinks a shared tablet.
2. Customers tap **Notify me** on the order status page (works for guests).
3. On every new order, rider assignment or status change, the database (`pg_net` trigger) calls `POST /api/push/order-event` on Vercel with a shared secret. The route sends via **Firebase** (Android) or **Apple APNs** (iPhone) and removes dead tokens.
4. Android builds without `google-services.json` skip push safely (no crash) and hide the *Notify me* button.

Server env vars (Vercel): `FIREBASE_SERVICE_ACCOUNT`, `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_PRIVATE_KEY`, `APNS_BUNDLE_ID`, `PUSH_WEBHOOK_SECRET` (plus the existing `SUPABASE_SERVICE_ROLE_KEY`).
Database config (set once, I can do this): `private.app_config` rows `push_webhook_url` = `https://pahuway-cafe.vercel.app/api/push/order-event` and `push_webhook_secret` = same as `PUSH_WEBHOOK_SECRET`.

## Developer notes
```bash
npm run cap:sync          # copy config/plugins into android/ and ios/
npm run android:debug     # build a debug APK (needs Android SDK + JDK 21)
node mobile/make-assets.mjs && npx capacitor-assets generate --assetPath mobile/assets   # regenerate icons/splash
```
Tests: `npm run test:db` (incl. mobile scenarios), `npm run test:push` (push sender with Firebase/APNs mocked), `node tests/native-bridge.test.js` (app-mode behaviour via Capacitor's real Android bridge with a fake native side).

## Remaining effort & cost (estimates)

| | Who | Time | Cost |
|---|---|---|---|
| Firebase + upload key + secrets (steps 2–3) | You (+ me) | ~30 min | Free |
| Play Console listing + internal test (step 5) | You | 1–2 h | US$25 once (paid) |
| Closed test with 12 testers (new personal Play accounts) | You + testers | 14 days elapsed | Free |
| Apple enrollment (step 6) | You | 1–2 days (individual) / 1–3 weeks (business) | US$99/year |
| Apple setup + TestFlight + submission (steps 7–8) | You (+ me) | 1–2 h, then 1–3 days review | — |
| Fixes from store review feedback | Me | 0.5–2 days if needed | — |
| GitHub Actions minutes | — | ~10 min per build | Free on public repos; private repos use paid minutes for macOS (≈10× rate) |

**Realistic timeline:** Android in internal testing within a day of you finishing steps 2–5; public on Google Play in ~2–3 weeks (because of the 14-day closed test); iPhone public ~1 week after Apple enrollment is approved.
