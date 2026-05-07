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
- Access token: existing JWT (`ACCESS_TOKEN_EXPIRE` env, currently 7 days —
  intentionally NOT lowered to 60 min in this phase to avoid invalidating
  active web sessions; see `routes/auth.py` comment for the full rationale).
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
