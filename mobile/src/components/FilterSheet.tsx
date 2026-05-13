/**
 * FilterSheet — Zomato-parity two-pane filter panel.
 *
 * Right pane = ONE long ScrollView containing every section stacked
 *              vertically (Type / Destination / Level / Budget / Dates).
 * Left rail  = icon-above-label section index. Tap → scrollTo section.
 *              The rail's active highlight follows the right pane's
 *              scroll position via an onScroll listener.
 *
 * Animation contract (unchanged from f387173):
 *   • `progress` (0 closed → 1 open) is owned by the parent (native
 *     driver). Outer Animated.View hosts only translateY.
 *   • Modal mount lifecycle handled by Discover.
 *
 * Filter form ownership unchanged — parent owns committed state, this
 * component holds a draft until Apply.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated, View, Text, TouchableOpacity, StyleSheet, ScrollView,
  TextInput, KeyboardAvoidingView, Platform, Dimensions,
  NativeScrollEvent, NativeSyntheticEvent, LayoutChangeEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Compass, MapPin, Gauge, Wallet, Calendar } from 'lucide-react-native';
import { Colors } from '../constants/colors';

export interface DiscoverFilters {
  types: string[];
  countries: string[];
  difficulties: string[];
  priceActive: boolean;
  priceMax: number;
  dateActive: boolean;
}

export const EMPTY_FILTERS: DiscoverFilters = {
  types: [], countries: [], difficulties: [],
  priceActive: false, priceMax: 1000, dateActive: false,
};

export const TYPE_OPTIONS = [
  { value: 'courses',     label: 'Courses' },
  { value: 'dives',       label: 'Fun Dives' },
  { value: 'day_trips',   label: 'Land-based' },
  { value: 'liveaboards', label: 'Liveaboards' },
  { value: 'snorkeling',  label: 'Snorkeling' },
];

export const LEVEL_OPTIONS = [
  { value: 'beginner',     label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced',     label: 'Advanced' },
];

interface Props {
  visible: boolean;
  progress: Animated.AnimatedInterpolation<number> | Animated.Value;
  onClose: () => void;
  initial: DiscoverFilters;
  destinations: { country: string; listing_count?: number }[];
  resultCount: number;
  onApply: (next: DiscoverFilters) => void;
  onClearAll: () => void;
  onDraftChange?: (draft: DiscoverFilters) => void;
}

const SCREEN_H = Dimensions.get('window').height;
const CARD_HEIGHT = Math.round(SCREEN_H * 0.75);

// Brand-tint constants. Colors module exposes cyan500/cyan400 but not the
// 50/700 stops, so the new pill + rail tints are literal — kept here so a
// single edit propagates if the palette is later centralised.
const CYAN_50 = '#ECFEFF';
const CYAN_500 = '#06B6D4';
const CYAN_600 = '#0891B2';
const CYAN_700 = '#0E7490';

type SectionKey = 'type' | 'destination' | 'level' | 'budget' | 'dates';

interface SectionMeta {
  key: SectionKey;
  label: string;
  Icon: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
}
const SECTIONS: SectionMeta[] = [
  { key: 'type',        label: 'Type',        Icon: Compass },
  { key: 'destination', label: 'Destination', Icon: MapPin },
  { key: 'level',       label: 'Level',       Icon: Gauge },
  { key: 'budget',      label: 'Budget',      Icon: Wallet },
  { key: 'dates',       label: 'Dates',       Icon: Calendar },
];

// Scroll offset (px) below the rail-active threshold — a section becomes
// "active" once its top crosses this many px below the ScrollView top.
const ACTIVE_THRESHOLD = 60;

export default function FilterSheet({
  visible, progress, onClose, initial, destinations, resultCount,
  onApply, onClearAll, onDraftChange,
}: Props) {
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState<DiscoverFilters>(initial);
  const [budgetText, setBudgetText] = useState(String(initial.priceMax || 1000));
  const [activeSection, setActiveSection] = useState<SectionKey>('type');

  const scrollRef = useRef<ScrollView | null>(null);
  // Visible viewport height of the right ScrollView and measured height of the
  // last (Dates) section card. We use them to compute a tail paddingBottom so
  // the last section can scroll its top up to the viewport's top — without it,
  // the rail's scroll-driven active highlight could never reach 'Dates'.
  const [paneHeight, setPaneHeight] = useState(0);
  const [lastSectionHeight, setLastSectionHeight] = useState(0);
  // Section vertical offsets within the ScrollView's content. Stored in a
  // ref (not state) — tap-to-scroll and the onScroll active-detector read
  // the latest value without triggering re-renders.
  const sectionOffsets = useRef<Record<SectionKey, number>>({
    type: 0, destination: 0, level: 0, budget: 0, dates: 0,
  });

  // Reset draft on each open.
  useEffect(() => {
    if (visible) {
      setDraft(initial);
      setBudgetText(String(initial.priceMax || 1000));
      setActiveSection('type');
    }
  }, [visible, initial]);

  // Live preview hook.
  useEffect(() => { if (onDraftChange) onDraftChange(draft); }, [draft, onDraftChange]);

  const toggle = (key: 'types' | 'countries' | 'difficulties', val: string) => {
    setDraft((d) => {
      const arr = d[key];
      return { ...d, [key]: arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val] };
    });
  };

  const apply = () => {
    onApply({ ...draft, priceMax: Number(budgetText) || draft.priceMax });
    onClose();
  };

  const clear = () => {
    setDraft(EMPTY_FILTERS);
    setBudgetText('1000');
    onClearAll();
  };

  const counts: Record<SectionKey, number> = useMemo(() => ({
    type:        draft.types.length,
    destination: draft.countries.length,
    level:       draft.difficulties.length,
    budget:      draft.priceActive ? 1 : 0,
    dates:       draft.dateActive ? 1 : 0,
  }), [draft]);

  const translateY = (progress as Animated.Value).interpolate({
    inputRange: [0, 1],
    outputRange: [SCREEN_H, 0],
  });

  const handleSectionLayout = (key: SectionKey) => (e: LayoutChangeEvent) => {
    sectionOffsets.current[key] = e.nativeEvent.layout.y;
    if (key === 'dates') {
      // The last section drives the tail-padding math. Capture its measured
      // height so paddingBottom can grant enough slack for it to reach the
      // viewport top.
      setLastSectionHeight(e.nativeEvent.layout.height);
    }
  };

  // paddingBottom = paneHeight - lastSectionHeight - 24 (visual gutter). Clamped
  // at 0 so a tall Dates section never produces negative padding. Computed on
  // every render — both inputs are stable while the sheet is open.
  const tailPadding = Math.max(0, paneHeight - lastSectionHeight - 24);

  const handleRailTap = (key: SectionKey) => {
    setActiveSection(key);  // optimistic — the scroll listener confirms
    scrollRef.current?.scrollTo({ y: sectionOffsets.current[key], animated: true });
  };

  // Active-section follow-along: pick the section whose top is the largest
  // value still <= (scrollY + threshold). Cheap O(5) sweep.
  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y + ACTIVE_THRESHOLD;
    let bestKey: SectionKey = 'type';
    let bestTop = -Infinity;
    for (const s of SECTIONS) {
      const top = sectionOffsets.current[s.key];
      if (top <= y && top > bestTop) { bestTop = top; bestKey = s.key; }
    }
    if (bestKey !== activeSection) setActiveSection(bestKey);
  };

  return (
    <Animated.View
      pointerEvents={visible ? 'auto' : 'none'}
      style={[styles.sheetWrap, { transform: [{ translateY }] }]}
      testID="filter-sheet-wrap"
    >
      <View style={styles.sheet} testID="filter-sheet">
        <View style={styles.handle} />

        {/* HEADER — title left, Clear all right. */}
        <View style={styles.headerRow}>
          <Text style={styles.title}>Filters and sorting</Text>
          <TouchableOpacity onPress={clear} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} testID="header-clear-all">
            <Text style={styles.clearAllText}>Clear all</Text>
          </TouchableOpacity>
        </View>

        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.bodyRow}>

            {/* LEFT RAIL */}
            <View style={styles.leftRail}>
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.leftRailContent}>
                {SECTIONS.map((s) => {
                  const active = s.key === activeSection;
                  const count = counts[s.key];
                  // Icons render in cyan in both states — only the shade & weight shift.
                  const iconColor = active ? CYAN_600 : CYAN_500;
                  return (
                    <TouchableOpacity
                      key={s.key}
                      onPress={() => handleRailTap(s.key)}
                      activeOpacity={0.85}
                      style={[styles.railEntry, active && styles.railEntryActive]}
                      testID={`filter-section-${s.key}`}
                    >
                      <View style={styles.railIconWrap}>
                        <s.Icon size={22} color={iconColor} strokeWidth={active ? 2.4 : 2} />
                        {count > 0 ? (
                          <View style={styles.railBadge}>
                            <Text style={styles.railBadgeText}>{count}</Text>
                          </View>
                        ) : null}
                      </View>
                      <Text
                        style={[styles.railLabel, active && styles.railLabelActive]}
                        numberOfLines={1}
                      >
                        {s.label}
                      </Text>
                      {/* Right-edge accent bar per brief spec. */}
                      {active ? <View style={styles.railAccent} /> : null}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            {/* RIGHT PANE — single ScrollView, all sections stacked. */}
            <ScrollView
              ref={scrollRef}
              style={styles.rightPane}
              contentContainerStyle={[styles.rightPaneContent, { paddingBottom: tailPadding }]}
              keyboardShouldPersistTaps="handled"
              onScroll={handleScroll}
              scrollEventThrottle={16}
              onLayout={(e) => setPaneHeight(e.nativeEvent.layout.height)}
              testID="filter-sheet-pane"
            >
              {/* TYPE */}
              <SectionCard title="Type" onLayout={handleSectionLayout('type')}>
                <View style={styles.pillGrid}>
                  {TYPE_OPTIONS.map((o) => (
                    <FilterPillButton
                      key={o.value}
                      label={o.label}
                      selected={draft.types.includes(o.value)}
                      onPress={() => toggle('types', o.value)}
                      testID={`pill-type-${o.value}`}
                    />
                  ))}
                </View>
              </SectionCard>

              {/* DESTINATION */}
              <SectionCard title="Destination" onLayout={handleSectionLayout('destination')}>
                {destinations.length === 0 ? (
                  <Text style={styles.emptyHint}>Loading destinations…</Text>
                ) : (
                  <View style={styles.pillGrid}>
                    {destinations.map((d) => (
                      <FilterPillButton
                        key={d.country}
                        label={d.country}
                        meta={d.listing_count != null ? `${d.listing_count}` : undefined}
                        selected={draft.countries.includes(d.country)}
                        onPress={() => toggle('countries', d.country)}
                        testID={`pill-dest-${d.country}`}
                      />
                    ))}
                  </View>
                )}
              </SectionCard>

              {/* LEVEL */}
              <SectionCard title="Level" onLayout={handleSectionLayout('level')}>
                <View style={styles.pillGrid}>
                  {LEVEL_OPTIONS.map((o) => (
                    <FilterPillButton
                      key={o.value}
                      label={o.label}
                      selected={draft.difficulties.includes(o.value)}
                      onPress={() => toggle('difficulties', o.value)}
                      testID={`pill-level-${o.value}`}
                    />
                  ))}
                </View>
              </SectionCard>

              {/* BUDGET — single full-width toggle pill + inline numeric input. */}
              <SectionCard title="Budget" onLayout={handleSectionLayout('budget')}>
                <FilterPillButton
                  fullWidth
                  label={draft.priceActive ? `Up to $${budgetText}` : 'Set a max price'}
                  selected={draft.priceActive}
                  onPress={() => setDraft((d) => ({ ...d, priceActive: !d.priceActive }))}
                  testID="pill-budget-toggle"
                />
                {draft.priceActive ? (
                  <View style={styles.budgetInputWrap}>
                    <Text style={styles.budgetPrefix}>$</Text>
                    <TextInput
                      keyboardType="numeric"
                      value={budgetText}
                      onChangeText={(t) => {
                        setBudgetText(t);
                        const n = Number(t);
                        if (!Number.isNaN(n) && n > 0) {
                          setDraft((d) => ({ ...d, priceMax: n }));
                        }
                      }}
                      style={styles.budgetInput}
                      placeholder="Max price"
                      placeholderTextColor={Colors.slate400}
                      testID="row-budget-input"
                    />
                    <Text style={styles.budgetHint}>USD</Text>
                  </View>
                ) : null}
              </SectionCard>

              {/* DATES — single full-width toggle pill. */}
              <SectionCard title="Dates" onLayout={handleSectionLayout('dates')}>
                <FilterPillButton
                  fullWidth
                  label={draft.dateActive ? 'Pick travel dates' : 'Any dates'}
                  selected={draft.dateActive}
                  onPress={() => setDraft((d) => ({ ...d, dateActive: !d.dateActive }))}
                  testID="pill-dates-toggle"
                />
                <Text style={styles.helperText}>
                  Toggle on to filter by date availability. A full calendar picker is coming soon.
                </Text>
              </SectionCard>
            </ScrollView>
          </View>

          {/* FOOTER — Close text left, Show results pill right. */}
          <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} testID="footer-close">
              <Text style={styles.closeBtnText}>Close</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={apply} style={styles.showResultsBtn} testID="sheet-apply-btn">
              <Text style={styles.showResultsText}>Show {resultCount} results</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Animated.View>
  );
}

// ─────────────────────────────────────────────────────────────────────────
function SectionCard({ title, onLayout, children }: {
  title: string;
  onLayout: (e: LayoutChangeEvent) => void;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.sectionCard} onLayout={onLayout}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function FilterPillButton({ label, selected, onPress, meta, fullWidth, testID }: {
  label: string;
  selected: boolean;
  onPress: () => void;
  meta?: string;
  fullWidth?: boolean;
  testID?: string;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={[
        styles.pillBtn,
        fullWidth ? styles.pillBtnFull : styles.pillBtnGridItem,
        selected && styles.pillBtnSelected,
      ]}
      testID={testID}
    >
      <Text
        style={[styles.pillLabel, selected && styles.pillLabelSelected]}
        numberOfLines={1}
      >
        {label}
        {meta ? <Text style={styles.pillMeta}>{`  ${meta}`}</Text> : null}
      </Text>
    </TouchableOpacity>
  );
}

// Unused but reserved if a back-arrow is ever wanted in the header.
// (Check / X glyphs intentionally not imported — see brief decision to drop
// the inline checkmark for cleaner Zomato-style pills.)

const styles = StyleSheet.create({
  sheetWrap: { position: 'absolute', left: 0, right: 0, bottom: 0, height: CARD_HEIGHT },
  sheet: {
    flex: 1,
    backgroundColor: Colors.white,
    borderTopLeftRadius: 44,
    borderTopRightRadius: 44,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: -6 },
    elevation: 12,
    overflow: 'hidden',
  },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.slate200, marginTop: 8, marginBottom: 8 },

  // HEADER
  headerRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.slate100,
  },
  title: { fontSize: 18, fontWeight: '700', color: Colors.slate900, letterSpacing: 0.2 },
  clearAllText: { fontSize: 14, color: Colors.slate500, fontWeight: '500' },

  // TWO-PANE BODY
  bodyRow: { flex: 1, flexDirection: 'row', backgroundColor: Colors.white },

  // LEFT RAIL — white background (fix #1) + 1px slate-100 divider on right edge.
  // Width pinned to 28% (4d8db60 lock — do not change).
  leftRail: {
    width: '28%',
    flexGrow: 0,
    flexShrink: 0,
    backgroundColor: Colors.white,
    borderRightWidth: 1,
    borderRightColor: Colors.slate100,
  },
  leftRailContent: { paddingVertical: 8 },
  railEntry: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 18,
    paddingHorizontal: 6,
    position: 'relative',
  },
  // Active row tint sits on top of the now-white rail bg — still cyan-50.
  railEntryActive: { backgroundColor: CYAN_50 },
  // 3 px x 28 px vertical bar, vertically centred on the RIGHT edge.
  railAccent: {
    position: 'absolute',
    right: 0,
    top: '50%',
    marginTop: -14,
    width: 3,
    height: 28,
    borderRadius: 2,
    backgroundColor: CYAN_500,
  },
  railIconWrap: { position: 'relative', width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  // Inactive label = slate-600 (was slate-500) for slightly stronger inactive read.
  railLabel: { fontSize: 11, color: Colors.slate600, fontWeight: '600', textAlign: 'center' },
  railLabelActive: { color: CYAN_700, fontWeight: '700' },
  railBadge: {
    position: 'absolute', top: -4, right: -8,
    minWidth: 16, height: 16, borderRadius: 8, paddingHorizontal: 4,
    backgroundColor: CYAN_500, alignItems: 'center', justifyContent: 'center',
  },
  railBadgeText: { fontSize: 11, fontWeight: '700', color: Colors.white },

  // RIGHT PANE
  rightPane: { flex: 1, backgroundColor: Colors.white },
  // paddingBottom is overridden at runtime via `tailPadding` so the last
  // section can scroll its top to the viewport top.
  rightPaneContent: { padding: 16 },

  // SECTION CARDS — softer slate-50 bg (fix #5).
  sectionCard: {
    backgroundColor: Colors.slate50,
    borderRadius: 16,
    padding: 14,
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.slate900,
    letterSpacing: -0.2,
    marginBottom: 12,
  },

  // PILL BUTTONS — strict 2-col grid (fix #4a) + identical border thickness
  // in both states (fix #4b). Check icon dropped — selection signalled purely
  // by colour shift.
  pillGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  pillBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: Colors.white,
    // 1.5 px in BOTH states keeps layout box identical.
    borderWidth: 1.5,
    borderColor: Colors.slate200,
  },
  // 48.5 % width yields exact 2-up rows after the 12 px gap; no flexGrow so
  // an orphan pill stays at column-width rather than stretching.
  pillBtnGridItem: { width: '48.5%' },
  pillBtnFull: { width: '100%' },
  pillBtnSelected: {
    backgroundColor: CYAN_50,
    borderColor: CYAN_500,
  },
  pillLabel: { fontSize: 15, color: Colors.slate800, fontWeight: '500', textAlign: 'center' },
  pillLabelSelected: { color: CYAN_700, fontWeight: '600' },
  pillMeta: { fontSize: 12, color: Colors.slate400, fontWeight: '600' },

  // BUDGET inline input.
  emptyHint: { fontSize: 14, color: Colors.slate400, fontStyle: 'italic' },
  helperText: { fontSize: 12, color: Colors.slate500, paddingTop: 10, lineHeight: 18 },
  budgetInputWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, height: 48, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.white, marginTop: 10 },
  budgetPrefix: { fontSize: 15, color: Colors.slate600, fontWeight: '700' },
  budgetInput: { flex: 1, fontSize: 15, color: Colors.slate900, fontWeight: '600', padding: 0 },
  budgetHint: { fontSize: 11, color: Colors.slate400, fontWeight: '600' },

  // FOOTER
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.slate100,
    backgroundColor: Colors.white,
  },
  closeBtn: { paddingHorizontal: 4, paddingVertical: 10 },
  closeBtnText: { fontSize: 16, color: Colors.slate600, fontWeight: '500' },
  showResultsBtn: {
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    backgroundColor: CYAN_500,
    alignItems: 'center',
    justifyContent: 'center',
    // Subtle cyan glow under the CTA. RN converts these to boxShadow on web
    // (the deprecation warning in mobile.out.log is platform-wide, not from
    // this file specifically).
    shadowColor: CYAN_600,
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  showResultsText: { fontSize: 16, fontWeight: '700', color: Colors.white },
});
