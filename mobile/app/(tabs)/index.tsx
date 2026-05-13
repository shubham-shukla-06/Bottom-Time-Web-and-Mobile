/**
 * Mobile Discover — pixel-mirrors web `frontend/src/pages/Discover.js`
 * but optimised for narrow mobile width.
 *
 * Layout (top → bottom):
 *  1. Header (currency picker only — the Bottom Time wordmark was removed
 *     per product; the left side now just holds a greeting/spacer).
 *  2. Search row
 *  3. Active-filter bar (horizontal scroll of removable chips) + "Filters" CTA
 *  4. Results count
 *  5. Listing FlatList
 *
 * Guest gating (non-authenticated):
 *  - Only 4 listing cards render. Ever. The list is hard-sliced before it
 *    reaches the FlatList so lazy rendering can't sneak more in.
 *  - The 4th card renders normally, then has a top-to-bottom white gradient
 *    overlay fading it from visible (top ~30%) to fully opaque (bottom ~70%),
 *    and the gating card is absolutely positioned on its lower half.
 *  - Tapping the "Log in" pill on the gating card routes to /welcome.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, TextInput, FlatList, ScrollView, StyleSheet,
  ActivityIndicator, RefreshControl, TouchableOpacity, Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Icon from '../../src/components/Icon';
import { LinearGradient } from 'expo-linear-gradient';
import api from '../../src/api/client';
import { Colors } from '../../src/constants/colors';
import ListingCard from '../../src/components/ListingCard';
import CurrencyPicker from '../../src/components/CurrencyPicker';
import FilterSheet, { DiscoverFilters, EMPTY_FILTERS, TYPE_OPTIONS, LEVEL_OPTIONS } from '../../src/components/FilterSheet';
import useAuthStore from '../../src/stores/authStore';
import useUIStore from '../../src/stores/uiStore';
import useTabBarOnScroll from '../../src/hooks/useTabBarOnScroll';

const TYPE_LABEL: Record<string, string> = Object.fromEntries(TYPE_OPTIONS.map((o) => [o.value, o.label]));
const LEVEL_LABEL: Record<string, string> = Object.fromEntries(LEVEL_OPTIONS.map((o) => [o.value, o.label]));

// Search input placeholder cycles through these strings every 5s with a
// fade+slide-up animation. Pauses while the field is focused or non-empty.
const SEARCH_PLACEHOLDERS = ['Search dives', 'Search courses', 'Search destinations'];
const PLACEHOLDER_CYCLE_MS = 3000;
const PLACEHOLDER_FADE_MS = 250;

// Guests see this many listing cards total. The 4th is the "faded" one that
// sits under the gating overlay.
const GUEST_VISIBLE_COUNT = 4;

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
  // Hides the bottom tab bar on scroll-down, reveals on scroll-up
  // (shared with all tab screens via the tabBarStore).
  const onListScroll = useTabBarOnScroll();

  // ── Animated rotating search placeholder ─────────────────────────────────
  // Cycles SEARCH_PLACEHOLDERS every PLACEHOLDER_CYCLE_MS with a fade+slide
  // transition (drives an Animated.Text overlaid on the TextInput). The
  // native `placeholder` prop is cleared so only the animated overlay shows.
  // Pauses while the input is focused OR has a value, so the user never
  // sees motion competing with what they're typing.
  const [searchFocused, setSearchFocused] = useState(false);
  const [placeholderIdx, setPlaceholderIdx] = useState(0);
  const placeholderOpacity = useRef(new Animated.Value(1)).current;
  const placeholderTranslateY = useRef(new Animated.Value(0)).current;
  const showAnimatedPlaceholder = search === '' && !searchFocused;

  useEffect(() => {
    if (!showAnimatedPlaceholder) return;
    const id = setInterval(() => {
      Animated.parallel([
        Animated.timing(placeholderOpacity, { toValue: 0, duration: PLACEHOLDER_FADE_MS, useNativeDriver: true }),
        Animated.timing(placeholderTranslateY, { toValue: -8, duration: PLACEHOLDER_FADE_MS, useNativeDriver: true }),
      ]).start(() => {
        setPlaceholderIdx((i) => (i + 1) % SEARCH_PLACEHOLDERS.length);
        placeholderTranslateY.setValue(8);
        Animated.parallel([
          Animated.timing(placeholderOpacity, { toValue: 1, duration: PLACEHOLDER_FADE_MS, useNativeDriver: true }),
          Animated.timing(placeholderTranslateY, { toValue: 0, duration: PLACEHOLDER_FADE_MS, useNativeDriver: true }),
        ]).start();
      });
    }, PLACEHOLDER_CYCLE_MS);
    return () => clearInterval(id);
  }, [showAnimatedPlaceholder, placeholderOpacity, placeholderTranslateY]);

  // ── Filter sheet open/close animation ────────────────────────────────────
  // `sheetOpen` drives two parallel timing animations:
  //   • filterProgress       (useNativeDriver: true)  — transforms + opacity:
  //                            Discover scale, backdrop opacity, sheet translateY.
  //   • filterRadiusProgress (useNativeDriver: false) — borderRadius
  //                            (the native driver doesn't support it).
  // Same input (sheetOpen) and same duration so they stay in lockstep.
  const filterProgress = useRef(new Animated.Value(0)).current;
  const filterRadiusProgress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(filterProgress, { toValue: sheetOpen ? 1 : 0, duration: 300, useNativeDriver: true }),
      Animated.timing(filterRadiusProgress, { toValue: sheetOpen ? 1 : 0, duration: 300, useNativeDriver: false }),
    ]).start();
  }, [sheetOpen, filterProgress, filterRadiusProgress]);

  // Discover content gently zooms out and rounds its corners — reads as a
  // card behind the sheet.
  const contentScale = filterProgress.interpolate({ inputRange: [0, 1], outputRange: [1, 0.94] });
  const contentRadius = filterRadiusProgress.interpolate({ inputRange: [0, 1], outputRange: [0, 24] });
  // Backdrop hits full opacity at progress = 0.5, i.e. ~150ms into the 300ms
  // animation — gives the "instant-ish" Zomato feel without a second driver
  // with a different duration.
  const backdropOpacity = filterProgress.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 1, 1] });

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

  // Hard slice to exactly 4 items for guests. Anything beyond that never
  // reaches the FlatList (so no lazy rendering, no scroll-to-reveal).
  const visibleData = useMemo(() => {
    if (!isGuest) return listings;
    return listings.slice(0, GUEST_VISIBLE_COUNT);
  }, [isGuest, listings]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Animated.View
        style={[styles.contentWrap, { borderRadius: contentRadius }]}
        pointerEvents={sheetOpen ? 'none' : 'auto'}
      >
        <Animated.View style={[styles.contentInner, { transform: [{ scale: contentScale }] }]}>
      <View style={styles.searchRow}>
        <View style={styles.searchBox}>
          <Icon name="search" size={14} color={Colors.slate400} />
        <View style={styles.searchInputWrap}>
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder=""
            placeholderTextColor={Colors.slate400}
            style={styles.searchInput}
            onSubmitEditing={fetchAll}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            testID="search-input"
          />
          {showAnimatedPlaceholder ? (
            <Animated.View
              pointerEvents="none"
              style={[
                styles.placeholderOverlay,
                { opacity: placeholderOpacity, transform: [{ translateY: placeholderTranslateY }] },
              ]}
              testID="animated-placeholder"
            >
              <Text style={styles.placeholderText}>{SEARCH_PLACEHOLDERS[placeholderIdx]}</Text>
            </Animated.View>
          ) : null}
        </View>
        </View>
        <TouchableOpacity onPress={() => setSheetOpen(true)} style={styles.filterBtn} testID="open-filters-btn">
          <Icon name="options-outline" size={14} color={Colors.white} />
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
                <Icon name="close" size={12} color={Colors.white} />
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
        <CurrencyPicker testID="discover-currency-picker" />
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={Colors.cyan400} />
        </View>
      ) : (
        <FlatList
          data={visibleData}
          keyExtractor={(l) => l.id}
          contentContainerStyle={{ padding: 16, paddingTop: 8, gap: 12, paddingBottom: 120 }}
          onScroll={onListScroll}
          scrollEventThrottle={16}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchAll(); }} tintColor={Colors.cyan400} />}
          renderItem={({ item, index }) => {
            const isLastForGuest = isGuest && index === GUEST_VISIBLE_COUNT - 1 && visibleData.length === GUEST_VISIBLE_COUNT;
            const card = (
              <ListingCard
                listing={item}
                onPress={() => {
                  if (isLastForGuest) { router.push('/welcome'); return; }
                  router.push({ pathname: '/listing/[id]', params: { id: item.id } });
                }}
              />
            );
            if (!isLastForGuest) return card;
            // Final guest card: render listing, overlay top-down white
            // gradient fading it out, then overlay the gating card on the
            // lower half so it sits above the faded portion.
            return (
              <View style={styles.gatedCardWrap} testID="guest-gated-card-wrap">
                {card}
                <LinearGradient
                  colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.85)', 'rgba(255,255,255,1)']}
                  locations={[0, 0.45, 0.85]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 0, y: 1 }}
                  pointerEvents="none"
                  style={StyleSheet.absoluteFillObject}
                />
                <View style={styles.gatingOverlay} pointerEvents="box-none">
                  <View style={styles.gatingCard} testID="guest-gating-card">
                    <Text style={styles.gatingTitle}>Log in to discover all listings</Text>
                    <TouchableOpacity
                      onPress={() => router.push('/welcome')}
                      style={styles.gatingBtn}
                      testID="guest-login-btn"
                    >
                      <Text style={styles.gatingBtnText}>Log in</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            );
          }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Icon name="location-outline" size={36} color={Colors.slate300} />
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

      </Animated.View>
      </Animated.View>

      {/* Backdrop — instant-ish fade-in (full opacity by ~150ms), full screen,
          taps close the sheet. Rendered ABOVE the scaled Discover content
          and BELOW the sliding sheet. */}
      <Animated.View
        pointerEvents={sheetOpen ? 'auto' : 'none'}
        style={[styles.filterBackdrop, { opacity: backdropOpacity }]}
        testID="filter-backdrop"
      >
        <TouchableOpacity
          activeOpacity={1}
          style={StyleSheet.absoluteFillObject}
          onPress={() => setSheetOpen(false)}
          testID="filter-backdrop-tap"
        />
      </Animated.View>

      <FilterSheet
        visible={sheetOpen}
        progress={filterProgress}
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
  // Wraps all scrolling Discover content. Scaled + rounded while the filter
  // sheet is open so the screen reads as a card lifted behind the sheet.
  // `overflow: hidden` is required for the animated borderRadius to clip.
  contentWrap: { flex: 1, backgroundColor: Colors.white, overflow: 'hidden' },
  // Inner flex-fill so the native-driven transform (scale) can run on a
  // view that ONLY hosts transform/opacity props. Keeping borderRadius
  // (JS-driven) on the OUTER wrap and scale (native-driven) here prevents
  // the "JS animation on node moved to native" error that occurs when a
  // single view mixes drivers.
  contentInner: { flex: 1, backgroundColor: Colors.white },
  // Full-screen dim layer between the scaled Discover content and the sheet.
  filterBackdrop: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.45)' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10 },
  searchRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 4, marginTop: 8, alignItems: 'center' },
  // Zomato-style: filter pill + search input both use `height/2` corner
  // radius so they read as fully rounded pills (matches the new bottom
  // tab-bar island shape).
  searchBox: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, height: 44, borderRadius: 22, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.white },
  searchInputWrap: { flex: 1, position: 'relative', justifyContent: 'center' },
  searchInput: { flex: 1, fontSize: 13, color: Colors.slate900 },
  placeholderOverlay: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, justifyContent: 'center' },
  placeholderText: { fontSize: 13, color: Colors.slate400 },
  filterBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, height: 44, borderRadius: 22, backgroundColor: Colors.cyan400 },
  filterBtnText: { color: Colors.white, fontSize: 13, fontWeight: '700' },

  activeBarWrap: { borderTopWidth: 1, borderTopColor: Colors.borderLight, backgroundColor: Colors.white },
  activeBarContent: { paddingHorizontal: 16, paddingVertical: 10, gap: 6, alignItems: 'center' },
  activePill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 9999, backgroundColor: Colors.cyan400 },
  activePillText: { fontSize: 12, fontWeight: '600', color: Colors.white, maxWidth: 120 },
  clearAllPill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 9999, backgroundColor: Colors.slate100 },
  clearAllText: { fontSize: 12, fontWeight: '600', color: Colors.accent },

  resultsBar: { paddingHorizontal: 16, paddingTop: 2, paddingBottom: 4, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  resultsCount: { fontSize: 11, color: Colors.slate400, fontWeight: '500' },

  empty: { alignItems: 'center', paddingVertical: 60, paddingHorizontal: 24, gap: 6 },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: Colors.slate800, marginTop: 8 },
  emptySub: { fontSize: 12, color: Colors.slate500, textAlign: 'center' },
  clearBtn: { marginTop: 12, paddingHorizontal: 16, paddingVertical: 9, borderRadius: 999, backgroundColor: Colors.cyan400 },
  clearBtnText: { color: Colors.white, fontWeight: '700', fontSize: 13 },

  // Gated 4th-card wrapper: relative so absolute children can overlay the
  // listing card + gradient fade.
  gatedCardWrap: { position: 'relative' },
  gatingOverlay: {
    position: 'absolute',
    left: 0, right: 0, bottom: 0, top: 0,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 16,
    paddingHorizontal: 16,
  },
  gatingCard: {
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.slate100,
    borderRadius: 18,
    paddingVertical: 20,
    paddingHorizontal: 22,
    alignItems: 'center',
    gap: 14,
    width: '100%',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  gatingTitle: { fontSize: 17, fontWeight: '700', color: Colors.slate900, textAlign: 'center' },
  gatingBtn: { paddingHorizontal: 32, paddingVertical: 12, borderRadius: 9999, backgroundColor: Colors.cyan400 },
  gatingBtnText: { color: Colors.white, fontWeight: '700', fontSize: 14 },
});
