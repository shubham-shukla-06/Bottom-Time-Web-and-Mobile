# WEB PASSKEY FLOW — LOCKED (HEAD b48654b)

Locked by user directive. Any future agent MUST NOT modify the files
below without explicit human permission for this specific change.

## Locked files (web frontend)
- /app/frontend/src/api/webauthnClient.js
- /app/frontend/src/components/AuthModal.js  (scroll-lock + passkey prop forwarding)
- /app/frontend/src/components/PasskeyEnrollDialog.jsx
- /app/frontend/src/components/auth/AuthSteps.js  (StepLogin + passkey button + AlertDialog)
- /app/frontend/src/components/auth/useAuthFlow.js  (handlePasskeyLogin + post-login hook trigger)
- /app/frontend/src/components/auth/passkeyEnrollPrompt.js  (runPostLoginPasskeyHook + dialog store)
- /app/frontend/src/pages/AuthCallback.js  (OAuth post-login hook invocation)
- /app/frontend/src/components/profile/SecuritySection.js  (passkey-related blocks are intentionally absent — do not re-add)

## Locked files (backend)
- /app/backend/routes/webauthn.py  (all WebAuthn endpoints, request-derived RP ID, authenticator_attachment=platform)
- /app/backend/passkeys.py  (collection helpers + list response shape with credential_id)

## Locked behaviour summary
1. Sign-in card: passkey button visible always; gated by localStorage.bt_passkey_device_id (real >20-char credential id). When absent or stale, tap shows centred cyan-pill AlertDialog "No passkey on this device" — NEVER calls navigator.credentials.get().
2. Post-login (OTP/OAuth/magic link): runPostLoginPasskeyHook fires with loggedInViaPasskey=false; opens PasskeyEnrollDialog when local flag is missing. Server has_passkey state is NOT a gate.
3. Enrollment: backend enforces authenticator_attachment=platform → no QR/USB picker during registration.
4. Stale credential recovery: any NotAllowedError/AbortError/InvalidStateError/SecurityError during get() AND 401 from /login/finish → clearPasskeyOnDeviceFlag + show "No passkey on this device" dialog.
5. localStorage flag is normalised (base64url, no padding). Legacy '1' is treated as falsy.
6. Profile > Security: passkey list intentionally removed; only Active Sessions shown.
7. RP ID is request-derived (X-Forwarded-Host → request.url.hostname) so the same code works on preview + bottom-time.com.

## To unlock (any subset)
The human must say one of:
- "Unlock the web passkey flow"
- "Edit <specific file> for passkey work" (one-turn unlock)

Last verified working at HEAD b48654b on 2026-05-14.
