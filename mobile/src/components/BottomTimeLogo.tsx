/**
 * Bottom Time wordmark — mirrors `frontend/src/components/Navbar.js` exactly.
 *  Waves icon (lucide), cyan-400 (#22d3ee), w-8 h-8 (32px).
 *  "Bottom Time" in Outfit 700, tracking-tight (-0.025em), text-xl (~20px).
 *  TM superscript: 0.5em, semibold, slate-500.
 */
import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { Waves } from 'lucide-react-native';
import { Colors } from '../constants/colors';

interface Props {
  size?: 'sm' | 'md' | 'lg';
  invert?: boolean;          // white wordmark on dark surfaces
  showTM?: boolean;
}

const SIZES = {
  sm: { icon: 22, text: 16, tm: 8 },
  md: { icon: 28, text: 20, tm: 10 },
  lg: { icon: 36, text: 26, tm: 13 },
};

export default function BottomTimeLogo({ size = 'md', invert = false, showTM = true }: Props) {
  const s = SIZES[size];
  const wordColor = invert ? Colors.white : Colors.slate900;
  const tmColor = invert ? Colors.slate400 : Colors.slate500;
  return (
    <View style={styles.row}>
      <Waves color={Colors.cyan400} size={s.icon} strokeWidth={2} />
      <View style={styles.wordWrap}>
        <Text
          style={[
            styles.word,
            {
              fontSize: s.text,
              color: wordColor,
              letterSpacing: -s.text * 0.025,
            },
          ]}
        >
          Bottom Time
        </Text>
        {showTM && (
          <Text style={[styles.tm, { fontSize: s.tm, color: tmColor }]}>TM</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  wordWrap: { flexDirection: 'row', alignItems: 'flex-start' },
  word: {
    fontFamily: Platform.OS === 'web' ? 'Outfit, sans-serif' : 'Outfit_700Bold',
    fontWeight: '700',
  },
  tm: {
    fontFamily: Platform.OS === 'web' ? 'Outfit, sans-serif' : 'Outfit_600SemiBold',
    fontWeight: '600',
    marginLeft: 2,
    marginTop: 1,
  },
});
