/**
 * FilterSheet — bottom-sheet filter panel for Discover.
 *
 * Rendered inside an RN <Modal> (owned by Discover) so backdrop+sheet
 * escape the (tabs) navigator container and naturally cover the tab bar.
 *
 * Animation contract:
 *   • `progress` (0 closed → 1 open) is owned by the parent (native driver).
 *   • This component interpolates it into the sheet's translateY only
 *     (full screen height -> 0). At progress = 0 the sheet sits below
 *     the viewport; at progress = 1 it sits anchored to the bottom edge
 *     with `top: insets.top + 24` so a slim band of the dimmed Discover
 *     content peeks at the very top, Zomato-style.
 *   • `visible` is the boolean source of truth used for pointerEvents
 *     and for resetting the draft form state on open.
 *
 * Filter state ownership is unchanged — parent owns committed state, this
 * component holds a draft until Apply.
 */
import React, { useEffect, useState } from 'react';
import {
  Animated, View, Text, TouchableOpacity, StyleSheet, ScrollView,
  TextInput, KeyboardAvoidingView, Platform, Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from './Icon';
import { Colors } from '../constants/colors';
import Chip from './ui/Chip';

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
}

// Generous over-estimate so the sheet is fully off-screen at progress=0 even
// on tall landscape devices.
const SCREEN_H = Dimensions.get('window').height;

export default function FilterSheet({ visible, progress, onClose, initial, destinations, resultCount, onApply, onClearAll }: Props) {
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState<DiscoverFilters>(initial);
  const [budgetText, setBudgetText] = useState(String(initial.priceMax || 1000));

  useEffect(() => {
    if (visible) {
      setDraft(initial);
      setBudgetText(String(initial.priceMax || 1000));
    }
  }, [visible, initial]);

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

  // Native-driven translateY: SCREEN_H (off-screen, below) -> 0 (anchored).
  // The outer Animated.View hosts ONLY translateY — keeps native driver pure.
  const translateY = (progress as Animated.Value).interpolate({
    inputRange: [0, 1],
    outputRange: [SCREEN_H, 0],
  });

  return (
    <Animated.View
      pointerEvents={visible ? 'auto' : 'none'}
      style={[
        styles.sheetWrap,
        // top + bottom anchoring stretches the wrap edge-to-edge between the
        // status-bar peek band and the physical bottom of the screen.
        { top: insets.top + 24, transform: [{ translateY }] },
      ]}
      testID="filter-sheet-wrap"
    >
      <View style={styles.sheet} testID="filter-sheet">
        <View style={styles.handle} />
        <View style={styles.headerRow}>
          <Text style={styles.title}>Filters</Text>
          <TouchableOpacity onPress={onClose} testID="filter-sheet-close">
            <Icon name="close" size={22} color={Colors.slate700} />
          </TouchableOpacity>
        </View>

        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          // Header (handle + title row) sits above the keyboard-avoiding
          // region so KAV only adjusts the scroll + footer.
        >
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={styles.body}
            keyboardShouldPersistTaps="handled"
          >
            <Section label="Type" testID="section-type">
              <View style={styles.chipWrap}>
                {TYPE_OPTIONS.map((o) => (
                  <Chip key={o.value} active={draft.types.includes(o.value)}
                    onPress={() => toggle('types', o.value)}
                    testID={`sheet-type-${o.value}`}>
                    {o.label}
                  </Chip>
                ))}
              </View>
            </Section>

            <Section label="Destination" testID="section-destination">
              {destinations.length === 0 ? (
                <Text style={styles.emptyHint}>Loading destinations…</Text>
              ) : (
                <View style={styles.chipWrap}>
                  {destinations.map((d) => (
                    <Chip key={d.country} active={draft.countries.includes(d.country)}
                      count={d.listing_count}
                      onPress={() => toggle('countries', d.country)}
                      testID={`sheet-dest-${d.country}`}>
                      {d.country}
                    </Chip>
                  ))}
                </View>
              )}
            </Section>

            <Section label="Level" testID="section-level">
              <View style={styles.chipWrap}>
                {LEVEL_OPTIONS.map((o) => (
                  <Chip key={o.value} active={draft.difficulties.includes(o.value)}
                    onPress={() => toggle('difficulties', o.value)}
                    testID={`sheet-level-${o.value}`}>
                    {o.label}
                  </Chip>
                ))}
              </View>
            </Section>

            <Section label="Budget" testID="section-budget">
              <View style={styles.chipWrap}>
                <Chip active={draft.priceActive}
                  leftIcon={<Text style={[styles.curMark, { color: draft.priceActive ? Colors.white : Colors.slate600 }]}>$</Text>}
                  onPress={() => setDraft((d) => ({ ...d, priceActive: !d.priceActive }))}
                  testID="sheet-budget-toggle">
                  {draft.priceActive ? `Up to $${budgetText}` : 'Any price'}
                </Chip>
              </View>
              {draft.priceActive ? (
                <View style={styles.budgetInputWrap}>
                  <Text style={styles.budgetPrefix}>$</Text>
                  <TextInput
                    keyboardType="numeric"
                    value={budgetText}
                    onChangeText={setBudgetText}
                    style={styles.budgetInput}
                    placeholder="Max price"
                    placeholderTextColor={Colors.slate400}
                    testID="sheet-budget-input"
                  />
                  <Text style={styles.budgetHint}>USD</Text>
                </View>
              ) : null}
            </Section>

            <Section label="Dates" testID="section-dates">
              <View style={styles.chipWrap}>
                <Chip active={draft.dateActive}
                  leftIcon={<Icon name="calendar-outline" size={11} color={draft.dateActive ? Colors.white : Colors.slate600} />}
                  onPress={() => setDraft((d) => ({ ...d, dateActive: !d.dateActive }))}
                  testID="sheet-date-toggle">
                  {draft.dateActive ? 'Pick travel dates' : 'Any dates'}
                </Chip>
              </View>
            </Section>
          </ScrollView>

          {/* Sticky footer. paddingBottom respects the home-indicator inset
              so taps don't land on the bezel, while the white card itself
              still extends all the way to the device bottom edge. */}
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

function Section({ label, testID, children }: { label: string; testID?: string; children: React.ReactNode }) {
  return (
    <View testID={testID} style={styles.section}>
      <Text style={styles.sectionLabel}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  // Stretches top → bottom of the Modal's window. translateY moves the
  // whole wrap up/down as a unit (native driver). `top` is applied inline
  // because it depends on safe-area insets resolved at runtime.
  sheetWrap: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  sheet: {
    flex: 1,
    backgroundColor: Colors.white,
    borderTopLeftRadius: 44,
    borderTopRightRadius: 44,
    paddingTop: 0,
    // Soft upward shadow so the sheet reads as a card lifted over the
    // (dimmed + scaled-down) Discover content behind it.
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: -6 },
    elevation: 12,
  },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.slate200, marginTop: 8, marginBottom: 8 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  title: { fontSize: 18, fontWeight: '700', color: Colors.slate900 },
  body: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 16, gap: 18 },
  section: { gap: 10 },
  sectionLabel: { fontSize: 11, color: Colors.cyan500, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.2 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  emptyHint: { fontSize: 12, color: Colors.slate400, fontStyle: 'italic' },
  curMark: { fontSize: 11, fontWeight: '700' },
  budgetInputWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, height: 44, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.white },
  budgetPrefix: { fontSize: 14, color: Colors.slate600, fontWeight: '700' },
  budgetInput: { flex: 1, fontSize: 14, color: Colors.slate900, fontWeight: '600', padding: 0 },
  budgetHint: { fontSize: 11, color: Colors.slate400, fontWeight: '600' },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: Colors.borderLight, backgroundColor: Colors.white },
  clearBtn: { paddingHorizontal: 18, paddingVertical: 12, borderRadius: 999, backgroundColor: Colors.slate100 },
  clearText: { fontSize: 13, color: Colors.slate700, fontWeight: '700' },
  applyBtn: { flex: 1, paddingVertical: 14, borderRadius: 999, backgroundColor: Colors.cyan400, alignItems: 'center', justifyContent: 'center' },
  applyText: { fontSize: 14, fontWeight: '700', color: Colors.white },
});
