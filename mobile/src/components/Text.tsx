/**
 * Text — thin wrapper around RN's Text that enforces the Outfit font family
 * project-wide. Derives the Outfit weight variant from the caller's
 * `style.fontWeight` so existing call-sites that pass `{ fontWeight: '700' }`
 * automatically get `Outfit_700Bold`.
 *
 * The wrapper places `fontFamily` BEFORE the caller's style so explicit
 * `fontFamily: 'Outfit_XXX'` overrides still win — but any non-Outfit
 * fontFamily passed downstream is treated as a regression and should fail
 * the audit grep.
 *
 * Only 4 Outfit weights are loaded by `_layout.tsx` today (400 / 500 / 600 /
 * 700). 800/900 collapse down to 700; 300 promotes up to 400.
 */
import React from 'react';
import { Text as RNText, TextProps, StyleSheet, TextStyle } from 'react-native';

const WEIGHT_TO_OUTFIT: Record<string, string> = {
  '100': 'Outfit_400Regular',
  '200': 'Outfit_400Regular',
  '300': 'Outfit_400Regular',
  '400': 'Outfit_400Regular',
  normal: 'Outfit_400Regular',
  '500': 'Outfit_500Medium',
  '600': 'Outfit_600SemiBold',
  '700': 'Outfit_700Bold',
  bold: 'Outfit_700Bold',
  '800': 'Outfit_700Bold',
  '900': 'Outfit_700Bold',
};

export function Text({ style, ...rest }: TextProps) {
  const flat = StyleSheet.flatten(style) as TextStyle | undefined;
  const weightKey = flat?.fontWeight != null ? String(flat.fontWeight) : '400';
  const family = WEIGHT_TO_OUTFIT[weightKey] ?? 'Outfit_400Regular';
  return <RNText {...rest} style={[{ fontFamily: family }, style]} />;
}

export default Text;
