/**
 * Pill / Chip — pixel-mirrors Bottom Time web spec (Discover, Shop).
 * Web Tailwind: `px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap`
 * Resolved:    paddingHorizontal 14, paddingVertical 6, borderRadius 9999,
 *              fontSize 12, fontWeight '600', height ~28
 *
 * Active:    bg-cyan-400 (#22d3ee) text-white shadow-sm
 * Inactive:  bg-slate-100 (#f1f5f9) text-slate-600 (#475569)
 * Disabled:  bg-slate-50 (#f8fafc) text-slate-300 (#cbd5e1)
 * Count badge inactive: bg-cyan-100 text-cyan-400, 18×18 circle, 10 px 700.
 * Count badge active:   bg-white/25 text-white, same dimensions.
 */
import React from 'react';
import { Pressable, View, StyleSheet, Platform } from 'react-native';
import { Text } from '../Text';
import { Colors } from '../../constants/colors';

interface Props {
  active?: boolean;
  disabled?: boolean;
  onPress?: () => void;
  testID?: string;
  leftIcon?: React.ReactNode;
  count?: number;
  children: React.ReactNode;
}

export default function Chip({ active, disabled, onPress, testID, leftIcon, count, children }: Props) {
  const bg = active ? Colors.cyan400 : disabled ? Colors.slate50 : Colors.slate100;
  const fg = active ? Colors.white : disabled ? Colors.slate300 : Colors.slate600;
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.base,
        { backgroundColor: bg },
        active && styles.activeShadow,
        pressed && !active && { backgroundColor: Colors.slate200 },
      ]}
    >
      {leftIcon ? <View style={styles.leadingIcon}>{leftIcon}</View> : null}
      {typeof children === 'string' ? (
        <Text numberOfLines={1} style={[styles.label, { color: fg }]}>{children}</Text>
      ) : (
        children
      )}
      {typeof count === 'number' ? (
        <View style={[styles.badge, { backgroundColor: active ? 'rgba(255,255,255,0.25)' : Colors.cyan100 }]}>
          <Text style={[styles.badgeText, { color: active ? Colors.white : Colors.cyan400 }]}>{count}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',  // chip never stretches; never grows past its content
    flexShrink: 0,
    paddingHorizontal: 14,    // px-3.5
    paddingVertical: 6,       // py-1.5
    borderRadius: 9999,       // rounded-full
    gap: 6,                   // gap-1.5
  },
  activeShadow: Platform.select({
    web: { boxShadow: '0 1px 2px 0 rgba(34,211,238,0.20)' } as any,
    default: { shadowColor: Colors.cyan400, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.2, shadowRadius: 2, elevation: 1 },
  }) as any,
  leadingIcon: { width: 14, height: 14, alignItems: 'center', justifyContent: 'center' },
  label: {
    fontSize: 12,
    fontWeight: '600',
    fontFamily: Platform.OS === 'web' ? 'Outfit, sans-serif' : 'Outfit_600SemiBold',
    includeFontPadding: false,
  },
  badge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9999,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
    fontFamily: Platform.OS === 'web' ? 'Outfit, sans-serif' : 'Outfit_700Bold',
    includeFontPadding: false,
  },
});
