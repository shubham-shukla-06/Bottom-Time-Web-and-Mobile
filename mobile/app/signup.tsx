/**
 * 🔒 LOCKED — Mobile Auth Flow (approved 2026-05-06)
 *
 * Approved follow-up fixes (2026-05-06 evening):
 *   - Removed `bodyTranslateY` keyboard animation. Layout stays static; the
 *     keyboard naturally covers the bottom of the form. ScrollView still
 *     allows reaching any input that might land behind the keyboard.
 *   - Step 2 (email OTP) and Step 4 (phone OTP) now use the reusable
 *     `<OtpBoxes>` component (6 rounded boxes, auto-advance, paste support,
 *     iOS one-time-code autofill).
 *   - Step 3 (phone) now uses `<PhoneInput>`: a country-code picker
 *     (flag + dial code, modal searchable list, defaults to 🇮🇳 +91) plus a
 *     digits-only number field. Validation: 8–15 digits + valid dial.
 *     Submit concatenates `${country.code}${phoneNumber}` as the E.164
 *     identifier sent to the backend.
 *
 * Other LOCKED constants (welcome.tsx) remain untouched. See
 * /app/memory/MOBILE_AUTH_LOCKED.md
 */

/**
 * Sign-up — multi-step new-user onboarding (mirrors web flow).
 *
 * Steps:
 *   1) Name + role + (email is pre-filled from welcome).
 *      → POST /auth/store-signup-data + /auth/send-otp(email)
 *   2) Email OTP verify.
 *      → POST /auth/verify-otp → JWT email_verified_token
 *   3) Phone number.
 *      → POST /auth/send-otp(phone)
 *   4) Phone OTP verify.
 *      → POST /auth/verify-otp + /auth/signup-complete → access_token → /(tabs)
 */
import React, { useState } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet,
  Platform, ScrollView, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import api from '../src/api/client';
import useAuthStore from '../src/stores/authStore';
import { Colors } from '../src/constants/colors';
import OtpBoxes from '../src/components/OtpBoxes';
import PhoneInput, { COUNTRIES, Country } from '../src/components/PhoneInput';

const ROLES = [
  { value: 'diver', label: 'Diver', icon: 'water-outline' as const },
  { value: 'instructor', label: 'Instructor', icon: 'school-outline' as const },
  { value: 'operator', label: 'Operator', icon: 'business-outline' as const },
];

export default function SignupScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string; name?: string }>();
  const login = useAuthStore((s) => s.login);

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [name, setName] = useState((params.name as string) || '');
  const [role, setRole] = useState('diver');
  const [emailOtp, setEmailOtp] = useState('');
  const [emailToken, setEmailToken] = useState('');
  // Phone is split into a country code (default IN +91) and a digits-only
  // local number. They are concatenated into E.164 (`${dial}${number}`)
  // when sending to the backend.
  const [country, setCountry] = useState<Country>(() =>
    COUNTRIES.find((c) => c.iso === 'IN') || COUNTRIES[0]
  );
  const [phoneNumber, setPhoneNumber] = useState('');
  const [phoneOtp, setPhoneOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const email = String(params.email || '').toLowerCase().trim();
  const phone = `${country.code}${phoneNumber}`;

  const submitNameRole = async () => {
    if (!name.trim()) { setError('Please enter your name.'); return; }
    setLoading(true); setError(null);
    try {
      await api.post('/auth/store-signup-data', { email, name: name.trim(), role });
      await api.post('/auth/send-otp', { identifier: email });
      setStep(2);
    } catch (e: any) { setError(e?.response?.data?.detail || 'Could not start signup. Try again.'); }
    finally { setLoading(false); }
  };

  const verifyEmailOtp = async () => {
    if (emailOtp.length !== 6) { setError('Enter the 6-digit code.'); return; }
    setLoading(true); setError(null);
    try {
      const r = await api.post('/auth/verify-otp', { identifier: email, code: emailOtp });
      setEmailToken(r.data.verification_token);
      setStep(3);
    } catch (e: any) { setError(e?.response?.data?.detail || 'Invalid code.'); }
    finally { setLoading(false); }
  };

  const sendPhoneOtp = async () => {
    const digits = phoneNumber.replace(/\D/g, '');
    if (digits.length < 8 || digits.length > 15) {
      setError('Enter a valid phone number (8–15 digits).'); return;
    }
    if (!country?.code) { setError('Select a country code.'); return; }
    setLoading(true); setError(null);
    try {
      await api.post('/auth/send-otp', { identifier: phone });
      setStep(4);
    } catch (e: any) { setError(e?.response?.data?.detail || 'Could not send code.'); }
    finally { setLoading(false); }
  };

  const verifyPhoneAndComplete = async () => {
    if (phoneOtp.length !== 6) { setError('Enter the 6-digit code.'); return; }
    setLoading(true); setError(null);
    try {
      const r = await api.post('/auth/verify-otp', { identifier: phone, code: phoneOtp });
      const signupRes = await api.post('/auth/signup-complete', {
        email, phone, email_verified_token: emailToken, phone_verified_token: r.data.verification_token,
      });
      await login(signupRes.data.access_token, signupRes.data.user);
      router.replace('/(tabs)');
    } catch (e: any) { setError(e?.response?.data?.detail || 'Verification failed.'); }
    finally { setLoading(false); }
  };

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <View style={{ flex: 1 }}>
        <View style={styles.header}>
          <Pressable onPress={() => (step > 1 ? setStep((step - 1) as any) : router.back())} hitSlop={12} testID="signup-back">
            <Ionicons name="arrow-back" size={24} color={Colors.slate900} />
          </Pressable>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${(step / 4) * 100}%` }]} />
          </View>
          <Text style={styles.stepLabel}>{step}/4</Text>
        </View>

        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          {step === 1 ? (
            <>
              <Text style={styles.h1}>Tell us about you</Text>
              <Text style={styles.sub}>Signing up as <Text style={{ fontWeight: '700' }}>{email}</Text></Text>
              <Field label="Full name" value={name} onChangeText={setName} placeholder="e.g. Alex Diver" testID="signup-name" autoCapitalize="words" />
              <Text style={styles.label}>I'm a</Text>
              <View style={styles.roleRow}>
                {ROLES.map((r) => {
                  const active = role === r.value;
                  return (
                    <Pressable key={r.value} onPress={() => setRole(r.value)}
                      style={({ pressed }) => [styles.roleCard, active && styles.roleCardActive, pressed && { opacity: 0.85 }]}
                      testID={`signup-role-${r.value}`}>
                      <Ionicons name={r.icon} size={22} color={active ? Colors.cyan500 : Colors.slate500} />
                      <Text style={[styles.roleText, active && { color: Colors.cyan500 }]}>{r.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
              {role === 'operator' ? (
                <Text style={styles.note}>Operator accounts are reviewed before activation.</Text>
              ) : null}
              <PrimaryBtn label="Continue" onPress={submitNameRole} loading={loading} testID="signup-step1-cta" />
            </>
          ) : null}

          {step === 2 ? (
            <>
              <Text style={styles.h1}>Verify your email</Text>
              <Text style={styles.sub}>We sent a 6-digit code to <Text style={{ fontWeight: '700' }}>{email}</Text></Text>
              <Text style={[styles.label, styles.labelCenter]}>Verification code</Text>
              <OtpBoxes
                value={emailOtp}
                onChange={(v: string) => { setEmailOtp(v); setError(null); }}
                autoFocus
                error={!!error}
                testIDPrefix="signup-email-otp-box"
              />
              <PrimaryBtn label="Verify" onPress={verifyEmailOtp} loading={loading} testID="signup-step2-cta" />
              <Pressable onPress={() => api.post('/auth/send-otp', { identifier: email }).catch(() => {/* silent */})} style={styles.linkRow} testID="signup-resend-email">
                <Text style={styles.linkText}>Resend code</Text>
              </Pressable>
            </>
          ) : null}

          {step === 3 ? (
            <>
              <Text style={styles.h1}>Add your phone</Text>
              <Text style={styles.sub}>We use this to verify your identity and notify you about bookings.</Text>
              <Text style={styles.label}>Phone number</Text>
              <View style={{ marginBottom: 14 }}>
                <PhoneInput
                  country={country}
                  onCountryChange={setCountry}
                  number={phoneNumber}
                  onNumberChange={(v) => { setPhoneNumber(v); setError(null); }}
                  testID="signup-phone"
                />
              </View>
              <PrimaryBtn label="Send code" onPress={sendPhoneOtp} loading={loading} testID="signup-step3-cta" />
            </>
          ) : null}

          {step === 4 ? (
            <>
              <Text style={styles.h1}>Verify your phone</Text>
              <Text style={styles.sub}>We sent a 6-digit code to <Text style={{ fontWeight: '700' }}>{phone}</Text></Text>
              <Text style={[styles.label, styles.labelCenter]}>Verification code</Text>
              <OtpBoxes
                value={phoneOtp}
                onChange={(v: string) => { setPhoneOtp(v); setError(null); }}
                autoFocus
                error={!!error}
                testIDPrefix="signup-phone-otp-box"
              />
              <PrimaryBtn label="Create account" onPress={verifyPhoneAndComplete} loading={loading} testID="signup-step4-cta" />
              <Pressable onPress={() => api.post('/auth/send-otp', { identifier: phone }).catch(() => {/* silent */})} style={styles.linkRow} testID="signup-resend-phone">
                <Text style={styles.linkText}>Resend code</Text>
              </Pressable>
            </>
          ) : null}

          {error ? <Text style={styles.errMsg} testID="signup-error">{error}</Text> : null}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

function Field({ label, value, onChangeText, placeholder, keyboardType, autoCapitalize, maxLength, testID }: any) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.fieldWrap}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={Colors.slate400}
          autoCapitalize={autoCapitalize || 'none'}
          keyboardType={keyboardType || 'default'}
          maxLength={maxLength}
          style={styles.field}
          testID={testID}
        />
      </View>
    </View>
  );
}

function PrimaryBtn({ label, onPress, loading, testID }: any) {
  return (
    <Pressable onPress={onPress} disabled={loading} style={({ pressed }) => [styles.cta, pressed && { opacity: 0.9 }, loading && { opacity: 0.7 }]} testID={testID}>
      {loading ? <ActivityIndicator size="small" color={Colors.white} /> : <Text style={styles.ctaText}>{label}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.white },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  progressTrack: { flex: 1, height: 4, backgroundColor: Colors.slate100, borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: 4, backgroundColor: Colors.cyan400 },
  stepLabel: { fontSize: 12, color: Colors.slate500, fontWeight: '600' },
  body: { padding: 24, paddingTop: 12 },
  h1: { fontSize: 26, fontWeight: '700', color: Colors.slate900, marginBottom: 8, fontFamily: Platform.OS === 'web' ? 'Outfit, sans-serif' : 'Outfit_700Bold' },
  sub: { fontSize: 14, color: Colors.slate600, marginBottom: 22, lineHeight: 20 },
  label: { fontSize: 12, fontWeight: '700', color: Colors.slate700, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  labelCenter: { textAlign: 'center', alignSelf: 'stretch' },
  fieldWrap: { height: 52, borderRadius: 9999, backgroundColor: Colors.slate50, borderWidth: 1, borderColor: Colors.slate200, justifyContent: 'center' },
  field: { height: 52, paddingHorizontal: 24, fontSize: 15, color: Colors.slate900 },
  roleRow: { flexDirection: 'row', gap: 10, marginBottom: 18 },
  roleCard: { flex: 1, paddingVertical: 18, borderRadius: 16, borderWidth: 1, borderColor: Colors.slate200, alignItems: 'center', gap: 6, backgroundColor: Colors.white },
  roleCardActive: { borderColor: Colors.cyan500, backgroundColor: Colors.cyan50 },
  roleText: { fontSize: 13, fontWeight: '700', color: Colors.slate700 },
  note: { fontSize: 12, color: Colors.slate500, marginBottom: 12, fontStyle: 'italic' },
  cta: { height: 52, borderRadius: 9999, backgroundColor: Colors.cyan400, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
  ctaText: { color: Colors.white, fontSize: 16, fontWeight: '700' },
  linkRow: { alignItems: 'center', paddingVertical: 14 },
  linkText: { color: Colors.cyan500, fontSize: 13, fontWeight: '600' },
  errMsg: { color: Colors.accent, fontSize: 13, textAlign: 'center', marginTop: 12 },
});
