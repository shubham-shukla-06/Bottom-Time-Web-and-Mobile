/**
 * HapticPressable — Pressable wrapper that fires a haptic on press-in.
 *
 * Drop-in for `react-native`'s Pressable. Default intensity is `'light'`;
 * override via `hapticIntensity` prop. Pass `hapticIntensity={null}` to
 * disable haptics for an instance without removing the import.
 *
 * The haptic fires on `onPressIn` (immediate, before the touch lifts)
 * so the feedback feels coupled to the gesture, not the JS handler.
 */
import React from 'react';
import { Pressable, type PressableProps, type GestureResponderEvent } from 'react-native';
import { triggerHaptic, type HapticIntensity } from '../utils/haptics';

interface HapticPressableProps extends PressableProps {
  hapticIntensity?: HapticIntensity | null;
}

export const HapticPressable = React.forwardRef<
  React.ComponentRef<typeof Pressable>,
  HapticPressableProps
>(function HapticPressable(
  { hapticIntensity = 'light', onPressIn, ...rest },
  ref,
) {
  const handlePressIn = (e: GestureResponderEvent) => {
    if (hapticIntensity != null) {
      // Fire-and-forget — never block the consumer's onPressIn handler.
      void triggerHaptic(hapticIntensity);
    }
    if (onPressIn) onPressIn(e);
  };
  return <Pressable ref={ref} onPressIn={handlePressIn} {...rest} />;
});

export default HapticPressable;
