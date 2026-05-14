# WEB PASSKEY FLOW — LOCKED (HEAD updated post-skip-forever-copy)

Locked by user directive. Any future agent MUST NOT modify the files
below without explicit human permission for this specific change.

## Locked files (web frontend)
- /app/frontend/src/api/webauthnClient.js
- /app/frontend/src/components/AuthModal.js  (scroll-lock + passkey prop forwarding)
- /app/frontend/src/components/PasskeyEnrollDialog.jsx
- /app/frontend/src/components/auth/AuthSteps.js  (StepLogin + passkey button)
- /app/frontend/src/components/auth/useAuthFlow.js  (handlePasskeyLogin + post-login hook trigger)
- /app/frontend/src/components/auth/passkeyEnrollPrompt.js  (runPostLoginPasskeyHook + dialog store + never-ask flag)
- /app/frontend/src/pages/AuthCallback.js  (OAuth post-login hook invocation)
- /app/frontend/src/components/profile/SecuritySection.js  (passkey-related blocks are intentionally absent — do not re-add)

## Locked files (backend)
- /app/backend/routes/webauthn.py  (all WebAuthn endpoints, request-derived RP ID, authenticator_attachment=platform)
- /app/backend/passkeys.py  (collection helpers + list response shape with credential_id)

## Locked behaviour summary
1. Sign in with passkey button is always enabled; tap calls navigator.credentials.get() unconditionally. The OS-level QR/USB-key picker is the expected fallback when no platform credential exists. The local flag (bt_passkey_device_id) is still maintained and used only by the post-login enrollment prompt.
2. Post-login (OTP/OAuth/magic link): runPostLoginPasskeyHook fires with loggedInViaPasskey=false; opens PasskeyEnrollDialog when local flag is missing. Server has_passkey state is NOT a gate.
3. Post-login enroll prompt: now also persistently suppressed when localStorage.bt_passkey_never_ask is set. The user can opt in/out via the Enroll dialog's "Skip forever" pill. Flag clears on successful enrollment so the prompt re-arms for future devices.
4. Enrollment: backend enforces authenticator_attachment=platform → no QR/USB picker during registration.
5. Stale credential recovery: any NotAllowedError/AbortError/InvalidStateError/SecurityError during get() AND 401 from /login/finish → clearPasskeyOnDeviceFlag inside webauthnClient.authenticatePasskey, then handlePasskeyLogin returns silently (no toast, no dialog). The OS picker the browser already surfaced is the unavoidable WebAuthn fallback.
6. localStorage flag is normalised (base64url, no padding). Legacy '1' is treated as falsy.
7. Profile > Security: passkey list intentionally removed; only Active Sessions shown.
8. RP ID is request-derived (X-Forwarded-Host → request.url.hostname) so the same code works on preview + bottom-time.com.

## To unlock (any subset)
The human must say one of:
- "Unlock the web passkey flow"
- "Edit <specific file> for passkey work" (one-turn unlock)

Last verified working on 2026-05-14 (post-skip-forever-copy commit).
