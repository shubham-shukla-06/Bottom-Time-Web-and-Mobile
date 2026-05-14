import React, { useCallback, useState } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Image,
} from 'react-native';
import { HapticTouchable as TouchableOpacity } from '../../src/components/HapticTouchable';
import { Text } from '../../src/components/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import Icon from '../../src/components/Icon';
import api from '../../src/api/client';
import { Colors } from '../../src/constants/colors';
import { confirmDialog } from '../../src/utils/confirm';

export default function UserProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [profile, setProfile] = useState<any>(null);
  const [connectionState, setConnectionState] = useState<'none' | 'sent' | 'connected' | 'pending'>('none');
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [profilesRes, connsRes] = await Promise.all([
        api.get('/community/profiles').catch(() => ({ data: { profiles: [] } })),
        api.get('/community/connections').catch(() => ({ data: { buddies: [], sent_ids: [], pending: [] } })),
      ]);
      const found = (profilesRes.data?.profiles || []).find((p: any) => p.id === id);
      setProfile(found || null);
      const buddies: any[] = connsRes.data?.buddies || [];
      const sentIds: string[] = connsRes.data?.sent_ids || [];
      const pending: any[] = connsRes.data?.pending || [];
      if (buddies.some((b) => b.buddy?.id === id)) setConnectionState('connected');
      else if (sentIds.includes(id || '')) setConnectionState('sent');
      else if (pending.some((p) => p.buddy?.id === id)) setConnectionState('pending');
      else setConnectionState('none');
    } catch {/* silent */}
    finally { setLoading(false); }
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleConnect = async () => {
    if (!id) return;
    setActing(true);
    try {
      await api.post(`/community/connect/${id}`);
      setConnectionState('sent');
    } catch {/* silent */} finally { setActing(false); }
  };

  const handleDisconnect = async () => {
    if (!id || !profile) return;
    const ok = await confirmDialog({
      title: 'Remove buddy?',
      message: `Disconnect from ${profile.name}? You'll need to send a new request to reconnect.`,
      confirmText: 'Remove',
      cancelText: 'Keep',
      destructive: true,
    });
    if (!ok) return;
    setActing(true);
    try {
      await api.delete(`/community/connect/${id}`);
      setConnectionState('none');
    } catch {/* silent */} finally { setActing(false); }
  };

  const openMessage = () => {
    if (!id) return;
    router.push({ pathname: '/thread/[userId]', params: { userId: id, kind: 'with' } });
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}><ActivityIndicator size="large" color={Colors.cyan400} /></View>
      </SafeAreaView>
    );
  }

  if (!profile) {
    return (
      <SafeAreaView style={styles.container} testID="user-profile-not-found">
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Icon name="arrow-back" size={22} color={Colors.slate900} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Profile</Text>
          <View style={{ width: 22 }} />
        </View>
        <View style={styles.center}>
          <Icon name="person-outline" size={40} color={Colors.slate300} />
          <Text style={styles.emptyTitle}>Profile not available</Text>
          <Text style={styles.emptySubtitle}>This diver may have made their profile private.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const initials = (profile.name || 'U').split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase();

  return (
    <SafeAreaView style={styles.container} testID="user-profile-screen">
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} testID="user-back-btn">
          <Icon name="arrow-back" size={22} color={Colors.slate900} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Profile</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 16 }}>
        <View style={styles.heroCard}>
          {profile.profile_photo ? (
            <Image source={{ uri: profile.profile_photo }} style={styles.bigAvatar} />
          ) : (
            <View style={[styles.bigAvatar, styles.bigAvatarFallback]}>
              <Text style={styles.bigAvatarText}>{initials}</Text>
            </View>
          )}
          <Text style={styles.name}>{profile.name}</Text>
          {profile.location_country ? (
            <Text style={styles.location}>
              <Icon name="location-outline" size={12} /> {profile.location_city ? `${profile.location_city}, ` : ''}{profile.location_country}
            </Text>
          ) : null}
          {profile.bio ? <Text style={styles.bio}>{profile.bio}</Text> : null}
        </View>

        <View style={styles.statsRow}>
          {profile.total_dives != null && <Stat icon="water-outline" label="Dives" value={String(profile.total_dives)} />}
          {profile.certification_level && <Stat icon="ribbon-outline" label="Cert" value={profile.certification_level.replace(/_/g, ' ')} />}
          {profile.years_diving != null && <Stat icon="calendar-outline" label="Years" value={String(profile.years_diving)} />}
        </View>

        <View style={styles.actions}>
          {connectionState === 'connected' ? (
            <>
              <TouchableOpacity style={styles.primaryBtn} onPress={openMessage} testID="user-message-btn">
                <Icon name="chatbubble" size={14} color={Colors.white} />
                <Text style={styles.primaryBtnText}>Message</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.dangerBtn} onPress={handleDisconnect} disabled={acting} testID="user-disconnect-btn">
                {acting ? <ActivityIndicator size="small" color={Colors.accent} /> : (
                  <>
                    <Icon name="person-remove-outline" size={14} color={Colors.accent} />
                    <Text style={styles.dangerBtnText}>Remove buddy</Text>
                  </>
                )}
              </TouchableOpacity>
            </>
          ) : connectionState === 'sent' ? (
            <View style={styles.sentPill}>
              <Icon name="time-outline" size={14} color="#b45309" />
              <Text style={styles.sentText}>Request sent</Text>
            </View>
          ) : connectionState === 'pending' ? (
            <Text style={styles.pendingNote}>You have a pending request from {profile.name}. Accept or decline from the Requests tab.</Text>
          ) : (
            <TouchableOpacity style={styles.primaryBtn} onPress={handleConnect} disabled={acting} testID="user-connect-btn">
              {acting ? <ActivityIndicator size="small" color={Colors.white} /> : (
                <>
                  <Icon name="person-add" size={14} color={Colors.white} />
                  <Text style={styles.primaryBtnText}>Send buddy request</Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string }) {
  return (
    <View style={styles.statCard}>
      <Icon name={icon} size={16} color={Colors.cyan500} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.slate50 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  headerTitle: { fontSize: 17, fontWeight: '700', color: Colors.slate900 },
  heroCard: { alignItems: 'center', backgroundColor: Colors.white, padding: 24, borderRadius: 18, gap: 8, borderWidth: 1, borderColor: Colors.borderLight },
  bigAvatar: { width: 84, height: 84, borderRadius: 42 },
  bigAvatarFallback: { backgroundColor: Colors.cyan500, alignItems: 'center', justifyContent: 'center' },
  bigAvatarText: { color: Colors.white, fontSize: 28, fontWeight: '700' },
  name: { fontSize: 22, fontWeight: '700', color: Colors.slate900 },
  location: { fontSize: 13, color: Colors.slate500 },
  bio: { fontSize: 13, color: Colors.slate700, textAlign: 'center', marginTop: 6, lineHeight: 18 },
  statsRow: { flexDirection: 'row', gap: 10 },
  statCard: { flex: 1, alignItems: 'center', gap: 4, padding: 14, borderRadius: 14, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.borderLight },
  statValue: { fontSize: 16, fontWeight: '700', color: Colors.slate900 },
  statLabel: { fontSize: 10, color: Colors.slate500, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  actions: { gap: 10 },
  primaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 13, borderRadius: 999, backgroundColor: Colors.cyan500 },
  primaryBtnText: { color: Colors.white, fontSize: 14, fontWeight: '700' },
  dangerBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 13, borderRadius: 999, borderWidth: 1, borderColor: Colors.accent, backgroundColor: Colors.white },
  dangerBtnText: { color: Colors.accent, fontSize: 14, fontWeight: '700' },
  sentPill: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 13, borderRadius: 999, backgroundColor: '#fffbeb' },
  sentText: { color: '#b45309', fontSize: 13, fontWeight: '700' },
  pendingNote: { fontSize: 13, color: Colors.slate600, textAlign: 'center', padding: 14, backgroundColor: '#fffbeb', borderRadius: 12 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: Colors.slate700, marginTop: 12 },
  emptySubtitle: { fontSize: 13, color: Colors.slate500, marginTop: 6, textAlign: 'center' },
});
