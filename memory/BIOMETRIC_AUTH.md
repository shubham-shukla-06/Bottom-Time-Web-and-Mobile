# Mobile Biometric Auth — Phase A (2026-05-07)

Single source of truth for the mobile Face ID / Touch ID / fingerprint
resume flow. Web passkeys are Phase B (not yet implemented).

## Backend model

### Mongo collection `device_sessions`

```
{
  _id:                str           # session_id (urlsafe 16)
  user_id:            str
  device_id:          str           # client-generated stable UUID per install
  device_name:        str
  platform:           "ios"|"android"|"web"
  refresh_token_hash: str           # sha256 — raw token NEVER stored
  created_at:         datetime
  last_used_at:       datetime
  expires_at:         datetime      # sliding 30-day window
  revoked_at:         datetime|None
  revoked_reason:     str|None      # user_logout|user_request|email_changed|
                                    # phone_changed|expired|rotated
  biometric_enabled:  bool          # informational; server never enforces
}
```

Indexes: `(user_id, revoked_at)`, unique `(refresh_token_hash)`,
`(expires_at)`, `(user_id, device_id)`.

### Tokens
- Access token: existing JWT (`ACCESS_TOKEN_EXPIRE` env, **lowered to 60 min
  in Phase B** when the web frontend gained refresh-interceptor support).
- Refresh token: 64 random URL-safe bytes; sha256 stored; **rotated on
  every successful refresh** (sliding 30 days from latest rotation).

### Endpoints (all under `/api`)

| Method | Path | Auth | Notes |
|---|---|---|---|
| `POST` | `/auth/signup-complete` | none | Optional `device` field; mints session if present. |
| `POST` | `/auth/login-complete`  | none | Optional `device` field. |
| `POST` | `/auth/social/signup-complete` | none | Optional `device` field. |
| `POST` | `/auth/session/refresh` | refresh-token (in body) | Rotates token; 401 with `invalid_token` / `session_revoked` / `session_expired` / `device_mismatch`. |
| `POST` | `/auth/session/revoke`  | bearer | `{session_id}` |
| `POST` | `/auth/session/revoke-all` | bearer | Sets `revoked_reason="user_request"`. |
| `GET`  | `/auth/sessions`        | bearer | `?session_id=` flags `is_current`. |

Cascade revoke on credential change is wired in `routes/auth.py` for the
social-merge phone-attach branch (`reason="phone_changed"`). Email-change
and standalone phone-change endpoints don't exist yet; when they're added
they MUST call `device_sessions.revoke_sessions_for_user(...)` with the
appropriate `email_changed` / `phone_changed` reason.

## Mobile flow

1. User completes OTP → `verify.tsx` sends `device` in `login-complete` →
   server returns `{access_token, refresh_token, session_id, refresh_expires_at}`.
2. If hardware biometrics are available + enrolled, and the user hasn't
   skipped within the last 14 days, `BiometricEnrollmentSheet` appears.
3. On Enable → `authStore.enrollBiometric()` writes the refresh token to
   `expo-secure-store` with `requireAuthentication: true,
   keychainAccessible: WHEN_UNLOCKED_THIS_DEVICE_ONLY`.
4. Cold launch → `_layout.tsx` sees `biometricEnabled === true && !token`
   → navigates to `/biometric-resume`. Splash auto-prompts, reads the
   refresh token (biometric-gated), calls `/session/refresh`, hydrates
   `/auth/me`, then `router.replace('/(tabs)')`.
5. 3 consecutive cancels/fails → `wipeBiometricSession()` clears local
   state and falls through to `/welcome` (next launch starts clean).
6. `Profile → Security` screen: toggle biometric, list active sessions
   with per-device "Sign out" + "Sign out everywhere" + footnote
   "Changing your email or phone number signs you out of all devices."

## File map

### Backend
- `backend/device_sessions.py` — pure data-layer helpers.
- `backend/routes/sessions.py`  — HTTP routes.
- `backend/routes/auth.py`      — extended to mint sessions, cascade revoke.
- `backend/models.py`           — `DeviceInfo`, extended `TokenResponse`.
- `backend/server.py`           — index registration on startup.
- `backend/tests/test_device_sessions.py` — 11 tests, all passing.

### Mobile
- `mobile/src/services/biometric.ts`     — wraps `expo-local-authentication`.
- `mobile/src/services/secureSession.ts` — wraps `expo-secure-store`.
- `mobile/src/api/sessionApi.ts`         — typed client for `/session/*`.
- `mobile/src/stores/authStore.ts`       — `tryBiometricResume`, `enrollBiometric`,
  `disableBiometric`, `refreshAccessToken`, extended `login` + `logout`.
- `mobile/src/components/auth/BiometricEnrollmentSheet.tsx`
- `mobile/app/biometric-resume.tsx`
- `mobile/app/profile/security.tsx`
- `mobile/app/verify.tsx`                — wires `device` payload + sheet.
- `mobile/app/_layout.tsx`               — boot redirect + new Stack.Screens.
- `mobile/app/(tabs)/profile.tsx`        — added Security row.


---

# Web Passkey Auth — Phase B (2026-05-07)

WebAuthn-based passwordless sign-in for the React web app, layered on top
of the Phase A device-sessions / refresh-token model. Reuses every Phase A
endpoint; adds 6 new endpoints under `/api/auth/webauthn/`.

## Backend model

### Mongo collections

`passkeys` — one row per registered credential:
```
{
  _id:           str           # passkey_id (urlsafe 16)
  user_id:       str
  credential_id: str           # base64url — UNIQUE
  public_key:    str           # base64url COSE key from authenticator
  sign_count:    int           # signature counter (anomaly check)
  transports:    [str]         # usb|nfc|ble|internal|hybrid
  aaguid:        str|None
  backed_up:     bool          # CredProps.backedUp == "synced" passkey
  device_type:   "single_device"|"multi_device"
  label:         str
  created_at, last_used_at, revoked_at: datetime|None
  revoked_reason: str|None     # user_request|email_changed|sign_count_anomaly
}
```
Indexes: unique `(credential_id)`, `(user_id, revoked_at)`.

`webauthn_challenges` — TTL=300s scratch space for in-flight ceremonies:
```
{ _id: challenge_b64url, user_id|None, kind: "register"|"login",
  created_at: datetime }
```
TTL index on `created_at` (`expireAfterSeconds=300`).

### Endpoints (all `/api/auth/webauthn/`)

| Method | Path | Auth | Body | Notes |
|---|---|---|---|---|
| `POST` | `register/begin`  | bearer | `{}` | Returns `PublicKeyCredentialCreationOptionsJSON`. Excludes existing credentials. |
| `POST` | `register/finish` | bearer | `{response, label?}` | Stores the new passkey. |
| `POST` | `login/begin`     | none   | `{email?}` | Email-first or usernameless. Always returns options (no email-enumeration leak). |
| `POST` | `login/finish`    | none   | `{response, device}` | Verifies, mints `device_session`, returns `{access_token, refresh_token, session_id, user, ...}`. **Auto-revokes the credential** with `reason="sign_count_anomaly"` if `sign_count` regresses. |
| `GET`  | `passkeys`        | bearer | — | List the user's active passkeys. |
| `DELETE` | `passkeys/{id}` | bearer | — | Revoke. |

### Cascade
`device_sessions.revoke_sessions_for_user(user_id, reason="email_changed")`
also flags every passkey for that user as revoked. `phone_changed` does
**not** cascade to passkeys (phone is not the WebAuthn user handle).

### Token TTL
`ACCESS_TOKEN_EXPIRE` is now **60 minutes** in `backend/.env` — the web
frontend has a refresh interceptor and tolerates short access tokens.

### Tests
`backend/tests/test_webauthn.py` — 9 tests, all passing:
register/begin auth required, login/begin (email-first + userless +
unknown-email no-leak), login/finish unknown credential = 401, list +
delete passkey, email-change cascade, phone-change does NOT cascade,
test bypass `007320` for `testuser@bottom-time.com` still works.

## Web flow

1. **Boot** — `App.js` calls `installAuthInterceptor()` once. The
   interceptor catches any 401 (except on `/session/refresh` itself),
   single-flight-refreshes via `/session/refresh`, retries the request
   once. On refresh failure → forced logout.
2. **OTP login** — `useAuthFlow.completeAuth` and the login-complete
   path now send `buildDevicePayload()` (`device_id` from a localStorage
   UUID, parsed `device_name`, `platform: "web"`). Server returns the
   full token bundle; `authStore.login` persists `refresh_token` +
   `session_id` in **localStorage** (access token stays in sessionStorage).
3. **Post-OTP enrollment toast** — `maybePromptPasskeyEnrollment()` shows
   a sonner toast with "Set up" / "Not now". **No persistent snooze** —
   dismissal is in-memory only (`dismissedThisSession` in the prompt
   module), so the toast reappears on the very next login if the user
   still has zero passkeys. Closing the tab and reopening also shows it
   again on the next sign-in. Caller-side gating: only fired when
   `GET /auth/webauthn/passkeys` returns an empty list AND the login
   wasn't via passkey AND `window.PublicKeyCredential` exists.
4. **Sign in with passkey** — `AuthSteps.StepLogin` renders the button
   only when `passkeysSupported()` **AND** the local
   `bt:passkey_on_device` flag is set. When the flag is missing the
   button slot renders a muted dashed-border card with the exact copy:
   *"No passkey found on this device. Sign in with another method, then
   add a passkey from Profile → Security."* — and **no WebAuthn dialog
   is triggered**, so users never see the OS USB-key / QR-code chooser
   when there's no passkey available locally.

   Empty email → usernameless flow; filled email → allow-list flow. On
   `NotAllowedError`/`AbortError` → silent no-op (user can fall through
   to OTP). Other errors toast.

   The `bt:passkey_on_device` flag is:
   • set when `register/finish` succeeds on this browser (Profile →
     Security and post-OTP toast both go through `registerPasskey`),
   • set after any non-passkey login when `GET /auth/webauthn/passkeys`
     returns ≥1 row (covers iCloud-synced / Chrome-profile-synced
     passkeys appearing on a brand-new browser — the user enters via
     OTP once, the next login shows the passkey button),
   • cleared **only** when the user removes their last passkey from the
     Security screen (`next.length === 0`).
   • **Logout does NOT clear the flag.** The passkey itself lives in
     the OS keychain (Touch ID / Windows Hello / iCloud Keychain /
     Google Password Manager) and survives our app's logout — the
     button must stay active so the user can sign back in with it. The
     flag is also intentionally device-level rather than user-level: a
     different user signing in on the same browser still sees the
     button (clicking it lets the OS surface whichever credentials are
     valid for the chosen RP).
5. **Profile → Security** (`SecuritySection.js`) — two cards:
   - **Passkeys**: list, "Add passkey" button (`registerPasskey()` →
     `@simplewebauthn/browser` → `register/begin`+`finish`), per-row
     remove.
   - **Active sessions**: reuses `GET /auth/sessions` (with `session_id`
     query so server flags the current device), per-row "Sign out",
     "Sign out everywhere" button.
6. **Logout** — best-effort `POST /auth/session/revoke` with the stored
   `session_id` before clearing local storage. Forced logout (refresh
   failure) skips the server call.

## File map (web frontend)

- `frontend/src/api/deviceInfo.js`              — UUID + UA-parsed device name.
- `frontend/src/api/webauthnClient.js`          — `registerPasskey`,
  `authenticatePasskey`, `listPasskeys`, `deletePasskey`,
  `listSessions`, `revokeSession`, `revokeAllSessions`.
- `frontend/src/stores/authStore.js`            — refresh interceptor +
  bootstrap-from-refresh-token + extended `login`/`logout`.
- `frontend/src/components/auth/passkeyEnrollPrompt.js` — toast helper.
- `frontend/src/components/auth/useAuthFlow.js` — sends `device`,
  fires post-OTP toast, owns `handlePasskeyLogin`.
- `frontend/src/components/auth/AuthSteps.js`   — passkey login button.
- `frontend/src/components/AuthModal.js`        — wires the new props.
- `frontend/src/components/profile/SecuritySection.js` — Profile UI.
- `frontend/src/pages/Profile.js`               — mounts `<SecuritySection/>`.
- `frontend/src/App.js`                         — `installAuthInterceptor()`.

## Acceptance summary

- 6 new WebAuthn endpoints live under `/api/auth/webauthn/`.
- `passkeys` and `webauthn_challenges` collections with required indexes.
- Email-change cascades to passkey revocation; phone-change does not.
- `ACCESS_TOKEN_EXPIRE` lowered to 60 min.
- Web auth store persists `refresh_token` + `session_id` in localStorage.
- Single-flight 401 interceptor refreshes + retries; forces logout on
  `invalid_token`/`session_revoked`/`session_expired`/`device_mismatch`.
- Post-OTP enrollment toast shown on every non-passkey login while the
  user has zero passkeys server-side; **no persistent snooze** —
  dismissal is only in-memory for the current page session.
- Login screen renders the passkey button only when WebAuthn is
  supported AND a passkey is known to exist on this browser
  (`bt:passkey_on_device` flag). When no passkey is on this device the
  slot shows a muted card with the copy *"No passkey found on this
  device. Sign in with another method, then add a passkey from Profile
  → Security."* — and **never opens the OS passkey chooser**.
- 9/9 backend WebAuthn tests + 11/11 Phase A device-session tests still
  green.
- Mobile, OTP login, and `007320` test bypass untouched and verified.
