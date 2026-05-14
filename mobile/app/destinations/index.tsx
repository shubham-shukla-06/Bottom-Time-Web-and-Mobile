import React, { useCallback, useState } from 'react';
import {
  View,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Image,
} from 'react-native';
import { HapticTouchable as TouchableOpacity } from '../../src/components/HapticTouchable';
import { Text } from '../../src/components/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import Icon from '../../src/components/Icon';
import api from '../../src/api/client';
import { Colors } from '../../src/constants/colors';
import { withRefreshHaptic } from '../../src/utils/withRefreshHaptic';
import { DestinationsGridSkeleton } from '../../src/components/skeletons/DestinationsGridSkeleton';

export default function DestinationsScreen() {
  const router = useRouter();
  const [destinations, setDestinations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.get('/destinations');
      setDestinations(res.data?.destinations || []);
    } catch {/* silent */} finally { setLoading(false); setRefreshing(false); }
  }, []);

  useFocusEffect(useCallback(() => { setLoading(true); load(); }, [load]));

  return (
    <SafeAreaView style={styles.container} testID="destinations-screen">
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} testID="dest-back-btn">
          <Icon name="arrow-back" size={22} color={Colors.slate900} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Destinations</Text>
        <View style={{ width: 22 }} />
      </View>
      {loading ? (
        <DestinationsGridSkeleton />
      ) : (
        <FlatList
          data={destinations}
          keyExtractor={(d) => d.country}
          contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 14 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={withRefreshHaptic(() => { setRefreshing(true); load(); })} tintColor={Colors.cyan400} />}
          ListEmptyComponent={
            <View style={styles.empty} testID="dest-empty">
              <Icon name="globe-outline" size={42} color={Colors.slate300} />
              <Text style={styles.emptyTitle}>No destinations yet</Text>
            </View>
          }
          renderItem={({ item: d }) => (
            <TouchableOpacity
              onPress={() => router.push({ pathname: '/(tabs)', params: { country: d.country } })}
              style={styles.card} testID={`dest-${d.country}`}
            >
              {d.image_url ? <Image source={{ uri: d.image_url }} style={styles.cover} /> : (
                <View style={[styles.cover, { backgroundColor: Colors.cyan100, alignItems: 'center', justifyContent: 'center' }]}>
                  <Icon name="map" size={36} color={Colors.cyan500} />
                </View>
              )}
              <View style={styles.gradient} />
              <View style={styles.body}>
                <Text style={styles.country}>{d.country}</Text>
                <View style={styles.statsRow}>
                  <View style={styles.statChip}>
                    <Icon name="bookmark" size={10} color={Colors.white} />
                    <Text style={styles.statText}>{d.listing_count} listings</Text>
                  </View>
                  {d.avg_rating > 0 && (
                    <View style={styles.statChip}>
                      <Icon name="star" size={10} color="#fbbf24" />
                      <Text style={styles.statText}>{d.avg_rating}</Text>
                    </View>
                  )}
                  <View style={styles.statChip}>
                    <Icon name="cash-outline" size={10} color={Colors.white} />
                    <Text style={styles.statText}>from ${d.min_price}</Text>
                  </View>
                </View>
                {(d.types || []).length > 0 && (
                  <Text style={styles.types} numberOfLines={1}>{d.types.slice(0, 3).join(' · ')}</Text>
                )}
              </View>
            </TouchableOpacity>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.slate50 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  headerTitle: { fontSize: 17, fontWeight: '700', color: Colors.slate900 },
  empty: { alignItems: 'center', paddingVertical: 60, paddingHorizontal: 32, gap: 6 },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: Colors.slate700, marginTop: 8 },
  card: { borderRadius: 14, overflow: 'hidden', position: 'relative', height: 180, backgroundColor: Colors.slate100 },
  cover: { width: '100%', height: '100%' },
  gradient: { position: 'absolute', left: 0, right: 0, bottom: 0, top: 0, backgroundColor: 'rgba(15,23,42,0.45)' },
  body: { position: 'absolute', left: 16, right: 16, bottom: 14, gap: 6 },
  country: { color: Colors.white, fontSize: 22, fontWeight: '700', letterSpacing: -0.5 },
  statsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  statChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.18)' },
  statText: { color: Colors.white, fontSize: 11, fontWeight: '600' },
  types: { color: 'rgba(255,255,255,0.85)', fontSize: 11, fontWeight: '600' },
});
