import React, { useCallback, useState } from 'react';
import {
  View,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Image,
} from 'react-native';
import { HapticTouchable as TouchableOpacity } from '../src/components/HapticTouchable';
import { Text } from '../src/components/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import Icon from '../src/components/Icon';
import api from '../src/api/client';
import { Colors } from '../src/constants/colors';
import { confirmDialog } from '../src/utils/confirm';
import { withRefreshHaptic } from '../src/utils/withRefreshHaptic';

const STATUS_COLOURS: Record<string, { bg: string; fg: string }> = {
  bucket: { bg: Colors.cyan100, fg: Colors.cyan500 },
  planned: { bg: '#fef3c7', fg: '#b45309' },
  visited: { bg: '#dcfce7', fg: '#15803d' },
};

export default function BucketListScreen() {
  const router = useRouter();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await api.get('/bucket-list');
      setItems(res.data?.items || []);
    } catch {/* silent */} finally { setLoading(false); setRefreshing(false); }
  }, []);

  useFocusEffect(useCallback(() => { setLoading(true); fetchData(); }, [fetchData]));

  const remove = async (itemId: string, name: string) => {
    const ok = await confirmDialog({
      title: 'Remove from bucket list?',
      message: `Remove "${name}" from your bucket list?`,
      confirmText: 'Remove', cancelText: 'Keep', destructive: true,
    });
    if (!ok) return;
    try { await api.delete(`/bucket-list/${itemId}`); fetchData(); } catch {/* silent */}
  };

  const setStatus = async (itemId: string, status: string) => {
    try {
      await api.put(`/bucket-list/${itemId}`, { status });
      fetchData();
    } catch {/* silent */}
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}><ActivityIndicator size="large" color={Colors.cyan400} /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} testID="bucket-list-screen">
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} testID="bl-back-btn">
          <Icon name="arrow-back" size={22} color={Colors.slate900} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Bucket list</Text>
        <View style={{ width: 22 }} />
      </View>

      <FlatList
        data={items}
        keyExtractor={(it) => it.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 10 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={withRefreshHaptic(() => { setRefreshing(true); fetchData(); })} tintColor={Colors.cyan400} />}
        ListEmptyComponent={
          <View style={styles.empty} testID="bl-empty">
            <Icon name="map-outline" size={40} color={Colors.slate300} />
            <Text style={styles.emptyTitle}>Bucket list is empty</Text>
            <Text style={styles.emptySubtitle}>Bookmark dive sites and experiences you want to do.</Text>
            <TouchableOpacity onPress={() => router.push('/discover' as any)} style={styles.shopBtn}>
              <Text style={styles.shopBtnText}>Discover dives</Text>
            </TouchableOpacity>
          </View>
        }
        renderItem={({ item: it }) => {
          const colors = STATUS_COLOURS[it.status] || STATUS_COLOURS.bucket;
          return (
            <View style={styles.card} testID={`bl-item-${it.id}`}>
              <TouchableOpacity onPress={() => it.listing_id && router.push({ pathname: '/listing/[id]', params: { id: it.listing_id } })}>
                {it.image ? (
                  <Image source={{ uri: it.image }} style={styles.img} />
                ) : (
                  <View style={[styles.img, { backgroundColor: Colors.slate100, alignItems: 'center', justifyContent: 'center' }]}>
                    <Icon name="image-outline" size={20} color={Colors.slate300} />
                  </View>
                )}
              </TouchableOpacity>
              <View style={{ flex: 1 }}>
                <View style={styles.titleRow}>
                  <Text style={styles.name} numberOfLines={1}>{it.site_name || it.title}</Text>
                  <View style={[styles.statusPill, { backgroundColor: colors.bg }]}>
                    <Text style={[styles.statusText, { color: colors.fg }]}>{it.status || 'bucket'}</Text>
                  </View>
                </View>
                {it.location && (
                  <Text style={styles.location}><Icon name="location-outline" size={11} /> {it.location}</Text>
                )}
                {it.notes && <Text style={styles.notes} numberOfLines={2}>{it.notes}</Text>}
                <View style={styles.actions}>
                  {it.status !== 'visited' && (
                    <TouchableOpacity onPress={() => setStatus(it.id, 'visited')} style={styles.tickBtn} testID={`bl-tick-${it.id}`}>
                      <Icon name="checkmark" size={12} color={Colors.white} />
                      <Text style={styles.tickText}>Visited</Text>
                    </TouchableOpacity>
                  )}
                  {it.status !== 'planned' && it.status !== 'visited' && (
                    <TouchableOpacity onPress={() => setStatus(it.id, 'planned')} style={styles.planBtn} testID={`bl-plan-${it.id}`}>
                      <Icon name="calendar-outline" size={12} color="#b45309" />
                      <Text style={styles.planText}>Planning</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity onPress={() => remove(it.id, it.site_name || it.title)} style={styles.removeBtn} testID={`bl-remove-${it.id}`}>
                    <Icon name="trash-outline" size={13} color={Colors.accent} />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.slate50 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  headerTitle: { fontSize: 17, fontWeight: '700', color: Colors.slate900 },
  empty: { alignItems: 'center', paddingVertical: 60, paddingHorizontal: 32 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: Colors.slate800, marginTop: 12 },
  emptySubtitle: { fontSize: 13, color: Colors.slate500, marginTop: 6, textAlign: 'center' },
  shopBtn: { marginTop: 14, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 999, backgroundColor: Colors.cyan500 },
  shopBtnText: { color: Colors.white, fontWeight: '700' },
  card: { flexDirection: 'row', gap: 12, padding: 12, borderRadius: 14, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.borderLight },
  img: { width: 80, height: 80, borderRadius: 10 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { flex: 1, fontSize: 13, fontWeight: '700', color: Colors.slate900 },
  statusPill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  statusText: { fontSize: 9, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  location: { fontSize: 11, color: Colors.slate500, marginTop: 2 },
  notes: { fontSize: 11, color: Colors.slate600, marginTop: 4 },
  actions: { flexDirection: 'row', gap: 6, marginTop: 6, alignItems: 'center' },
  tickBtn: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, backgroundColor: Colors.success },
  tickText: { color: Colors.white, fontSize: 10, fontWeight: '700' },
  planBtn: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, backgroundColor: '#fef3c7' },
  planText: { color: '#b45309', fontSize: 10, fontWeight: '700' },
  removeBtn: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.accent, marginLeft: 'auto' },
});
