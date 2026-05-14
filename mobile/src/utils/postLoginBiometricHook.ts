/**
 * Shared post-login hook — fire-and-forget. Called by every login success
 * path on mobile (verify.tsx OTP, WelcomeView.onSocial OAuth,
 * biometric-resume.tsx biometric re-login). Pass `loggedInViaBiometric=true`
 * if the login itself used biometric — that short-circuits the prompt since
 * the user just authenticated with a biometric and the `bt_biometric_enabled`
 * flag is already set as a side-effect of the resume flow.
 *
 * Mirror of web's `runPostLoginPasskeyHook` from commit 36252c6, adapted to
 * the mobile biometric concept (no WebAuthn — uses expo-local-authentication
 * + SecureStore refresh-token, see services/secureSession.ts).
 *
 * Decision tree:
 *   • Web platform → noop (mobile-only feature).
 *   • loggedInViaBiometric === true → noop (just authed with biometric).
 *   • Else: reset the per-session dismissal latch, check
 *     isBiometricEnabled() + isBiometricAvailable(); if biometric hardware
 *     exists AND not yet enrolled → fire the global enrollment prompt.
 */
import { Platform } from 'react-native';
import { isBiometricAvailable } from '../services/biometric';
import { isBiometricEnabled } from '../services/secureSession';
import useBiometricPromptStore from '../stores/biometricPromptStore';

export async function runPostLoginBiometricHook(
  loggedInViaBiometric: boolean,
): Promise<void> {
  if (Platform.OS === 'web') return;
  if (loggedInViaBiometric) return;
  // Fresh login event — clear any prior "skip for now" so the dialog can
  // re-appear if conditions still warrant it.
  useBiometricPromptStore.getState().resetDismissal();
  try {
    const [enabled, available] = await Promise.all([
      isBiometricEnabled(),
      isBiometricAvailable(),
    ]);
    if (!enabled && available) {
      useBiometricPromptStore.getState().show();
    }
  } catch {
    // Silent — failing to fire the enrollment prompt must never block
    // post-login navigation.
  }
}
