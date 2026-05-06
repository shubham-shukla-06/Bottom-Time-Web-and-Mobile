/**
 * Pill / Chip — fixed height, rounded-full, used for filters and tabs.
 * Mirrors web `inline-flex h-9 rounded-full px-4 text-sm font-medium`.
 *
 * Active:   bg-cyan-400  text-slate-900
 * Inactive: bg-slate-100 text-slate-700
 * Outline:  border bg-transparent text-slate-700
 */
import React from 'react';
import { Pressable, Text, StyleSheet, View, ViewStyle, StyleProp, Platform } from 'react-native';
import { Colors } from '../../constants/colors';

interface Props {
  active?: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  variant?: 'solid' | 'outline';
  size?: 'sm' | 'md';
  children: React.ReactNode;
}

export default function Chip({
  active,
  onPress,
  style,
  testID,
  leftIcon,
  rightIcon,
  variant = 'solid',
  size = 'md',
  children,
}: Props) {
  const h = size === 'sm' ? 30 : 36;
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        { height: h, paddingHorizontal: size === 'sm' ? 12 : 16 },
        variant === 'outline'
          ? { backgroundColor: 'transparent', borderWidth: 1, borderColor: active ? Colors.cyan500 : Colors.border }
          : { backgroundColor: active ? Colors.cyan400 : Colors.slate100 },
        pressed && { opacity: 0.85 },
        style,
      ]}
    >
      {leftIcon ? <View style={styles.icon}>{leftIcon}</View> : null}
      {typeof children === 'string' ? (
        <Text
          numberOfLines={1}
          style={[
            styles.text,
            { fontSize: size === 'sm' ? 12 : 13, color: active ? Colors.slate900 : Colors.slate700 },
          ]}
        >
          {children}
        </Text>
      ) : (
        children
      )}
      {rightIcon ? <View style={styles.icon}>{rightIcon}</View> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,            // never let parent stretch us vertically
    alignSelf: 'flex-start',  // shrink to content height
    borderRadius: 9999,
    gap: 6,
  },
  text: {
    fontWeight: '500',
    lineHeight: Platform.OS === 'web' ? (16 as any) : undefined,
    fontFamily: Platform.OS === 'web' ? 'Outfit, sans-serif' : 'Outfit_500Medium',
  },
  icon: { alignItems: 'center', justifyContent: 'center' },
});
