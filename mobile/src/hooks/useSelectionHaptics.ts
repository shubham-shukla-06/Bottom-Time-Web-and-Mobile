/**
 * useSelectionHaptics — tiny ergonomic shortcut for selection haptics.
 *
 * Use this in chip toggles, filter selections, segmented control taps —
 * places where the user is making a discrete choice and a subtle "tick"
 * confirms it without feeling tactile/forceful.
 *
 * Returns `{ fire }` to keep the shape parallel to other haptic-style
 * hooks and leave room for future extensions (`{ fire, fireBurst }`).
 */
import { useCallback } from 'react';
import { triggerHaptic } from '../utils/haptics';

export function useSelectionHaptics() {
  const fire = useCallback(() => {
    void triggerHaptic('selection');
  }, []);
  return { fire };
}

export default useSelectionHaptics;
