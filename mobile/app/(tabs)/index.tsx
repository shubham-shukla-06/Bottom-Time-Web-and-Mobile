/**
 * Mobile Discover — pixel-mirrors web `frontend/src/pages/Discover.js`.
 * Filter rows (5): Type, Destination, Level, Budget, Dates.
 *  - Multi-select arrays for types, countries, difficulties (toggle on/off).
 *  - Budget = currency + max-price input (slider on web; number-pad on mobile).
 *  - Dates = single chip toggling a Pick-dates pill (calendar deferred — open
 *    range modal on web parity is out of scope here; the pill toggles a
 *    sentinel "Any dates" / placeholder text per the web component).
 *  - Counts come from the same listings response the web uses.
 *  - Clear-all chip appears when any filter is active.
 * Chip: `<Chip>` primitive (px-3.5/py-1.5/rounded-full/text-xs/font-semibold).
 * Row:  `FilterRow` label + horizontal scroll, gap 8 (gap-2).
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
import useAuthStore from '../../src/stores/authStore';
import { Colors } from '../../src/constants/colors';
import ListingCard from '../../src/components/ListingCard';
import BottomTimeLogo from '../../src/components/BottomTimeLogo';
import Chip from '../../src/components/ui/Chip';

const TYPE_OPTIONS = [
  { value: 'courses', label: 'Courses' },
  { value: 'dives', label: 'Fun Dives' },
  { value: 'day_trips', label: 'Land-based' },
  { value: 'liveaboards', label: 'Liveaboards' },
  { value: 'snorkeling', label: 'Snorkeling' },
];
const LEVEL_OPTIONS = [
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' },
];

interface Filters {
  types: string[];
  countries: string[];
  difficulties: string[];
  priceActive: boolean;
  priceMax: number;
  dateActive: boolean;
}
const EMPTY: Filters = { types: [], countries: [], difficulties: [], priceActive: false, priceMax: 1000, dateActive: false };

export default function DiscoverScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const [listings, setListings] = useState<any[]>([]);
  const [destinations, setDestinations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const [budgetInput, setBudgetInput] = useState('1000');

  const fetchAll = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      params.append('limit', '40');
      params.append('include_reviews', 'true');
      if (search.trim()) params.append('search', search.trim());
      if (filters.types.length) params.append('types', filters.types.join(','));
      if (filters.countries.length) params.append('countries', filters.countries.join(','));
      if (filters.difficulties.length) params.append('difficulties', filters.difficulties.join(','));
      if (filters.priceActive) params.append('price_max', String(filters.priceMax));
      const [lRes, dRes] = await Promise.all([
        api.get(`/listings?${params.toString()}`),
        destinations.length ? Promise.resolve({ data: { destinations } }) : api.get('/destinations'),
      ]);
      setListings(lRes.data?.listings || lRes.data || []);
      if (dRes?.data?.destinations) setDestinations(dRes.data.destinations);
    } catch {/* silent */}
    finally { setLoading(false); setRefreshing(false); }
  }, [search, filters, destinations]);

  useEffect(() => { setLoading(true); fetchAll(); }, [filters]); // eslint-disable-line react-hooks/exhaustive-deps

  // Counts from the rendered listings (server-side counts not exposed publicly)
  const typeCounts = useMemo(() => countBy(listings, 'type'), [listings]);
  const destCounts = useMemo(() => countBy(listings, 'country'), [listings]);
  const levelCounts = useMemo(() => countBy(listings, 'difficulty'), [listings]);

  const visibleTypes = useMemo(
    () => TYPE_OPTIONS.filter(o => (typeCounts[o.value] || 0) > 0 || filters.types.includes(o.value)),
    [typeCounts, filters.types]
  );
  const visibleDestinations = useMemo(
    () => destinations.filter((d: any) => (destCounts[d.country] ?? d.listing_count) > 0 || filters.countries.includes(d.country)),
    [destinations, destCounts, filters.countries]
  );
  const visibleLevels = useMemo(
    () => LEVEL_OPTIONS.filter(o => (levelCounts[o.value] || 0) > 0 || filters.difficulties.includes(o.value)),
    [levelCounts, filters.difficulties]
  );

  const toggle = (key: 'types' | 'countries' | 'difficulties', val: string) => {
    setFilters(f => {
      const arr = f[key];
      return { ...f, [key]: arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val] };
    });
  };

  const hasFilters = filters.types.length || filters.countries.length || filters.difficulties.length || filters.priceActive || filters.dateActive || search.trim();
  const clearAll = () => { setFilters(EMPTY); setSearch(''); };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}><BottomTimeLogo size="md" showTM={false} /></View>

      {/* Search bar */}
      <View style={styles.searchRow}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={14} color={Colors.slate400} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search dives, courses, destinations..."
            placeholderTextColor={Colors.slate400}
            style={styles.searchInput}
            onSubmitEditing={fetchAll}
            testID="search-input"
          />
        </View>
        <TouchableOpacity onPress={fetchAll} style={styles.searchBtn} testID="search-btn">
          <Text style={styles.searchBtnText}>Search</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.filtersWrap} contentContainerStyle={{ paddingBottom: 4 }}>
        <FilterRow label="Type" testID="filter-row-type">
          {visibleTypes.length === 0 ? (
            <Text style={styles.emptyHint}>No types match</Text>
          ) : visibleTypes.map(o => (
            <Chip key={o.value} active={filters.types.includes(o.value)}
              count={typeCounts[o.value] || 0}
              onPress={() => toggle('types', o.value)}
              testID={`pill-${o.value}`}>{o.label}</Chip>
          ))}
        </FilterRow>

        <FilterRow label="Destination" testID="filter-row-destination">
          {visibleDestinations.length === 0 ? (
            <Text style={styles.emptyHint}>No destinations match</Text>
          ) : visibleDestinations.map((d: any) => (
            <Chip key={d.country} active={filters.countries.includes(d.country)}
              count={destCounts[d.country] ?? d.listing_count}
              onPress={() => toggle('countries', d.country)}
              testID={`destination-pill-${d.country}`}>{d.country}</Chip>
          ))}
        </FilterRow>

        <FilterRow label="Level" testID="filter-row-level">
          {visibleLevels.length === 0 ? (
            <Text style={styles.emptyHint}>No levels match</Text>
          ) : visibleLevels.map(o => (
            <Chip key={o.value} active={filters.difficulties.includes(o.value)}
              count={levelCounts[o.value] || 0}
              onPress={() => toggle('difficulties', o.value)}
              testID={`diff-${o.value}`}>{o.label}</Chip>
          ))}
        </FilterRow>

        <FilterRow label="Budget" testID="filter-row-budget">
          <Chip
            active={filters.priceActive}
            leftIcon={<Text style={styles.currencyMark}>$</Text>}
            onPress={() => setFilters(f => ({ ...f, priceActive: !f.priceActive, priceMax: Number(budgetInput) || 1000 }))}
            testID="budget-toggle">
            {filters.priceActive ? `Up to $${filters.priceMax}` : 'Any price'}
          </Chip>
          {filters.priceActive ? (
            <View style={styles.budgetInputWrap}>
              <Text style={styles.budgetPrefix}>$</Text>
              <TextInput
                keyboardType="numeric"
                value={budgetInput}
                onChangeText={(v) => { setBudgetInput(v); setFilters(f => ({ ...f, priceMax: Number(v) || 0 })); }}
                style={styles.budgetInput}
                testID="budget-max-input"
              />
            </View>
          ) : null}
        </FilterRow>

        <FilterRow label="Dates" testID="filter-row-dates">
          <Chip
            active={filters.dateActive}
            leftIcon={<Ionicons name="calendar-outline" size={11} color={filters.dateActive ? Colors.white : Colors.slate600} />}
            onPress={() => setFilters(f => ({ ...f, dateActive: !f.dateActive }))}
            testID="date-filter-btn">
            {filters.dateActive ? 'Pick travel dates' : 'Any dates'}
          </Chip>
        </FilterRow>

        {hasFilters ? (
          <View style={{ paddingHorizontal: 16, paddingTop: 4 }}>
            <Chip onPress={clearAll} testID="clear-all-btn"
              leftIcon={<Ionicons name="close" size={11} color={Colors.accent} />}>
              <Text style={styles.clearText}>Clear all filters</Text>
            </Chip>
          </View>
        ) : null}
      </ScrollView>

      <View style={styles.resultsBar}>
        <Text style={styles.resultsCount} testID="results-count">{loading ? '...' : `${listings.length} result${listings.length !== 1 ? 's' : ''}`}</Text>
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
              {hasFilters ? (
                <TouchableOpacity onPress={clearAll} style={styles.clearBtn} testID="clear-all-noresults-btn">
                  <Text style={styles.clearBtnText}>Clear filters</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

function FilterRow({ label, testID, children }: { label: string; testID?: string; children: React.ReactNode }) {
  return (
    <View testID={testID} style={styles.filterRowWrap}>
      <Text style={styles.filterRowLabel}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRowContent}>
        {children}
      </ScrollView>
    </View>
  );
}

function countBy(arr: any[], key: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const x of arr) {
    const k = x?.[key];
    if (!k) continue;
    out[k] = (out[k] || 0) + 1;
  }
  return out;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.white },
  header: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10 },
  searchRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 12, alignItems: 'center' },
  searchBox: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, height: 40, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.white },
  searchInput: { flex: 1, fontSize: 13, color: Colors.slate900 },
  searchBtn: { paddingHorizontal: 14, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.cyan400 },
  searchBtnText: { color: Colors.white, fontSize: 13, fontWeight: '600' },

  filtersWrap: { maxHeight: 280, flexGrow: 0 },
  filterRowWrap: { paddingTop: 8 },
  filterRowLabel: { fontSize: 10, color: Colors.cyan400, opacity: 0.6, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1.2, paddingHorizontal: 16, marginBottom: 6 },
  filterRowContent: { paddingHorizontal: 16, gap: 8, alignItems: 'center', paddingBottom: 2 },
  emptyHint: { fontSize: 11, color: Colors.slate400, fontStyle: 'italic' },

  budgetInputWrap: { flexDirection: 'row', alignItems: 'center', height: 28, paddingHorizontal: 10, borderRadius: 9999, backgroundColor: Colors.slate100, gap: 2 },
  budgetPrefix: { fontSize: 12, color: Colors.slate600, fontWeight: '600' },
  budgetInput: { width: 56, fontSize: 12, color: Colors.slate900, fontWeight: '600', padding: 0 },
  currencyMark: { fontSize: 11, fontWeight: '700', color: Colors.slate600 },

  resultsBar: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 4, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  resultsCount: { fontSize: 11, color: Colors.slate400, fontWeight: '500' },
  clearText: { fontSize: 12, fontWeight: '600', color: Colors.accent },

  empty: { alignItems: 'center', paddingVertical: 60, paddingHorizontal: 24, gap: 6 },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: Colors.slate800, marginTop: 8 },
  emptySub: { fontSize: 12, color: Colors.slate500, textAlign: 'center' },
  clearBtn: { marginTop: 12, paddingHorizontal: 16, paddingVertical: 9, borderRadius: 999, backgroundColor: Colors.cyan400 },
  clearBtnText: { color: Colors.white, fontWeight: '700', fontSize: 13 },
});
