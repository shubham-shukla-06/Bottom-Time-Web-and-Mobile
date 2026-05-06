/**
 * Verify — existing-user OTP step.
 *
 * Email OTP → /auth/verify-otp → /auth/login-complete → JWT → /(tabs).
 * If the OTP is wrong, error inline; user can resend or go back to /welcome.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet, Keyboard, Animated, Easing,
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
  const params = useLocalSearchParams<{ email?: string; phone_hint?: string }>();
  const login = useAuthStore((s) => s.login);
  const email = String(params.email || '').toLowerCase().trim();
  const phoneHint = String(params.phone_hint || '');

  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resentAt, setResentAt] = useState<number | null>(null);

  // Imperative keyboard listener — slide the body up by the keyboard height.
  // Snappy fixed 200ms ease-out cubic for a Zomato-like feel.
  const insets = useSafeAreaInsets();
  const bodyTranslateY = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const easing = Easing.out(Easing.cubic);
    const showSub = Keyboard.addListener(showEvent, (e: any) => {
      Animated.timing(bodyTranslateY, {
        toValue: -(e?.endCoordinates?.height || 0) + (insets.bottom || 0),
        duration: 200,
        easing,
        useNativeDriver: true,
      }).start();
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      Animated.timing(bodyTranslateY, {
        toValue: 0, duration: 200, easing, useNativeDriver: true,
      }).start();
    });
    return () => { showSub.remove(); hideSub.remove(); };
  }, [insets.bottom, bodyTranslateY]);

  const verify = async () => {
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
    try {
      await api.post('/auth/send-otp', { identifier: email });
      setResentAt(Date.now());
    } catch (e: any) { setError(e?.response?.data?.detail || 'Could not resend code.'); }
  };

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <Animated.View style={{ flex: 1, transform: [{ translateY: bodyTranslateY }] }}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={12} testID="verify-back">
            <Ionicons name="arrow-back" size={24} color={Colors.slate900} />
          </Pressable>
        </View>

        <View style={styles.body}>
          <Text style={styles.h1}>Welcome back</Text>
          <Text style={styles.sub}>
            We sent a 6-digit code to <Text style={{ fontWeight: '700' }}>{email}</Text>.
            {phoneHint ? ` (Linked phone ends in •••${phoneHint})` : ''}
          </Text>

          <Text style={styles.label}>Verification code</Text>
          <View style={styles.fieldWrap}>
            <TextInput
              value={code}
              onChangeText={(v: string) => { setCode(v.replace(/\D/g, '').slice(0, 6)); setError(null); }}
              placeholder="123456"
              placeholderTextColor={Colors.slate400}
              keyboardType="number-pad"
              maxLength={6}
              style={styles.field}
              autoFocus
              testID="verify-otp-input"
              onSubmitEditing={verify}
              returnKeyType="go"
            />
          </View>

          <Pressable onPress={verify} disabled={loading} style={({ pressed }) => [styles.cta, pressed && { opacity: 0.9 }, loading && { opacity: 0.7 }]} testID="verify-cta">
            {loading ? <ActivityIndicator size="small" color={Colors.white} /> : <Text style={styles.ctaText}>Sign in</Text>}
          </Pressable>

          <Pressable onPress={resend} style={styles.linkRow} testID="verify-resend">
            <Text style={styles.linkText}>{resentAt ? 'Code resent' : 'Resend code'}</Text>
          </Pressable>

          {error ? <Text style={styles.errMsg} testID="verify-error">{error}</Text> : null}
        </View>
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.white },
  header: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 12 },
  body: { flex: 1, padding: 24 },
  h1: { fontSize: 26, fontWeight: '700', color: Colors.slate900, marginBottom: 8, fontFamily: Platform.OS === 'web' ? 'Outfit, sans-serif' : 'Outfit_700Bold' },
  sub: { fontSize: 14, color: Colors.slate600, marginBottom: 22, lineHeight: 20 },
  label: { fontSize: 12, fontWeight: '700', color: Colors.slate700, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  fieldWrap: { height: 52, borderRadius: 9999, backgroundColor: Colors.slate50, borderWidth: 1, borderColor: Colors.slate200, justifyContent: 'center', marginBottom: 14 },
  field: { height: 52, paddingHorizontal: 24, fontSize: 18, color: Colors.slate900, letterSpacing: 4, fontWeight: '700' },
  cta: { height: 52, borderRadius: 9999, backgroundColor: Colors.cyan400, alignItems: 'center', justifyContent: 'center' },
  ctaText: { color: Colors.white, fontSize: 16, fontWeight: '700' },
  linkRow: { alignItems: 'center', paddingVertical: 14 },
  linkText: { color: Colors.cyan500, fontSize: 13, fontWeight: '600' },
  errMsg: { color: Colors.accent, fontSize: 13, textAlign: 'center', marginTop: 12 },
});
