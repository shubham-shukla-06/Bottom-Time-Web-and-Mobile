/**
 * FilterSheet — two-pane (Zomato-style) filter panel for Discover.
 *
 * Rendered inside an RN <Modal> (owned by Discover) so backdrop+sheet
 * escape the (tabs) navigator and cover the tab bar.
 *
 * Layout:
 *   ┌─────────────────────────────────────────────┐
 *   │ Filters and sorting                       X │
 *   ├──────────┬──────────────────────────────────┤
 *   │  Type ●2 │                                  │
 *   │  Dest    │  Larger-font option rows for the │
 *   │  Level   │  active section, vertically      │
 *   │  Budget  │  scrollable.                     │
 *   │  Dates   │                                  │
 *   ├──────────┴──────────────────────────────────┤
 *   │  Clear all                  Apply (N live)  │
 *   └─────────────────────────────────────────────┘
 *
 * Left rail = vertical list of section entries (active section
 * highlighted, applied-count badge per section). Right pane = options
 * for the active section only. Active section is local component state.
 *
 * Hot reload: every draft mutation fires `onDraftChange(draft)` so the
 * parent (Discover) can re-run its filter pipeline against the loaded
 * listings and feed a live preview count back via `resultCount`.
 *
 * Animation contract (unchanged from f387173):
 *   • `progress` (0 closed → 1 open) is owned by the parent (native driver).
 *   • Outer Animated.View hosts ONLY translateY (single native driver,
 *     no mixed-driver style props).
 *   • Visibility/mount lifecycle is handled by Discover's RN Modal latch.
 *
 * Filter form ownership is unchanged — parent owns committed state, this
 * component holds a draft until Apply.
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  Animated, View, Text, TouchableOpacity, StyleSheet, ScrollView,
  TextInput, KeyboardAvoidingView, Platform, Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from './Icon';
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
  { value: 'courses', label: 'Courses' },
  { value: 'dives', label: 'Fun Dives' },
  { value: 'day_trips', label: 'Land-based' },
  { value: 'liveaboards', label: 'Liveaboards' },
  { value: 'snorkeling', label: 'Snorkeling' },
];

export const LEVEL_OPTIONS = [
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' },
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
  /**
   * Fired on every draft mutation. Parent can use the supplied draft to
   * preview a live "Apply (N)" count without committing the filters yet.
   * Optional — sheet works without it (the static `resultCount` prop is
   * used as a fallback).
   */
  onDraftChange?: (draft: DiscoverFilters) => void;
}

// Card occupies 75% of the device window. translateY moves it SCREEN_H → 0.
const SCREEN_H = Dimensions.get('window').height;
const CARD_HEIGHT = Math.round(SCREEN_H * 0.75);

type SectionKey = 'type' | 'destination' | 'level' | 'budget' | 'dates';

interface SectionMeta { key: SectionKey; label: string; icon: string }
const SECTIONS: SectionMeta[] = [
  { key: 'type',        label: 'Type',        icon: 'options-outline' },
  { key: 'destination', label: 'Destination', icon: 'earth-outline' },
  { key: 'level',       label: 'Level',       icon: 'trending-up-outline' },
  { key: 'budget',      label: 'Budget',      icon: 'cash-outline' },
  { key: 'dates',       label: 'Dates',       icon: 'calendar-outline' },
];

export default function FilterSheet({
  visible, progress, onClose, initial, destinations, resultCount,
  onApply, onClearAll, onDraftChange,
}: Props) {
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState<DiscoverFilters>(initial);
  const [budgetText, setBudgetText] = useState(String(initial.priceMax || 1000));
  const [activeSection, setActiveSection] = useState<SectionKey>('type');

  // Reset draft on each open so a cancelled session doesn't leak between
  // opens. activeSection NOT reset — sticky within a session feels better.
  useEffect(() => {
    if (visible) {
      setDraft(initial);
      setBudgetText(String(initial.priceMax || 1000));
    }
  }, [visible, initial]);

  // Live preview hook — fires whenever the user touches anything.
  useEffect(() => {
    if (onDraftChange) onDraftChange(draft);
  }, [draft, onDraftChange]);

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

  // Per-section applied-count for the rail badges.
  const counts: Record<SectionKey, number> = useMemo(() => ({
    type:        draft.types.length,
    destination: draft.countries.length,
    level:       draft.difficulties.length,
    budget:      draft.priceActive ? 1 : 0,
    dates:       draft.dateActive ? 1 : 0,
  }), [draft]);

  // Native-driven translateY: SCREEN_H (off-screen) -> 0 (anchored).
  const translateY = (progress as Animated.Value).interpolate({
    inputRange: [0, 1],
    outputRange: [SCREEN_H, 0],
  });

  return (
    <Animated.View
      pointerEvents={visible ? 'auto' : 'none'}
      style={[styles.sheetWrap, { transform: [{ translateY }] }]}
      testID="filter-sheet-wrap"
    >
      <View style={styles.sheet} testID="filter-sheet">
        <View style={styles.handle} />
        <View style={styles.headerRow}>
          <Text style={styles.title}>Filters and sorting</Text>
          <TouchableOpacity onPress={onClose} testID="filter-sheet-close" hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Icon name="close" size={22} color={Colors.slate700} />
          </TouchableOpacity>
        </View>

        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.bodyRow}>
            {/* LEFT RAIL — section selector */}
            <ScrollView
              style={styles.leftRail}
              contentContainerStyle={styles.leftRailContent}
              showsVerticalScrollIndicator={false}
              testID="filter-sheet-rail"
            >
              {SECTIONS.map((s) => {
                const active = s.key === activeSection;
                const count = counts[s.key];
                return (
                  <TouchableOpacity
                    key={s.key}
                    onPress={() => setActiveSection(s.key)}
                    activeOpacity={0.85}
                    style={[styles.railEntry, active && styles.railEntryActive]}
                    testID={`filter-section-${s.key}`}
                  >
                    {/* Left accent bar on active section. */}
                    {active ? <View style={styles.railAccent} /> : null}
                    <Icon
                      name={s.icon}
                      size={14}
                      color={active ? Colors.cyan500 : Colors.slate500}
                    />
                    <Text
                      style={[styles.railLabel, active && styles.railLabelActive]}
                      numberOfLines={1}
                    >
                      {s.label}
                    </Text>
                    {count > 0 ? (
                      <View style={styles.railBadge}>
                        <Text style={styles.railBadgeText}>{count}</Text>
                      </View>
                    ) : null}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <View style={styles.divider} />

            {/* RIGHT PANE — options for active section */}
            <ScrollView
              style={styles.rightPane}
              contentContainerStyle={styles.rightPaneContent}
              keyboardShouldPersistTaps="handled"
              testID="filter-sheet-pane"
            >
              {activeSection === 'type' ? (
                <View>
                  {TYPE_OPTIONS.map((o) => (
                    <CheckRow
                      key={o.value}
                      label={o.label}
                      checked={draft.types.includes(o.value)}
                      onPress={() => toggle('types', o.value)}
                      testID={`row-type-${o.value}`}
                    />
                  ))}
                </View>
              ) : null}

              {activeSection === 'destination' ? (
                <View>
                  {destinations.length === 0 ? (
                    <Text style={styles.emptyHint}>Loading destinations…</Text>
                  ) : (
                    destinations.map((d) => (
                      <CheckRow
                        key={d.country}
                        label={d.country}
                        meta={d.listing_count != null ? `${d.listing_count}` : undefined}
                        checked={draft.countries.includes(d.country)}
                        onPress={() => toggle('countries', d.country)}
                        testID={`row-dest-${d.country}`}
                      />
                    ))
                  )}
                </View>
              ) : null}

              {activeSection === 'level' ? (
                <View>
                  {LEVEL_OPTIONS.map((o) => (
                    <CheckRow
                      key={o.value}
                      label={o.label}
                      checked={draft.difficulties.includes(o.value)}
                      onPress={() => toggle('difficulties', o.value)}
                      testID={`row-level-${o.value}`}
                    />
                  ))}
                </View>
              ) : null}

              {activeSection === 'budget' ? (
                <View>
                  <CheckRow
                    label="Set a max price"
                    checked={draft.priceActive}
                    onPress={() => setDraft((d) => ({ ...d, priceActive: !d.priceActive }))}
                    testID="row-budget-toggle"
                  />
                  {draft.priceActive ? (
                    <View style={styles.budgetInputWrap}>
                      <Text style={styles.budgetPrefix}>$</Text>
                      <TextInput
                        keyboardType="numeric"
                        value={budgetText}
                        onChangeText={(t) => {
                          setBudgetText(t);
                          // Mirror into draft so onDraftChange fires and the
                          // live (N) reflects the new ceiling immediately.
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
                </View>
              ) : null}

              {activeSection === 'dates' ? (
                <View>
                  <CheckRow
                    label="Pick travel dates"
                    checked={draft.dateActive}
                    onPress={() => setDraft((d) => ({ ...d, dateActive: !d.dateActive }))}
                    testID="row-dates-toggle"
                  />
                  <Text style={styles.helperText}>
                    Toggle on to filter by date availability. A full calendar picker is coming soon.
                  </Text>
                </View>
              ) : null}
            </ScrollView>
          </View>

          {/* Sticky footer — paddingBottom respects the home indicator so
              taps don't land on the bezel while the white card itself
              still extends to the device bottom edge. */}
          <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
            <TouchableOpacity onPress={clear} style={styles.clearBtn} testID="sheet-clear-all">
              <Text style={styles.clearText}>Clear all</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={apply} style={styles.applyBtn} testID="sheet-apply-btn">
              <Text style={styles.applyText}>Apply ({resultCount})</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Animated.View>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Right-pane option row. Larger font (17 px) + generous vertical padding
// per the design brief.
function CheckRow({ label, checked, onPress, meta, testID }: {
  label: string;
  checked: boolean;
  onPress: () => void;
  meta?: string;
  testID?: string;
}) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7} style={styles.row} testID={testID}>
      <View style={styles.rowLabelWrap}>
        <Text style={[styles.rowLabel, checked && styles.rowLabelActive]} numberOfLines={2}>
          {label}
        </Text>
        {meta ? <Text style={styles.rowMeta}>{meta}</Text> : null}
      </View>
      <View style={[styles.checkbox, checked && styles.checkboxOn]}>
        {checked ? <Icon name="checkmark" size={14} color={Colors.white} /> : null}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  // Anchored bottom + fixed 75%-of-window height — leaves a 25% peek band
  // of dimmed Discover content above the card.
  sheetWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: CARD_HEIGHT,
  },
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
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  title: { fontSize: 17, fontWeight: '700', color: Colors.slate900, letterSpacing: 0.2 },

  // Two-pane container.
  bodyRow: { flex: 1, flexDirection: 'row', backgroundColor: Colors.slate100 },
  // LEFT RAIL
  // LEFT RAIL
  // `width:'28%'` alone is unreliable on a ScrollView inside a flex row —
  // ScrollView's inner wrapper has a flexGrow that can leak and stretch
  // the rail. Pin with `flexGrow:0, flexShrink:0` so the rail stays at
  // exactly 28 % of the card width and the right pane absorbs the rest.
  leftRail: { width: '28%', flexGrow: 0, flexShrink: 0, backgroundColor: Colors.slate100 },
  leftRailContent: { paddingVertical: 8 },
  railEntry: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 14, paddingHorizontal: 14,
    backgroundColor: Colors.slate100,
  },
  railEntryActive: { backgroundColor: Colors.white },
  railAccent: { position: 'absolute', left: 0, top: 10, bottom: 10, width: 3, borderRadius: 2, backgroundColor: Colors.cyan500 },
  railLabel: { flex: 1, fontSize: 13, color: Colors.slate600, fontWeight: '500' },
  railLabelActive: { color: Colors.slate900, fontWeight: '700' },
  railBadge: { minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 5, backgroundColor: Colors.cyan500, alignItems: 'center', justifyContent: 'center' },
  railBadgeText: { fontSize: 10, fontWeight: '700', color: Colors.white },

  // 1-pixel separator between rail and pane.
  divider: { width: StyleSheet.hairlineWidth, backgroundColor: Colors.borderLight },

  // RIGHT PANE
  rightPane: { flex: 1, backgroundColor: Colors.white },
  rightPaneContent: { paddingHorizontal: 18, paddingVertical: 12, paddingBottom: 24 },

  // Larger option row — 17px label, 14-16px vertical padding per brief.
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.borderLight },
  rowLabelWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowLabel: { fontSize: 17, color: Colors.slate700, fontWeight: '500', flexShrink: 1 },
  rowLabelActive: { color: Colors.slate900, fontWeight: '700' },
  rowMeta: { fontSize: 12, color: Colors.slate400, fontWeight: '600' },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.white },
  checkboxOn: { backgroundColor: Colors.cyan500, borderColor: Colors.cyan500 },

  emptyHint: { fontSize: 14, color: Colors.slate400, fontStyle: 'italic', paddingVertical: 16 },
  helperText: { fontSize: 12, color: Colors.slate500, paddingTop: 10, lineHeight: 18 },

  budgetInputWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, height: 48, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.white, marginTop: 12 },
  budgetPrefix: { fontSize: 15, color: Colors.slate600, fontWeight: '700' },
  budgetInput: { flex: 1, fontSize: 15, color: Colors.slate900, fontWeight: '600', padding: 0 },
  budgetHint: { fontSize: 11, color: Colors.slate400, fontWeight: '600' },

  // Footer.
  footer: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: Colors.borderLight, backgroundColor: Colors.white },
  clearBtn: { paddingHorizontal: 18, paddingVertical: 12, borderRadius: 999, backgroundColor: Colors.slate100 },
  clearText: { fontSize: 13, color: Colors.slate700, fontWeight: '700' },
  applyBtn: { flex: 1, paddingVertical: 14, borderRadius: 999, backgroundColor: Colors.cyan400, alignItems: 'center', justifyContent: 'center' },
  applyText: { fontSize: 14, fontWeight: '700', color: Colors.white },
});
