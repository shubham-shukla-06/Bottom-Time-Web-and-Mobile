/**
 * Global biometric-enrollment sheet — mounted once at the root of
 * `app/_layout.tsx` so it can overlay any post-login route (/(tabs), etc.).
 * Visibility is driven by `biometricPromptStore`, which is opened by
 * `runPostLoginBiometricHook(false)` after a non-biometric login.
 *
 * Reuses the existing `BiometricEnrollmentSheet` primitive — no new UI.
 * "Enable" calls authStore.enrollBiometric() (which writes the refresh
 * token into SecureStore + stamps `bt_biometric_enabled='1'` — see
 * stores/authStore.ts:117-131). "Not now" dismisses for this session only;
 * the next fresh login resets the latch via the hook's resetDismissal().
 */
import React from 'react';
import useAuthStore from '../../stores/authStore';
import useBiometricPromptStore from '../../stores/biometricPromptStore';
import BiometricEnrollmentSheet from './BiometricEnrollmentSheet';

export default function GlobalBiometricSheet() {
  const open = useBiometricPromptStore((s) => s.open);
  const dismiss = useBiometricPromptStore((s) => s.dismiss);
  const hide = useBiometricPromptStore((s) => s.hide);
  const enrollBiometric = useAuthStore((s) => s.enrollBiometric);

  const onEnable = async () => {
    await enrollBiometric();
    hide();
  };
  // Per brief: "Skip for now" must NOT persist — the prompt should re-appear
  // on next login until biometric is enrolled. So we only set the in-memory
  // `dismissedThisSession` flag (via store.dismiss()) — NO SecureStore write.
  const onSkip = () => { dismiss(); };

  return (
    <BiometricEnrollmentSheet
      visible={open}
      onEnable={onEnable}
      onSkip={onSkip}
    />
  );
}
