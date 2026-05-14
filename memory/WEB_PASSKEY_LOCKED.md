# WEB PASSKEY FLOW — LOCKED

Updated: 2026-05-14
Pinned commits producing the current state:
- `33f29b8` — pill reorder (Enroll | Skip for now | Skip forever)
- `d307839` — icon→title gap tightened (16px → 4px) via custom header wrapper
- `c1c2907` — Radix autofocus suppressed on AlertDialogContent → kills :focus-visible ring on first paint
- `5c041f6` — single `<Button>` pipeline for all three pills (eliminates first-paint border/weight divergence)

Locked by user directive. Any future agent MUST NOT modify the files below
without explicit human permission for this specific change.

---

## Locked files

### Web frontend
- `/app/frontend/src/api/webauthnClient.js`
- `/app/frontend/src/components/AuthModal.js`  (scroll-lock + passkey prop forwarding)
- `/app/frontend/src/components/PasskeyEnrollDialog.jsx`  (fully locked — see pinned invariants below)
- `/app/frontend/src/components/auth/AuthSteps.js`  (StepLogin + passkey button)
- `/app/frontend/src/components/auth/useAuthFlow.js`  (handlePasskeyLogin + post-login hook trigger)
- `/app/frontend/src/components/auth/passkeyEnrollPrompt.js`  (runPostLoginPasskeyHook + dialog store + never-ask flag helpers)
- `/app/frontend/src/pages/AuthCallback.js`  (OAuth post-login hook invocation)
- `/app/frontend/src/components/profile/SecuritySection.js`  (passkey-related blocks are intentionally absent — do not re-add)

### Backend
- `/app/backend/routes/webauthn.py`  (all WebAuthn endpoints, request-derived RP ID, authenticator_attachment=platform)
- `/app/backend/passkeys.py`  (collection helpers + list response shape with credential_id)

---

## Pinned invariants for `PasskeyEnrollDialog.jsx`

Future agents MUST preserve all of the following. Drift on any single point
counts as a regression.

### Component pipeline (single source of truth)
All three pills render through ONE `<Button>` component pipeline so they share
one resolved classList. This is the fix for the first-paint border/weight
divergence — do not revert it.

| Pill | Component path | Variant | className token |
|---|---|---|---|
| Enroll passkey (filled cyan) | `<AlertDialogAction asChild><Button …>` | default (implicit) | `PILL_FILLED` |
| Skip for now (outline) | `<AlertDialogCancel asChild><Button variant="outline">` | `outline` | `PILL_OUTLINE` |
| Skip forever (outline) | plain `<Button variant="outline">` (NOT wrapped in any Radix primitive) | `outline` | `PILL_OUTLINE` |

`Skip forever` owns the `setNeverAskAgain()` localStorage write — do not move
that logic into a Radix Cancel/Action wrapper.

### Autofocus suppression (do NOT remove)
```jsx
<AlertDialogContent onOpenAutoFocus={(e) => e.preventDefault()}>
```
Without this, Radix autofocuses the first focusable descendant
(`AlertDialogAction` post-reorder, previously `AlertDialogCancel`). When the
user submits OTP via the Enter key, that propagates a keyboard focus modality
to the autofocused button, `:focus-visible` matches, and `buttonVariants`'
`focus-visible:ring-1 focus-visible:ring-ring` paints a 1 px dark `box-shadow`
halo outside the 1 px cyan border — the pill reads as visually heavier than
the other two on first paint. Suppressing autofocus keeps focus on the dialog
content's `tabindex="-1"` itself, which paints no ring. Users can still Tab
to any button for keyboard nav (which gets the ring, as expected for a11y).

### Header structure (custom wrapper, NOT `AlertDialogHeader`)
`AlertDialogHeader` from `ui/alert-dialog.jsx` applies `space-y-2` uniformly
to every child, which forces an 8 px gap between the icon and the title that
visually splits them into two groups. The shared file is out of scope for
edits (other consumers depend on its defaults), so this call site uses a
plain `<div>` wrapper to control inter-element spacing locally.

Locked spacing:
- Icon wrapper: `flex justify-center mb-1` → **4 px** icon-bottom → title-top (grouped unit)
- Title: no explicit margin
- Description: `text-center mt-2` → **8 px** title-bottom → description-top (breathable)

`AlertDialogTitle` and `AlertDialogDescription` Radix primitives are preserved
so semantics (`aria-labelledby`, `aria-describedby`, role announcements) wire
up correctly. `AlertDialogHeader` is NOT imported in this file.

### Pill order (left → right)
```
[ Enroll passkey ]  [ Skip for now ]  [ Skip forever ]
   (filled cyan)        (outline)        (outline)
```
Footer container class: `flex justify-center gap-3 sm:justify-center`
(unchanged from shadcn default for `AlertDialogFooter`).

### Copy (exact strings — do not paraphrase)
- Title: `Enroll a passkey`
- Description: `Add a passkey to this device for faster, password-free sign-in next time.`
- Button labels: `Enroll passkey`, `Skip for now`, `Skip forever`
- Button-during-enrolling: `Setting up…`

### Icon
- `Fingerprint` from `lucide-react`, `size={22}`
- Wrapper: `w-12 h-12 rounded-full bg-cyan-50 text-cyan-500 flex items-center justify-center`
- Outer centering: `<div className="flex justify-center mb-1">`

### localStorage keys
- `bt_passkey_device_id` — credential id (base64url, no padding). Set by
  `setPasskeyOnDeviceFlag()` after successful enrolment. Used ONLY by the
  post-login enrollment prompt to decide whether to fire.
- `bt_passkey_never_ask` — persistent dismissal flag. Set by the "Skip
  forever" pill via `setNeverAskAgain()`. Cleared by `clearNeverAskFlag()`
  on successful enrolment so the prompt re-arms for future devices.
- Server-side passkey existence is queried via `/api/auth/me/has-passkey`;
  it does NOT gate the login button (that is local-flag only).

### data-testids (preserved across all refactors)
- `passkey-enroll-dialog` — root AlertDialogContent
- `passkey-enroll-confirm` — Enroll passkey button
- `passkey-enroll-skip` — Skip for now button
- `passkey-enroll-never` — Skip forever button

### Local className tokens (do not inline)
```js
const PILL_OUTLINE = 'rounded-full px-4 py-2 border-cyan-500 text-cyan-700 bg-white hover:bg-cyan-50 hover:text-cyan-700 shadow-none mt-0 sm:mt-0';
const PILL_FILLED  = 'rounded-full px-4 py-2 bg-cyan-500 hover:bg-cyan-600 text-white border-0 shadow-sm mt-0';
```
The `hover:text-cyan-700` on `PILL_OUTLINE` neutralises the outline variant's
default `hover:text-accent-foreground`. The `shadow-none` neutralises the
outline variant's default `shadow-sm`. Do not strip either.

---

## Behavioural invariants (wider flow)

1. **Sign in with passkey button is always enabled.** Tap calls
   `navigator.credentials.get()` unconditionally. The OS-level QR/USB-key
   picker is the expected fallback when no platform credential exists. The
   local flag (`bt_passkey_device_id`) is still maintained and used only by
   the post-login enrollment prompt.

2. **Post-login enrollment prompt** (OTP / OAuth / magic link):
   `runPostLoginPasskeyHook` fires with `loggedInViaPasskey=false`; opens
   `PasskeyEnrollDialog` when the local flag is missing AND
   `bt_passkey_never_ask` is not set. Server `has_passkey` state is NOT a
   gate.

3. **Persistent dismissal:** `localStorage.bt_passkey_never_ask` set via the
   "Skip forever" pill suppresses the prompt across sessions. Flag clears on
   successful enrolment so the prompt re-arms for future devices.

4. **Enrollment:** backend enforces `authenticator_attachment=platform`
   → no QR/USB picker during registration.

5. **Stale-credential recovery is silent.** Any
   `NotAllowedError`/`AbortError`/`InvalidStateError`/`SecurityError` during
   `get()` AND 401 from `/login/finish` → `clearPasskeyOnDeviceFlag` inside
   `webauthnClient.authenticatePasskey`; `handlePasskeyLogin` then returns
   silently (no toast, no dialog). The OS picker the browser already surfaced
   is the unavoidable WebAuthn fallback.

6. **localStorage flag normalisation:** `bt_passkey_device_id` is stored as
   base64url with no padding. Legacy `'1'` value is treated as falsy.

7. **Profile > Security:** passkey management list intentionally removed;
   only Active Sessions shown. Do not re-add a passkey list — OS-level
   passkey deletions cannot be reconciled with the web UI.

8. **WebAuthn RP ID is request-derived** from `X-Forwarded-Host`
   → `request.url.hostname`, so the same code works on preview hostnames
   and `bottom-time.com`. Do not hardcode.

---

## Unlock protocol

Each unlock authorises **exactly one file for one turn**.

To unlock, the human must explicitly say one of:
- `"Unlock the web passkey flow"`  (broad — unlocks for the current turn only)
- `"Edit <file> for passkey work"`  (file-specific, one turn)

After the authorised commit, the lock re-applies automatically. The next
agent must refuse passkey-flow edits unless a fresh explicit unlock is
present in the immediate prior user message.

---

## Related locks

- See `WEB_APPLE_AUTH_LOCKED.md` for Apple sign-in invariants that interact with the passkey enrollment hook.
