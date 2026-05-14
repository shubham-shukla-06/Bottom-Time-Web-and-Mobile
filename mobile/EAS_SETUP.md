# EAS / TestFlight setup — Bottom Time iOS

This doc walks through getting `com.bottom-time.app` onto TestFlight so we can test Apple Sign-In (which cannot work inside Expo Go because the `aud` claim defaults to `host.exp.Exponent` instead of our bundle ID).

Everything you do here happens **outside the pod** on your local machine where you can run `eas` and interact with Apple credentials.

---

## Resume checklist (read first)

If you are picking this back up after a deferral, the EAS scaffolding is already in place. To resume:

1. **`eas.json` is already wired** with the ASC API key submit config (`ascAppId`, `appleTeamId`, `ascApiKeyPath`, `ascApiKeyId`, `ascApiKeyIssuerId` all set; no placeholders remain). If you regenerate the ASC API key on Apple's side, rotate `ascApiKeyPath` / `ascApiKeyId` / `ascApiKeyIssuerId` to match.
2. **Run `eas credentials --platform ios` ONCE interactively on your laptop.** EAS hardcodes a gate that the first-time Distribution Certificate + Provisioning Profile setup must happen in interactive mode — the pod can't do this step (we tried). Authenticate via the ASC API key prompts when asked; EAS will register the cert + profile against bundle `com.bottom-time.app` and store both in EAS's credential service.
3. **After that, the pod can run `eas build` / `eas submit` non-interactively** for all subsequent builds. The full walkthrough below still applies; only step 2's "credentials" sub-step now succeeds without a laptop because EAS has the cert stored server-side.

The Expo project is already created and linked: <https://expo.dev/accounts/shubshukla/projects/bottom-time> (projectId `99fcd0a5-2063-4250-9a17-a7bf6dda4bea`, owner `shubshukla`).

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

---

## Known limitation: Apple Sign-In does not work inside Expo Go

If you try to sign in with Apple while running the app inside **Expo Go** (the generic Expo client app available on the App Store, used in tunnel-mode dev like `expo start --tunnel`), the flow will fail with a backend 401:

```
"Apple: Identity token did not validate against any audience
 (com.bottom-time.app, com.bottom-time.web): Invalid audience"
```

This is **expected**, not a bug.

### Why

Apple's `ASAuthorizationAppleIDProvider` (which `expo-apple-authentication` calls into) sets the issued identity token's `aud` claim to the **host process's bundle ID**. Inside Expo Go, the host process is the published Expo Go app itself — bundle `host.exp.Exponent` — not our `com.bottom-time.app`. So the token Apple returns has `aud=host.exp.Exponent`.

Our backend (`/app/backend/apple_auth.py:verify_apple_identity_token`) validates the `aud` against `[APPLE_BUNDLE_ID, APPLE_SERVICES_ID]` (i.e. `com.bottom-time.app` and `com.bottom-time.web`). `host.exp.Exponent` matches neither, so jose's verifier rejects it as `Invalid audience` and we 401.

There is **no fix inside Expo Go**. Adding `host.exp.Exponent` to the allow-list would let any malicious Expo Go user worldwide forge tokens — not acceptable. The only correct path is to run the app under its real bundle identifier, which requires a real build.

### Fix path

Complete the TestFlight flow described in this doc (above). Once installed via TestFlight, the host process IS our app with bundle `com.bottom-time.app`, so Apple returns `aud=com.bottom-time.app`, and the existing backend validator accepts it. **No code change needed when you resume — just create the build.**

### Code state

Web and mobile Apple flows are parity-complete already. For reference:
- `46e449d` — Apple credentials wired (popup mode), env vars, bundle-ID flip to `com.bottom-time.app`
- `25d07ac` — Web `pkceHelpers.js` `needs_setup` / `logged_in` branching + canonical `login()`
- `9f1644b` — Web `AuthCallback.js` post-OTP passkey hook
- `7b927e1` — Mobile parity: handle `needs_setup` + payload-form login for all social providers (Apple/Google/MS)

### What to do during Expo-Go dev meanwhile

- The Apple button on the Welcome screen will show a visible error toast ("Apple: Identity token did not validate…") and remain inert. **Safe to ignore** for non-Apple-related testing.
- **Email-OTP, Google, and Microsoft sign-in DO work inside Expo Go** — use any of those for testing other mobile features. The OTP test bypass code remains `007320` for the seeded test user.
