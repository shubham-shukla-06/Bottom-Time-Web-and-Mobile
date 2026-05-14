/**
 * Global zustand store controlling the biometric-enrollment sheet that
 * appears after a non-biometric login (email OTP / phone OTP / OAuth).
 *
 * The sheet UI itself is `components/auth/GlobalBiometricSheet.tsx`,
 * mounted once at the root of `app/_layout.tsx` so it overlays any route.
 *
 * `dismissedThisSession` mirrors the web `resetPasskeyEnrollDismissal`
 * behaviour from 199e445 — in-memory only, intentionally NOT persisted to
 * SecureStore. The post-login hook calls `resetDismissal()` on every fresh
 * login so the prompt re-appears next time until the user actually enrolls.
 */
import { create } from 'zustand';

interface State {
  open: boolean;
  dismissedThisSession: boolean;
  show: () => void;
  hide: () => void;
  dismiss: () => void;
  resetDismissal: () => void;
}

const useBiometricPromptStore = create<State>((set) => ({
  open: false,
  dismissedThisSession: false,
  show: () => set({ open: true }),
  hide: () => set({ open: false }),
  dismiss: () => set({ open: false, dismissedThisSession: true }),
  resetDismissal: () => set({ dismissedThisSession: false }),
}));

export default useBiometricPromptStore;
