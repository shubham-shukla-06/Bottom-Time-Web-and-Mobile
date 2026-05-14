/**
 * Biometric resume splash — auto-prompts on mount. Phase A (2026-05-07).
 */
import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Icon from '../src/components/Icon';
import useAuthStore from '../src/stores/authStore';
import { Colors } from '../src/constants/colors';
import { biometricLabel, getBiometricType, type BiometricKind } from '../src/services/biometric';
import { runPostLoginBiometricHook } from '../src/utils/postLoginBiometricHook';

export default function BiometricResume() {
  const router = useRouter();
  const tryResume = useAuthStore((s) => s.tryBiometricResume);
  const [kind, setKind] = useState<BiometricKind>('generic');
  const [busy, setBusy] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const label = biometricLabel(kind);

  const start = async () => {
    setBusy(true); setErr(null);
    const out = await tryResume();
    setBusy(false);
    if (out === 'resumed') {
      // Logged in via biometric — short-circuits the post-login hook (no
      // enrollment prompt needed). Kept for call-site symmetry with the
      // OTP / social paths so all three success branches funnel through
      // the same helper.
      runPostLoginBiometricHook(true);
      router.replace('/(tabs)');
    }
    else if (out === 'failed' || out === 'no_session' || out === 'unsupported') router.replace('/welcome');
    else setErr(`Could not verify ${label}. Tap to retry, or use OTP instead.`);
  };

  useEffect(() => {
    (async () => setKind(await getBiometricType()))();
    start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const icon: keyof typeof Ionicons.glyphMap =
    kind === 'face' ? 'scan-outline' :
    kind === 'fingerprint' ? 'finger-print' :
    'lock-closed-outline';

  return (
    <SafeAreaView style={styles.root} testID="biometric-resume-screen">
      <View style={styles.center}>
        <View style={styles.iconWrap}>
          <Icon name={icon} size={44} color={Colors.cyan500} />
        </View>
        <Text style={styles.title}>Welcome back</Text>
        <Text style={styles.body}>
          Sign in with {label} to pick up where you left off.
        </Text>
        {err ? <Text style={styles.err} testID="biometric-resume-error">{err}</Text> : null}
        <Pressable
          onPress={start}
          disabled={busy}
          style={({ pressed }) => [styles.cta, pressed && { opacity: 0.9 }, busy && { opacity: 0.7 }]}
          testID="biometric-resume-retry"
        >
          {busy
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.ctaLabel}>Use {label}</Text>}
        </Pressable>
        <Pressable
          onPress={() => router.replace('/welcome')}
          style={styles.linkRow}
          testID="biometric-resume-otp"
        >
          <Text style={styles.linkText}>Use OTP instead</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fff' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  iconWrap: {
    width: 88, height: 88, borderRadius: 44,
    backgroundColor: Colors.cyan50,
    alignItems: 'center', justifyContent: 'center', marginBottom: 24,
  },
  title: { fontFamily: 'Outfit_700Bold', fontSize: 28, color: Colors.slate900 },
  body: {
    fontFamily: 'Outfit_400Regular', fontSize: 15, color: Colors.slate600,
    textAlign: 'center', marginTop: 8, paddingHorizontal: 8, lineHeight: 22,
  },
  cta: {
    width: '100%', backgroundColor: Colors.cyan500,
    paddingVertical: 16, borderRadius: 14, marginTop: 32, alignItems: 'center',
  },
  ctaLabel: { color: '#fff', fontFamily: 'Outfit_600SemiBold', fontSize: 16 },
  linkRow: { paddingVertical: 14, marginTop: 8 },
  linkText: { color: Colors.cyan600, fontFamily: 'Outfit_500Medium', fontSize: 15 },
  err: { color: '#dc2626', fontSize: 13, textAlign: 'center', marginTop: 12, fontFamily: 'Outfit_500Medium' },
});
