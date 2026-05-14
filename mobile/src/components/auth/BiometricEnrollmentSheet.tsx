/**
 * One-time enrollment bottom sheet shown after a successful OTP verify.
 * Phase A — mobile biometric resume (2026-05-07).
 */
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Modal, ActivityIndicator } from 'react-native';
import { HapticPressable as Pressable } from '../HapticPressable';
import Icon from '../Icon';
import { Colors } from '../../constants/colors';
import {
  isBiometricAvailable,
  getBiometricType,
  biometricLabel,
  authenticate,
  type BiometricKind,
} from '../../services/biometric';

type Props = {
  visible: boolean;
  onEnable: () => Promise<void> | void;
  onSkip: () => Promise<void> | void;
};

export default function BiometricEnrollmentSheet({ visible, onEnable, onSkip }: Props) {
  const [kind, setKind] = useState<BiometricKind>('generic');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const label = biometricLabel(kind);

  useEffect(() => {
    if (!visible) return;
    (async () => {
      if (!(await isBiometricAvailable())) {
        // Should not normally land here — caller checks first — but be safe.
        await onSkip();
        return;
      }
      setKind(await getBiometricType());
    })();
  }, [visible]);

  const handleEnable = async () => {
    setErr(null); setBusy(true);
    try {
      const r = await authenticate(`Enable ${label} login`);
      if (!r.success) {
        setErr(r.error === 'cancelled' || r.error === 'user_cancel'
          ? null
          : `Could not verify ${label}. Please try again.`);
        setBusy(false);
        return;
      }
      await onEnable();
    } catch (e: any) {
      setErr(e?.message || 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const icon: keyof typeof Ionicons.glyphMap =
    kind === 'face' ? 'scan-outline' :
    kind === 'fingerprint' ? 'finger-print' :
    'lock-closed-outline';

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={() => onSkip()}>
      <View style={styles.backdrop} testID="biometric-enrollment-backdrop">
        <View style={styles.sheet} testID="biometric-enrollment-sheet">
          <View style={styles.handle} />
          <View style={styles.iconWrap}>
            <Icon name={icon} size={36} color={Colors.cyan500} />
          </View>
          <Text style={styles.title}>Sign in faster next time</Text>
          <Text style={styles.body}>
            Use {label} to sign in without an OTP next time you open Bottom Time.
          </Text>
          {err ? <Text style={styles.errMsg} testID="biometric-enrollment-error">{err}</Text> : null}
          <Pressable
            style={({ pressed }) => [styles.cta, pressed && { opacity: 0.9 }, busy && { opacity: 0.7 }]}
            onPress={handleEnable}
            disabled={busy}
            testID="biometric-enrollment-enable"
          >
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.ctaLabel}>Enable {label}</Text>}
          </Pressable>
          <Pressable onPress={() => onSkip()} style={styles.secondary} testID="biometric-enrollment-skip">
            <Text style={styles.secondaryLabel}>Not now</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15,23,42,0.55)' },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 32,
    alignItems: 'center',
  },
  handle: {
    width: 44, height: 4, borderRadius: 2,
    backgroundColor: Colors.slate200, marginBottom: 16,
  },
  iconWrap: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: Colors.cyan50,
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  title: {
    fontFamily: 'Outfit_700Bold', fontSize: 22, color: Colors.slate900, textAlign: 'center',
  },
  body: {
    fontFamily: 'Outfit_400Regular', fontSize: 15, color: Colors.slate600,
    textAlign: 'center', marginTop: 8, lineHeight: 22, paddingHorizontal: 8,
  },
  cta: {
    width: '100%', backgroundColor: Colors.cyan500,
    paddingVertical: 16, borderRadius: 14, marginTop: 22, alignItems: 'center',
  },
  ctaLabel: { color: '#fff', fontFamily: 'Outfit_600SemiBold', fontSize: 16 },
  secondary: { paddingVertical: 14, marginTop: 4 },
  secondaryLabel: { color: Colors.slate500, fontFamily: 'Outfit_500Medium', fontSize: 15 },
  errMsg: {
    color: '#dc2626', fontSize: 13, textAlign: 'center', marginTop: 12,
    fontFamily: 'Outfit_500Medium',
  },
});
