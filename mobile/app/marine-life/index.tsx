import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  TextInput,
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

export default function MarineLifeScreen() {
  const router = useRouter();
  const [trending, setTrending] = useState<any[]>([]);
  const [results, setResults] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [searching, setSearching] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadTrending = useCallback(async () => {
    try {
      const res = await api.get('/marine-life/trending');
      setTrending(res.data?.results || []);
    } catch {/* silent */} finally { setLoading(false); setRefreshing(false); }
  }, []);

  useFocusEffect(useCallback(() => { setLoading(true); loadTrending(); }, [loadTrending]));

  useEffect(() => {
    if (!search.trim() || search.trim().length < 2) { setResults([]); return; }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await api.get(`/marine-life/search?q=${encodeURIComponent(search.trim())}&per_page=20`);
        setResults(res.data?.results || []);
      } catch {/* silent */} finally { setSearching(false); }
    }, 350);
    return () => clearTimeout(t);
  }, [search]);

  const data = search.trim().length >= 2 ? results : trending;

  return (
    <SafeAreaView style={styles.container} testID="marine-life-screen">
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} testID="ml-back-btn">
          <Icon name="arrow-back" size={22} color={Colors.slate900} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Marine Life</Text>
        <View style={{ width: 22 }} />
      </View>

      <View style={styles.searchWrap}>
        <Icon name="search" size={14} color={Colors.slate400} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search species (e.g. clownfish)"
          placeholderTextColor={Colors.slate400}
          style={styles.searchInput}
          testID="ml-search-input"
        />
        {search ? (
          <TouchableOpacity onPress={() => setSearch('')} testID="ml-clear-search">
            <Icon name="close-circle" size={16} color={Colors.slate400} />
          </TouchableOpacity>
        ) : null}
      </View>

      <View style={styles.sectionLabel}>
        <Text style={styles.sectionLabelText}>{search.trim().length >= 2 ? 'Search results' : 'Trending now'}</Text>
        {searching && <ActivityIndicator size="small" color={Colors.cyan400} />}
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={Colors.cyan400} /></View>
      ) : (
        <FlatList
          data={data}
          keyExtractor={(s) => String(s.taxon_id)}
          numColumns={2}
          columnWrapperStyle={{ gap: 10, paddingHorizontal: 16 }}
          contentContainerStyle={{ paddingBottom: 40, gap: 10 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={withRefreshHaptic(() => { setRefreshing(true); loadTrending(); })} tintColor={Colors.cyan400} />}
          ListEmptyComponent={
            <View style={styles.empty} testID="ml-empty">
              <Icon name="fish-outline" size={36} color={Colors.slate300} />
              <Text style={styles.emptyTitle}>{search ? 'No species found' : 'No trending species'}</Text>
              <Text style={styles.emptySub}>{search ? 'Try a different name.' : 'Pull to refresh.'}</Text>
            </View>
          }
          renderItem={({ item: s }) => (
            <TouchableOpacity onPress={() => router.push({ pathname: '/marine-life/species/[id]', params: { id: String(s.taxon_id) } })}
              style={styles.card} testID={`ml-species-${s.taxon_id}`}>
              {s.photo_square || s.photo_url ? (
                <Image source={{ uri: s.photo_square || s.photo_url }} style={styles.image} />
              ) : (
                <View style={[styles.image, { backgroundColor: Colors.slate100, alignItems: 'center', justifyContent: 'center' }]}>
                  <Icon name="fish" size={28} color={Colors.slate300} />
                </View>
              )}
              <View style={styles.cardBody}>
                <Text style={styles.cardName} numberOfLines={1}>{s.name}</Text>
                <Text style={styles.cardSci} numberOfLines={1}><Text style={{ fontStyle: 'italic' }}>{s.scientific_name}</Text></Text>
                {s.observations_count != null && (
                  <Text style={styles.cardObs}><Icon name="eye-outline" size={9} /> {s.observations_count} obs</Text>
                )}
                {s.conservation_status && (
                  <View style={styles.consPill}><Text style={styles.consText}>{s.conservation_status}</Text></View>
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
  searchWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginTop: 12, paddingHorizontal: 12, paddingVertical: 9, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border, borderRadius: 12 },
  searchInput: { flex: 1, fontSize: 13, color: Colors.slate900 },
  sectionLabel: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  sectionLabelText: { fontSize: 11, fontWeight: '700', color: Colors.slate500, textTransform: 'uppercase', letterSpacing: 1 },
  empty: { alignItems: 'center', paddingVertical: 60, paddingHorizontal: 32, gap: 4 },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: Colors.slate700, marginTop: 8 },
  emptySub: { fontSize: 12, color: Colors.slate500 },
  card: { flex: 1, borderRadius: 14, overflow: 'hidden', backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.borderLight },
  image: { width: '100%', height: 130 },
  cardBody: { padding: 10, gap: 3 },
  cardName: { fontSize: 13, fontWeight: '700', color: Colors.slate900 },
  cardSci: { fontSize: 11, color: Colors.slate500 },
  cardObs: { fontSize: 10, color: Colors.slate500, marginTop: 2 },
  consPill: { alignSelf: 'flex-start', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999, backgroundColor: '#fef3c7', marginTop: 4 },
  consText: { fontSize: 9, fontWeight: '700', color: '#b45309', textTransform: 'uppercase' },
});
