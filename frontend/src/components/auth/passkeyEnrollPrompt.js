// Phase B (web passkeys) — post-OTP enrollment prompt.
//
// Shown after every successful non-passkey login when the user has zero
// passkeys on the server side. NO persistent snooze — the only suppression
// is an in-memory "dismissed for this page session" flag, so closing /
// reopening the tab will show it again on the next login. This is
// intentional: keep nagging until they enrol.
//
// Caller is responsible for the precondition checks (server-side passkey
// count === 0, login wasn't via passkey, browser supports WebAuthn). This
// module just owns the toast UI + the in-memory dismiss flag.

import { toast } from 'sonner';
import {
  passkeysSupported,
  registerPasskey,
  setPasskeyOnDeviceFlag,
} from '../../api/webauthnClient';

// Module-scoped (not localStorage) — survives across React renders within
// the same browser session, resets on full page reload.
let dismissedThisSession = false;

export function resetPasskeyEnrollDismissal() {
  dismissedThisSession = false;
}

/**
 * Fire the toast. Returns immediately — non-blocking. Caller should have
 * already verified there are zero passkeys server-side and the login
 * wasn't via passkey.
 */
export function maybePromptPasskeyEnrollment() {
  if (typeof window === 'undefined') return;
  if (!passkeysSupported()) return;
  if (dismissedThisSession) return;

  // Slight delay so it doesn't compete visually with the "Welcome back" toast.
  setTimeout(() => {
    if (dismissedThisSession) return;
    toast('Sign in faster next time', {
      description: 'Add a passkey to skip the OTP step on this browser.',
      duration: 10000,
      action: {
        label: 'Set up',
        onClick: async () => {
          try {
            const result = await registerPasskey();
            setPasskeyOnDeviceFlag();
            // Successful enrol → nothing to nag about for the rest of
            // this session even if they sign out and back in here.
            dismissedThisSession = true;
            toast.success(`Passkey added: ${result.label}`);
          } catch (err) {
            const name = err?.name || '';
            if (name === 'NotAllowedError' || name === 'AbortError') {
              dismissedThisSession = true;
            } else {
              const msg = err?.response?.data?.detail || 'Could not set up passkey';
              toast.error(typeof msg === 'string' ? msg : 'Could not set up passkey');
            }
          }
        },
      },
      cancel: {
        label: 'Not now',
        onClick: () => { dismissedThisSession = true; },
      },
      onDismiss: () => { dismissedThisSession = true; },
      onAutoClose: () => { dismissedThisSession = true; },
    });
  }, 600);
}
