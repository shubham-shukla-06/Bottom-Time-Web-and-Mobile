/**
 * useScrollHaptics — fire a haptic tick every N pixels of scroll.
 *
 * Useful for image carousels (selection on page change), long product
 * lists (subtle confirm-you-are-scrolling feel), and any infinite-feed
 * pattern where a passive selection cue makes the scroll feel "alive".
 *
 * Returns a stable `onScroll` callback to spread into ScrollView or
 * FlatList props. Tracks the last-triggered offset internally with a
 * ref so it doesn't re-render the host on every scroll event.
 *
 * iOS-only by default — Android's vibrator can't render selection
 * haptics distinctly and continuous low-grade vibration is unpleasant.
 */
import { useCallback, useRef } from 'react';
import { Platform, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { triggerHaptic, type HapticIntensity } from '../utils/haptics';

interface UseScrollHapticsOpts {
  /** Fire a haptic every N pixels of scroll. Default 200. */
  every?: number;
  /** Haptic intensity. Default 'selection' (iOS-only ultra-light tick). */
  intensity?: HapticIntensity;
  /** Disable haptics without removing the hook. Default true. */
  enabled?: boolean;
}

export function useScrollHaptics(opts: UseScrollHapticsOpts = {}) {
  const { every = 200, intensity = 'selection', enabled = true } = opts;
  const lastOffsetRef = useRef(0);

  return useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (!enabled) return;
      if (intensity === 'selection' && Platform.OS !== 'ios') return;
      const y = e.nativeEvent.contentOffset.y;
      if (Math.abs(y - lastOffsetRef.current) >= every) {
        lastOffsetRef.current = y;
        void triggerHaptic(intensity);
      }
    },
    [every, intensity, enabled],
  );
}

export default useScrollHaptics;
