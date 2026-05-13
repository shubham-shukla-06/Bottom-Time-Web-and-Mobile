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
  Animated, View, TouchableOpacity, StyleSheet, ScrollView,
  KeyboardAvoidingView, Platform, Dimensions, Modal, PanResponder,
  NativeScrollEvent, NativeSyntheticEvent, LayoutChangeEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Compass, MapPin, Gauge, Wallet, Calendar as CalendarIcon, X } from 'lucide-react-native';
import { Calendar } from 'react-native-calendars';
import MultiSlider from '@ptomasroos/react-native-multi-slider';
import { Colors } from '../constants/colors';
import CurrencyPicker from './CurrencyPicker';
import { Text } from './Text';
import useUIStore, { CURRENCY_SYMBOLS } from '../stores/uiStore';

export interface DiscoverFilters {
  types: string[];
  countries: string[];
  difficulties: string[];
  priceActive: boolean;
  priceMax: number;
  dateActive: boolean;
  // Additive fields — Discover's filter pipeline ignores unknown keys, so
  // these can land without index.tsx changes.
  priceMin?: number;
  currency?: string;
  dateStart?: string;  // ISO yyyy-MM-dd
  dateEnd?: string;    // ISO yyyy-MM-dd
}

const PRICE_MIN_DEFAULT = 0;
const PRICE_MAX_DEFAULT = 5000;
const PRICE_STEP = 50;

export const EMPTY_FILTERS: DiscoverFilters = {
  types: [], countries: [], difficulties: [],
  priceActive: false, priceMax: 1000, dateActive: false,
  priceMin: PRICE_MIN_DEFAULT,
  currency: undefined,
  dateStart: undefined, dateEnd: undefined,
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
const SCREEN_W = Dimensions.get('window').width;
const CARD_HEIGHT = Math.round(SCREEN_H * 0.75);

// Brand-tint constants. Colors module exposes cyan500/cyan400 but not the
// 50/600/700 stops, so they are literals here.
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
  { key: 'dates',       label: 'Dates',       Icon: CalendarIcon },
];

const ACTIVE_THRESHOLD = 60;

const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function fmtShort(iso?: string): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map((n) => parseInt(n, 10));
  if (!y || !m || !d) return iso;
  return `${MONTHS_SHORT[m - 1]} ${d}`;
}

export default function FilterSheet({
  visible, progress, onClose, initial, destinations, resultCount,
  onApply, onClearAll, onDraftChange,
}: Props) {
  const insets = useSafeAreaInsets();
  const appCurrency = useUIStore((s) => s.currency);
  const [draft, setDraft] = useState<DiscoverFilters>(initial);
  const [activeSection, setActiveSection] = useState<SectionKey>('type');
  const [dateModalOpen, setDateModalOpen] = useState(false);

  const scrollRef = useRef<ScrollView | null>(null);
  // Latch set when a rail tap initiates a programmatic scroll. While set,
  // `handleScroll` ignores the section-detection sweep so the rail highlight
  // doesn't flicker through intermediate sections during the animation.
  // Cleared on a short timeout (~380 ms) — RN's scrollTo animation settles
  // well within that window on iOS/Android.
  const programmaticTargetRef = useRef<SectionKey | null>(null);
  // Last scrollY observed by the dampener (change #5 jitter filter).
  const lastScrollYRef = useRef(0);
  // PanResponder drag offset, composed into translateY alongside the parent's
  // entry/exit `progress` animation. Native driver compatible.
  const dragY = useRef(new Animated.Value(0)).current;
  const [paneHeight, setPaneHeight] = useState(0);
  const [lastSectionHeight, setLastSectionHeight] = useState(0);
  const sectionOffsets = useRef<Record<SectionKey, number>>({
    type: 0, destination: 0, level: 0, budget: 0, dates: 0,
  });

  // Reset draft on each open. Default currency tracks the app's selected
  // currency from uiStore so the budget slider's display units make sense.
  useEffect(() => {
    if (visible) {
      setDraft({ ...initial, currency: initial.currency ?? appCurrency });
      setActiveSection('type');
      dragY.setValue(0);
    }
  }, [visible, initial, appCurrency, dragY]);

  // Live preview hook.
  useEffect(() => { if (onDraftChange) onDraftChange(draft); }, [draft, onDraftChange]);

  const toggle = (key: 'types' | 'countries' | 'difficulties', val: string) => {
    setDraft((d) => {
      const arr = d[key];
      return { ...d, [key]: arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val] };
    });
  };

  const apply = () => { onApply(draft); onClose(); };

  const clear = () => { setDraft(EMPTY_FILTERS); onClearAll(); };

  const counts: Record<SectionKey, number> = useMemo(() => ({
    type:        draft.types.length,
    destination: draft.countries.length,
    level:       draft.difficulties.length,
    budget:      draft.priceActive ? 1 : 0,
    dates:       draft.dateActive ? 1 : 0,
  }), [draft]);

  // Whether the user has any filter selected — controls the Show-results
  // button's active vs muted state.
  const hasAnyFilter =
    draft.types.length > 0 ||
    draft.countries.length > 0 ||
    draft.difficulties.length > 0 ||
    draft.priceActive ||
    draft.dateActive;

  const translateY = Animated.add(
    (progress as Animated.Value).interpolate({
      inputRange: [0, 1],
      outputRange: [SCREEN_H, 0],
    }),
    // Drag offset added on top of the entry/exit animation. The PanResponder
    // writes raw dy into `dragY`; on release we either spring it back to 0
    // or run a close timing then call onClose.
    dragY,
  );

  // Whole-sheet pull-down-to-dismiss. Attached to the header band only so
  // the body ScrollView keeps its native vertical scroll. PanResponder
  // (not gesture-handler) — matches the listing-detail precedent and
  // avoids iOS race conditions when nested under RN Modal.
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) =>
        g.dy > 6 && Math.abs(g.dy) > Math.abs(g.dx) * 1.5,
      onPanResponderMove: (_, g) => {
        dragY.setValue(Math.max(0, g.dy));
      },
      onPanResponderRelease: (_, g) => {
        if (g.dy > 100 || g.vy > 1.2) {
          // Slide remaining distance, then notify parent. Reset dragY so the
          // next open cycle starts clean — the parent re-mounts on visible
          // but the ref persists between renders.
          Animated.timing(dragY, {
            toValue: SCREEN_H,
            duration: 180,
            useNativeDriver: true,
          }).start(() => {
            dragY.setValue(0);
            onClose();
          });
        } else {
          Animated.spring(dragY, {
            toValue: 0,
            useNativeDriver: true,
            bounciness: 4,
          }).start();
        }
      },
      onPanResponderTerminate: () => {
        Animated.spring(dragY, {
          toValue: 0,
          useNativeDriver: true,
          bounciness: 4,
        }).start();
      },
    }),
  ).current;

  const handleSectionLayout = (key: SectionKey) => (e: LayoutChangeEvent) => {
    sectionOffsets.current[key] = e.nativeEvent.layout.y;
    if (key === 'dates') setLastSectionHeight(e.nativeEvent.layout.height);
  };

  const tailPadding = Math.max(0, paneHeight - lastSectionHeight - 24);

  const handleRailTap = (key: SectionKey) => {
    // Set the visual state immediately so the cyan-50 bg + accent bar
    // jump to the target row before the scroll animation begins.
    programmaticTargetRef.current = key;
    setActiveSection(key);
    scrollRef.current?.scrollTo({ y: sectionOffsets.current[key], animated: true });
    // Clear the latch ~380 ms later — long enough for the default RN
    // scroll animation to settle, short enough that user-initiated scroll
    // immediately after a tap feels responsive.
    setTimeout(() => {
      if (programmaticTargetRef.current === key) {
        programmaticTargetRef.current = null;
      }
    }, 380);
  };

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    // Latch: while a programmatic scroll is animating, ignore the sweep —
    // its intermediate ticks would otherwise flip activeSection through
    // every section between source and target, causing visible flicker.
    if (programmaticTargetRef.current !== null) return;
    const scrollY = e.nativeEvent.contentOffset.y;
    // Jitter dampener: skip negligible delta updates.
    if (Math.abs(scrollY - lastScrollYRef.current) < 4) return;
    lastScrollYRef.current = scrollY;
    const y = scrollY + ACTIVE_THRESHOLD;
    let bestKey: SectionKey = 'type';
    let bestTop = -Infinity;
    for (const s of SECTIONS) {
      const top = sectionOffsets.current[s.key];
      if (top <= y && top > bestTop) { bestTop = top; bestKey = s.key; }
    }
    if (bestKey !== activeSection) setActiveSection(bestKey);
  };

  // Dates pill label.
  const datesPillLabel = draft.dateStart && draft.dateEnd
    ? `${fmtShort(draft.dateStart)} – ${fmtShort(draft.dateEnd)}`
    : 'Anytime';

  // Commit handlers for the date modal.
  const commitDates = (start?: string, end?: string) => {
    setDraft((d) => ({
      ...d,
      dateStart: start,
      dateEnd: end,
      dateActive: !!(start && end),
    }));
    setDateModalOpen(false);
  };
  const clearDates = () => {
    setDraft((d) => ({ ...d, dateStart: undefined, dateEnd: undefined, dateActive: false }));
    setDateModalOpen(false);
  };

  return (
    <Animated.View
      pointerEvents={visible ? 'auto' : 'none'}
      style={[styles.sheetWrap, { transform: [{ translateY }] }]}
      testID="filter-sheet-wrap"
    >
      <View style={styles.sheet} testID="filter-sheet">
        <View style={styles.handle} />

        {/* HEADER — also the drag handle band. PanResponder attached only
            here so the body ScrollView keeps native vertical scroll. */}
        <View style={styles.headerRow} {...panResponder.panHandlers}>
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
                        <s.Icon size={32} color={iconColor} strokeWidth={active ? 1.8 : 1.5} />
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
                      {active ? <View style={styles.railAccent} /> : null}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            {/* RIGHT PANE */}
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

              {/* BUDGET — Currency selector + dual-thumb min/max slider. */}
              <SectionCard title="Budget" onLayout={handleSectionLayout('budget')}>
                <BudgetSlider
                  min={draft.priceMin ?? PRICE_MIN_DEFAULT}
                  max={draft.priceMax}
                  currency={draft.currency ?? appCurrency}
                  onChange={(mn, mx) => {
                    const active = mn > PRICE_MIN_DEFAULT || mx < PRICE_MAX_DEFAULT;
                    setDraft((d) => ({
                      ...d,
                      priceMin: mn, priceMax: mx, priceActive: active,
                    }));
                  }}
                />
              </SectionCard>

              {/* DATES — single pill opens a full-screen range calendar. */}
              <SectionCard title="Dates" onLayout={handleSectionLayout('dates')}>
                <FilterPillButton
                  fullWidth
                  label={datesPillLabel}
                  selected={draft.dateActive}
                  onPress={() => setDateModalOpen(true)}
                  testID="pill-dates-toggle"
                />
              </SectionCard>
            </ScrollView>
          </View>

          {/* FOOTER */}
          <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} testID="footer-close">
              <Text style={styles.closeBtnText}>Close</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={hasAnyFilter ? apply : undefined}
              activeOpacity={hasAnyFilter ? 0.7 : 1}
              style={[styles.showResultsBtn, !hasAnyFilter && styles.showResultsBtnMuted]}
              testID="sheet-apply-btn"
            >
              <Text style={[styles.showResultsText, !hasAnyFilter && styles.showResultsTextMuted]}>
                Show results
              </Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </View>

      {/* DATE RANGE MODAL — full-screen overlay. */}
      <DateRangeModal
        visible={dateModalOpen}
        initialStart={draft.dateStart}
        initialEnd={draft.dateEnd}
        onClose={() => setDateModalOpen(false)}
        onDone={commitDates}
        onClear={clearDates}
      />
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

// ─────────────────────────────────────────────────────────────────────────
// Budget min/max range slider. Currency selector reuses CurrencyPicker so
// changes update the app-wide uiStore.currency; we also mirror the choice
// onto draft.currency so the slider header always reflects the picked unit.
function BudgetSlider({
  min, max, currency, onChange,
}: {
  min: number;
  max: number;
  currency: string;
  onChange: (mn: number, mx: number) => void;
}) {
  const symbol = CURRENCY_SYMBOLS[currency] || currency;
  // The slider component is uncontrolled internally; we feed `values` for
  // initial render but allow drag to animate without parent thrash.
  const [pair, setPair] = useState<[number, number]>([
    Math.max(PRICE_MIN_DEFAULT, Math.min(max, min)),
    Math.max(min, Math.min(PRICE_MAX_DEFAULT, max)),
  ]);
  return (
    <View>
      <View style={styles.budgetCurrencyRow}>
        <Text style={styles.budgetLabel}>Currency</Text>
        <CurrencyPicker testID="filter-currency-picker" />
      </View>
      <View style={styles.budgetRangeRow}>
        <Text style={styles.budgetRangeText}>
          {`${symbol}${pair[0]} – ${symbol}${pair[1]}${pair[1] >= PRICE_MAX_DEFAULT ? '+' : ''}`}
        </Text>
      </View>
      <View style={styles.sliderWrap}>
        <MultiSlider
          values={pair}
          min={PRICE_MIN_DEFAULT}
          max={PRICE_MAX_DEFAULT}
          step={PRICE_STEP}
          sliderLength={SCREEN_W * 0.55}
          onValuesChange={(v: number[]) => setPair([v[0], v[1]])}
          onValuesChangeFinish={(v: number[]) => onChange(v[0], v[1])}
          selectedStyle={{ backgroundColor: CYAN_500 }}
          unselectedStyle={{ backgroundColor: Colors.slate200 }}
          trackStyle={{ height: 4, borderRadius: 2 }}
          markerStyle={{
            height: 20, width: 20, borderRadius: 10,
            backgroundColor: Colors.white,
            borderWidth: 2, borderColor: CYAN_500,
          }}
          pressedMarkerStyle={{ backgroundColor: CYAN_50 }}
          containerStyle={{ height: 32 }}
        />
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Full-screen date-range picker using react-native-calendars in "period"
// markingType. Two taps select range. Done commits, Clear resets.
function DateRangeModal({
  visible, initialStart, initialEnd, onClose, onDone, onClear,
}: {
  visible: boolean;
  initialStart?: string;
  initialEnd?: string;
  onClose: () => void;
  onDone: (start?: string, end?: string) => void;
  onClear: () => void;
}) {
  const [start, setStart] = useState<string | undefined>(initialStart);
  const [end, setEnd] = useState<string | undefined>(initialEnd);

  useEffect(() => {
    if (visible) { setStart(initialStart); setEnd(initialEnd); }
  }, [visible, initialStart, initialEnd]);

  const onDayPress = (d: { dateString: string }) => {
    const date = d.dateString;
    if (!start || (start && end)) { setStart(date); setEnd(undefined); return; }
    if (date < start) { setStart(date); setEnd(undefined); return; }
    setEnd(date);
  };

  // Build markedDates dict for range fill.
  const marked: Record<string, object> = useMemo(() => {
    if (!start) return {};
    if (start && !end) {
      return { [start]: { startingDay: true, endingDay: true, color: CYAN_500, textColor: '#FFFFFF' } };
    }
    const out: Record<string, object> = {};
    const s = new Date(start);
    const e = new Date(end!);
    let cur = new Date(s);
    while (cur <= e) {
      const iso = cur.toISOString().slice(0, 10);
      const isStart = iso === start;
      const isEnd = iso === end;
      out[iso] = {
        startingDay: isStart,
        endingDay: isEnd,
        color: isStart || isEnd ? CYAN_500 : CYAN_50,
        textColor: isStart || isEnd ? '#FFFFFF' : CYAN_700,
      };
      cur.setDate(cur.getDate() + 1);
    }
    return out;
  }, [start, end]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={modalStyles.backdrop}>
        <View style={modalStyles.sheet}>
          <View style={modalStyles.header}>
            <Text style={modalStyles.title}>Select dates</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} testID="date-modal-close">
              <X size={22} color={Colors.slate700} strokeWidth={2.2} />
            </TouchableOpacity>
          </View>
          <Calendar
            markingType="period"
            markedDates={marked as any}
            onDayPress={onDayPress}
            theme={{
              todayTextColor: CYAN_600,
              arrowColor: CYAN_600,
              textDayFontWeight: '500',
              textMonthFontWeight: '700',
            }}
          />
          <View style={modalStyles.footer}>
            <TouchableOpacity onPress={onClear} style={modalStyles.clearBtn} testID="date-modal-clear">
              <Text style={modalStyles.clearText}>Clear</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => onDone(start, end)}
              disabled={!start || !end}
              style={[modalStyles.doneBtn, (!start || !end) && modalStyles.doneBtnDisabled]}
              testID="date-modal-done"
            >
              <Text style={modalStyles.doneText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheetWrap: { position: 'absolute', left: 0, right: 0, bottom: 0, height: CARD_HEIGHT },
  sheet: {
    flex: 1,
    backgroundColor: Colors.white,
    // Filter-sheet card corners — 20 px per latest brief. Does NOT affect
    // the auth/welcome card radius elsewhere.
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
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

  // LEFT RAIL — width 20% (28 × 0.7). Bigger icon + label inside a narrower
  // column, so we relax horizontal padding to 4 and rely on numberOfLines:1.
  leftRail: {
    width: '20%',
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
    gap: 2,
    paddingVertical: 14,
    paddingHorizontal: 4,
    position: 'relative',
  },
  railEntryActive: { backgroundColor: CYAN_50 },
  // Accent stretches to the row's content height minus a 6 px top/bottom
  // margin so it always matches the rail entry regardless of icon/label
  // size. No fixed-height + manual centring.
  railAccent: {
    position: 'absolute',
    right: 0,
    top: 6,
    bottom: 6,
    width: 3,
    borderRadius: 2,
    backgroundColor: CYAN_500,
  },
  // Icon wrap sized 40×40 to fit the 32 px lucide glyph snugly.
  railIconWrap: { position: 'relative', width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  // 5 px / weight 600 — half of the previous 9 px per latest brief.
  // NOTE: 5 px is below the typical legibility floor on most phones; shipped
  // as instructed.
  railLabel: { fontSize: 5, color: Colors.slate600, fontWeight: '600', textAlign: 'center' },
  railLabelActive: { color: CYAN_700, fontWeight: '700' },
  railBadge: {
    position: 'absolute', top: -4, right: -8,
    minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4,
    backgroundColor: CYAN_500, alignItems: 'center', justifyContent: 'center',
  },
  railBadgeText: { fontSize: 11, fontWeight: '700', color: Colors.white },

  // RIGHT PANE — significantly downsized typography per latest brief.
  rightPane: { flex: 1, backgroundColor: Colors.white },
  rightPaneContent: { padding: 12 },

  // SECTION CARDS
  sectionCard: {
    backgroundColor: Colors.slate50,
    borderRadius: 12,
    padding: 10,
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.slate900,
    letterSpacing: -0.1,
    marginBottom: 8,
  },

  // PILL BUTTONS — shrunk per brief: minH 34, pad 8×10, radius 10, gap 8.
  pillGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pillBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 34,
    paddingHorizontal: 10,
    paddingVertical: 8,
    // Fully-rounded pill — adapts to any future minHeight tweak.
    borderRadius: 999,
    backgroundColor: Colors.white,
    borderWidth: 1.5,
    borderColor: Colors.slate200,
  },
  pillBtnGridItem: { width: '48.5%' },
  pillBtnFull: { width: '100%' },
  pillBtnSelected: {
    backgroundColor: CYAN_50,
    borderColor: CYAN_500,
  },
  pillLabel: { fontSize: 11, color: Colors.slate800, fontWeight: '500', textAlign: 'center' },
  pillLabelSelected: { color: CYAN_700, fontWeight: '600' },
  pillMeta: { fontSize: 10, color: Colors.slate400, fontWeight: '600' },

  // BUDGET / hints
  emptyHint: { fontSize: 11, color: Colors.slate400, fontStyle: 'italic' },
  budgetCurrencyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  budgetLabel: { fontSize: 11, color: Colors.slate600, fontWeight: '500' },
  budgetRangeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 4, marginBottom: 4 },
  budgetRangeText: { fontSize: 12, color: Colors.slate800, fontWeight: '700' },
  sliderWrap: { alignItems: 'center', paddingTop: 4 },

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
    // Fully-rounded pill CTA. Horizontal padding kept at 24 — does not look
    // pinched at the shorter "Show results" label after the count was
    // removed.
    borderRadius: 999,
    backgroundColor: CYAN_500,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: CYAN_600,
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  // Muted state — no filters selected. No shadow, slate-200 fill.
  showResultsBtnMuted: {
    backgroundColor: Colors.slate200,
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  showResultsText: { fontSize: 16, fontWeight: '700', color: Colors.white },
  showResultsTextMuted: { color: Colors.slate500, fontWeight: '600' },
});

const modalStyles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.55)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.slate100,
  },
  title: { fontSize: 16, fontWeight: '700', color: Colors.slate900 },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  clearBtn: { paddingVertical: 10, paddingHorizontal: 6 },
  clearText: { fontSize: 15, fontWeight: '500', color: Colors.slate600 },
  doneBtn: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
    backgroundColor: CYAN_500,
  },
  doneBtnDisabled: { backgroundColor: Colors.slate300 },
  doneText: { fontSize: 15, fontWeight: '700', color: Colors.white },
});
