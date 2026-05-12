/**
 * Mirror of frontend/src/components/ui/button.jsx (shadcn Button).
 *
 * Web variants -> mobile equivalents:
 *   default     bg-primary (slate-900) text-white shadow rounded-md h-9 px-4
 *   destructive bg-rose-500            text-white shadow-sm
 *   outline     border bg-transparent  hover:bg-slate-100
 *   secondary   bg-slate-100           text-slate-900
 *   ghost       transparent            hover:bg-slate-100
 *   link        underline cyan-500
 *   cyan        bg-cyan-400            text-white     (Bottom Time primary CTA — cyan pill text colour rule, see /app/memory/design.md)
 *
 * Sizes:           default h-9 px-4   sm h-8 px-3 text-xs   lg h-10 px-8   icon h-9 w-9
 */
import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  ViewStyle,
  TextStyle,
  StyleProp,
  Platform,
} from 'react-native';
import { Colors } from '../../constants/colors';

export type ButtonVariant =
  | 'default'
  | 'destructive'
  | 'outline'
  | 'secondary'
  | 'ghost'
  | 'link'
  | 'cyan';
export type ButtonSize = 'default' | 'sm' | 'lg' | 'icon';

interface Props {
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  testID?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  children?: React.ReactNode;
  fullWidth?: boolean;
}

const SIZE: Record<ButtonSize, { height: number; px: number; fontSize: number }> = {
  default: { height: 36, px: 16, fontSize: 14 },
  sm: { height: 32, px: 12, fontSize: 12 },
  lg: { height: 40, px: 32, fontSize: 15 },
  icon: { height: 36, px: 0, fontSize: 14 },
};

function variantStyles(variant: ButtonVariant, pressed: boolean): { bg: ViewStyle; fg: TextStyle } {
  switch (variant) {
    case 'destructive':
      return { bg: { backgroundColor: pressed ? '#e11d48' : Colors.accent }, fg: { color: Colors.white } };
    case 'outline':
      return {
        bg: {
          backgroundColor: pressed ? Colors.slate100 : 'transparent',
          borderWidth: 1,
          borderColor: Colors.border,
        },
        fg: { color: Colors.slate900 },
      };
    case 'secondary':
      return { bg: { backgroundColor: pressed ? Colors.slate200 : Colors.slate100 }, fg: { color: Colors.slate900 } };
    case 'ghost':
      return { bg: { backgroundColor: pressed ? Colors.slate100 : 'transparent' }, fg: { color: Colors.slate900 } };
    case 'link':
      return { bg: { backgroundColor: 'transparent' }, fg: { color: Colors.cyan500, textDecorationLine: 'underline' } };
    case 'cyan':
      return { bg: { backgroundColor: pressed ? Colors.cyan500 : Colors.cyan400 }, fg: { color: Colors.white } };
    case 'default':
    default:
      return { bg: { backgroundColor: pressed ? Colors.slate800 : Colors.slate900 }, fg: { color: Colors.white } };
  }
}

export default function Button({
  onPress,
  variant = 'default',
  size = 'default',
  disabled,
  loading,
  style,
  textStyle,
  testID,
  leftIcon,
  rightIcon,
  children,
  fullWidth,
}: Props) {
  const sz = SIZE[size];
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled || loading}
      android_ripple={{ color: 'rgba(15,23,42,0.08)' }}
      style={({ pressed }) => {
        const v = variantStyles(variant, pressed);
        const baseShadow =
          variant === 'default' || variant === 'destructive' || variant === 'cyan'
            ? Platform.select({
                web: { boxShadow: '0 1px 2px 0 rgba(15,23,42,0.06), 0 1px 1px 0 rgba(15,23,42,0.04)' } as any,
                default: { shadowColor: '#0f172a', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 2, elevation: 1 },
              })
            : null;
        return [
          styles.base,
          { height: sz.height, paddingHorizontal: size === 'icon' ? 0 : sz.px, width: size === 'icon' ? sz.height : undefined },
          fullWidth && { alignSelf: 'stretch' },
          v.bg,
          baseShadow,
          (disabled || loading) && { opacity: 0.5 },
          style,
        ];
      }}
    >
      {({ pressed }) => {
        const v = variantStyles(variant, pressed);
        return (
          <View style={styles.content}>
            {loading ? (
              <ActivityIndicator size="small" color={v.fg.color as string} />
            ) : (
              <>
                {leftIcon ? <View style={styles.icon}>{leftIcon}</View> : null}
                {typeof children === 'string' ? (
                  <Text style={[styles.label, { fontSize: sz.fontSize }, v.fg, textStyle]}>{children}</Text>
                ) : (
                  children
                )}
                {rightIcon ? <View style={styles.icon}>{rightIcon}</View> : null}
              </>
            )}
          </View>
        );
      }}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: 6, // shadcn rounded-md
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  content: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  label: {
    fontFamily: Platform.OS === 'web' ? 'Outfit, sans-serif' : 'Outfit_500Medium',
    fontWeight: '500',
  },
  icon: { alignItems: 'center', justifyContent: 'center' },
});
