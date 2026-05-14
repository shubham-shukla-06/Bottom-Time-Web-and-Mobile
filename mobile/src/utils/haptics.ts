/**
 * Haptics wrapper — single entry point for tactile feedback across the app.
 *
 * Why this lives in /utils and not inline:
 *  - Centralises platform gating (selection haptics are iOS-only because
 *    Android can't distinguish them from impact haptics).
 *  - Centralises try/catch so callers don't need to defensively handle
 *    devices without haptic hardware (older Android, web).
 *  - Keeps the `expo-haptics` import surface in one place — easier to
 *    swap or extend later (e.g. a `useHaptic({ enabled })` user setting).
 *
 * Intensity vocabulary:
 *  - `light` / `medium` / `heavy`  : impact taps (button presses)
 *  - `selection`                   : iOS-only ultra-light tick (chip toggles, scroll-snap)
 *  - `success` / `warning` / `error` : notification-style multi-pulse (form completions)
 */
import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

export type HapticIntensity =
  | 'light'
  | 'medium'
  | 'heavy'
  | 'selection'
  | 'success'
  | 'warning'
  | 'error';

export async function triggerHaptic(intensity: HapticIntensity): Promise<void> {
  try {
    switch (intensity) {
      case 'light':
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        return;
      case 'medium':
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        return;
      case 'heavy':
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        return;
      case 'selection':
        // Selection haptic is iOS-only — Android's vibrator can't render
        // the ultra-light tick that makes selection distinct from impact,
        // and a fallback to impact would feel wrong (too heavy for a
        // chip toggle).
        if (Platform.OS === 'ios') {
          await Haptics.selectionAsync();
        }
        return;
      case 'success':
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        return;
      case 'warning':
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        return;
      case 'error':
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        return;
    }
  } catch {
    // Silently swallow — no haptic hardware (older Android, web). Never
    // surface as a user-visible failure; haptics are always best-effort.
  }
}
