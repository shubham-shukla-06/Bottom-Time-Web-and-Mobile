/**
 * Mirror of frontend/src/components/ui/card.jsx (shadcn Card).
 *  Card:       rounded-xl, border (slate-200), bg-white, shadow (subtle)
 *  CardHeader: p-6 (24px), gap-1.5
 *  CardTitle:  semibold, leading-none, tracking-tight
 *  CardContent:p-6 pt-0
 *  CardFooter: p-6 pt-0, items-center
 *
 * On mobile we tighten p-6 to a more usable mobile padding (p-4 = 16px) but
 * keep the rounded-xl, border, and shadow tokens identical.
 */
import React from 'react';
import { View, StyleSheet, ViewStyle, TextStyle, StyleProp, Platform } from 'react-native';
import { Text } from '../Text';
import { Colors } from '../../constants/colors';

const cardShadow = Platform.select({
  web: { boxShadow: '0 1px 3px 0 rgba(15, 23, 42, 0.06), 0 1px 2px -1px rgba(15, 23, 42, 0.06)' } as any,
  default: {
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
});

export function Card({ style, children, testID }: { style?: StyleProp<ViewStyle>; children?: React.ReactNode; testID?: string }) {
  return (
    <View testID={testID} style={[styles.card, cardShadow as ViewStyle, style]}>
      {children}
    </View>
  );
}

export function CardHeader({ style, children }: { style?: StyleProp<ViewStyle>; children?: React.ReactNode }) {
  return <View style={[styles.cardHeader, style]}>{children}</View>;
}

export function CardTitle({ style, children }: { style?: StyleProp<TextStyle>; children?: React.ReactNode }) {
  return <Text style={[styles.cardTitle, style]}>{children}</Text>;
}

export function CardDescription({ style, children }: { style?: StyleProp<TextStyle>; children?: React.ReactNode }) {
  return <Text style={[styles.cardDesc, style]}>{children}</Text>;
}

export function CardContent({ style, children }: { style?: StyleProp<ViewStyle>; children?: React.ReactNode }) {
  return <View style={[styles.cardContent, style]}>{children}</View>;
}

export function CardFooter({ style, children }: { style?: StyleProp<ViewStyle>; children?: React.ReactNode }) {
  return <View style={[styles.cardFooter, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12, // rounded-xl
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.white,
    overflow: 'hidden',
  },
  cardHeader: { padding: 16, gap: 6 },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: -0.4,
    color: Colors.slate900,
    fontFamily: Platform.OS === 'web' ? 'Outfit, sans-serif' : 'Outfit_600SemiBold',
  },
  cardDesc: {
    fontSize: 13,
    color: Colors.slate500,
    fontFamily: Platform.OS === 'web' ? 'Outfit, sans-serif' : 'Outfit_400Regular',
  },
  cardContent: { padding: 16, paddingTop: 0 },
  cardFooter: { padding: 16, paddingTop: 0, flexDirection: 'row', alignItems: 'center' },
});

export default Card;
