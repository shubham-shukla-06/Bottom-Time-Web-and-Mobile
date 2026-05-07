// Phase B (web passkeys) — post-OTP enrollment prompt.
//
// Shown once after a successful OTP login/signup, asking if the user wants
// to add a passkey for next time. Snoozable for 14 days via localStorage:
//   bt:passkey_prompt_skipped_until -> ISO date string.
//
// Skipped silently when:
//   • passkeysSupported() is false
//   • the user already has at least one passkey on this account (we don't
//     bother checking server-side at this point — a no-op on the second
//     enrollment is fine)
//   • the snooze window hasn't expired

import { toast } from 'sonner';
import { passkeysSupported, registerPasskey } from '../../api/webauthnClient';

const SKIP_KEY = 'bt:passkey_prompt_skipped_until';
const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;

function snoozed() {
  try {
    const v = localStorage.getItem(SKIP_KEY);
    if (!v) return false;
    const until = Date.parse(v);
    return Number.isFinite(until) && Date.now() < until;
  } catch { return false; }
}

function snoozeFor14Days() {
  try {
    localStorage.setItem(
      SKIP_KEY,
      new Date(Date.now() + FOURTEEN_DAYS_MS).toISOString(),
    );
  } catch { /* private mode */ }
}

export function clearPasskeyPromptSnooze() {
  try { localStorage.removeItem(SKIP_KEY); } catch { /* noop */ }
}

/**
 * Fire the toast. Returns immediately — non-blocking. Safe to call
 * from any successful login/signup path.
 */
export function maybePromptPasskeyEnrollment() {
  if (typeof window === 'undefined') return;
  if (!passkeysSupported()) return;
  if (snoozed()) return;

  // Slight delay so it doesn't compete visually with the "Welcome back" toast.
  setTimeout(() => {
    toast('Sign in faster next time', {
      description: 'Add a passkey to skip the OTP step on this browser.',
      duration: 10000,
      action: {
        label: 'Set up',
        onClick: async () => {
          try {
            const result = await registerPasskey();
            toast.success(`Passkey added: ${result.label}`);
            clearPasskeyPromptSnooze();
          } catch (err) {
            const name = err?.name || '';
            if (name === 'NotAllowedError' || name === 'AbortError') {
              snoozeFor14Days();
            } else {
              const msg = err?.response?.data?.detail || 'Could not set up passkey';
              toast.error(typeof msg === 'string' ? msg : 'Could not set up passkey');
            }
          }
        },
      },
      cancel: {
        label: 'Not now',
        onClick: () => snoozeFor14Days(),
      },
      onDismiss: () => snoozeFor14Days(),
      onAutoClose: () => snoozeFor14Days(),
    });
  }, 600);
}
