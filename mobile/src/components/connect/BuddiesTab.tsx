import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  TextInput,
  RefreshControl,
} from 'react-native';
import { HapticTouchable as TouchableOpacity } from '../HapticTouchable';
import { Text } from '../Text';
import { useRouter } from 'expo-router';
import Icon from '../Icon';
import api from '../../api/client';
import { Colors } from '../../constants/colors';
import useTabBarOnScroll from '../../hooks/useTabBarOnScroll';
import { confirmDialog } from '../../utils/confirm';
import { triggerHaptic } from '../../../src/utils/haptics';

type SubTab = 'matches' | 'browse' | 'requests' | 'buddies';

const SUB_TABS: { key: SubTab; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'matches', label: 'For You', icon: 'sparkles-outline' },
  { key: 'browse', label: 'Browse', icon: 'search-outline' },
  { key: 'requests', label: 'Requests', icon: 'mail-outline' },
  { key: 'buddies', label: 'Buddies', icon: 'people-outline' },
];

export default function BuddiesTab() {
  const router = useRouter();
  const [subTab, setSubTab] = useState<SubTab>('matches');
  const onListScroll = useTabBarOnScroll();
  const [search, setSearch] = useState('');
  const [matches, setMatches] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [buddies, setBuddies] = useState<any[]>([]);
  const [pending, setPending] = useState<any[]>([]);
  const [sent, setSent] = useState<any[]>([]);
  const [sentIds, setSentIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchConnections = useCallback(async () => {
    try {
      const res = await api.get('/community/connections');
      setBuddies(res.data?.buddies || []);
      setPending(res.data?.pending || []);
      setSent(res.data?.sent || []);
      setSentIds(res.data?.sent_ids || []);
    } catch {/* silent */}
  }, []);

  const fetchMatches = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/buddy-finder/matches?limit=20');
      setMatches(res.data?.matches || []);
    } catch {/* silent */} finally { setLoading(false); setRefreshing(false); }
  }, []);

  const fetchProfiles = useCallback(async (q?: string) => {
    setLoading(true);
    try {
      const params = q ? `?country=${encodeURIComponent(q)}` : '';
      const res = await api.get(`/community/profiles${params}`);
      setProfiles(res.data?.profiles || []);
    } catch {/* silent */} finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => {
    fetchConnections();
    if (subTab === 'matches') fetchMatches();
    else if (subTab === 'browse') fetchProfiles();
    else { setLoading(false); }
  }, [subTab, fetchConnections, fetchMatches, fetchProfiles]);

  const onRefresh = () => {
    try { void triggerHaptic('selection'); } catch {/* noop */}
    setRefreshing(true);
    fetchConnections();
    if (subTab === 'matches') fetchMatches();
    else if (subTab === 'browse') fetchProfiles(search);
    else setRefreshing(false);
  };

  const handleConnect = async (userId: string) => {
    try {
      await api.post(`/community/connect/${userId}`);
      setSentIds((prev) => [...prev, userId]);
    } catch {/* silent */}
  };

  const handleRespond = async (connId: string, action: 'accept' | 'reject') => {
    try {
      await api.put(`/community/connections/${connId}?action=${action}`);
      fetchConnections();
    } catch {/* silent */}
  };

  const handleDisconnect = async (userId: string, name: string) => {
    const ok = await confirmDialog({
      title: 'Remove buddy?',
      message: `Disconnect from ${name}? You'll need to send a new request to reconnect.`,
      confirmText: 'Remove',
      cancelText: 'Keep',
      destructive: true,
    });
    if (!ok) return;
    try {
      await api.delete(`/community/connect/${userId}`);
      fetchConnections();
    } catch {/* silent */}
  };

  return (
    <View style={{ flex: 1 }} testID="buddies-tab-content">
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.subTabRow}>
        {SUB_TABS.map((t) => {
          const active = subTab === t.key;
          const count = t.key === 'requests' ? pending.length + sent.length : t.key === 'buddies' ? buddies.length : 0;
          return (
            <TouchableOpacity key={t.key} onPress={() => setSubTab(t.key)}
              style={[styles.subTab, active && styles.subTabActive]} testID={`subtab-${t.key}`}>
              <Icon name={t.icon} size={13} color={active ? Colors.slate900 : Colors.slate500} />
              <Text style={[styles.subTabText, active && styles.subTabTextActive]}>{t.label}</Text>
              {count > 0 && <View style={[styles.countPill, active && styles.countPillActive]}>
                <Text style={[styles.countText, active && { color: Colors.cyan500 }]}>{count}</Text>
              </View>}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {subTab === 'browse' && (
        <View style={styles.searchRow}>
          <Icon name="search" size={14} color={Colors.slate400} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            onSubmitEditing={() => fetchProfiles(search)}
            placeholder="Filter by country…"
            style={styles.searchInput}
            testID="browse-search"
          />
          {search ? (
            <TouchableOpacity onPress={() => { setSearch(''); fetchProfiles(); }}>
              <Icon name="close-circle" size={14} color={Colors.slate400} />
            </TouchableOpacity>
          ) : null}
        </View>
      )}

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 140, gap: 10 }}
        onScroll={onListScroll}
        scrollEventThrottle={16}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.cyan400} />}
      >
        {loading ? (
          <View style={{ paddingVertical: 40, alignItems: 'center' }}>
            <ActivityIndicator size="large" color={Colors.cyan400} />
          </View>
        ) : (
          <>
            {subTab === 'matches' && (
              matches.length === 0 ? <Empty title="No matches yet" subtitle="We'll find buddies as more divers join." /> :
                matches.map((m) => (
                  <DiverCard
                    key={m.id}
                    profile={m}
                    score={m.compatibility}
                    isSent={sentIds.includes(m.id)}
                    onConnect={() => handleConnect(m.id)}
                    onView={() => router.push({ pathname: '/user/[id]', params: { id: m.id } })}
                  />
                ))
            )}

            {subTab === 'browse' && (
              profiles.length === 0 ? <Empty title="No divers found" subtitle="Try a different country filter." /> :
                profiles.map((p) => (
                  <DiverCard
                    key={p.id}
                    profile={p}
                    isSent={sentIds.includes(p.id)}
                    onConnect={() => handleConnect(p.id)}
                    onView={() => router.push({ pathname: '/user/[id]', params: { id: p.id } })}
                  />
                ))
            )}

            {subTab === 'requests' && (
              pending.length === 0 && sent.length === 0 ?
                <Empty title="No requests" subtitle="Buddy requests will show up here." /> :
                <>
                  {pending.length > 0 && (
                    <>
                      <SectionLabel>Received</SectionLabel>
                      {pending.map((p) => (
                        <View key={p.id} style={styles.row} testID="request-card">
                          <Avatar name={p.buddy?.name} />
                          <View style={{ flex: 1 }}>
                            <Text style={styles.rowTitle}>{p.buddy?.name}</Text>
                            {p.buddy?.location_country && <Text style={styles.rowSub}>{p.buddy.location_country}</Text>}
                          </View>
                          <TouchableOpacity onPress={() => handleRespond(p.id, 'accept')} style={styles.acceptBtn} testID={`accept-${p.id}`}>
                            <Icon name="checkmark" size={14} color={Colors.white} />
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => handleRespond(p.id, 'reject')} style={styles.rejectBtn} testID={`reject-${p.id}`}>
                            <Icon name="close" size={14} color={Colors.slate500} />
                          </TouchableOpacity>
                        </View>
                      ))}
                    </>
                  )}
                  {sent.length > 0 && (
                    <>
                      <SectionLabel>Sent</SectionLabel>
                      {sent.map((s) => (
                        <View key={s.id} style={[styles.row, { opacity: 0.7 }]} testID="sent-card">
                          <Avatar name={s.buddy?.name} />
                          <View style={{ flex: 1 }}>
                            <Text style={styles.rowTitle}>{s.buddy?.name}</Text>
                          </View>
                          <View style={styles.pendingPill}>
                            <Icon name="time-outline" size={10} color="#b45309" />
                            <Text style={styles.pendingText}>Pending</Text>
                          </View>
                        </View>
                      ))}
                    </>
                  )}
                </>
            )}

            {subTab === 'buddies' && (
              buddies.length === 0 ?
                <Empty title="No buddies yet" subtitle="Connect with divers in 'For You' to start a network." /> :
                buddies.map((b) => (
                  <View key={b.id} style={styles.row} testID="buddy-card">
                    <TouchableOpacity onPress={() => router.push({ pathname: '/user/[id]', params: { id: b.buddy?.id } })}>
                      <Avatar name={b.buddy?.name} />
                    </TouchableOpacity>
                    <TouchableOpacity style={{ flex: 1 }} onPress={() => router.push({ pathname: '/user/[id]', params: { id: b.buddy?.id } })}>
                      <Text style={styles.rowTitle}>{b.buddy?.name}</Text>
                      {b.buddy?.location_country && <Text style={styles.rowSub}>{b.buddy.location_country}</Text>}
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => router.push({ pathname: '/thread/[userId]', params: { userId: b.buddy?.id } })}
                      style={styles.iconAction} testID={`message-${b.buddy?.id}`}>
                      <Icon name="chatbubble-outline" size={14} color={Colors.cyan500} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => handleDisconnect(b.buddy?.id, b.buddy?.name || 'this buddy')}
                      style={styles.iconAction} testID={`disconnect-${b.buddy?.id}`}>
                      <Icon name="person-remove-outline" size={14} color={Colors.accent} />
                    </TouchableOpacity>
                  </View>
                ))
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function DiverCard({ profile, score, isSent, onConnect, onView }: {
  profile: any; score?: number; isSent: boolean; onConnect: () => void; onView: () => void;
}) {
  return (
    <TouchableOpacity onPress={onView} style={styles.diverCard} testID={`diver-card-${profile.id}`}>
      <Avatar name={profile.name} size={42} />
      <View style={{ flex: 1, gap: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={styles.rowTitle}>{profile.name}</Text>
          {score != null && (
            <View style={[styles.scoreChip, score >= 75 ? styles.scoreHigh : score >= 50 ? styles.scoreMid : styles.scoreLow]}>
              <Text style={styles.scoreText}>{score}%</Text>
            </View>
          )}
        </View>
        {profile.location_country && (
          <Text style={styles.rowSub}><Icon name="location-outline" size={10} /> {profile.location_country}</Text>
        )}
        <View style={styles.diverChips}>
          {profile.certification_level && (
            <View style={styles.diverChip}><Text style={styles.diverChipText}>{profile.certification_level}</Text></View>
          )}
          {profile.total_dives > 0 && (
            <View style={[styles.diverChip, { backgroundColor: '#eff6ff' }]}>
              <Text style={[styles.diverChipText, { color: '#2563eb' }]}>{profile.total_dives} dives</Text>
            </View>
          )}
        </View>
      </View>
      <TouchableOpacity onPress={onConnect} disabled={isSent}
        style={[styles.connectBtn, isSent && styles.connectBtnSent]}
        testID={`connect-${profile.id}`}>
        {isSent ? (
          <><Icon name="time" size={12} color={Colors.slate500} /><Text style={styles.connectBtnSentText}>Pending</Text></>
        ) : (
          <><Icon name="person-add" size={12} color={Colors.white} /><Text style={styles.connectBtnText}>Connect</Text></>
        )}
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

function Avatar({ name, size = 36 }: { name?: string; size?: number }) {
  const initials = (name || 'U').split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: Colors.cyan500, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: Colors.white, fontWeight: '700', fontSize: size * 0.36 }}>{initials}</Text>
    </View>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <Text style={styles.sectionLabel}>{children}</Text>;
}

function Empty({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <View style={styles.empty} testID="buddies-empty">
      <Icon name="people-outline" size={36} color={Colors.slate300} />
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptySubtitle}>{subtitle}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  subTabRow: { paddingHorizontal: 16, gap: 6, paddingBottom: 12 },
  subTab: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.borderLight },
  subTabActive: { backgroundColor: Colors.white, borderColor: Colors.cyan400 },
  subTabText: { fontSize: 12, fontWeight: '600', color: Colors.slate500 },
  subTabTextActive: { color: Colors.slate900 },
  countPill: { paddingHorizontal: 5, paddingVertical: 1, borderRadius: 999, backgroundColor: Colors.slate100 },
  countPillActive: { backgroundColor: Colors.cyan100 },
  countText: { fontSize: 9, fontWeight: '700', color: Colors.slate500 },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginBottom: 10, paddingHorizontal: 12, paddingVertical: 9, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border, borderRadius: 12 },
  searchInput: { flex: 1, fontSize: 13, color: Colors.slate900 },
  diverCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.borderLight },
  rowTitle: { fontSize: 14, fontWeight: '700', color: Colors.slate900 },
  rowSub: { fontSize: 11, color: Colors.slate500 },
  diverChips: { flexDirection: 'row', gap: 4, flexWrap: 'wrap' },
  diverChip: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999, backgroundColor: Colors.cyan50 },
  diverChipText: { fontSize: 9, fontWeight: '700', color: Colors.cyan500, textTransform: 'uppercase', letterSpacing: 0.5 },
  scoreChip: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 999 },
  scoreHigh: { backgroundColor: '#ecfdf5' },
  scoreMid: { backgroundColor: '#fffbeb' },
  scoreLow: { backgroundColor: Colors.slate100 },
  scoreText: { fontSize: 9, fontWeight: '900', color: Colors.slate700 },
  connectBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 999, backgroundColor: Colors.cyan500 },
  connectBtnText: { color: Colors.white, fontSize: 11, fontWeight: '700' },
  connectBtnSent: { backgroundColor: Colors.slate100 },
  connectBtnSentText: { color: Colors.slate500, fontSize: 11, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 14, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.borderLight },
  acceptBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.cyan500, alignItems: 'center', justifyContent: 'center' },
  rejectBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.slate100, alignItems: 'center', justifyContent: 'center' },
  iconAction: { width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.slate50, alignItems: 'center', justifyContent: 'center' },
  pendingPill: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: '#fffbeb' },
  pendingText: { fontSize: 10, fontWeight: '700', color: '#b45309' },
  sectionLabel: { fontSize: 10, fontWeight: '700', color: Colors.slate500, textTransform: 'uppercase', letterSpacing: 1, marginTop: 4, marginBottom: 4 },
  empty: { alignItems: 'center', paddingVertical: 40, paddingHorizontal: 24, backgroundColor: Colors.white, borderRadius: 14, borderWidth: 1, borderColor: Colors.borderLight },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: Colors.slate700, marginTop: 12 },
  emptySubtitle: { fontSize: 13, color: Colors.slate500, marginTop: 6, textAlign: 'center' },
});
