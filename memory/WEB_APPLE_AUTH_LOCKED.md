# WEB APPLE SIGN-IN FLOW — LOCKED

Updated: 2026-05-14
Pinned commits producing the current state:
- `46e449d` — Apple credentials wired (popup mode); env vars + bundle-ID flip
- `25d07ac` — `pkceHelpers.js` `needs_setup` / `logged_in` branching, canonical `login()` action, additive Apple branch in `AuthCallback.js` `processCallback`
- `9f1644b` — replaced deprecated server-sync passkey prompt block with `runPostLoginPasskeyHook(false)` in `AuthCallback.js` phone-OTP completion path

Locked by user directive after end-to-end verification of the popup-mode
Apple sign-in chain (consent → backend `/auth/social/apple-token` 200 →
`needs_setup` route → role → phone → OTP → onboarding → enroll-passkey
prompt). Any future agent MUST NOT modify the files or invariants below
without explicit human permission for this specific change.

---

## Locked files

### Web frontend
- `/app/frontend/src/components/auth/pkceHelpers.js` — **scoped lock**: only
  `initiateAppleAuth()` and its success-handler branching are locked. The
  other PKCE helpers in this file (Google PKCE state generators, Microsoft
  helpers, etc.) are NOT part of the Apple-flow lock and may be edited for
  unrelated work.
- `/app/frontend/src/pages/AuthCallback.js` — **scoped lock**:
  1. The Apple branch at the top of `processCallback` that handles
     `?provider=apple&needs_setup=1` by consuming `sessionStorage.apple_pending_signup`.
  2. The `runPostLoginPasskeyHook(false)` call in the phone-OTP completion
     path (`verifyPhoneOtp`, immediately after `login(access_token, user)`).
  Cross-reference: this file is also locked by `WEB_PASSKEY_LOCKED.md`
  for the OAuth post-login hook invocation. Honor both locks together.

### Backend
- `/app/backend/apple_auth.py` — JWKS verifier. RS256, audience-array
  iteration (`verify_apple_identity_token(token, audiences)`), kid cache
  with 1-hour TTL + force-refresh on unknown kid. Apple public keys fetched
  from `https://appleid.apple.com/auth/keys`.
- `/app/backend/routes/auth.py` — `POST /api/auth/social/apple-token`
  route handler (line ~551) and its audience-list construction:
  `[os.environ["APPLE_BUNDLE_ID"], os.environ["APPLE_SERVICES_ID"]]`.
- `/app/backend/models.py` — `SocialAppleTokenRequest` Pydantic schema
  (fields: `identity_token: str`, `full_name: Optional[str]`).

### Mobile (FUTURE SCOPE — not yet locked)
The mobile Apple flow (`expo-apple-authentication` integration in
`/app/mobile/src/screens/WelcomeView.tsx` + `/app/mobile/src/utils/oauth.ts`)
has been wired with the new bundle ID `com.bottom-time.app` but is NOT yet
verified end-to-end on a real iOS device. When that verification lands, add
`MOBILE_APPLE_AUTH_LOCKED.md` mirroring this doc's structure.

---

## Pinned invariants

Future agents MUST preserve all of the following. Drift on any single point
counts as a regression.

### 1. Flow mode is popup-only
The web flow uses `AppleID.auth.signIn()` with `usePopup: true`. Apple's
hosted authorize page responds with `response_mode=web_message` and
postMessages the `id_token` back to the opener JS. There is NO `form_post`
redirect, no callback-URL navigation by Apple's JS lib, no backend
`/auth/apple/callback` endpoint. Switching to redirect mode requires an
explicit unlock and is a substantial surgery (new backend endpoint, client
secret JWT generator, AuthCallback.js refactor).

### 2. Two backend audiences are valid
```python
allowed_audiences = [
    os.environ["APPLE_BUNDLE_ID"],      # com.bottom-time.app — native iOS
    os.environ["APPLE_SERVICES_ID"],    # com.bottom-time.web — web popup
]
```
`verify_apple_identity_token` iterates this list. Both audiences must remain
valid so iOS-app users and web-popup users land on the same backend route.
Do not hardcode either value; both come from env at request time.

### 3. Frontend handles three response shapes from `/auth/social/apple-token`
Located in `pkceHelpers.js:initiateAppleAuth()` success handler. All three
branches are mandatory — silent no-op on any non-matching shape was the
original bug that left the modal stuck open.

| Shape | Action |
|---|---|
| `{status: 'needs_setup', email, name, provider: 'apple', apple_sub?}` | Stash in `sessionStorage.apple_pending_signup` → `window.location.href = '/auth/callback?provider=apple&needs_setup=1'` |
| `{access_token, user, refresh_token?, session_id?, refresh_expires_at?}` | Dynamic-import `useAuthStore` + `runPostLoginPasskeyHook` → `useAuthStore.getState().login(access_token, user, { refresh_token, session_id, refresh_expires_at })` → `runPostLoginPasskeyHook(false)` → `window.location.href = dest` (where `dest` is `/onboarding` if `!user.onboarding_complete`, `/operator` if role is operator/instructor, else `/discover`) |
| Anything else | `console.warn('[apple-auth] unexpected response shape', data)` + `throw new Error(...)` so the outer `catch` surfaces an alert. **NEVER silently return.** |

### 4. No `localStorage` writes for tokens
All token persistence flows through the Zustand `login()` action which
writes to `sessionStorage` (per `authStore.js` `writeSession` helper).
Re-introducing a direct `localStorage.setItem('token', ...)` call is a
regression — it writes to the wrong storage layer (the store reads from
`sessionStorage`) AND bypasses `applyAuthHeader()`, the `user` state set,
and refresh-token / session-id persistence.

### 5. `AuthCallback.js` Apple branch is additive at the TOP of `processCallback`
The Apple branch checks `URLSearchParams.get('provider') === 'apple' &&
get('needs_setup') === '1'`, reads `sessionStorage.apple_pending_signup`,
calls `setSocialData({...})` + `setStatus('needs_setup')`, then `return`s.
It NEVER falls through to the Google/MS branches below. The Google/MS
branches and their `code`/`session_id` URL-param discrimination must remain
byte-identical.

### 6. Post-signup passkey prompt uses the shared hook
After `login(...)` in the phone-OTP completion path
(`AuthCallback.js:verifyPhoneOtp`), the next line is
`runPostLoginPasskeyHook(false)` — the SAME helper used by the existing-user
social-login path on `AuthCallback.js:46`. Do NOT re-introduce a server-side
`has_passkey` query gate (the deleted `syncPasskeyFlagFromServer` pattern
violated `WEB_PASSKEY_LOCKED.md` invariant #2 *"Server `has_passkey` state
is NOT a gate"*).

### 7. Apple JS SDK + registered Return URIs
- The Apple JS SDK loads from `https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js` at runtime.
- `AppleID.auth.init({ redirectURI: ... })` must match a Return URI registered on the Apple Developer portal for Services ID `com.bottom-time.web`.
- **Currently registered Return URIs** (popup-mode landing target, never actually navigated to):
  - `https://bottom-time.com/auth/callback`
  - `https://app.bottom-time.com/auth/callback`
  - `https://project-scanner-44.preview.emergentagent.com/auth/callback`
  (note: no `/api/` prefix; popup mode never POSTs here — the URI just needs to be registered)
- Adding a new preview/staging host = portal registration update before the popup will succeed on that host.

### 8. Five backend env vars must remain set
Located in `/app/backend/.env` (gitignored; not committed).

| Var | Value (public IDs not secret) | Purpose |
|---|---|---|
| `APPLE_BUNDLE_ID` | `com.bottom-time.app` | Audience for native iOS tokens |
| `APPLE_SERVICES_ID` | `com.bottom-time.web` | Audience for web popup tokens |
| `APPLE_TEAM_ID` | `Z996V7NGK5` | Apple Developer team identifier — needed for client_secret JWT |
| `APPLE_KEY_ID` | rotated value (see `.env`) | `kid` header for client_secret JWT |
| `APPLE_PRIVATE_KEY` | multi-line ES256 PEM (double-quoted, real newlines) | Signing key for client_secret JWT |

Backend popup-mode doesn't actively use the team/key/private-key trio today
(the route only verifies the id_token via JWKS — no code exchange against
Apple's `/auth/token`). They are staged for a future form_post migration or
for the revoke/refresh APIs. **Do not remove them.** The PEM MUST parse via
`cryptography.hazmat.primitives.serialization.load_pem_private_key()` and
return an `EllipticCurvePrivateKey`.

### 9. Frontend env var
`/app/frontend/.env`: `REACT_APP_APPLE_CLIENT_ID=com.bottom-time.web`
(Services ID — drives Apple JS SDK init).

### 10. Mobile env var
`/app/mobile/.env`: `EXPO_PUBLIC_APPLE_CLIENT_ID=com.bottom-time.app`
(Bundle ID — native iOS `expo-apple-authentication` uses the bundle ID for
the token audience, NOT the Services ID). The `app.json`
`ios.bundleIdentifier` MUST also be `com.bottom-time.app` to match.

---

## Related locks

- `/app/memory/WEB_PASSKEY_LOCKED.md` — passkey enrollment dialog +
  `runPostLoginPasskeyHook` are downstream of every successful Apple login
  (existing-user path and new-signup-completion path both fire the hook).
  Both locks must be honored together. In particular:
  - `WEB_PASSKEY_LOCKED.md` invariant #2 (server `has_passkey` is NOT a gate)
    is the reason `syncPasskeyFlagFromServer` was deleted and the simplified
    `runPostLoginPasskeyHook(false)` replaced it.

- `/app/memory/MOBILE_AUTH_LOCKED.md` — locks the mobile welcome/signup/verify
  navigation chrome. Apple sign-in inside that chrome is currently un-locked
  (future scope); changes to that path don't need this lock today but should
  add a `MOBILE_APPLE_AUTH_LOCKED.md` once verified.

---

## Unlock protocol

Each unlock authorises **exactly one file for one turn**.

To unlock, the human must explicitly say one of:
- `"Unlock the Apple flow"`  (broad — unlocks for the current turn only)
- `"Edit <file> for Apple work"`  (file-specific, one turn)

After the authorised commit, the lock re-applies automatically. The next
agent must refuse Apple-flow edits unless a fresh explicit unlock is present
in the immediate prior user message.
