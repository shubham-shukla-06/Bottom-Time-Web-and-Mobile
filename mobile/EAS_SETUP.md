# EAS / TestFlight setup — Bottom Time iOS

This doc walks through getting `com.bottom-time.app` onto TestFlight so we can test Apple Sign-In (which cannot work inside Expo Go because the `aud` claim defaults to `host.exp.Exponent` instead of our bundle ID).

Everything you do here happens **outside the pod** on your local machine where you can run `eas` and interact with Apple credentials.

---

## 1) One-time human steps

These need YOUR Apple credentials, so they must happen on your laptop, not from the agent pod.

1. **Create the App Store Connect app record** at <https://appstoreconnect.apple.com> → My Apps → `+` → New App.
   - Platform: iOS
   - Name: `Bottom Time`
   - Primary language: English (U.S.)
   - Bundle ID: `com.bottom-time.app` (must already exist in <https://developer.apple.com> → Identifiers → with **Sign In with Apple** capability ticked; bundle was registered earlier in the auth-wiring turn)
   - SKU: your choice (e.g. `bottomtime-ios-001`)
2. **Note the ASC App ID.** On the App Information page (left sidebar inside the new app record) you'll see "Apple ID" — a 10-digit number like `6499123456`. Copy it.
3. **Generate an app-specific password** for `eas submit` to upload builds to App Store Connect without your Apple ID 2FA prompt every time:
   - Go to <https://appleid.apple.com> → Sign-In and Security → App-Specific Passwords → Generate.
   - Label it `eas-submit-bottomtime` (or whatever).
   - Save the 16-char `xxxx-xxxx-xxxx-xxxx` value. EAS will ask for it during `eas credentials` / `eas submit` interactively.
4. **Replace placeholders in `/app/mobile/eas.json`:**
   - `PLACEHOLDER_APPLE_ID_EMAIL` → the Apple ID email you log into App Store Connect with.
   - `PLACEHOLDER_ASC_APP_ID` → the 10-digit ASC App ID from step 2.
   - `appleTeamId` is already filled (`Z996V7NGK5`).

---

## 2) Commands to run, from inside `/app/mobile/`

```bash
eas login
eas init          # links this repo to an EAS project, writes expo.extra.eas.projectId into app.json
eas credentials   # interactive: when prompted, "Set up new" for the Distribution Cert + Provisioning Profile.
                  # Let EAS manage both. Push Notifications Key only needed if you add push later.
eas build --platform ios --profile production
```

The `production` profile (in `eas.json`) auto-increments `ios.buildNumber`, distributes via the App Store channel, and produces a `.ipa` ready for TestFlight.

Build time: **15–25 minutes** on EAS Cloud Free tier. Track at <https://expo.dev/accounts/<your-username>/projects/bottom-time/builds>.

---

## 3) Submit the finished build to TestFlight

```bash
eas submit --platform ios --profile production --latest
```

`--latest` grabs the most recent successful build automatically. EAS will use the `appleId` + `ascAppId` + `appleTeamId` from `eas.json` and prompt for the app-specific password the first time.

---

## 4) Take it from App Store Connect

1. Wait ~15 minutes after `eas submit` reports success. Apple needs to process the binary.
2. App Store Connect → your `Bottom Time` app → **TestFlight** tab.
3. The new build appears under iOS Builds. Click it → answer the **"Provide Export Compliance Information"** prompt (select "uses standard encryption only / exempt under 740.17(b)" — true for HTTPS + WebAuthn / Apple Sign-In).
4. **Internal Testing** → Create / use the default group → Add yourself as a tester (your Apple ID).
5. Install the TestFlight app on your iPhone, sign in with the same Apple ID, accept the invitation, install `Bottom Time`.
6. Open the app → Sign in with Apple → Face ID prompt → backend should now receive `aud=com.bottom-time.app` ✓ → logs you in (or routes to `/signup` if first-time).

---

## 5) Iterating on JS-only fixes without a new TestFlight build

Most of your changes (frontend logic, screens, hooks, navigation) are pure JS. EAS Update can ship them over-the-air to the already-installed TestFlight build without re-uploading a new `.ipa`:

```bash
eas update --branch production --message "your change description"
```

The TestFlight build (in `production` channel) will pick up the new bundle on next launch. **Native code changes** (new expo plugin, bundle-ID change, new Info.plist entry, new native module) DO require a fresh `eas build` + `eas submit`.

---

## 6) Common gotchas

- **"Bundle ID already in use"** when creating the ASC app record → another developer (or you, in a different team) registered `com.bottom-time.app`. Check <https://developer.apple.com> → Identifiers under the team `Z996V7NGK5`. If it shows up there, the App Store Connect creation should work; if not, you may need to use a different bundle ID (and update `app.json`, `apple_auth.py` audience, etc.) — flag if this happens.
- **Sign In with Apple capability missing from the Identifier** → Developer portal → Identifiers → `com.bottom-time.app` → Edit → ✅ "Sign In with Apple" → Save. Without this, the Apple Sign-In button on the device throws an `ASAuthorizationError` before ever hitting our backend.
- **App-specific password vs. regular Apple ID password** → `eas submit` always wants the **app-specific** password during the App Store Connect upload step. Using your real password will fail with `Two-Factor Authentication required`.
- **"Provide Export Compliance Information" stalls TestFlight processing** → answer the prompt at App Store Connect → TestFlight → Builds → click the missing-info icon. Until you answer it, internal testers can't install.
- **EAS Update doesn't ship to TestFlight build** → the `channel` in your `eas update` must match what was built (`production` here). Re-check `eas.json` → `build.production.channel`.
- **Build fails with `Sign in with Apple` capability error during EAS prebuild** → the iOS provisioning profile `eas credentials` generated didn't include Sign In with Apple. Re-run `eas credentials` → iOS → Build credentials → Remove Provisioning Profile → Generate new (EAS will re-create it with the latest capabilities from your Identifier).

---

## 7) After the first successful flow

Once `eas init` runs, `app.json` will gain a key:
```json
"extra": { "eas": { "projectId": "<uuid>" } }
```
Commit that change. Subsequent agent sessions / fork agents will be able to detect the EAS link without re-running `eas init`.

Also consider creating `/app/memory/MOBILE_APPLE_AUTH_LOCKED.md` mirroring `WEB_APPLE_AUTH_LOCKED.md` once the TestFlight flow proves Apple Sign-In end-to-end — the mobile flow will deserve the same anti-regression lock.
