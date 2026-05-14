/**
 * Toast — minimal bottom-anchored notification primitive.
 *
 * Purpose: surface transient, dismissible messages (errors, successes,
 * info) that should NOT block UI but also shouldn't disappear silently.
 * Built bespoke (no external lib) to keep the bundle small and the
 * presentation consistent with the app's design language.
 *
 * Usage:
 *   import { toast } from '../components/Toast';
 *   toast.error('Apple sign-in failed. Please try again or use email.');
 *   toast.success('Profile saved.');
 *   toast.info('Slider snapped to new bounds.', { duration: 2500 });
 *
 *   // Mount once at app root:
 *   <ToastHost />
 *
 * Behaviour:
 *  - Slide in from below + fade in via Reanimated (~220 ms).
 *  - Auto-dismisses after `duration` ms (default 4000).
 *  - Tap anywhere on the toast to dismiss immediately.
 *  - Only one toast visible at a time — calling `toast.x(...)` while
 *    another is showing replaces the current one (auto-dismiss timer
 *    resets).
 *  - Position: anchored to the bottom safe-area inset + TAB_BAR_HEIGHT
 *    (the floating pill cleared) + 12 px.
 */
import React, { useEffect, useRef, useSyncExternalStore } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AlertCircle, Check, Info, X } from 'lucide-react-native';
import { Text } from './Text';
import { Colors } from '../constants/colors';
import { TAB_BAR_HEIGHT } from '../constants/tabBar';

type Variant = 'error' | 'success' | 'info';

interface ToastState {
  id: number;
  message: string;
  variant: Variant;
  duration: number;
}

// Tiny module-scoped pub/sub. Avoids pulling in zustand for a single
// ephemeral piece of state. `current` is null when no toast is visible.
let current: ToastState | null = null;
const listeners = new Set<() => void>();
let nextId = 1;

function emit() {
  for (const l of listeners) l();
}

function show(variant: Variant, message: string, opts?: { duration?: number }) {
  current = {
    id: nextId++,
    message,
    variant,
    duration: opts?.duration ?? 4000,
  };
  emit();
}

function dismiss() {
  if (current) {
    current = null;
    emit();
  }
}

export const toast = {
  error: (message: string, opts?: { duration?: number }) => show('error', message, opts),
  success: (message: string, opts?: { duration?: number }) => show('success', message, opts),
  info: (message: string, opts?: { duration?: number }) => show('info', message, opts),
  dismiss,
};

// Per-variant visual treatment. Color tokens are inline rather than added
// to `Colors` since they're cosmetic-only and Toast is the sole consumer.
const VARIANT_STYLE: Record<Variant, {
  bg: string;
  text: string;
  border: string;
  Icon: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
}> = {
  error: {
    bg: '#FEF2F2',         // red-50
    text: '#991B1B',       // red-800
    border: '#FCA5A5',     // red-300
    Icon: AlertCircle,
  },
  success: {
    bg: '#ECFDF5',         // emerald-50
    text: '#065F46',       // emerald-800
    border: '#6EE7B7',     // emerald-300
    Icon: Check,
  },
  info: {
    bg: Colors.slate100,
    text: Colors.slate900,
    border: Colors.slate300,
    Icon: Info,
  },
};

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}
function getSnapshot() { return current; }

/**
 * Mount once at the app root (after navigator, inside any ThemeProvider).
 * Re-renders whenever `toast.error/success/info/dismiss` is called.
 */
export function ToastHost() {
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const insets = useSafeAreaInsets();
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(20);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (state) {
      // Animate in.
      opacity.value = withTiming(1, { duration: 220, easing: Easing.out(Easing.cubic) });
      translateY.value = withTiming(0, { duration: 220, easing: Easing.out(Easing.cubic) });
      // Schedule auto-dismiss.
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        opacity.value = withTiming(0, { duration: 180, easing: Easing.in(Easing.cubic) });
        translateY.value = withTiming(20, { duration: 180, easing: Easing.in(Easing.cubic) });
        setTimeout(() => toast.dismiss(), 200);
      }, state.duration);
    } else {
      opacity.value = 0;
      translateY.value = 20;
      if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [state, opacity, translateY]);

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  if (!state) return null;

  const v = VARIANT_STYLE[state.variant];
  const IconEl = v.Icon;
  // Clear the floating pill tab bar + home-indicator safe area + a small
  // breathing gap so the toast doesn't visually collide with bottom chrome.
  const bottom = insets.bottom + TAB_BAR_HEIGHT + 12;

  return (
    <View pointerEvents="box-none" style={[styles.host, { bottom }]}>
      <Animated.View style={[styles.cardWrap, animStyle]}>
        <Pressable
          onPress={() => toast.dismiss()}
          style={[styles.card, { backgroundColor: v.bg, borderColor: v.border }]}
          testID={`toast-${state.variant}`}
        >
          <IconEl size={18} color={v.text} strokeWidth={2.2} />
          <Text style={[styles.message, { color: v.text }]} numberOfLines={3}>
            {state.message}
          </Text>
          <X size={16} color={v.text} strokeWidth={2} />
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 9999,
    elevation: 9999,
  },
  cardWrap: {
    maxWidth: '92%',
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  message: {
    flexShrink: 1,
    fontSize: 14,
    lineHeight: 18,
  },
});
