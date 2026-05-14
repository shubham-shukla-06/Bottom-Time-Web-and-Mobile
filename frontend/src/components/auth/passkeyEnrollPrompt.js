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
import { passkeysSupported } from '../../api/webauthnClient';

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
