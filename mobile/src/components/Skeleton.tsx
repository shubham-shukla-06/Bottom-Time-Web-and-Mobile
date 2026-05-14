/**
 * Skeleton — animated loading placeholder primitive.
 *
 * Renders a solid slate-200 block with a moving light gradient sweeping
 * left-to-right via Reanimated. Used as the building block for composite
 * skeleton layouts (DiscoverListSkeleton, ListingDetailSkeleton, etc.)
 * that mirror the eventual content's geometry — so the swap-in from
 * skeleton to real content is visually seamless.
 *
 * Performance:
 *  - Each instance owns a single `useSharedValue` driving the gradient
 *    translateX; Reanimated handles the loop on the UI thread.
 *  - No JS-thread reflow during the shimmer (style is animated via
 *    `useAnimatedStyle`).
 *
 * iOS + Android + Web all fine.
 */
import React, { useEffect } from 'react';
import { StyleSheet, View, type ViewStyle, type DimensionValue } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors } from '../constants/colors';

interface SkeletonProps {
  width: DimensionValue;
  height: number;
  borderRadius?: number;
  style?: ViewStyle;
}

export function Skeleton({ width, height, borderRadius = 4, style }: SkeletonProps) {
  const progress = useSharedValue(-1);

  useEffect(() => {
    progress.value = withRepeat(
      withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
      -1, // infinite
      false,
    );
  }, [progress]);

  const animStyle = useAnimatedStyle(() => {
    // Slide a gradient across the width of the box. The width of the
    // gradient is roughly the same as the box width, so translateX of
    // `-w` parks it just off the left edge and `+w` just off the right.
    // We use a normalized 0..1 progress and multiply by 2x width to span
    // the visible range.
    const tx = progress.value * 200;
    return {
      transform: [{ translateX: tx }],
    };
  });

  return (
    <View
      style={[
        styles.base,
        { width, height, borderRadius },
        style,
      ]}
    >
      <Animated.View style={[StyleSheet.absoluteFillObject, animStyle]}>
        <LinearGradient
          colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.55)', 'rgba(255,255,255,0)']}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFillObject}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: Colors.slate200,
    overflow: 'hidden',
  },
});

export default Skeleton;
