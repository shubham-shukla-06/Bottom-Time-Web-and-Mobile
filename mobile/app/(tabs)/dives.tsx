import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import api from '../../src/api/client';
import useAuthStore from '../../src/stores/authStore';
import { Colors } from '../../src/constants/colors';

const TABS = [
  { key: 'overview', label: 'Overview', icon: 'analytics-outline' as const },
  { key: 'log', label: 'Dive Log', icon: 'book-outline' as const },
];

const DIVE_TYPE_COLOURS: Record<string, string> = {
  reef: '#10b981', wreck: '#f59e0b', night: '#6366f1', cave: '#475569',
  drift: Colors.cyan500, deep: '#3b82f6', shore: '#22c55e', boat: '#0ea5e9',
};

export default function DivesScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const [tab, setTab] = useState('overview');
  const [logs, setLogs] = useState<any[]>([]);
  const [stats, setStats] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');

  const fetchData = useCallback(async (q?: string) => {
    try {
      const params = q ? `?search=${encodeURIComponent(q)}` : '';
      const res = await api.get(`/dive-log${params}`);
      setLogs(res.data?.logs || []);
      setStats(res.data?.stats || {});
    } catch (e) {
      // silent — surfaces in empty state
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (user) fetchData();
    else setLoading(false);
  }, [user, fetchData]);

  useFocusEffect(useCallback(() => {
    if (user) fetchData(search);
  }, [user, fetchData, search]));

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchData(search);
  }, [fetchData, search]);

  const filtered = useMemo(() => {
    if (!search.trim()) return logs;
    const q = search.toLowerCase();
    return logs.filter((l) =>
      (l.site_name || '').toLowerCase().includes(q) ||
      (l.location || '').toLowerCase().includes(q)
    );
  }, [logs, search]);

  if (!user) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.authPrompt}>
          <Ionicons name="water" size={48} color={Colors.slate300} />
          <Text style={styles.authTitle}>My Dives</Text>
          <Text style={styles.authSubtitle}>Track every dive, plan your next adventure.</Text>
          <TouchableOpacity style={styles.authBtn} onPress={() => router.push('/welcome')} testID="dive-in-btn">
            <Text style={styles.authBtnText}>Dive in</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} testID="dive-dashboard">
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>My Dives</Text>
          <Text style={styles.subtitle}>Track, plan, and explore</Text>
        </View>
        <TouchableOpacity style={styles.headerCta} onPress={() => router.push('/dive-log/new')} testID="add-dive-btn">
          <Ionicons name="add" size={18} color={Colors.white} />
          <Text style={styles.headerCtaText}>Log dive</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.tabRow} testID="dive-tabs">
        {TABS.map((t) => (
          <TouchableOpacity key={t.key} style={[styles.tabBtn, tab === t.key && styles.tabBtnActive]}
            onPress={() => setTab(t.key)} testID={`tab-${t.key}`}>
            <Ionicons name={t.icon} size={15} color={tab === t.key ? Colors.white : Colors.slate400} />
            <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.cyan400} />
        </View>
      ) : tab === 'overview' ? (
        <FlatList
          data={[]}
          renderItem={null as any}
          ListHeaderComponent={
            <View style={{ paddingHorizontal: 16, paddingBottom: 24 }}>
              <View style={styles.statsRow}>
                <Stat label="Total" value={String(stats.total || logs.length || 0)} />
                <Stat label="Max depth" value={stats.max_depth ? `${stats.max_depth}m` : '—'} />
                <Stat label="Total time" value={stats.total_time ? `${stats.total_time}m` : '—'} />
              </View>
              <View style={styles.statsRow}>
                <Stat label="Avg depth" value={stats.avg_depth ? `${stats.avg_depth}m` : '—'} />
                <Stat label="Sites" value={String(stats.unique_sites || 0)} />
                <Stat label="Countries" value={String(stats.countries || 0)} />
              </View>

              <View style={styles.toolRow}>
                <ToolCard
                  icon="calculator-outline"
                  title="Plan a dive"
                  subtitle="NDL · gas · deco"
                  onPress={() => router.push('/dive-planner')}
                  testID="dive-planner-cta"
                />
                <ToolCard
                  icon="sunny-outline"
                  title="Surface log"
                  subtitle="Recap your dive day"
                  onPress={() => router.push('/surface-log')}
                  testID="surface-log-cta"
                />
              </View>

              <Text style={styles.sectionTitle}>Recent dives</Text>
              {logs.length === 0 ? (
                <EmptyState onPress={() => router.push('/dive-log/new')} />
              ) : (
                logs.slice(0, 5).map((item) => (
                  <DiveRow key={item.id} item={item} onPress={() => router.push({ pathname: '/dive-log/[id]', params: { id: item.id } })} />
                ))
              )}
            </View>
          }
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.cyan400} />}
          showsVerticalScrollIndicator={false}
        />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item, i) => item.id || String(i)}
          ListHeaderComponent={
            <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
              <View style={styles.searchWrap}>
                <Ionicons name="search" size={16} color={Colors.slate400} />
                <TextInput
                  value={search} onChangeText={setSearch}
                  placeholder="Search by site or location…"
                  placeholderTextColor={Colors.slate400}
                  style={styles.searchInput}
                  testID="dive-log-search"
                />
                {search ? (
                  <TouchableOpacity onPress={() => setSearch('')} testID="clear-search">
                    <Ionicons name="close-circle" size={16} color={Colors.slate400} />
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          }
          renderItem={({ item }) => (
            <View style={{ paddingHorizontal: 16 }}>
              <DiveRow item={item} onPress={() => router.push({ pathname: '/dive-log/[id]', params: { id: item.id } })} />
            </View>
          )}
          contentContainerStyle={{ paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.cyan400} />}
          ListEmptyComponent={<View style={{ padding: 16 }}><EmptyState onPress={() => router.push('/dive-log/new')} /></View>}
        />
      )}
    </SafeAreaView>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statCard} testID="dive-stat">
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function ToolCard({ icon, title, subtitle, onPress, testID }: {
  icon: keyof typeof Ionicons.glyphMap; title: string; subtitle: string;
  onPress: () => void; testID: string;
}) {
  return (
    <TouchableOpacity onPress={onPress} style={styles.toolCard} testID={testID}>
      <View style={styles.toolIcon}>
        <Ionicons name={icon} size={18} color={Colors.cyan500} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.toolTitle}>{title}</Text>
        <Text style={styles.toolSubtitle}>{subtitle}</Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={Colors.slate400} />
    </TouchableOpacity>
  );
}

function DiveRow({ item, onPress }: { item: any; onPress: () => void }) {
  const dot = DIVE_TYPE_COLOURS[item.dive_type] || Colors.cyan500;
  return (
    <TouchableOpacity onPress={onPress} style={styles.diveCard} testID={`dive-log-${item.id}`}>
      <View style={[styles.diveIcon, { backgroundColor: `${dot}1f` }]}>
        <Ionicons name="water" size={18} color={dot} />
      </View>
      <View style={styles.diveInfo}>
        <View style={styles.diveTitleRow}>
          <Text style={styles.diveSite} numberOfLines={1}>{item.site_name || 'Unknown site'}</Text>
          {item.dive_type ? (
            <View style={[styles.typePill, { backgroundColor: `${dot}1a` }]}>
              <Text style={[styles.typeText, { color: dot }]}>{item.dive_type}</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.diveLocation} numberOfLines={1}>
          <Ionicons name="location-outline" size={11} /> {item.location || '—'}
        </Text>
        <Text style={styles.diveMeta}>
          {item.date ? new Date(item.date).toLocaleDateString() : '—'}
          {item.max_depth != null ? ` • ${item.max_depth}m` : ''}
          {item.duration != null ? ` • ${item.duration}min` : ''}
          {item.water_temp != null ? ` • ${item.water_temp}°C` : ''}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={Colors.slate300} />
    </TouchableOpacity>
  );
}

function EmptyState({ onPress }: { onPress: () => void }) {
  return (
    <View style={styles.emptyContainer} testID="empty-dive-logs">
      <Ionicons name="water-outline" size={40} color={Colors.slate300} />
      <Text style={styles.emptyTitle}>No dives logged yet</Text>
      <Text style={styles.emptySubtitle}>Track your underwater adventures — depth, time, conditions, sightings.</Text>
      <TouchableOpacity onPress={onPress} style={styles.emptyCta} testID="empty-add-dive-btn">
        <Ionicons name="add" size={16} color={Colors.white} />
        <Text style={styles.emptyCtaText}>Log your first dive</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.slate50 },
  header: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 24, fontWeight: '700', color: Colors.slate900 },
  subtitle: { fontSize: 14, color: Colors.slate500, marginTop: 2 },
  headerCta: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999, backgroundColor: Colors.cyan500 },
  headerCtaText: { color: Colors.white, fontWeight: '700', fontSize: 13 },
  tabRow: { flexDirection: 'row', paddingHorizontal: 16, gap: 8, marginBottom: 16 },
  tabBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 12, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.borderLight },
  tabBtnActive: { backgroundColor: Colors.cyan400, borderColor: Colors.cyan400 },
  tabText: { fontSize: 13, fontWeight: '600', color: Colors.slate400 },
  tabTextActive: { color: Colors.white },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  statCard: { flex: 1, backgroundColor: Colors.white, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 10, alignItems: 'center', borderWidth: 1, borderColor: Colors.borderLight },
  statValue: { fontSize: 18, fontWeight: '700', color: Colors.slate900 },
  statLabel: { fontSize: 10, color: Colors.slate500, marginTop: 4, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  toolRow: { flexDirection: 'row', gap: 10, marginTop: 14, marginBottom: 18 },
  toolCard: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 14, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.borderLight },
  toolIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.cyan50, alignItems: 'center', justifyContent: 'center' },
  toolTitle: { fontSize: 13, fontWeight: '700', color: Colors.slate900 },
  toolSubtitle: { fontSize: 11, color: Colors.slate500, marginTop: 2 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: Colors.slate700, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  searchWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.white, marginBottom: 12 },
  searchInput: { flex: 1, fontSize: 14, color: Colors.slate900 },
  diveCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Colors.white, borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: Colors.borderLight },
  diveIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  diveInfo: { flex: 1 },
  diveTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  diveSite: { fontSize: 14, fontWeight: '700', color: Colors.slate900, flexShrink: 1 },
  typePill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  typeText: { fontSize: 9, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  diveLocation: { fontSize: 11, color: Colors.slate500, marginTop: 2 },
  diveMeta: { fontSize: 12, color: Colors.slate500, marginTop: 4 },
  emptyContainer: { alignItems: 'center', paddingVertical: 40, paddingHorizontal: 24, backgroundColor: Colors.white, borderRadius: 14, borderWidth: 1, borderColor: Colors.borderLight },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: Colors.slate700, marginTop: 12 },
  emptySubtitle: { fontSize: 13, color: Colors.slate500, marginTop: 6, textAlign: 'center' },
  emptyCta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 16, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 999, backgroundColor: Colors.cyan500 },
  emptyCtaText: { color: Colors.white, fontWeight: '700', fontSize: 13 },
  authPrompt: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  authTitle: { fontSize: 22, fontWeight: '700', color: Colors.slate900, marginTop: 12, marginBottom: 8 },
  authSubtitle: { fontSize: 14, color: Colors.slate500, textAlign: 'center', marginBottom: 20 },
  authBtn: { backgroundColor: Colors.cyan400, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 24 },
  authBtnText: { color: Colors.white, fontSize: 14, fontWeight: '700' },
});
