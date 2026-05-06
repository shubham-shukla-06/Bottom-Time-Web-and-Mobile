/**
 * Mirror of frontend/src/components/ui/input.jsx (shadcn Input).
 *  h-9, rounded-md, border (slate-200), bg-transparent, px-3, py-1, text-base.
 *  Focus ring: cyan-500 outline.
 */
import React, { useState, forwardRef } from 'react';
import {
  TextInput,
  TextInputProps,
  StyleSheet,
  View,
  Text,
  ViewStyle,
  StyleProp,
  Platform,
} from 'react-native';
import { Colors } from '../../constants/colors';

interface Props extends TextInputProps {
  label?: string;
  error?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  containerStyle?: StyleProp<ViewStyle>;
}

const Input = forwardRef<TextInput, Props>(function Input(
  { label, error, leftIcon, rightIcon, containerStyle, style, onFocus, onBlur, ...rest },
  ref
) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={[styles.wrap, containerStyle]}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View
        style={[
          styles.field,
          focused && styles.fieldFocus,
          error ? styles.fieldError : null,
        ]}
      >
        {leftIcon ? <View style={styles.iconLeft}>{leftIcon}</View> : null}
        <TextInput
          ref={ref}
          {...rest}
          placeholderTextColor={Colors.slate400}
          onFocus={(e) => { setFocused(true); onFocus?.(e); }}
          onBlur={(e) => { setFocused(false); onBlur?.(e); }}
          style={[styles.input, leftIcon ? { paddingLeft: 0 } : null, rightIcon ? { paddingRight: 0 } : null, style]}
        />
        {rightIcon ? <View style={styles.iconRight}>{rightIcon}</View> : null}
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
});

export default Input;

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.slate700,
    fontFamily: Platform.OS === 'web' ? 'Outfit, sans-serif' : 'Outfit_600SemiBold',
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 40,
    borderRadius: 6, // rounded-md
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.white,
    paddingHorizontal: 12,
  },
  fieldFocus: {
    borderColor: Colors.cyan500,
  },
  fieldError: {
    borderColor: Colors.accent,
  },
  iconLeft: { marginRight: 8 },
  iconRight: { marginLeft: 8 },
  input: {
    flex: 1,
    fontSize: 14,
    color: Colors.slate900,
    paddingVertical: 0,
    fontFamily: Platform.OS === 'web' ? 'Outfit, sans-serif' : 'Outfit_400Regular',
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none', outlineWidth: 0 } as any) : null),
  },
  error: {
    fontSize: 11,
    color: Colors.accent,
    fontFamily: Platform.OS === 'web' ? 'Outfit, sans-serif' : 'Outfit_500Medium',
  },
});
