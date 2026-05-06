import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, Alert, ActivityIndicator
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import api from '../src/api/client';
import useAuthStore from '../src/stores/authStore';
import { Colors } from '../src/constants/colors';

export default function AuthScreen() {
  const router = useRouter();
  const login = useAuthStore((s) => s.login);
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [emailOTP, setEmailOTP] = useState('');
  const [phoneOTP, setPhoneOTP] = useState('');
  const [emailVerifiedToken, setEmailVerifiedToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [role, setRole] = useState('diver');

  const handleSendEmailOTP = async () => {
    if (!email) { Alert.alert('Error', 'Please enter your email'); return; }
    if (mode === 'signup' && !name) { Alert.alert('Error', 'Please enter your name'); return; }
    setLoading(true);
    try {
      if (mode === 'signup') {
        await api.post('/auth/store-signup-data', { email, name, role });
      } else {
        await api.post('/auth/login-init', { email });
      }
      await api.post('/auth/send-otp', { identifier: email });
      setStep(2);
    } catch (e: any) {
      Alert.alert('Error', e.response?.data?.detail || 'Failed to send code');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyEmailOTP = async () => {
    if (emailOTP.length !== 6) { Alert.alert('Error', 'Please enter the 6-digit code'); return; }
    setLoading(true);
    try {
      const res = await api.post('/auth/verify-otp', { identifier: email, code: emailOTP });
      const emailToken = res.data.verification_token;

      if (mode === 'signin') {
        const loginRes = await api.post('/auth/login-complete', { email, email_verified_token: emailToken });
        await login(loginRes.data.access_token, loginRes.data.user);
        router.replace('/');
      } else {
        setEmailVerifiedToken(emailToken);
        setStep(3);
      }
    } catch (e: any) {
      Alert.alert('Error', e.response?.data?.detail || 'Invalid code');
    } finally {
      setLoading(false);
    }
  };

  const handleSendPhoneOTP = async () => {
    if (!phone) { Alert.alert('Error', 'Please enter your phone number'); return; }
    setLoading(true);
    try {
      await api.post('/auth/send-otp', { identifier: phone });
      setStep(4);
    } catch (e: any) {
      Alert.alert('Error', e.response?.data?.detail || 'Failed to send code');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyPhoneOTP = async () => {
    if (phoneOTP.length !== 6) { Alert.alert('Error', 'Please enter the 6-digit code'); return; }
    setLoading(true);
    try {
      const res = await api.post('/auth/verify-otp', { identifier: phone, code: phoneOTP });
      const signupRes = await api.post('/auth/signup-complete', {
        email, phone,
        email_verified_token: emailVerifiedToken,
        phone_verified_token: res.data.verification_token,
      });
      await login(signupRes.data.access_token, signupRes.data.user);
      router.replace('/');
    } catch (e: any) {
      Alert.alert('Error', e.response?.data?.detail || 'Verification failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={() => router.back()} testID="auth-close-btn">
              <Ionicons name="close" size={24} color={Colors.slate600} />
            </TouchableOpacity>
          </View>

          {/* Step 1: Email input */}
          {step === 1 && (
            <View testID="auth-step-email">
              <Text style={styles.title}>{mode === 'signin' ? 'Dive in' : 'Create Account'}</Text>
              <Text style={styles.subtitle}>
                {mode === 'signin' ? 'Enter your email to sign in' : 'Sign up to get started'}
              </Text>

              {mode === 'signup' && (
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Your Name</Text>
                  <View style={styles.inputRow}>
                    <Ionicons name="person-outline" size={18} color={Colors.slate400} />
                    <TextInput
                      style={styles.input}
                      placeholder="John Doe"
                      placeholderTextColor={Colors.slate400}
                      value={name}
                      onChangeText={setName}
                      testID="name-input"
                    />
                  </View>
                </View>
              )}

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Email Address</Text>
                <View style={styles.inputRow}>
                  <Ionicons name="mail-outline" size={18} color={Colors.slate400} />
                  <TextInput
                    style={styles.input}
                    placeholder="your@email.com"
                    placeholderTextColor={Colors.slate400}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    value={email}
                    onChangeText={setEmail}
                    testID="email-input"
                  />
                </View>
              </View>

              <TouchableOpacity
                style={styles.primaryBtn}
                onPress={handleSendEmailOTP}
                disabled={loading}
                testID="send-email-otp-btn"
              >
                {loading ? (
                  <ActivityIndicator color={Colors.white} />
                ) : (
                  <Text style={styles.primaryBtnText}>Send Code</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); }}
                style={styles.switchBtn}
                testID={mode === 'signin' ? 'switch-to-signup' : 'switch-to-signin'}
              >
                <Text style={styles.switchText}>
                  {mode === 'signin' ? "New here? Create an account" : "Already have an account? Dive in"}
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Step 2: Verify Email OTP */}
          {step === 2 && (
            <View testID="auth-step-verify-email">
              <View style={styles.otpIcon}>
                <Ionicons name="mail" size={32} color={Colors.cyan400} />
              </View>
              <Text style={styles.title}>Verify Email</Text>
              <Text style={styles.subtitle}>Code sent to {email}</Text>

              <View style={styles.inputGroup}>
                <TextInput
                  style={[styles.input, styles.otpInput]}
                  placeholder="123456"
                  placeholderTextColor={Colors.slate400}
                  keyboardType="number-pad"
                  maxLength={6}
                  value={emailOTP}
                  onChangeText={(t) => setEmailOTP(t.replace(/\D/g, ''))}
                  testID="email-otp-input"
                />
              </View>

              <TouchableOpacity
                style={styles.primaryBtn}
                onPress={handleVerifyEmailOTP}
                disabled={loading}
                testID="verify-email-btn"
              >
                {loading ? (
                  <ActivityIndicator color={Colors.white} />
                ) : (
                  <Text style={styles.primaryBtnText}>Verify</Text>
                )}
              </TouchableOpacity>
            </View>
          )}

          {/* Step 3: Phone input (signup only) */}
          {step === 3 && (
            <View testID="auth-step-phone">
              <View style={styles.successBanner}>
                <Ionicons name="checkmark-circle" size={20} color={Colors.success} />
                <Text style={styles.successText}>Email Verified!</Text>
              </View>
              <Text style={styles.title}>Your Phone</Text>
              <Text style={styles.subtitle}>Verify your phone for 2FA security</Text>

              <View style={styles.inputGroup}>
                <View style={styles.inputRow}>
                  <Ionicons name="call-outline" size={18} color={Colors.slate400} />
                  <TextInput
                    style={styles.input}
                    placeholder="+1234567890"
                    placeholderTextColor={Colors.slate400}
                    keyboardType="phone-pad"
                    value={phone}
                    onChangeText={setPhone}
                    testID="phone-input"
                  />
                </View>
              </View>

              <TouchableOpacity
                style={styles.primaryBtn}
                onPress={handleSendPhoneOTP}
                disabled={loading}
                testID="send-phone-otp-btn"
              >
                {loading ? (
                  <ActivityIndicator color={Colors.white} />
                ) : (
                  <Text style={styles.primaryBtnText}>Send SMS Code</Text>
                )}
              </TouchableOpacity>
            </View>
          )}

          {/* Step 4: Verify Phone OTP */}
          {step === 4 && (
            <View testID="auth-step-verify-phone">
              <View style={styles.otpIcon}>
                <Ionicons name="call" size={32} color={Colors.cyan400} />
              </View>
              <Text style={styles.title}>Verify Phone</Text>
              <Text style={styles.subtitle}>SMS sent to {phone}</Text>

              <View style={styles.inputGroup}>
                <TextInput
                  style={[styles.input, styles.otpInput]}
                  placeholder="123456"
                  placeholderTextColor={Colors.slate400}
                  keyboardType="number-pad"
                  maxLength={6}
                  value={phoneOTP}
                  onChangeText={(t) => setPhoneOTP(t.replace(/\D/g, ''))}
                  testID="phone-otp-input"
                />
              </View>

              <TouchableOpacity
                style={styles.primaryBtn}
                onPress={handleVerifyPhoneOTP}
                disabled={loading}
                testID="verify-phone-btn"
              >
                {loading ? (
                  <ActivityIndicator color={Colors.white} />
                ) : (
                  <Text style={styles.primaryBtnText}>Verify & Complete</Text>
                )}
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.white },
  flex: { flex: 1 },
  scrollContent: { padding: 24, paddingTop: 8 },
  header: { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 16 },
  title: { fontSize: 28, fontWeight: '700', color: Colors.slate900, marginBottom: 8 },
  subtitle: { fontSize: 14, color: Colors.slate500, marginBottom: 24 },
  inputGroup: { marginBottom: 16 },
  label: { fontSize: 13, fontWeight: '600', color: Colors.slate700, marginBottom: 8 },
  inputRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.slate50, borderRadius: 14, borderWidth: 1, borderColor: Colors.slate200, paddingHorizontal: 14, gap: 10 },
  input: { flex: 1, height: 48, fontSize: 15, color: Colors.slate900 },
  otpInput: { textAlign: 'center', fontSize: 24, letterSpacing: 8, fontWeight: '600', backgroundColor: Colors.slate50, borderRadius: 14, borderWidth: 1, borderColor: Colors.slate200, paddingHorizontal: 14 },
  otpIcon: { alignItems: 'center', marginBottom: 16 },
  primaryBtn: { backgroundColor: Colors.cyan400, borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 8 },
  primaryBtnText: { color: Colors.white, fontSize: 16, fontWeight: '700' },
  switchBtn: { alignItems: 'center', marginTop: 20 },
  switchText: { color: Colors.cyan400, fontSize: 14, fontWeight: '500' },
  successBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#f0fdf4', borderWidth: 1, borderColor: '#bbf7d0', borderRadius: 12, padding: 12, marginBottom: 16 },
  successText: { fontSize: 14, fontWeight: '600', color: '#166534' },
});
