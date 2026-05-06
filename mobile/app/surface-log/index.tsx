import React, { useCallback, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import api from '../../src/api/client';
import { Colors } from '../../src/constants/colors';

const MOOD_LABEL: Record<string, string> = {
  stoked: 'Stoked',
  serene: 'Serene',
  adventurous: 'Adventurous',
  grateful: 'Grateful',
  tired: 'Tired but happy',
  mind_blown: 'Mind blown',
};

export default function SurfaceLogIndex() {
  const router = useRouter();
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchLogs = useCallback(async () => {
    setError(null);
    try {
      const res = await api.get('/surface-log');
      setLogs(res.data?.logs || []);
    } catch (e: any) {
      setError(e?.response?.data?.detail || e?.message || 'Failed to load surface logs');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { setLoading(true); fetchLogs(); }, [fetchLogs]));

  const onRefresh = () => { setRefreshing(true); fetchLogs(); };

  return (
    <SafeAreaView style={styles.container} testID="surface-log-screen">
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} testID="sl-back-btn">
          <Ionicons name="arrow-back" size={22} color={Colors.slate900} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Surface log</Text>
        <TouchableOpacity onPress={() => router.push('/surface-log/new')} testID="sl-new-btn">
          <Ionicons name="add-circle" size={26} color={Colors.cyan500} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={Colors.cyan400} /></View>
      ) : (
        <FlatList
          data={logs}
          keyExtractor={(l, i) => l.id || String(i)}
          contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 12 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.cyan400} />}
          ListHeaderComponent={
            error ? (
              <View style={styles.errorBanner}>
                <Ionicons name="alert-circle" size={16} color={Colors.accent} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer} testID="empty-surface-logs">
              <Ionicons name="sunny-outline" size={40} color={Colors.slate300} />
              <Text style={styles.emptyTitle}>No dive day recaps yet</Text>
              <Text style={styles.emptySubtitle}>Surface logs auto-build a beautiful recap from the dives you logged on a given day. Add a mood, highlight and caption to share.</Text>
              <TouchableOpacity onPress={() => router.push('/surface-log/new')} style={styles.emptyCta} testID="empty-create-surface-btn">
                <Ionicons name="add" size={16} color={Colors.white} />
                <Text style={styles.emptyCtaText}>Create surface log</Text>
              </TouchableOpacity>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.logCard} testID={`surface-log-${item.id}`}>
              <View style={styles.logHeader}>
                <View>
                  <Text style={styles.logDate}>{(item.date || '').slice(0, 10)}</Text>
                  {item.location ? <Text style={styles.logLocation}>{item.location}</Text> : null}
                </View>
                {item.mood && (
                  <View style={styles.moodPill}>
                    <Text style={styles.moodText}>{MOOD_LABEL[item.mood] || item.mood}</Text>
                  </View>
                )}
              </View>

              <View style={styles.logStats}>
                <Stat label="Dives" value={String(item.dive_count || 0)} />
                <Stat label="Max depth" value={item.max_depth ? `${item.max_depth}m` : '—'} />
                <Stat label="Total time" value={item.total_time ? `${item.total_time}m` : '—'} />
                {item.water_temp != null && <Stat label="Water" value={`${item.water_temp}°C`} />}
              </View>

              {item.sites && item.sites.length > 0 && (
                <View style={styles.sitesRow}>
                  {item.sites.slice(0, 3).map((s: string) => (
                    <View key={s} style={styles.siteChip}>
                      <Ionicons name="location" size={10} color={Colors.cyan500} />
                      <Text style={styles.siteChipText}>{s}</Text>
                    </View>
                  ))}
                  {item.sites.length > 3 && <Text style={styles.moreSites}>+{item.sites.length - 3} more</Text>}
                </View>
              )}

              {item.highlight ? (
                <View style={styles.highlightBox}>
                  <Ionicons name="sparkles" size={12} color={Colors.cyan500} />
                  <Text style={styles.highlightText} numberOfLines={2}>{item.highlight}</Text>
                </View>
              ) : null}

              {item.caption ? <Text style={styles.caption} numberOfLines={3}>{item.caption}</Text> : null}

              {item.species && item.species.length > 0 && (
                <View style={styles.speciesRow}>
                  {item.species.slice(0, 4).map((sp: string) => (
                    <View key={sp} style={styles.speciesChip}>
                      <Ionicons name="fish" size={10} color={Colors.slate600} />
                      <Text style={styles.speciesText}>{sp}</Text>
                    </View>
                  ))}
                </View>
              )}

              <View style={styles.engageRow}>
                <View style={styles.engageItem}>
                  <Ionicons name="heart-outline" size={14} color={Colors.slate500} />
                  <Text style={styles.engageText}>{item.reaction_count || 0}</Text>
                </View>
                <View style={styles.engageItem}>
                  <Ionicons name="chatbubble-outline" size={14} color={Colors.slate500} />
                  <Text style={styles.engageText}>{item.comment_count || 0}</Text>
                </View>
              </View>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statBlock}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.slate50 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  headerTitle: { fontSize: 17, fontWeight: '700', color: Colors.slate900 },
  errorBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 10, backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fecaca', marginBottom: 12 },
  errorText: { flex: 1, fontSize: 13, color: Colors.accent },
  logCard: { backgroundColor: Colors.white, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: Colors.borderLight, gap: 12 },
  logHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  logDate: { fontSize: 14, fontWeight: '700', color: Colors.slate900 },
  logLocation: { fontSize: 12, color: Colors.slate500, marginTop: 2 },
  moodPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: Colors.cyan50 },
  moodText: { fontSize: 11, fontWeight: '700', color: Colors.cyan500 },
  logStats: { flexDirection: 'row', gap: 14, paddingTop: 4 },
  statBlock: { gap: 2 },
  statValue: { fontSize: 16, fontWeight: '700', color: Colors.slate900 },
  statLabel: { fontSize: 10, color: Colors.slate500, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  sitesRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  siteChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, backgroundColor: Colors.cyan50 },
  siteChipText: { fontSize: 11, fontWeight: '600', color: Colors.cyan500 },
  moreSites: { fontSize: 11, color: Colors.slate500 },
  highlightBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, padding: 10, borderRadius: 10, backgroundColor: Colors.cyan50 },
  highlightText: { flex: 1, fontSize: 13, color: Colors.slate800, fontWeight: '600' },
  caption: { fontSize: 13, color: Colors.slate700, lineHeight: 18 },
  speciesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  speciesChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, backgroundColor: Colors.slate100 },
  speciesText: { fontSize: 10, color: Colors.slate700, fontWeight: '600' },
  engageRow: { flexDirection: 'row', gap: 16, paddingTop: 4, borderTopWidth: 1, borderTopColor: Colors.borderLight },
  engageItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  engageText: { fontSize: 12, color: Colors.slate500, fontWeight: '600' },
  emptyContainer: { alignItems: 'center', paddingVertical: 40, paddingHorizontal: 24, backgroundColor: Colors.white, borderRadius: 14, borderWidth: 1, borderColor: Colors.borderLight },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: Colors.slate700, marginTop: 12 },
  emptySubtitle: { fontSize: 13, color: Colors.slate500, marginTop: 6, textAlign: 'center', lineHeight: 18 },
  emptyCta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 16, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 999, backgroundColor: Colors.cyan500 },
  emptyCtaText: { color: Colors.white, fontWeight: '700', fontSize: 13 },
});
