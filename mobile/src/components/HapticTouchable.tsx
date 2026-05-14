/**
 * HapticTouchable — TouchableOpacity wrapper that fires a haptic on press-in.
 *
 * Drop-in for `react-native`'s TouchableOpacity. The existing codebase has
 * ~42 files using TouchableOpacity; this wrapper lets each be migrated
 * with a single import-line change instead of switching primitives.
 *
 * API mirrors HapticPressable for consistency: same `hapticIntensity` prop,
 * same `null` opt-out, same press-in trigger timing.
 */
import React from 'react';
import { TouchableOpacity, type TouchableOpacityProps, type GestureResponderEvent } from 'react-native';
import { triggerHaptic, type HapticIntensity } from '../utils/haptics';

interface HapticTouchableProps extends TouchableOpacityProps {
  hapticIntensity?: HapticIntensity | null;
}

export const HapticTouchable = React.forwardRef<
  React.ComponentRef<typeof TouchableOpacity>,
  HapticTouchableProps
>(function HapticTouchable(
  { hapticIntensity = 'light', onPressIn, ...rest },
  ref,
) {
  const handlePressIn = (e: GestureResponderEvent) => {
    if (hapticIntensity != null) {
      void triggerHaptic(hapticIntensity);
    }
    if (onPressIn) onPressIn(e);
  };
  return <TouchableOpacity ref={ref} onPressIn={handlePressIn} {...rest} />;
});

export default HapticTouchable;
