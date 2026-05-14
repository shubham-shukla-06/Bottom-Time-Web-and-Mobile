// Phase B (web passkeys) — post-login enrollment prompt controller.
//
// Replaces the previous sonner-toast based prompt with a real AlertDialog
// (see ../PasskeyEnrollDialog). This module owns:
//   • a tiny zustand store `usePasskeyEnrollPromptStore` ({ open, show, hide })
//   • the `maybePromptPasskeyEnrollment()` trigger that the post-login hook
//     calls — it sets `open=true` after a short delay so the welcome toast
//     can render first.
//   • a module-scope `dismissedThisSession` flag so the prompt doesn't
//     thrash if the user dismisses it then a stale login event re-fires.
//     (Cleared on full page reload — intentional; brief asks for no
//     persistent skip.)
import { create } from 'zustand';
import {
  passkeysSupported,
  hasPasskeyOnDeviceFlag,
  setPasskeyOnDeviceFlag,
} from '../../api/webauthnClient';

export const usePasskeyEnrollPromptStore = create((set) => ({
  open: false,
  show: () => set({ open: true }),
  hide: () => set({ open: false }),
}));

let dismissedThisSession = false;

export function resetPasskeyEnrollDismissal() {
  dismissedThisSession = false;
}

// Mark the prompt as dismissed for the rest of this page session. Hooked
// into the dialog's onCancel/onAction handlers via the store callback
// pattern below.
function markDismissed() {
  dismissedThisSession = true;
  usePasskeyEnrollPromptStore.getState().hide();
}

// Wire the store so any external `hide()` also flips the dismissed latch.
// (The dialog's Skip / Cancel / outside-click all funnel through `hide()`.)
usePasskeyEnrollPromptStore.subscribe((state, prev) => {
  if (prev.open && !state.open) dismissedThisSession = true;
});

/**
 * Fire the dialog. Returns immediately — non-blocking. Caller should have
 * already verified the precondition (server `has_passkey === false` OR
 * local `bt_passkey_device_id` absent, and login wasn't via passkey).
 */
export function maybePromptPasskeyEnrollment() {
  if (typeof window === 'undefined') return;
  if (!passkeysSupported()) return;
  if (dismissedThisSession) return;
  // Small delay so it doesn't compete visually with the welcome toast.
  setTimeout(() => {
    if (dismissedThisSession) return;
    usePasskeyEnrollPromptStore.getState().show();
  }, 600);
}

// Kept for legacy callers — same semantics as before, just dispatches via
// the store. Not currently used elsewhere.
export const __markDismissed = markDismissed;

/**
 * Shared post-login hook — fire-and-forget. Called by useAuthFlow.completeAuth
 * (OTP / magic-link flow) AND by AuthCallback (Google / Microsoft / Apple
 * OAuth). Pass `loggedInViaPasskey=true` if the login itself used a passkey
 * — that short-circuits the prompt and just stamps the local flag.
 *
 * Decision tree (single source of truth = LOCAL device flag):
 *   • Passkeys unsupported in this browser → noop.
 *   • Logged in via passkey → flag this device, done.
 *   • Else: reset the per-session dismissal; if no local flag → prompt.
 *
 * The previous version queried `/auth/me/has-passkey` and synced the local
 * flag from server state. That caused a regression: a stale server row
 * (e.g. user wiped macOS Keychain or deleted the browser's WebAuthn store)
 * would falsely re-enable the local flag and suppress the enrollment
 * prompt. Server-side `has_passkey === true` cannot prove the credential
 * is still resident on THIS device, so we no longer treat it as a gate.
 */
export async function runPostLoginPasskeyHook(loggedInViaPasskey) {
  if (!passkeysSupported()) return;
  resetPasskeyEnrollDismissal();
  if (loggedInViaPasskey) {
    setPasskeyOnDeviceFlag();
    return;
  }
  const localHas = hasPasskeyOnDeviceFlag();
  if (!localHas) maybePromptPasskeyEnrollment();
}
