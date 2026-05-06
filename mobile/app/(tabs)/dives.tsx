import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import api from '../../src/api/client';
import useAuthStore from '../../src/stores/authStore';
import { Colors } from '../../src/constants/colors';

const TABS = [
  { key: 'overview', label: 'Overview', icon: 'analytics-outline' as const },
  { key: 'log', label: 'Dive Log', icon: 'book-outline' as const },
];

export default function DivesScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const [tab, setTab] = useState('overview');
  const [logs, setLogs] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [logsRes, statsRes] = await Promise.all([
        api.get('/dive-logs'),
        api.get('/dive-logs/stats').catch(() => ({ data: null })),
      ]);
      setLogs(logsRes.data.logs || logsRes.data || []);
      setStats(statsRes.data);
    } catch (e) {
      console.log('Dive fetch error:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (user) fetchData();
    else setLoading(false);
  }, [user, fetchData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchData();
  }, [fetchData]);

  if (!user) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.authPrompt}>
          <Ionicons name="water" size={48} color={Colors.slate300} />
          <Text style={styles.authTitle}>My Dives</Text>
          <Text style={styles.authSubtitle}>Track every dive, plan your next adventure.</Text>
          <TouchableOpacity
            style={styles.authBtn}
            onPress={() => router.push('/auth')}
            testID="dive-in-btn"
          >
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
      </View>

      {/* Tabs */}
      <View style={styles.tabRow} testID="dive-tabs">
        {TABS.map((t) => (
          <TouchableOpacity
            key={t.key}
            style={[styles.tabBtn, tab === t.key && styles.tabBtnActive]}
            onPress={() => setTab(t.key)}
            testID={`tab-${t.key}`}
          >
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
        <View style={styles.overviewContent}>
          {/* Stats Cards */}
          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{stats?.total_dives || logs.length || 0}</Text>
              <Text style={styles.statLabel}>Total Dives</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{stats?.max_depth ? `${stats.max_depth}m` : '--'}</Text>
              <Text style={styles.statLabel}>Max Depth</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{stats?.total_time ? `${Math.round(stats.total_time / 60)}h` : '--'}</Text>
              <Text style={styles.statLabel}>Total Time</Text>
            </View>
          </View>
          {/* Recent Dives */}
          <Text style={styles.sectionTitle}>Recent Dives</Text>
          {logs.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyTitle}>No dives logged yet</Text>
              <Text style={styles.emptySubtitle}>Log your first dive to get started!</Text>
            </View>
          ) : (
            <FlatList
              data={logs.slice(0, 5)}
              keyExtractor={(item, i) => item.id || String(i)}
              renderItem={({ item }) => (
                <View style={styles.diveCard} testID={`dive-log-${item.id}`}>
                  <View style={styles.diveIcon}>
                    <Ionicons name="water" size={18} color={Colors.cyan400} />
                  </View>
                  <View style={styles.diveInfo}>
                    <Text style={styles.diveSite}>{item.site_name || item.location || 'Unknown Site'}</Text>
                    <Text style={styles.diveMeta}>
                      {item.date ? new Date(item.date).toLocaleDateString() : ''}
                      {item.max_depth ? ` • ${item.max_depth}m` : ''}
                      {item.duration ? ` • ${item.duration}min` : ''}
                    </Text>
                  </View>
                </View>
              )}
              scrollEnabled={false}
            />
          )}
        </View>
      ) : (
        <FlatList
          data={logs}
          keyExtractor={(item, i) => item.id || String(i)}
          renderItem={({ item }) => (
            <View style={styles.diveCard} testID={`dive-log-${item.id}`}>
              <View style={styles.diveIcon}>
                <Ionicons name="water" size={18} color={Colors.cyan400} />
              </View>
              <View style={styles.diveInfo}>
                <Text style={styles.diveSite}>{item.site_name || item.location || 'Unknown Site'}</Text>
                <Text style={styles.diveMeta}>
                  {item.date ? new Date(item.date).toLocaleDateString() : ''}
                  {item.max_depth ? ` • ${item.max_depth}m` : ''}
                  {item.duration ? ` • ${item.duration}min` : ''}
                </Text>
              </View>
            </View>
          )}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.cyan400} />}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyTitle}>No dives logged</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.slate50 },
  header: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  title: { fontSize: 24, fontWeight: '700', color: Colors.slate900 },
  subtitle: { fontSize: 14, color: Colors.slate500, marginTop: 2 },
  tabRow: { flexDirection: 'row', paddingHorizontal: 16, gap: 8, marginBottom: 16 },
  tabBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 12, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.borderLight },
  tabBtnActive: { backgroundColor: Colors.cyan400, borderColor: Colors.cyan400 },
  tabText: { fontSize: 13, fontWeight: '600', color: Colors.slate400 },
  tabTextActive: { color: Colors.white },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  overviewContent: { paddingHorizontal: 16, flex: 1 },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  statCard: { flex: 1, backgroundColor: Colors.white, borderRadius: 14, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: Colors.borderLight },
  statValue: { fontSize: 20, fontWeight: '700', color: Colors.slate900 },
  statLabel: { fontSize: 11, color: Colors.slate500, marginTop: 4 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: Colors.slate900, marginBottom: 12 },
  diveCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Colors.white, borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: Colors.borderLight },
  diveIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.cyan50, alignItems: 'center', justifyContent: 'center' },
  diveInfo: { flex: 1 },
  diveSite: { fontSize: 14, fontWeight: '600', color: Colors.slate900 },
  diveMeta: { fontSize: 12, color: Colors.slate500, marginTop: 2 },
  listContent: { paddingHorizontal: 16, paddingBottom: 20 },
  emptyContainer: { alignItems: 'center', paddingTop: 40 },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: Colors.slate700 },
  emptySubtitle: { fontSize: 13, color: Colors.slate500, marginTop: 4 },
  authPrompt: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  authTitle: { fontSize: 22, fontWeight: '700', color: Colors.slate900, marginTop: 12, marginBottom: 8 },
  authSubtitle: { fontSize: 14, color: Colors.slate500, textAlign: 'center', marginBottom: 20 },
  authBtn: { backgroundColor: Colors.cyan400, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 24 },
  authBtnText: { color: Colors.white, fontSize: 14, fontWeight: '700' },
});
