/**
 * 🔒 LOCKED — Mobile Auth Flow (approved 2026-05-06)
 *
 * Reusable 6-box OTP input. Used in:
 *   • /app/mobile/app/verify.tsx        (login OTP)
 *   • /app/mobile/app/signup.tsx step 2 (email OTP)
 *   • /app/mobile/app/signup.tsx step 4 (phone OTP)
 *
 * Behaviour:
 *   • 6 digit boxes; auto-advance focus on input.
 *   • Backspace on an empty box moves focus to the previous box.
 *   • Pasting a 6-digit code distributes one digit per box.
 *   • Each box carries `textContentType="oneTimeCode"` and
 *     `autoComplete="one-time-code"` so iOS surfaces the OTP from the
 *     latest verification email/SMS as a keyboard suggestion.
 *
 * Visuals (classy / Apple-style):
 *   • 40 × 48 box, gap 10
 *   • borderRadius 12
 *   • Default border 1.5 slate-200, slate-50 background
 *   • Focused box: 1.5 cyan-400 border
 *   • Filled box: 1.5 slate-300 border
 *   • Error: 1.5 accent-red border
 *   • Outfit_600SemiBold, slate-900, fontSize 20, centered
 */
import React, { useRef, useState } from 'react';
import { View, TextInput, StyleSheet, Platform } from 'react-native';
import { Colors } from '../constants/colors';

type Props = {
  value: string;
  onChange: (v: string) => void;
  autoFocus?: boolean;
  error?: boolean;
  testIDPrefix?: string;
};

export const OtpBoxes: React.FC<Props> = ({
  value, onChange, autoFocus = false, error = false, testIDPrefix = 'otp-box',
}) => {
  const boxRefs = useRef<Array<TextInput | null>>([null, null, null, null, null, null]);
  const [focusedIdx, setFocusedIdx] = useState<number | null>(null);

  const digits = (value || '').padEnd(6, ' ').split('').slice(0, 6).map((c) => (c === ' ' ? '' : c));

  const setDigitAt = (i: number, ch: string) => {
    const arr = [...digits];
    arr[i] = ch;
    onChange(arr.join('').replace(/\s/g, ''));
  };

  const handleChange = (i: number, v: string) => {
    const cleaned = v.replace(/\D/g, '');
    if (cleaned.length === 6) {
      onChange(cleaned);
      boxRefs.current[5]?.focus();
      return;
    }
    if (cleaned.length > 1) {
      setDigitAt(i, cleaned.slice(-1));
      if (i < 5) boxRefs.current[i + 1]?.focus();
      return;
    }
    setDigitAt(i, cleaned);
    if (cleaned && i < 5) boxRefs.current[i + 1]?.focus();
  };

  const handleKey = (i: number, e: any) => {
    if (e?.nativeEvent?.key === 'Backspace' && !digits[i] && i > 0) {
      boxRefs.current[i - 1]?.focus();
    }
  };

  return (
    <View style={styles.row}>
      {[0, 1, 2, 3, 4, 5].map((i) => {
        const filled = !!digits[i];
        const focused = focusedIdx === i;
        const boxStyle = [
          styles.box,
          filled && !focused && styles.boxFilled,
          focused && styles.boxFocused,
          error && styles.boxError,
        ];
        return (
          <TextInput
            key={i}
            ref={(r) => { boxRefs.current[i] = r; }}
            value={digits[i]}
            onChangeText={(v: string) => handleChange(i, v)}
            onKeyPress={(e: any) => handleKey(i, e)}
            onFocus={() => setFocusedIdx(i)}
            onBlur={() => setFocusedIdx(null)}
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            autoComplete="one-time-code"
            maxLength={6}
            style={boxStyle}
            autoFocus={autoFocus && i === 0}
            testID={`${testIDPrefix}-${i}`}
          />
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row', justifyContent: 'center', gap: 10,
    marginBottom: 18, alignSelf: 'stretch',
  },
  box: {
    width: 40, height: 48,
    borderWidth: 1.5, borderColor: Colors.slate200, borderRadius: 12,
    backgroundColor: Colors.slate50, color: Colors.slate900,
    fontSize: 20, fontWeight: '600', textAlign: 'center',
    fontFamily: Platform.OS === 'web' ? 'Outfit, sans-serif' : 'Outfit_600SemiBold',
  },
  boxFilled: { borderColor: Colors.slate300 },
  boxFocused: { borderColor: Colors.cyan400 },
  boxError: { borderColor: Colors.accent },
});

export default OtpBoxes;
