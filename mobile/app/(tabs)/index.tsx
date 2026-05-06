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
import useAuthStore from '../../src/stores/authStore';
import useUIStore from '../../src/stores/uiStore';

const TYPE_LABEL: Record<string, string> = Object.fromEntries(TYPE_OPTIONS.map((o) => [o.value, o.label]));
const LEVEL_LABEL: Record<string, string> = Object.fromEntries(LEVEL_OPTIONS.map((o) => [o.value, o.label]));

export default function DiscoverScreen() {
  const router = useRouter();
  const token = useAuthStore((s) => s.token);
  const guestMode = useUIStore((s) => s.guestMode);
  const isGuest = !token || guestMode;
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
          data={(() => {
            if (!isGuest || listings.length <= 3) return listings;
            return [
              ...listings.slice(0, 3),
              { id: '__gating__', __gating: true } as any,
              ...listings.slice(3).map((l) => ({ ...l, __blurred: true })),
            ];
          })()}
          keyExtractor={(l) => l.id}
          contentContainerStyle={{ padding: 16, paddingTop: 8, gap: 12 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchAll(); }} tintColor={Colors.cyan400} />}
          renderItem={({ item }) => {
            if (item.__gating) {
              return (
                <View style={styles.gatingCard} testID="guest-gating-card">
                  <View style={styles.avatarStack}>
                    <View style={[styles.avatarCircle, { backgroundColor: '#fde68a', left: 0 }]}><Ionicons name="water" size={18} color="#92400e" /></View>
                    <View style={[styles.avatarCircle, { backgroundColor: '#bae6fd', left: 22 }]}><Ionicons name="boat" size={18} color="#075985" /></View>
                    <View style={[styles.avatarCircle, { backgroundColor: '#bbf7d0', left: 44 }]}><Ionicons name="fish" size={18} color="#166534" /></View>
                  </View>
                  <Text style={styles.gatingTitle}>Dive in to discover all listings</Text>
                  <Text style={styles.gatingSub}>Sign in to unlock the full marketplace, save favourites, and book trips.</Text>
                  <TouchableOpacity onPress={() => router.push('/welcome')} style={styles.gatingBtn} testID="guest-signin-btn">
                    <Text style={styles.gatingBtnText}>Sign in</Text>
                  </TouchableOpacity>
                </View>
              );
            }
            const blurred = !!item.__blurred;
            const card = (
              <ListingCard
                listing={item}
                onPress={() => {
                  if (blurred) { router.push('/welcome'); return; }
                  router.push({ pathname: '/listing/[id]', params: { id: item.id } });
                }}
              />
            );
            if (!blurred) return card;
            return (
              <View pointerEvents="none" style={{ opacity: 0.4 }}>
                {card}
              </View>
            );
          }}
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

  gatingCard: { backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.slate100, borderRadius: 18, paddingVertical: 22, paddingHorizontal: 18, alignItems: 'center', gap: 8, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  avatarStack: { flexDirection: 'row', height: 40, width: 84, marginBottom: 4 },
  avatarCircle: { position: 'absolute', width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: Colors.white },
  gatingTitle: { fontSize: 18, fontWeight: '700', color: Colors.slate900, textAlign: 'center' },
  gatingSub: { fontSize: 12, color: Colors.slate500, textAlign: 'center', lineHeight: 18, paddingHorizontal: 8 },
  gatingBtn: { marginTop: 10, paddingHorizontal: 28, paddingVertical: 12, borderRadius: 9999, backgroundColor: Colors.cyan400 },
  gatingBtnText: { color: Colors.white, fontWeight: '700', fontSize: 14 },
});
