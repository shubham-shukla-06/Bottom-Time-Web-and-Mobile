import React, { useEffect, useMemo } from 'react';
import { Animated, Platform, Pressable, StyleSheet, View, Easing } from 'react-native';
import { Text } from '../../src/components/Text';
import { Tabs } from 'expo-router';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
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
// Icon + label sizing — 25% smaller icon (24 → 18) and a label sized
// for legibility WITHOUT descender clipping. The earlier 12.5 px label
// was cropping its bottom edge against the inner-tabBar's 6 px bottom
// padding; we now use 11 px with an explicit `lineHeight` ≈ fontSize ×
// 1.36 so descenders ("p" in Profile) render fully inside the box.
// Single source of truth so every Tabs.Screen renders consistently.
const TAB_ICON_SIZE = 18;
const TAB_LABEL_FONT_SIZE = 11;
const TAB_LABEL_LINE_HEIGHT = 15;

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
  const { state, descriptors, navigation } = baseProps;
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

      {/* Custom tab row.
          The default `BottomTabBar` from React Navigation v7 ignores any
          `style` prop passed through JSX, so paddingHorizontal applied
          there silently no-ops (we verified by inspector). We render the
          5 tab items ourselves from `descriptors + state` — full control
          over horizontal padding so the cluster tightens cleanly. */}
      <View style={styles.tabRow}>
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          const isFocused = state.index === index;
          const color = isFocused ? Colors.cyan400 : Colors.slate500;
          const label =
            typeof options.tabBarLabel === 'string'
              ? options.tabBarLabel
              : (options.title ?? route.name);
          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });
            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name as never, route.params as never);
            }
          };
          const onLongPress = () => {
            navigation.emit({ type: 'tabLongPress', target: route.key });
          };
          // Render the icon via the screenOption-provided factory so the
          // size + colour rules stay declared in one place.
          const iconNode = options.tabBarIcon
            ? options.tabBarIcon({ focused: isFocused, color, size: TAB_ICON_SIZE })
            : null;
          return (
            <Pressable
              key={route.key}
              accessibilityRole="button"
              accessibilityState={isFocused ? { selected: true } : {}}
              accessibilityLabel={options.tabBarAccessibilityLabel}
              testID={options.tabBarTestID}
              onPress={onPress}
              onLongPress={onLongPress}
              style={styles.tabItem}
            >
              {iconNode}
              <Text
                numberOfLines={1}
                style={[
                  styles.tabLabel,
                  { color },
                ]}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
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
        // CRITICAL for iOS native: `@react-navigation/bottom-tabs` paints
        // its own scene container behind each tab's screen, defaulting
        // to the platform system grey on iOS (#f2f2f7). Without this
        // override, cream leaks behind tabbed screens regardless of any
        // `ThemeProvider` or root Stack `contentStyle`. Both keys are
        // set because RN-Navigation v7 renamed the prop mid-cycle and
        // different point-releases honour different names. Explicit
        // literal '#ffffff' (not `Colors.white`) to remove any
        // build-time import indirection.
        sceneContainerStyle: { backgroundColor: '#ffffff' },
        sceneStyle: { backgroundColor: '#ffffff' },
        tabBarLabelStyle: {
          fontSize: TAB_LABEL_FONT_SIZE,
          // Explicit lineHeight prevents descender clipping (the bottom
          // of "p" in "Profile" was getting cut off against the 6 px
          // bottom padding when only fontSize was specified).
          lineHeight: TAB_LABEL_LINE_HEIGHT,
          fontWeight: '600',
          marginTop: 1,
          // RN-Web wraps the label in a div with the default
          // text-overflow / box rules; `includeFontPadding: false` is
          // Android-only and harmless on iOS / web.
          includeFontPadding: false,
        },
        // Tighten the cluster of 5 tab items by ~17%: each item gives
        // up 7 px of horizontal padding (was inherited default ~0).
        // Combined with the wrapping pill (402 px wide), the tab
        // touchable area drops from ~80 px to ~66 px wide while every
        // hit target remains comfortably above the 44 px minimum.
        tabBarItemStyle: { paddingVertical: 2, paddingHorizontal: 7 },
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
          tabBarIcon: ({ color }) => <Icon name="compass-outline" size={TAB_ICON_SIZE} color={color} />,
          tabBarTestID: 'tab-discover',
        }}
      />
      <Tabs.Screen
        name="shop"
        options={{
          title: 'Shop',
          tabBarIcon: ({ color }) => <Icon name="bag-outline" size={TAB_ICON_SIZE} color={color} />,
          tabBarTestID: 'tab-shop',
        }}
      />
      <Tabs.Screen
        name="community"
        options={{
          title: 'Connect',
          tabBarIcon: ({ color }) => <Icon name="people-outline" size={TAB_ICON_SIZE} color={color} />,
          tabBarTestID: 'tab-community',
        }}
      />
      <Tabs.Screen
        name="dives"
        options={{
          title: 'Dives',
          tabBarIcon: ({ color }) => <Icon name="water-outline" size={TAB_ICON_SIZE} color={color} />,
          tabBarTestID: 'tab-dives',
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color }) => <Icon name="person-outline" size={TAB_ICON_SIZE} color={color} />,
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
  // Horizontal tab row inside the island. Using explicit `width`/`height`
  // 100% rather than `flex: 1` because the absoluteFill glass sibling
  // confuses RN-Web's flex resolver and the row collapses into a column.
  tabRow: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 32,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
    minHeight: 44,
  },
  // `lineHeight` ≈ fontSize × 1.36 so descenders never clip against
  // the bottom edge of the bar. `marginTop: 2` lifts the label clear
  // of the icon without crowding it.
  tabLabel: {
    fontSize: TAB_LABEL_FONT_SIZE,
    lineHeight: TAB_LABEL_LINE_HEIGHT,
    fontWeight: '600',
    marginTop: 2,
    includeFontPadding: false,
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
