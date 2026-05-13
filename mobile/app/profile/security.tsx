/**
 * Profile → Security screen. Phase A — mobile biometric resume (2026-05-07).
 *
 * Sections:
 *   1. Biometric login toggle.
 *   2. Active sessions list — each row has a "Sign out" button calling
 *      /api/auth/session/revoke; plus a "Sign out everywhere" button.
 *   3. Footer note: changing email/phone signs out of every device.
 */
import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Pressable,
  StyleSheet,
  ScrollView,
  Switch,
  ActivityIndicator,
} from 'react-native';
import { Text } from '../../src/components/Text';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Icon from '../../src/components/Icon';
import useAuthStore from '../../src/stores/authStore';
import { Colors } from '../../src/constants/colors';
import { confirmDialog } from '../../src/utils/confirm';
import {
  isBiometricAvailable, getBiometricType, biometricLabel, authenticate,
  type BiometricKind,
} from '../../src/services/biometric';
import {
  listSessions, revokeSession, revokeAllSessions, type SessionRow,
} from '../../src/api/sessionApi';

export default function SecurityScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const biometricEnabled = useAuthStore((s) => s.biometricEnabled);
  const enrollBiometric = useAuthStore((s) => s.enrollBiometric);
  const disableBiometric = useAuthStore((s) => s.disableBiometric);
  const sessionId = useAuthStore((s) => s.sessionId);
  const logout = useAuthStore((s) => s.logout);

  const [available, setAvailable] = useState<boolean>(false);
  const [kind, setKind] = useState<BiometricKind>('generic');
  const [sessions, setSessions] = useState<SessionRow[] | null>(null);
  const [busyRow, setBusyRow] = useState<string | null>(null);
  const [busyToggle, setBusyToggle] = useState(false);
  const [busyAll, setBusyAll] = useState(false);
  const label = biometricLabel(kind);

  useEffect(() => {
    (async () => {
      setAvailable(await isBiometricAvailable());
      setKind(await getBiometricType());
    })();
  }, []);

  const refresh = useCallback(async () => {
    try {
      const rows = await listSessions(sessionId || undefined);
      setSessions(rows);
    } catch {
      setSessions([]);
    }
  }, [sessionId]);

  useEffect(() => { refresh(); }, [refresh]);

  const onToggle = async (next: boolean) => {
    setBusyToggle(true);
    try {
      if (next) {
        const auth = await authenticate(`Enable ${label} login`);
        if (!auth.success) return;
        await enrollBiometric();
      } else {
        const ok = await confirmDialog({
          title: `Disable ${label} login?`,
          message: `You'll need to enter an OTP next time you open Bottom Time.`,
          confirmText: 'Disable',
          cancelText: 'Cancel',
          destructive: true,
        });
        if (!ok) return;
        await disableBiometric();
      }
    } finally {
      setBusyToggle(false);
    }
  };

  const onRevoke = async (row: SessionRow) => {
    if (row.is_current) {
      const ok = await confirmDialog({
        title: 'Sign out of this device?',
        message: 'You will be signed out and need to enter an OTP to sign back in.',
        confirmText: 'Sign out',
        cancelText: 'Cancel',
        destructive: true,
      });
      if (!ok) return;
      await logout();
      router.replace('/welcome');
      return;
    }
    const ok = await confirmDialog({
      title: `Sign out of ${row.device_name}?`,
      confirmText: 'Sign out',
      cancelText: 'Cancel',
      destructive: true,
    });
    if (!ok) return;
    setBusyRow(row.session_id);
    try {
      await revokeSession(row.session_id);
      await refresh();
    } finally { setBusyRow(null); }
  };

  const onRevokeAll = async () => {
    const ok = await confirmDialog({
      title: 'Sign out of every device?',
      message: 'All sessions including this one will be revoked. You will need an OTP to sign back in.',
      confirmText: 'Sign out everywhere',
      cancelText: 'Cancel',
      destructive: true,
    });
    if (!ok) return;
    setBusyAll(true);
    try {
      await revokeAllSessions();
      await logout();
      router.replace('/welcome');
    } finally { setBusyAll(false); }
  };

  return (
    <SafeAreaView style={styles.root} testID="security-screen">
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} testID="security-back">
          <Icon name="chevron-back" size={26} color={Colors.slate900} />
        </Pressable>
        <Text style={styles.headerTitle}>Security</Text>
        <View style={{ width: 26 }} />
      </View>
      <ScrollView contentContainerStyle={styles.scroll}>

        <Text style={styles.sectionTitle}>Sign-in</Text>
        <View style={styles.card}>
          <View style={styles.toggleRow}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={styles.toggleLabel}>Biometric login</Text>
              <Text style={styles.toggleHelp}>
                {available
                  ? `Use ${label} to sign in without an OTP next time you open the app.`
                  : 'Biometrics aren\'t available on this device.'}
              </Text>
            </View>
            {busyToggle
              ? <ActivityIndicator color={Colors.cyan500} />
              : (
                <Switch
                  value={biometricEnabled}
                  onValueChange={onToggle}
                  disabled={!available || busyToggle}
                  trackColor={{ false: Colors.slate200, true: Colors.cyan400 }}
                  thumbColor="#fff"
                  testID="security-biometric-toggle"
                />
              )}
          </View>
        </View>

        <Text style={styles.sectionTitle}>Active sessions</Text>
        <View style={styles.card}>
          {sessions === null
            ? <ActivityIndicator color={Colors.cyan500} style={{ marginVertical: 16 }} />
            : sessions.length === 0
              ? <Text style={styles.empty}>No active sessions.</Text>
              : sessions.map((s, i) => (
                <View
                  key={s.session_id}
                  style={[styles.sessRow, i < sessions.length - 1 && styles.divider]}
                  testID={`security-session-${s.session_id}`}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.sessName}>
                      {s.device_name}
                      {s.is_current && <Text style={styles.current}>  ·  Current</Text>}
                    </Text>
                    <Text style={styles.sessMeta}>
                      {s.platform.toUpperCase()} · last used {fmtRel(s.last_used_at)}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => onRevoke(s)}
                    disabled={busyRow === s.session_id}
                    style={({ pressed }) => [styles.revokeBtn, pressed && { opacity: 0.6 }]}
                    testID={`security-revoke-${s.session_id}`}
                  >
                    {busyRow === s.session_id
                      ? <ActivityIndicator color="#dc2626" size="small" />
                      : <Text style={styles.revokeLabel}>Sign out</Text>}
                  </Pressable>
                </View>
              ))}
        </View>

        <Pressable
          onPress={onRevokeAll}
          disabled={busyAll}
          style={({ pressed }) => [styles.revokeAllBtn, pressed && { opacity: 0.85 }, busyAll && { opacity: 0.6 }]}
          testID="security-revoke-all"
        >
          {busyAll
            ? <ActivityIndicator color="#dc2626" />
            : <Text style={styles.revokeAllLabel}>Sign out everywhere</Text>}
        </Pressable>

        <Text style={styles.footnote}>
          Changing your email or phone number signs you out of all devices.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function fmtRel(iso: string | null): string {
  if (!iso) return '—';
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '—';
  const diff = Date.now() - t;
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.slate50 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 12, backgroundColor: '#fff',
    borderBottomWidth: 1, borderBottomColor: Colors.slate100,
  },
  headerTitle: { fontFamily: 'Outfit_600SemiBold', fontSize: 18, color: Colors.slate900 },
  scroll: { padding: 16, paddingBottom: 64 },
  sectionTitle: {
    fontFamily: 'Outfit_600SemiBold', fontSize: 12, letterSpacing: 0.5,
    textTransform: 'uppercase', color: Colors.slate500, marginTop: 8, marginBottom: 8,
  },
  card: {
    backgroundColor: '#fff', borderRadius: 16, paddingHorizontal: 16, paddingVertical: 4,
    borderWidth: 1, borderColor: Colors.slate100,
  },
  toggleRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 14,
  },
  toggleLabel: { fontFamily: 'Outfit_600SemiBold', fontSize: 15, color: Colors.slate900 },
  toggleHelp: { fontFamily: 'Outfit_400Regular', fontSize: 13, color: Colors.slate500, marginTop: 2, lineHeight: 18 },
  sessRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, gap: 12 },
  divider: { borderBottomWidth: 1, borderBottomColor: Colors.slate100 },
  sessName: { fontFamily: 'Outfit_600SemiBold', fontSize: 15, color: Colors.slate900 },
  current: { color: Colors.cyan600, fontFamily: 'Outfit_500Medium' },
  sessMeta: { fontFamily: 'Outfit_400Regular', fontSize: 12, color: Colors.slate500, marginTop: 2 },
  revokeBtn: { paddingHorizontal: 12, paddingVertical: 8 },
  revokeLabel: { color: '#dc2626', fontFamily: 'Outfit_600SemiBold', fontSize: 14 },
  revokeAllBtn: {
    marginTop: 22, alignItems: 'center', paddingVertical: 14, borderRadius: 14,
    backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fecaca',
  },
  revokeAllLabel: { color: '#dc2626', fontFamily: 'Outfit_600SemiBold', fontSize: 15 },
  footnote: {
    color: Colors.slate500, fontFamily: 'Outfit_400Regular', fontSize: 13,
    textAlign: 'center', marginTop: 18, paddingHorizontal: 16, lineHeight: 19,
  },
  empty: { fontFamily: 'Outfit_400Regular', color: Colors.slate500, fontSize: 14, paddingVertical: 18, textAlign: 'center' },
});
