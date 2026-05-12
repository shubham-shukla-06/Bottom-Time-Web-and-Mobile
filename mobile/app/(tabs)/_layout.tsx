import React, { useEffect, useMemo } from 'react';
import { Animated, Platform, StyleSheet, View, Easing } from 'react-native';
import { Tabs } from 'expo-router';
import { BottomTabBar } from '@react-navigation/bottom-tabs';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from '../../src/components/Icon';
import { Colors } from '../../src/constants/colors';
import { useTabBarStore } from '../../src/stores/tabBarStore';

/**
 * Liquid-glass FLOATING-PILL tab bar (Zomato-style shape, Apple-iOS-style
 * material).
 *
 * Shape:
 *   • True pill — `borderRadius = height / 2`.
 *   • Side inset 14 px so it visibly floats and matches the search +
 *     filter pills on Discover.
 *
 * Material (platform fork):
 *   • iOS  → `BlurView intensity={70} tint="systemChromeMaterialLight"`.
 *   • Android → BlurView at intensity 40 + translucent white wash
 *     (Android blur is weaker / GPU-cost-prohibitive at higher levels).
 *   • Web → BlurView renders a `div` with `backdrop-filter: blur(...)
 *     saturate(180%)` per `expo-blur` web shim.
 *
 * Polish: hairline border + 1-px inner top-edge sheen + soft drop shadow.
 *
 * Scroll-hide: subscribes to `useTabBarStore.hidden` and animates a
 * shared `Animated.Value` for translateY (0 → BAR_OFFSCREEN) + opacity
 * (1 → 0). All native-driven. Each scrollable screen calls
 * `useTabBarOnScroll()` to report scroll Y.
 */
function GlassMaterial() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <BlurView
        intensity={Platform.select({ ios: 70, android: 40, default: 50 })}
        tint={Platform.OS === 'ios' ? 'systemChromeMaterialLight' : 'light'}
        style={[StyleSheet.absoluteFill, styles.glass]}
      />
      <View pointerEvents="none" style={styles.glassSheen} />
    </View>
  );
}

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const hidden = useTabBarStore((s) => s.hidden);
  const BAR_HEIGHT = 60;
  // 0 = fully visible, 1 = hidden (off-screen below). Animated.spring
  // gives the Zomato bouncy reveal; we use timing with `useNativeDriver:
  // true` for a 200 ms linear-out feel.
  const anim = useMemo(() => new Animated.Value(0), []);
  useEffect(() => {
    Animated.timing(anim, {
      toValue: hidden ? 1 : 0,
      duration: 220,
      easing: hidden ? Easing.in(Easing.cubic) : Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [hidden, anim]);

  const translateY = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, BAR_HEIGHT + Math.max(insets.bottom, 10) + 16],
  });
  const opacity = anim.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });

  return (
    <Tabs
      // Wrap the default tab bar in an Animated.View driving translateY +
      // opacity so the bar smoothly slides off-screen on scroll-down and
      // back on scroll-up. Native driver for 60fps on Android.
      tabBar={(props) => (
        <Animated.View
          pointerEvents={hidden ? 'none' : 'auto'}
          style={{ transform: [{ translateY }], opacity }}
        >
          <BottomTabBar {...props} />
        </Animated.View>
      )}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: Colors.cyan400,
        tabBarInactiveTintColor: Colors.slate500,
        tabBarStyle: {
          position: 'absolute',
          left: 14,
          right: 14,
          bottom: Math.max(insets.bottom, 10),
          height: BAR_HEIGHT,
          paddingTop: 6,
          paddingBottom: 6,
          backgroundColor: 'transparent',
          borderTopWidth: 0,
          // True pill — height / 2 — matches Zomato silhouette + the
          // search/filter pills on Discover.
          borderRadius: BAR_HEIGHT / 2,
          overflow: 'hidden',
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: 0.12,
          shadowRadius: 16,
          elevation: 12,
        },
        tabBarBackground: () => <GlassMaterial />,
        tabBarLabelStyle: { fontSize: 10.5, fontWeight: '600', marginTop: 1 },
        tabBarItemStyle: { paddingVertical: 2 },
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
  glass: {
    backgroundColor: Platform.select({
      ios: 'rgba(255,255,255,0.55)',
      android: 'rgba(255,255,255,0.74)',
      default: 'rgba(255,255,255,0.66)',
    }),
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(15,23,42,0.10)',
    // BlurView fills the parent Tabs.Screen tabBarStyle — radius already
    // applied at that level, but we inherit it here so the glass clips
    // cleanly even when iOS rasterises the blur layer separately.
    borderRadius: 999,
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
