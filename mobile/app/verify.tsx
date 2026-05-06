/**
 * 🔒 LOCKED — Mobile Auth Flow (approved 2026-05-06)
 *
 * Approved follow-up fixes (2026-05-06 evening):
 *   - Removed `bodyTranslateY` keyboard animation (input now sits high; keyboard
 *     simply covers empty bottom). Layout uses static `paddingTop: insets.top + 60`.
 *   - Title "Welcome back" → "Welcome back!"
 *   - Removed phone-hint sentence + `phone_hint` route param.
 *   - Added `submittedOnce` flag so the "Enter the 6-digit code" error only
 *     renders after the first Sign-in tap.
 *   - All textual elements + the OTP field + CTA + resend link are centered.
 *   - Added 60s resend-code cooldown timer (matches web's Onboarding behaviour):
 *     "Resend code in 0:59" disabled / slate while counting; flips to a tappable
 *     "Resend code" link once it hits 0. Cooldown resets on every successful send.
 *   - OTP input is now SIX squared boxes (48×56, slate-100 bg, slate-300 border,
 *     cyan-400 2px border on focus). Auto-advance on digit, backspace moves to
 *     previous box, paste of a 6-digit code distributes across boxes. Each box
 *     carries `textContentType="oneTimeCode"` + `autoComplete="one-time-code"`
 *     so iOS surfaces the OTP from the recent email above the keyboard.
 *
 * Other LOCKED constants (welcome.tsx) remain untouched. See
 * /app/memory/MOBILE_AUTH_LOCKED.md.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet,
  Platform, ActivityIndicator,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import api from '../src/api/client';
import useAuthStore from '../src/stores/authStore';
import { Colors } from '../src/constants/colors';

export default function VerifyScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string }>();
  const login = useAuthStore((s) => s.login);
  const insets = useSafeAreaInsets();
  const email = String(params.email || '').toLowerCase().trim();

  // SIX-box OTP: each box owns one digit, refs auto-advance/-retreat focus.
  // Pasting a 6-digit string distributes across all boxes.
  const [boxValues, setBoxValues] = useState<string[]>(['', '', '', '', '', '']);
  const [focusedIdx, setFocusedIdx] = useState<number | null>(0);
  const boxRefs = useRef<Array<TextInput | null>>([null, null, null, null, null, null]);
  const code = boxValues.join('');
  const setBoxAt = (i: number, ch: string) => {
    setBoxValues((prev) => { const next = [...prev]; next[i] = ch; return next; });
  };
  const handleBoxChange = (i: number, v: string) => {
    const cleaned = v.replace(/\D/g, '');
    setError(null);
    if (cleaned.length === 6) {
      // Paste: distribute across all 6 boxes
      const arr = cleaned.split('');
      setBoxValues(arr);
      boxRefs.current[5]?.focus();
      return;
    }
    if (cleaned.length > 1) {
      // User typed multiple chars in one box — keep last digit
      setBoxAt(i, cleaned.slice(-1));
      if (i < 5) boxRefs.current[i + 1]?.focus();
      return;
    }
    setBoxAt(i, cleaned);
    if (cleaned && i < 5) boxRefs.current[i + 1]?.focus();
  };
  const handleBoxKey = (i: number, e: any) => {
    const key = e?.nativeEvent?.key;
    if (key === 'Backspace' && !boxValues[i] && i > 0) {
      boxRefs.current[i - 1]?.focus();
    }
  };
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submittedOnce, setSubmittedOnce] = useState(false);
  const [resentAt, setResentAt] = useState<number | null>(null);
  // Resend cooldown: 60s on mount (matches the initial OTP send), counts
  // down to 0; while > 0 the link is disabled and shows "Resend code in m:ss".
  const [cooldown, setCooldown] = useState<number>(60);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = setInterval(() => {
      setCooldown((c) => (c > 0 ? c - 1 : 0));
    }, 1000);
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, []);
  const fmtCooldown = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  const verify = async () => {
    setSubmittedOnce(true);
    if (code.length !== 6) { setError('Enter the 6-digit code.'); return; }
    setLoading(true); setError(null);
    try {
      const r = await api.post('/auth/verify-otp', { identifier: email, code });
      const loginRes = await api.post('/auth/login-complete', {
        email, email_verified_token: r.data.verification_token,
      });
      await login(loginRes.data.access_token, loginRes.data.user);
      router.replace('/(tabs)');
    } catch (e: any) { setError(e?.response?.data?.detail || 'Invalid code.'); }
    finally { setLoading(false); }
  };

  const resend = async () => {
    if (cooldown > 0) return;
    try {
      await api.post('/auth/send-otp', { identifier: email });
      setResentAt(Date.now());
      setCooldown(60);
    } catch (e: any) { setError(e?.response?.data?.detail || 'Could not resend code.'); }
  };

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} testID="verify-back">
          <Ionicons name="arrow-back" size={24} color={Colors.slate900} />
        </Pressable>
      </View>

      <View style={[styles.body, { paddingTop: insets.top + 24 }]}>
        <Text style={styles.h1}>Welcome back!</Text>
        <Text style={styles.sub}>
          We sent a 6-digit code to <Text style={{ fontWeight: '700' }}>{email}</Text>.
        </Text>

        <Text style={styles.label}>Verification code</Text>
        <View style={styles.boxRow}>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <TextInput
              key={i}
              ref={(r) => { boxRefs.current[i] = r; }}
              value={boxValues[i]}
              onChangeText={(v: string) => handleBoxChange(i, v)}
              onKeyPress={(e: any) => handleBoxKey(i, e)}
              onFocus={() => setFocusedIdx(i)}
              onBlur={() => setFocusedIdx(null)}
              keyboardType="number-pad"
              textContentType="oneTimeCode"
              autoComplete="one-time-code"
              maxLength={6}
              style={[styles.box, focusedIdx === i && styles.boxFocused]}
              autoFocus={i === 0}
              testID={`verify-otp-box-${i}`}
            />
          ))}
        </View>

        <Pressable onPress={verify} disabled={loading} style={({ pressed }) => [styles.cta, pressed && { opacity: 0.9 }, loading && { opacity: 0.7 }]} testID="verify-cta">
          {loading ? <ActivityIndicator size="small" color={Colors.white} /> : <Text style={styles.ctaText}>Sign in</Text>}
        </Pressable>

        <Pressable onPress={resend} style={styles.linkRow} disabled={cooldown > 0} testID="verify-resend">
          <Text style={[styles.linkText, cooldown > 0 && styles.linkTextDisabled]}>
            {cooldown > 0
              ? `Resend code in ${fmtCooldown(cooldown)}`
              : (resentAt ? 'Code resent — tap to send again' : 'Resend code')}
          </Text>
        </Pressable>

        {submittedOnce && error ? <Text style={styles.errMsg} testID="verify-error">{error}</Text> : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.white },
  header: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 12 },
  body: { flex: 1, paddingHorizontal: 24, alignItems: 'center' },
  h1: {
    fontSize: 26, fontWeight: '700', color: Colors.slate900, marginBottom: 8,
    textAlign: 'center',
    fontFamily: Platform.OS === 'web' ? 'Outfit, sans-serif' : 'Outfit_700Bold',
  },
  sub: { fontSize: 14, color: Colors.slate600, marginBottom: 22, lineHeight: 20, textAlign: 'center' },
  label: {
    fontSize: 12, fontWeight: '700', color: Colors.slate700, textTransform: 'uppercase',
    letterSpacing: 0.5, marginBottom: 6, textAlign: 'center', alignSelf: 'stretch',
  },
  boxRow: {
    flexDirection: 'row', justifyContent: 'center', gap: 8,
    marginBottom: 18, alignSelf: 'stretch',
  },
  box: {
    width: 40, height: 48, borderWidth: 1, borderColor: Colors.slate300,
    backgroundColor: Colors.slate100, color: Colors.slate900,
    fontSize: 20, fontWeight: '700', textAlign: 'center',
    fontFamily: Platform.OS === 'web' ? 'Outfit, sans-serif' : 'Outfit_700Bold',
  },
  boxFocused: { borderColor: Colors.cyan400, borderWidth: 2 },
  cta: {
    height: 52, borderRadius: 9999, backgroundColor: Colors.cyan400,
    alignItems: 'center', justifyContent: 'center', alignSelf: 'stretch',
  },
  ctaText: { color: Colors.white, fontSize: 16, fontWeight: '700', textAlign: 'center' },
  linkRow: { alignItems: 'center', paddingVertical: 14 },
  linkText: { color: Colors.cyan500, fontSize: 13, fontWeight: '600', textAlign: 'center' },
  linkTextDisabled: { color: Colors.slate400, fontWeight: '500' },
  errMsg: { color: Colors.accent, fontSize: 13, textAlign: 'center', marginTop: 12 },
});
