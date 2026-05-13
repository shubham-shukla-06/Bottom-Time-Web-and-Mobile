/**
 * Mirror of frontend/src/components/ui/badge.jsx (shadcn Badge).
 *  Base:  rounded-md, border, px-2.5, py-0.5, text-xs (12px), font-semibold (600).
 *  Variants:
 *    default     bg-primary (slate-900) text-white
 *    secondary   bg-slate-100  text-slate-900
 *    destructive bg-rose-500   text-white
 *    outline     transparent + border + slate-900 text
 *    cyan        bg-cyan-400   text-slate-900   (Bottom Time accent)
 *    success     bg-green-100  text-green-700
 *    warning     bg-amber-100  text-amber-700
 */
import React from 'react';
import { View, StyleSheet, ViewStyle, StyleProp, Platform } from 'react-native';
import { Text } from '../Text';
import { Colors } from '../../constants/colors';

export type BadgeVariant =
  | 'default'
  | 'secondary'
  | 'destructive'
  | 'outline'
  | 'cyan'
  | 'success'
  | 'warning';

interface Props {
  variant?: BadgeVariant;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  children: React.ReactNode;
  uppercase?: boolean;
}

function variantStyle(v: BadgeVariant): { bg: string; fg: string; border: string } {
  switch (v) {
    case 'secondary':
      return { bg: Colors.slate100, fg: Colors.slate900, border: 'transparent' };
    case 'destructive':
      return { bg: Colors.accent, fg: Colors.white, border: 'transparent' };
    case 'outline':
      return { bg: 'transparent', fg: Colors.slate900, border: Colors.border };
    case 'cyan':
      return { bg: Colors.cyan100, fg: Colors.cyan500, border: 'transparent' };
    case 'success':
      return { bg: '#dcfce7', fg: '#15803d', border: 'transparent' };
    case 'warning':
      return { bg: '#fef3c7', fg: '#b45309', border: 'transparent' };
    case 'default':
    default:
      return { bg: Colors.slate900, fg: Colors.white, border: 'transparent' };
  }
}

export default function Badge({ variant = 'default', style, testID, children, uppercase }: Props) {
  const v = variantStyle(variant);
  return (
    <View
      testID={testID}
      style={[
        styles.base,
        { backgroundColor: v.bg, borderColor: v.border },
        style,
      ]}
    >
      {typeof children === 'string' ? (
        <Text style={[styles.text, { color: v.fg }, uppercase && styles.upper]}>{children}</Text>
      ) : (
        children
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: 6, // rounded-md
    borderWidth: 1,
    paddingHorizontal: 10, // px-2.5
    paddingVertical: 2,    // py-0.5
    gap: 4,
  },
  text: {
    fontSize: 12,
    fontWeight: '600',
    fontFamily: Platform.OS === 'web' ? 'Outfit, sans-serif' : 'Outfit_600SemiBold',
  },
  upper: {
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    fontSize: 10,
  },
});
