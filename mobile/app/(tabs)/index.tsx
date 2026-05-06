/**
 * Mobile Discover — pixel-mirrors web `frontend/src/pages/Discover.js`
 * but optimised for narrow mobile width.
 *
 * Layout (top → bottom):
 *  1. Header (logo + currency picker)
 *  2. Search row
 *  3. Active-filter bar (horizontal scroll of removable chips) + "Filters" CTA
 *  4. Results count
 *  5. Listing FlatList
 *
 * Tapping "Filters" opens <FilterSheet/> bottom sheet which holds the full
 * multi-select chip groups for TYPE / DESTINATION / LEVEL / BUDGET / DATES.
 *
 * State changes (filters + search) re-fetch listings via `useEffect` so any
 * chip toggle immediately re-queries the backend with the correct singular
 * param names: `type`, `country`, `difficulty`, `max_price`, `search`.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, TextInput, FlatList, ScrollView, StyleSheet,
  ActivityIndicator, RefreshControl, TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import api from '../../src/api/client';
import { Colors } from '../../src/constants/colors';
import ListingCard from '../../src/components/ListingCard';
import BottomTimeLogo from '../../src/components/BottomTimeLogo';
import CurrencyPicker from '../../src/components/CurrencyPicker';
import FilterSheet, { DiscoverFilters, EMPTY_FILTERS, TYPE_OPTIONS, LEVEL_OPTIONS } from '../../src/components/FilterSheet';

const TYPE_LABEL: Record<string, string> = Object.fromEntries(TYPE_OPTIONS.map((o) => [o.value, o.label]));
const LEVEL_LABEL: Record<string, string> = Object.fromEntries(LEVEL_OPTIONS.map((o) => [o.value, o.label]));

export default function DiscoverScreen() {
  const router = useRouter();
  const [listings, setListings] = useState<any[]>([]);
  const [destinations, setDestinations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<DiscoverFilters>(EMPTY_FILTERS);
  const [sheetOpen, setSheetOpen] = useState(false);

  const fetchAll = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      params.set('limit', '40');
      params.set('include_reviews', 'true');
      if (search.trim()) params.set('search', search.trim());
      if (filters.types.length) params.set('type', filters.types.join(','));
      if (filters.countries.length) params.set('country', filters.countries.join(','));
      if (filters.difficulties.length) params.set('difficulty', filters.difficulties.join(','));
      if (filters.priceActive) params.set('max_price', String(filters.priceMax));

      const lRes = await api.get(`/listings?${params.toString()}`);
      setListings(lRes.data?.listings || lRes.data || []);

      if (destinations.length === 0) {
        try {
          const dRes = await api.get('/destinations');
          if (dRes?.data?.destinations) setDestinations(dRes.data.destinations);
        } catch {/* silent */}
      }
    } catch {/* silent */}
    finally { setLoading(false); setRefreshing(false); }
  }, [search, filters, destinations.length]);

  // Re-fetch whenever filters or search change (debounced for search).
  useEffect(() => {
    setLoading(true);
    const t = setTimeout(fetchAll, 250);
    return () => clearTimeout(t);
  }, [filters.types, filters.countries, filters.difficulties, filters.priceActive, filters.priceMax, filters.dateActive, search]); // eslint-disable-line

  const activeChips = useMemo(() => {
    const out: { key: string; label: string; remove: () => void }[] = [];
    filters.types.forEach((v) => out.push({ key: `t-${v}`, label: TYPE_LABEL[v] || v, remove: () => setFilters((f) => ({ ...f, types: f.types.filter((x) => x !== v) })) }));
    filters.countries.forEach((v) => out.push({ key: `c-${v}`, label: v, remove: () => setFilters((f) => ({ ...f, countries: f.countries.filter((x) => x !== v) })) }));
    filters.difficulties.forEach((v) => out.push({ key: `d-${v}`, label: LEVEL_LABEL[v] || v, remove: () => setFilters((f) => ({ ...f, difficulties: f.difficulties.filter((x) => x !== v) })) }));
    if (filters.priceActive) out.push({ key: 'price', label: `Up to $${filters.priceMax}`, remove: () => setFilters((f) => ({ ...f, priceActive: false })) });
    if (filters.dateActive) out.push({ key: 'date', label: 'Pick dates', remove: () => setFilters((f) => ({ ...f, dateActive: false })) });
    return out;
  }, [filters]);

  const clearAll = () => { setFilters(EMPTY_FILTERS); setSearch(''); };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <BottomTimeLogo size="md" showTM={false} />
        <CurrencyPicker testID="discover-currency-picker" />
      </View>

      <View style={styles.searchRow}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={14} color={Colors.slate400} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search dives, courses, destinations…"
            placeholderTextColor={Colors.slate400}
            style={styles.searchInput}
            onSubmitEditing={fetchAll}
            testID="search-input"
          />
        </View>
        <TouchableOpacity onPress={() => setSheetOpen(true)} style={styles.filterBtn} testID="open-filters-btn">
          <Ionicons name="options-outline" size={14} color={Colors.slate900} />
          <Text style={styles.filterBtnText}>Filters{activeChips.length ? ` · ${activeChips.length}` : ''}</Text>
        </TouchableOpacity>
      </View>

      {/* Active-filter bar */}
      {activeChips.length > 0 ? (
        <View style={styles.activeBarWrap}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.activeBarContent}>
            {activeChips.map((c) => (
              <TouchableOpacity key={c.key} onPress={c.remove} style={styles.activePill} testID={`active-${c.key}`}>
                <Text style={styles.activePillText} numberOfLines={1}>{c.label}</Text>
                <Ionicons name="close" size={12} color={Colors.white} />
              </TouchableOpacity>
            ))}
            <TouchableOpacity onPress={clearAll} style={styles.clearAllPill} testID="clear-all-btn">
              <Text style={styles.clearAllText}>Clear all</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      ) : null}

      <View style={styles.resultsBar}>
        <Text style={styles.resultsCount} testID="results-count">
          {loading ? '…' : `${listings.length} result${listings.length !== 1 ? 's' : ''}`}
        </Text>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={Colors.cyan400} />
        </View>
      ) : (
        <FlatList
          data={listings}
          keyExtractor={(l) => l.id}
          contentContainerStyle={{ padding: 16, paddingTop: 8, gap: 12 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchAll(); }} tintColor={Colors.cyan400} />}
          renderItem={({ item }) => (
            <ListingCard
              listing={item}
              onPress={() => router.push({ pathname: '/listing/[id]', params: { id: item.id } })}
            />
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="location-outline" size={36} color={Colors.slate300} />
              <Text style={styles.emptyTitle}>No results</Text>
              <Text style={styles.emptySub}>Try adjusting your filters.</Text>
              {activeChips.length > 0 ? (
                <TouchableOpacity onPress={clearAll} style={styles.clearBtn} testID="clear-all-noresults-btn">
                  <Text style={styles.clearBtnText}>Clear filters</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          }
        />
      )}

      <FilterSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        initial={filters}
        destinations={destinations}
        resultCount={listings.length}
        onApply={(next) => setFilters(next)}
        onClearAll={clearAll}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.white },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10 },
  searchRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 10, alignItems: 'center' },
  searchBox: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, height: 40, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.white },
  searchInput: { flex: 1, fontSize: 13, color: Colors.slate900 },
  filterBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, height: 40, borderRadius: 12, backgroundColor: Colors.cyan400 },
  filterBtnText: { color: Colors.slate900, fontSize: 13, fontWeight: '700' },

  activeBarWrap: { borderTopWidth: 1, borderTopColor: Colors.borderLight, backgroundColor: Colors.white },
  activeBarContent: { paddingHorizontal: 16, paddingVertical: 10, gap: 6, alignItems: 'center' },
  activePill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 9999, backgroundColor: Colors.cyan400 },
  activePillText: { fontSize: 12, fontWeight: '600', color: Colors.white, maxWidth: 120 },
  clearAllPill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 9999, backgroundColor: Colors.slate100 },
  clearAllText: { fontSize: 12, fontWeight: '600', color: Colors.accent },

  resultsBar: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 4, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  resultsCount: { fontSize: 11, color: Colors.slate400, fontWeight: '500' },

  empty: { alignItems: 'center', paddingVertical: 60, paddingHorizontal: 24, gap: 6 },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: Colors.slate800, marginTop: 8 },
  emptySub: { fontSize: 12, color: Colors.slate500, textAlign: 'center' },
  clearBtn: { marginTop: 12, paddingHorizontal: 16, paddingVertical: 9, borderRadius: 999, backgroundColor: Colors.cyan400 },
  clearBtnText: { color: Colors.white, fontWeight: '700', fontSize: 13 },
});
