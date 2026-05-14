/**
 * FilterPanel — Web equivalent of mobile's Zomato-style two-pane FilterSheet.
 *
 * Desktop adaptation: rendered as a slide-over dialog from the right side of
 * the screen. Left rail has section icons + labels, right pane shows options.
 *
 * Sections: Type, Destination, Level, Budget (dual-range slider), Dates.
 */
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Compass, MapPin, Gauge, Wallet, CalendarDays, X } from 'lucide-react';
import { Slider } from './ui/slider';
import { Calendar } from './ui/calendar';
import { CURRENCY_OPTIONS } from '../hooks/useDiscoverFilters';

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

const SECTIONS = [
  { key: 'type', label: 'Type', Icon: Compass },
  { key: 'destination', label: 'Destination', Icon: MapPin },
  { key: 'level', label: 'Level', Icon: Gauge },
  { key: 'budget', label: 'Budget', Icon: Wallet },
  { key: 'dates', label: 'Dates', Icon: CalendarDays },
];

const PRICE_MIN = 0;
const PRICE_MAX = 5000;
const PRICE_STEP = 50;

export default function FilterPanel({
  open,
  onClose,
  filters,
  destinations,
  currency,
  currencySymbol,
  onApply,
  onClearAll,
  resultCount,
}) {
  const [draft, setDraft] = useState(filters);
  const [activeSection, setActiveSection] = useState('type');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const sectionRefs = useRef({});
  const scrollRef = useRef(null);

  // Reset draft when panel opens
  useEffect(() => {
    if (open) {
      setDraft(filters);
      setActiveSection('type');
    }
  }, [open, filters]);

  const toggle = (key, val) => {
    setDraft(d => {
      const arr = d[key];
      return { ...d, [key]: arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val] };
    });
  };

  const hasAnyFilter = useMemo(() => (
    draft.types.length > 0 ||
    draft.countries.length > 0 ||
    draft.difficulties.length > 0 ||
    draft.priceActive ||
    draft.dateRange?.from
  ), [draft]);

  const counts = useMemo(() => ({
    type: draft.types.length,
    destination: draft.countries.length,
    level: draft.difficulties.length,
    budget: draft.priceActive ? 1 : 0,
    dates: draft.dateRange?.from ? 1 : 0,
  }), [draft]);

  const apply = () => {
    onApply(draft);
    onClose();
  };

  const clear = () => {
    setDraft({
      types: [], countries: [], difficulties: [],
      priceMin: PRICE_MIN, priceMax: PRICE_MAX,
      priceActive: false, dateRange: { from: undefined, to: undefined },
    });
  };

  const scrollToSection = (key) => {
    setActiveSection(key);
    const el = sectionRefs.current[key];
    if (el && scrollRef.current) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  // Handle scroll to track active section
  const handleScroll = useCallback(() => {
    const container = scrollRef.current;
    if (!container) return;
    const scrollTop = container.scrollTop + 80;
    let bestKey = 'type';
    let bestTop = -Infinity;
    for (const s of SECTIONS) {
      const el = sectionRefs.current[s.key];
      if (el) {
        const top = el.offsetTop;
        if (top <= scrollTop && top > bestTop) {
          bestTop = top;
          bestKey = s.key;
        }
      }
    }
    setActiveSection(bestKey);
  }, []);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  // Prevent body scroll when open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  const sym = currencySymbol || '$';
  const priceMin = draft.priceMin ?? PRICE_MIN;
  const priceMax = draft.priceMax ?? PRICE_MAX;

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60]" data-testid="filter-panel-overlay">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 transition-opacity"
        onClick={onClose}
        data-testid="filter-panel-backdrop"
      />

      {/* Panel */}
      <div
        className="absolute right-0 top-0 bottom-0 w-full max-w-[640px] bg-white shadow-2xl flex flex-col animate-in slide-in-from-right duration-300"
        data-testid="filter-panel"
        role="dialog"
        aria-label="Filters and sorting"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100" data-testid="filter-panel-header">
          <h2 className="text-lg font-bold text-slate-900 tracking-tight">Filters and sorting</h2>
          <div className="flex items-center gap-3">
            <button
              onClick={clear}
              className="text-sm text-slate-500 font-medium hover:text-slate-700 transition-colors"
              data-testid="filter-panel-clear-all"
            >
              Clear all
            </button>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-slate-100 transition-colors"
              data-testid="filter-panel-close"
              aria-label="Close filters"
            >
              <X size={18} className="text-slate-500" />
            </button>
          </div>
        </div>

        {/* Body: two-pane layout */}
        <div className="flex flex-1 min-h-0">
          {/* Left Rail */}
          <nav className="w-[100px] flex-shrink-0 border-r border-slate-100 bg-white overflow-y-auto py-2" data-testid="filter-rail">
            {SECTIONS.map(s => {
              const active = s.key === activeSection;
              const count = counts[s.key];
              return (
                <button
                  key={s.key}
                  onClick={() => scrollToSection(s.key)}
                  className={`w-full flex flex-col items-center gap-1 py-3.5 px-2 relative transition-colors ${active ? 'bg-cyan-50' : 'hover:bg-slate-50'}`}
                  data-testid={`filter-section-${s.key}`}
                >
                  <div className="relative">
                    <s.Icon
                      size={24}
                      strokeWidth={1.5}
                      className={active ? 'text-cyan-600' : 'text-slate-400'}
                    />
                    {count > 0 && (
                      <span className="absolute -top-1.5 -right-2.5 min-w-[16px] h-4 rounded-full bg-cyan-500 text-white text-[10px] font-bold flex items-center justify-center px-1">
                        {count}
                      </span>
                    )}
                  </div>
                  <span className={`text-[11px] font-semibold ${active ? 'text-cyan-700' : 'text-slate-500'}`}>
                    {s.label}
                  </span>
                  {active && (
                    <span className="absolute right-0 top-1.5 bottom-1.5 w-[3px] rounded-l-full bg-cyan-500" />
                  )}
                </button>
              );
            })}
          </nav>

          {/* Right Pane */}
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto p-4"
            onScroll={handleScroll}
            data-testid="filter-panel-content"
          >
            {/* Type */}
            <SectionCard
              title="Type"
              refCallback={el => sectionRefs.current.type = el}
            >
              <div className="flex flex-wrap gap-2">
                {TYPE_OPTIONS.map(o => (
                  <PillButton
                    key={o.value}
                    label={o.label}
                    selected={draft.types.includes(o.value)}
                    onClick={() => toggle('types', o.value)}
                    testId={`pill-type-${o.value}`}
                  />
                ))}
              </div>
            </SectionCard>

            {/* Destination */}
            <SectionCard
              title="Destination"
              refCallback={el => sectionRefs.current.destination = el}
            >
              {destinations.length === 0 ? (
                <p className="text-xs text-slate-400 italic">Loading destinations…</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {destinations.map(d => (
                    <PillButton
                      key={d.country}
                      label={d.country}
                      selected={draft.countries.includes(d.country)}
                      onClick={() => toggle('countries', d.country)}
                      testId={`pill-dest-${d.country}`}
                    />
                  ))}
                </div>
              )}
            </SectionCard>

            {/* Level */}
            <SectionCard
              title="Level"
              refCallback={el => sectionRefs.current.level = el}
            >
              <div className="flex flex-wrap gap-2">
                {LEVEL_OPTIONS.map(o => (
                  <PillButton
                    key={o.value}
                    label={o.label}
                    selected={draft.difficulties.includes(o.value)}
                    onClick={() => toggle('difficulties', o.value)}
                    testId={`pill-level-${o.value}`}
                  />
                ))}
              </div>
            </SectionCard>

            {/* Budget */}
            <SectionCard
              title="Budget"
              refCallback={el => sectionRefs.current.budget = el}
            >
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500 font-medium">Currency</span>
                  <CurrencySelect
                    value={currency}
                    onChange={(code) => {
                      // Currency change is handled at parent level
                    }}
                  />
                </div>
                <div className="text-center">
                  <span className="text-sm font-bold text-slate-800">
                    {sym}{priceMin} – {sym}{priceMax}{priceMax >= PRICE_MAX ? '+' : ''}
                  </span>
                </div>
                <Slider
                  value={[priceMin, priceMax]}
                  onValueChange={([mn, mx]) => {
                    const active = mn > PRICE_MIN || mx < PRICE_MAX;
                    setDraft(d => ({ ...d, priceMin: mn, priceMax: mx, priceActive: active }));
                  }}
                  min={PRICE_MIN}
                  max={PRICE_MAX}
                  step={PRICE_STEP}
                  color="cyan"
                  data-testid="filter-budget-slider"
                />
                <div className="flex justify-between text-[10px] text-slate-400">
                  <span>{sym}{PRICE_MIN}</span>
                  <span>{sym}{PRICE_MAX}+</span>
                </div>
              </div>
            </SectionCard>

            {/* Dates */}
            <SectionCard
              title="Dates"
              refCallback={el => sectionRefs.current.dates = el}
            >
              <PillButton
                label={draft.dateRange?.from && draft.dateRange?.to
                  ? `${draft.dateRange.from.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${draft.dateRange.to.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
                  : 'Anytime'}
                selected={!!draft.dateRange?.from}
                onClick={() => setShowDatePicker(!showDatePicker)}
                testId="pill-dates-toggle"
                fullWidth
              />
              {showDatePicker && (
                <div className="mt-3 border border-slate-200 rounded-xl overflow-hidden bg-white" data-testid="filter-date-picker">
                  <Calendar
                    mode="range"
                    selected={draft.dateRange}
                    onSelect={r => setDraft(d => ({ ...d, dateRange: r || { from: undefined, to: undefined } }))}
                    numberOfMonths={1}
                    fromDate={new Date()}
                  />
                  <div className="flex justify-between px-3 pb-3">
                    <button
                      onClick={() => {
                        setDraft(d => ({ ...d, dateRange: { from: undefined, to: undefined } }));
                        setShowDatePicker(false);
                      }}
                      className="text-xs font-medium text-slate-500 hover:text-slate-700"
                      data-testid="filter-date-clear"
                    >
                      Clear
                    </button>
                    <button
                      onClick={() => setShowDatePicker(false)}
                      disabled={!draft.dateRange?.from || !draft.dateRange?.to}
                      className="px-4 py-1.5 text-xs font-bold text-white bg-cyan-500 rounded-lg disabled:bg-slate-300 disabled:text-slate-500"
                      data-testid="filter-date-done"
                    >
                      Done
                    </button>
                  </div>
                </div>
              )}
            </SectionCard>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-slate-100 bg-white" data-testid="filter-panel-footer">
          <button
            onClick={onClose}
            className="text-base text-slate-500 font-medium hover:text-slate-700 transition-colors"
            data-testid="filter-panel-footer-close"
          >
            Close
          </button>
          <button
            onClick={hasAnyFilter ? apply : undefined}
            className={`px-6 py-3 rounded-full text-base font-bold transition-all ${
              hasAnyFilter
                ? 'bg-cyan-500 text-white shadow-md shadow-cyan-500/20 hover:bg-cyan-600'
                : 'bg-slate-200 text-slate-500 cursor-default'
            }`}
            data-testid="filter-panel-apply"
          >
            Show results
          </button>
        </div>
      </div>
    </div>
  );
}

function SectionCard({ title, refCallback, children }) {
  return (
    <div ref={refCallback} className="bg-slate-50 rounded-xl p-3 mb-3">
      <h3 className="text-xs font-bold text-slate-900 tracking-tight mb-2">{title}</h3>
      {children}
    </div>
  );
}

function PillButton({ label, selected, onClick, testId, fullWidth }) {
  return (
    <button
      onClick={onClick}
      className={`
        inline-flex items-center justify-center
        min-h-[34px] px-3 py-2 rounded-full
        text-[11px] font-medium transition-all
        border-[1.5px]
        ${fullWidth ? 'w-full' : ''}
        ${selected
          ? 'bg-cyan-50 border-cyan-500 text-cyan-700 font-semibold'
          : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'}
      `}
      data-testid={testId}
    >
      {label}
    </button>
  );
}

function CurrencySelect({ value }) {
  const sym = CURRENCY_OPTIONS.find(c => c.code === value)?.symbol || value;
  return (
    <span className="text-xs font-semibold text-cyan-600 bg-cyan-50 px-2.5 py-1 rounded-full" data-testid="filter-currency-display">
      {sym} {value}
    </span>
  );
}
