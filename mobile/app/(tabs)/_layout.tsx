import React, { useEffect, useMemo } from 'react';
import { Animated, Platform, StyleSheet, View, Easing } from 'react-native';
import { Tabs } from 'expo-router';
import { BottomTabBar, BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from '../../src/components/Icon';
import { Colors } from '../../src/constants/colors';
import { useTabBarStore } from '../../src/stores/tabBarStore';

/**
 * Liquid-glass FLOATING-PILL tab bar.
 *
 * IMPORTANT layout note (Zomato-style island):
 *   Putting the floating-pill geometry (left/right inset, borderRadius,
 *   shadow, height) on `screenOptions.tabBarStyle` does NOT work reliably
 *   on RN-Web — React Navigation's default `BottomTabBar` applies its
 *   own internal layout on top of the supplied style and ends up
 *   rendering edge-to-edge. The fix is to OWN the wrapper ourselves:
 *     1. Render a custom `tabBar` prop.
 *     2. Apply the floating-pill geometry to the OUTER `Animated.View`.
 *     3. Render the BlurView inside that wrapper, clipped by the pill
 *        border-radius via `overflow: 'hidden'`.
 *     4. Let `BottomTabBar` fill the wrapper with a flat transparent
 *        style. Its background is now our BlurView instead of its own.
 *
 * Scroll-hide stays untouched — translateY + opacity remain driven by
 * `useTabBarStore.hidden` via the same `Animated.Value` interpolation.
 */

const BAR_HEIGHT = 60;
// Side inset matches the Discover search + filter pills (14 px).
const SIDE_INSET = 14;

function FloatingPillTabBar({
  baseProps,
  bottomInset,
  translateY,
  opacity,
  hidden,
}: {
  baseProps: BottomTabBarProps;
  bottomInset: number;
  translateY: Animated.AnimatedInterpolation<number>;
  opacity: Animated.AnimatedInterpolation<number>;
  hidden: boolean;
}) {
  return (
    <Animated.View
      pointerEvents={hidden ? 'none' : 'box-none'}
      style={[
        styles.island,
        {
          left: SIDE_INSET,
          right: SIDE_INSET,
          bottom: bottomInset,
          height: BAR_HEIGHT,
          borderRadius: BAR_HEIGHT / 2,
          transform: [{ translateY }],
          opacity,
        },
      ]}
      testID="floating-tab-bar"
    >
      {/* Glass material — BlurView + translucent wash + hairline border +
          1-px inner sheen. Clipped to the pill radius by the parent's
          `overflow: 'hidden'`. */}
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <BlurView
          intensity={Platform.select({ ios: 70, android: 40, default: 50 })}
          tint={Platform.OS === 'ios' ? 'systemChromeMaterialLight' : 'light'}
          style={[StyleSheet.absoluteFill, styles.glassWash]}
        />
        <View pointerEvents="none" style={styles.glassSheen} />
      </View>

      {/* Default tab bar renders inside the island — `style` resets ALL
          the position / shadow / background that BottomTabBar tries to
          paint, so only the touchables show through. */}
      <BottomTabBar
        {...baseProps}
        style={styles.innerTabBar}
      />
    </Animated.View>
  );
}

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const hidden = useTabBarStore((s) => s.hidden);

  // 0 = fully visible, 1 = hidden (translated below screen + faded).
  const anim = useMemo(() => new Animated.Value(0), []);
  useEffect(() => {
    Animated.timing(anim, {
      toValue: hidden ? 1 : 0,
      duration: 220,
      easing: hidden ? Easing.in(Easing.cubic) : Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [hidden, anim]);

  const bottomInset = Math.max(insets.bottom, 10);
  const translateY = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, BAR_HEIGHT + bottomInset + 16],
  });
  const opacity = anim.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });

  return (
    <Tabs
      tabBar={(props) => (
        <FloatingPillTabBar
          baseProps={props}
          bottomInset={bottomInset}
          translateY={translateY}
          opacity={opacity}
          hidden={hidden}
        />
      )}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: Colors.cyan400,
        tabBarInactiveTintColor: Colors.slate500,
        tabBarLabelStyle: { fontSize: 10.5, fontWeight: '600', marginTop: 1 },
        tabBarItemStyle: { paddingVertical: 2 },
        // `tabBarStyle` is intentionally left at default — all layout/
        // shape/material lives on FloatingPillTabBar above. Setting
        // anything here would compete with the wrapper geometry and is
        // exactly what caused the previous "edge-to-edge" regression.
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Discover',
          tabBarIcon: ({ color, size }) => <Icon name="compass-outline" size={size} color={color} />,
          tabBarTestID: 'tab-discover',
        }}
      />
      <Tabs.Screen
        name="shop"
        options={{
          title: 'Shop',
          tabBarIcon: ({ color, size }) => <Icon name="bag-outline" size={size} color={color} />,
          tabBarTestID: 'tab-shop',
        }}
      />
      <Tabs.Screen
        name="community"
        options={{
          title: 'Connect',
          tabBarIcon: ({ color, size }) => <Icon name="people-outline" size={size} color={color} />,
          tabBarTestID: 'tab-community',
        }}
      />
      <Tabs.Screen
        name="dives"
        options={{
          title: 'Dives',
          tabBarIcon: ({ color, size }) => <Icon name="water-outline" size={size} color={color} />,
          tabBarTestID: 'tab-dives',
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size }) => <Icon name="person-outline" size={size} color={color} />,
          tabBarTestID: 'tab-profile',
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  // The Animated.View wrapper IS the floating island. Owns all layout.
  island: {
    position: 'absolute',
    overflow: 'hidden',     // clip BlurView + BottomTabBar to pill radius
    backgroundColor: 'transparent',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(15,23,42,0.10)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 12,
  },
  // BottomTabBar fills the island. Every paint/inset it would draw is
  // suppressed — the visible chrome is OUR BlurView + sheen above.
  innerTabBar: {
    backgroundColor: 'transparent',
    borderTopWidth: 0,
    elevation: 0,
    shadowOpacity: 0,
    position: 'relative',
    left: 0,
    right: 0,
    bottom: 0,
    height: BAR_HEIGHT,
    paddingTop: 6,
    paddingBottom: 6,
  },
  glassWash: {
    backgroundColor: Platform.select({
      ios: 'rgba(255,255,255,0.55)',
      android: 'rgba(255,255,255,0.74)',
      default: 'rgba(255,255,255,0.66)',
    }),
  },
  glassSheen: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.85)',
    opacity: 0.6,
  },
});
