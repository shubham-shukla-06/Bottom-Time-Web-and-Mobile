import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { Tabs } from 'expo-router';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from '../../src/components/Icon';
import { Colors } from '../../src/constants/colors';

/**
 * Liquid-glass floating tab bar.
 *
 * iOS  — `BlurView` with `tint="systemChromeMaterialLight"` reproduces
 *        the Apple "thick-material" blur (≈ what iOS uses for nav/tab
 *        bars in 17+). Pure native blur, GPU-accelerated.
 * Android — `BlurView` falls back to a translucent white at intensity≥30
 *        with a subtle gradient — RN-iOS-style blur is approximated.
 * Web   — `BlurView` from `expo-blur` renders a `div` with
 *        `backdrop-filter: blur(40px) saturate(180%)` (the docs-recommended
 *        web shim). We layer a 1px hairline border + inner-top highlight
 *        on top to recover the "glass sheen" look that the blur alone
 *        can't deliver.
 *
 * Floating-island geometry: 12 px horizontal inset, rounded 28 px, sits
 * `insets.bottom + 8` from the screen bottom. Active icon tint stays
 * cyan-400 per design.
 */
function LiquidGlassBackground() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <BlurView
        intensity={Platform.select({ ios: 60, android: 40, default: 50 })}
        tint={Platform.OS === 'ios' ? 'systemChromeMaterialLight' : 'light'}
        style={[StyleSheet.absoluteFill, styles.glass]}
      />
      {/* Inner top-edge highlight — adds the subtle "sheen" that real
          glass gets from the light source above it. */}
      <View pointerEvents="none" style={styles.glassSheen} />
    </View>
  );
}

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  // Total tab-bar height inc. label + bottom inset.
  const BAR_HEIGHT = 62;
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: Colors.cyan400,
        tabBarInactiveTintColor: Colors.slate500,
        // Floating glass island — transparent so BlurView shows through.
        tabBarStyle: {
          position: 'absolute',
          left: 12,
          right: 12,
          bottom: Math.max(insets.bottom, 10),
          height: BAR_HEIGHT,
          paddingTop: 8,
          paddingBottom: 8,
          backgroundColor: 'transparent',
          borderTopWidth: 0,         // hairline lives inside the glass component
          borderRadius: 28,
          overflow: 'hidden',
          // Soft drop shadow so the island visibly floats above content.
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: 0.12,
          shadowRadius: 16,
          elevation: 12,
        },
        tabBarBackground: () => <LiquidGlassBackground />,
        tabBarLabelStyle: {
          fontSize: 10.5,
          fontWeight: '600',
          marginTop: 2,
        },
        tabBarItemStyle: { paddingVertical: 2 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Discover',
          tabBarIcon: ({ color, size }) => (
            <Icon name="compass-outline" size={size} color={color} />
          ),
          tabBarTestID: 'tab-discover',
        }}
      />
      <Tabs.Screen
        name="shop"
        options={{
          title: 'Shop',
          tabBarIcon: ({ color, size }) => (
            <Icon name="bag-outline" size={size} color={color} />
          ),
          tabBarTestID: 'tab-shop',
        }}
      />
      <Tabs.Screen
        name="community"
        options={{
          title: 'Connect',
          tabBarIcon: ({ color, size }) => (
            <Icon name="people-outline" size={size} color={color} />
          ),
          tabBarTestID: 'tab-community',
        }}
      />
      <Tabs.Screen
        name="dives"
        options={{
          title: 'Dives',
          tabBarIcon: ({ color, size }) => (
            <Icon name="water-outline" size={size} color={color} />
          ),
          tabBarTestID: 'tab-dives',
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size }) => (
            <Icon name="person-outline" size={size} color={color} />
          ),
          tabBarTestID: 'tab-profile',
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  glass: {
    // BlurView alone reads slightly cold on web — overlay a faint white
    // wash so the glass picks up the brand's bright/clean character.
    backgroundColor: Platform.select({
      ios: 'rgba(255,255,255,0.55)',
      android: 'rgba(255,255,255,0.72)',
      default: 'rgba(255,255,255,0.62)',
    }),
    // Hairline border for the "floating glass island" silhouette.
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(15,23,42,0.10)',
    borderRadius: 28,
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
