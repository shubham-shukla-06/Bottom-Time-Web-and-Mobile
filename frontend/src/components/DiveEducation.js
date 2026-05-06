import { useState } from 'react';
import { HelpCircle, X, ChevronRight, BookOpen } from 'lucide-react';

// Complete dive education glossary — written for beginners
const GLOSSARY = {
  // Core metrics
  ndl: {
    term: 'NDL (No-Decompression Limit)',
    simple: 'How long you can stay at this depth before you MUST make a decompression stop on the way up.',
    why: 'If you exceed your NDL, you can\'t go straight to the surface — you\'d need to stop at specific depths to let nitrogen safely leave your body. Going over NDL without stopping risks decompression sickness ("the bends").',
    tip: 'Always plan to surface with NDL time remaining. A good rule: never use more than 80% of your NDL.',
    color: 'Green = plenty of time. Amber = getting close. Red = exceeded, mandatory deco stops needed.',
  },
  depth: {
    term: 'Depth',
    simple: 'How deep you are underwater, measured in metres from the surface.',
    why: 'The deeper you go, the faster your body absorbs nitrogen and the less time you can safely stay. Pressure doubles every 10 metres.',
    tip: 'Recreational diving limit is 40m (130ft). Most fun diving happens between 10-30m where there\'s plenty of light and marine life.',
    color: 'On depth charts, the line goes DOWN as you go deeper (like the ocean). The filled area shows your depth over time.',
  },
  duration: {
    term: 'Bottom Time / Duration',
    simple: 'Total time underwater from descent to surfacing, measured in minutes.',
    why: 'Longer dives mean more gas consumed and more nitrogen absorbed. Your bottom time determines how much air you need and whether you stay within safe limits.',
    tip: 'Track your duration to improve your air consumption over time. Most recreational dives are 40-60 minutes.',
  },
  sac: {
    term: 'SAC Rate (Surface Air Consumption)',
    simple: 'How fast you breathe through your air supply, measured in litres per minute at the surface.',
    why: 'A lower SAC rate means you use air more efficiently and can dive longer. It\'s the single best measure of your diving efficiency.',
    tip: 'Beginners: 18-22 L/min. Experienced: 12-16 L/min. Improve by: relaxing underwater, slow deep breaths, proper weighting, good trim.',
  },
  ppo2: {
    term: 'pO2 (Partial Pressure of Oxygen)',
    simple: 'How concentrated the oxygen is in each breath at your current depth. Gets higher as you go deeper.',
    why: 'Too much oxygen becomes toxic to your brain and lungs. Above 1.4 bar, you risk oxygen toxicity — which can cause underwater seizures.',
    tip: 'Keep pO2 below 1.4 bar for recreational diving. This is why Nitrox has a maximum operating depth (MOD).',
    color: 'Amber line on the profile chart. The red dashed line at 1.4 marks the safety limit — stay below it.',
  },
  ppn2: {
    term: 'pN2 (Partial Pressure of Nitrogen)',
    simple: 'How much nitrogen your body is absorbing at this depth. This is what causes decompression sickness if you surface too fast.',
    why: 'Nitrogen dissolves into your blood and tissues under pressure. Surface too quickly and it forms bubbles — like shaking a soda can and opening it.',
    tip: 'High pN2 (above 3.2 bar) can cause nitrogen narcosis — feeling "drunk" underwater. This starts around 30m on air.',
    color: 'Purple/indigo dashed line on the profile chart.',
  },
  cns: {
    term: 'CNS% (Central Nervous System Oxygen Toxicity)',
    simple: 'A running score of how much oxygen stress your brain has accumulated. Starts at 0%, danger above 80%.',
    why: 'Oxygen toxicity can cause seizures underwater — extremely dangerous. CNS% tracks your cumulative exposure across the dive.',
    tip: 'Stay below 80% for single dives. Resets over time on the surface. Higher pO2 = CNS% climbs faster.',
  },
  otu: {
    term: 'OTU (Oxygen Tolerance Units)',
    simple: 'A score tracking oxygen stress on your lungs over time. Similar to CNS but measures long-term pulmonary effects.',
    why: 'While CNS tracks brain toxicity risk, OTU tracks lung irritation from breathing high-oxygen mixes across multiple dives or days.',
    tip: 'Daily limit: ~300 OTU. Weekly limit: ~850 OTU. Mainly relevant for technical divers doing many dives.',
  },
  mod: {
    term: 'MOD (Maximum Operating Depth)',
    simple: 'The deepest you can safely go with your current gas mix before oxygen becomes toxic.',
    why: 'Every gas mix has a depth limit. Air: ~56m. EAN32 (Nitrox 32%): ~33m. Go deeper than the MOD and you risk oxygen toxicity.',
    tip: 'Always know your MOD before diving. It\'s the most important number for Nitrox divers.',
  },
  ead: {
    term: 'EAD (Equivalent Air Depth)',
    simple: 'When using Nitrox, this tells you the "equivalent" depth you\'d be at on regular air for nitrogen absorption purposes.',
    why: 'EAD shows the nitrogen benefit of Nitrox. A 30m dive on EAN32 has the nitrogen exposure of only ~24m on air — meaning longer NDL.',
    tip: 'Lower EAD = less nitrogen = longer no-deco time. This is why divers use Nitrox.',
  },
  gf: {
    term: 'Gradient Factors (GF Low / GF High)',
    simple: 'Safety margins for the decompression algorithm. Lower numbers = more conservative (safer). Think of them as "how cautious the computer is".',
    why: 'GF High controls when you\'re allowed to surface. GF 85% means you surface at 85% of the theoretical maximum — leaving a 15% safety buffer.',
    tip: 'Recreational: GF 85-100%. Conservative: GF 70-80%. Very conservative: GF 60-70%. If in doubt, go more conservative.',
  },
  tissue: {
    term: 'Tissue Compartments',
    simple: 'Your body has different tissues (brain, muscles, fat, bones) that absorb and release nitrogen at different speeds. The algorithm models 16 of these.',
    why: 'Fast tissues (like blood) load up quickly but also off-gas fast. Slow tissues (like fat) take hours to saturate but also hours to clear. This is why you need surface intervals between dives.',
    tip: 'The bars show each tissue\'s saturation. Cyan/green = safe. Amber = getting loaded. Red = near maximum — reduce depth or time.',
    color: 'Cyan bars = safe zone. Amber bars = caution. Red bars = near or at maximum safe loading.',
  },
  ascent_rate: {
    term: 'Ascent Rate',
    simple: 'How fast you\'re swimming toward the surface, measured in metres per minute.',
    why: 'Ascending too fast is the #1 cause of decompression sickness. Your body needs time to gradually release dissolved nitrogen as pressure decreases.',
    tip: 'Safe rate: 9 metres/min or slower (that\'s really slow — about the speed of your smallest exhaled bubbles). Never exceed 18m/min.',
    color: 'Green zone (below 9m/min) = safe. Amber (9-18m/min) = too fast, slow down. Red (above 18m/min) = dangerous, stop and descend.',
  },
  ceiling: {
    term: 'Deco Ceiling',
    simple: 'The shallowest depth you\'re allowed to ascend to right now. If this is above 0m, you MUST do a decompression stop.',
    why: 'If your tissues are heavily loaded with nitrogen, surfacing directly would cause bubbles to form. The ceiling tells you the highest point that\'s safe.',
    tip: 'Recreational divers should never have a ceiling — that means you\'ve exceeded NDL. If you see a ceiling line on your profile, you entered decompression.',
    color: 'Red shaded area on the depth profile. If it appears, it means you need to stop at that depth before going shallower.',
  },
  nitrox: {
    term: 'Nitrox / Enriched Air (EANx)',
    simple: 'Air with extra oxygen (and less nitrogen). "EAN32" means 32% oxygen instead of the normal 21% in regular air.',
    why: 'Less nitrogen = longer no-deco times and shorter surface intervals. The tradeoff: you can\'t go as deep (lower MOD).',
    tip: 'EAN32 is the most popular Nitrox blend. Great for shallow reef diving (under 30m). Always get your tank analysed before diving.',
  },
  safety_stop: {
    term: 'Safety Stop',
    simple: 'A 3-minute pause at 5 metres depth on every dive deeper than 10m. Not mandatory, but strongly recommended.',
    why: 'Gives your body extra time to off-gas nitrogen in a controlled way. Think of it as an insurance policy against decompression sickness.',
    tip: 'Always do a safety stop. Use the time to check your buddy, enjoy the view, and practice buoyancy control.',
  },
  surface_interval: {
    term: 'Surface Interval (SI)',
    simple: 'Time spent on the surface between two dives. Your body uses this time to release absorbed nitrogen.',
    why: 'The longer your surface interval, the more nitrogen leaves your body, and the more bottom time you get on the next dive.',
    tip: 'Minimum 1 hour between dives. 2+ hours is better. Use the repetitive dive planner to see how SI affects your next dive.',
  },
};

// Chart reading guides
const CHART_GUIDES = {
  depth_profile: {
    title: 'How to Read the Depth Profile',
    sections: [
      { subtitle: 'The main line', text: 'The cyan/teal line shows your depth over time. It goes DOWN as you descend (like going deeper in the ocean). Time runs left to right.', color: '#0891b2' },
      { subtitle: 'The shape tells a story', text: 'A U-shape = you went to one depth and came back. A square profile = you stayed at one depth. Multiple dips = multi-level dive. A gradual rise at the end = your ascent and safety stop.' },
      { subtitle: 'The filled area', text: 'The shaded area under the line helps visualize how much time you spent at depth. Bigger area = more nitrogen absorbed.' },
      { subtitle: 'Safety stop', text: 'Look for a flat section at 5m near the end — that\'s your safety stop. It should be at least 3 minutes long.' },
    ],
  },
  ascent_chart: {
    title: 'How to Read the Ascent Rate Chart',
    sections: [
      { subtitle: 'Green zone (below 9 m/min)', text: 'This is perfect. You\'re ascending slowly and safely. Your bubbles should be rising faster than you.', color: '#22c55e' },
      { subtitle: 'Amber zone (9-18 m/min)', text: 'You\'re going a bit fast. Slow down. Dump some air from your BCD and kick less.', color: '#f59e0b' },
      { subtitle: 'Red zone (above 18 m/min)', text: 'DANGER. You\'re ascending far too fast. Stop, descend slightly, and resume slowly. This is how DCS happens.', color: '#ef4444' },
    ],
  },
  tissue_bars: {
    title: 'How to Read the Tissue Loading Bars',
    sections: [
      { subtitle: 'What the bars represent', text: 'Each bar is one tissue type in your body. T1 (fast tissue, like blood) loads and unloads quickly. T16 (slow tissue, like cartilage) takes hours.' },
      { subtitle: 'The percentage', text: 'Shows how loaded that tissue is compared to its maximum safe limit. 50% = half loaded. 100% = at the limit.' },
      { subtitle: 'Cyan/teal bars', text: 'Safe zone. Tissue is well within limits. This is where recreational divers should be.', color: '#0e7490' },
      { subtitle: 'Amber bars', text: 'Caution. Tissue is getting significantly loaded. Consider ascending or reducing bottom time.', color: '#f59e0b' },
      { subtitle: 'Red bars', text: 'Near maximum. You\'re close to or exceeding no-deco limits. Time to start ascending.', color: '#ef4444' },
    ],
  },
  ppo2_chart: {
    title: 'How to Read the Partial Pressure Chart',
    sections: [
      { subtitle: 'Amber line = pO2 (oxygen)', text: 'Shows your oxygen partial pressure at each point in the dive. Goes up as you descend.', color: '#f59e0b' },
      { subtitle: 'Purple dashed line = pN2 (nitrogen)', text: 'Shows nitrogen pressure. This is what your body is absorbing and what causes deco obligations.', color: '#6366f1' },
      { subtitle: 'Red dashed line at 1.4', text: 'The oxygen toxicity limit. If your pO2 line crosses this, you\'re at risk of oxygen toxicity. Ascend immediately.', color: '#ef4444' },
      { subtitle: 'Gas switches', text: 'Vertical dashed lines show where you switched gas mix (e.g., from air to deco gas). The pO2 may jump at these points.' },
    ],
  },
};

// Contextual tooltip — small (?) icon that opens explanation
export function HelpTip({ termKey, size = 14 }) {
  const [open, setOpen] = useState(false);
  const entry = GLOSSARY[termKey];
  if (!entry) return null;

  return (
    <>
      <button onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        className="inline-flex items-center justify-center text-slate-300 hover:text-cyan-500 transition-colors ml-0.5 align-middle"
        title={`What is ${entry.term}?`} data-testid={`help-${termKey}`}>
        <HelpCircle size={size} />
      </button>
      {open && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setOpen(false)}>
          <div className="bg-white w-full sm:w-[420px] sm:max-h-[80vh] max-h-[70vh] rounded-t-2xl sm:rounded-2xl overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="h-1 bg-gradient-to-r from-cyan-400 to-blue-400" />
            <div className="p-5 overflow-y-auto max-h-[calc(70vh-40px)] sm:max-h-[calc(80vh-40px)]">
              <div className="flex items-start justify-between mb-3">
                <h3 className="text-base font-bold text-slate-800">{entry.term}</h3>
                <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
              </div>
              <div className="space-y-3">
                <div>
                  <p className="text-[10px] font-bold text-cyan-600 uppercase tracking-wider mb-1">What is it?</p>
                  <p className="text-sm text-slate-600 leading-relaxed">{entry.simple}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-amber-600 uppercase tracking-wider mb-1">Why does it matter?</p>
                  <p className="text-sm text-slate-600 leading-relaxed">{entry.why}</p>
                </div>
                <div className="bg-cyan-50 border border-cyan-100 rounded-xl p-3">
                  <p className="text-[10px] font-bold text-cyan-700 uppercase tracking-wider mb-1">Pro tip</p>
                  <p className="text-xs text-cyan-700 leading-relaxed">{entry.tip}</p>
                </div>
                {entry.color && (
                  <div className="bg-slate-50 border border-slate-100 rounded-xl p-3">
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Colour guide</p>
                    <p className="text-xs text-slate-600 leading-relaxed">{entry.color}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// Full chart reading guide — opened from profile viewer
export function ChartGuide({ chartKey, onClose }) {
  const guide = CHART_GUIDES[chartKey];
  if (!guide) return null;

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white w-full sm:w-[480px] sm:max-h-[80vh] max-h-[70vh] rounded-t-2xl sm:rounded-2xl overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="h-1 bg-gradient-to-r from-cyan-400 to-blue-400" />
        <div className="p-5 overflow-y-auto max-h-[calc(70vh-40px)] sm:max-h-[calc(80vh-40px)]">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-2">
              <BookOpen size={16} className="text-cyan-500" />
              <h3 className="text-base font-bold text-slate-800">{guide.title}</h3>
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
          </div>
          <div className="space-y-4">
            {guide.sections.map((s, i) => (
              <div key={`k${i}`} className="flex gap-3">
                {s.color && <div className="w-3 h-3 rounded-full flex-shrink-0 mt-1" style={{ background: s.color }} />}
                {!s.color && <div className="w-3 h-3 rounded-full flex-shrink-0 mt-1 bg-slate-200" />}
                <div>
                  <p className="text-sm font-semibold text-slate-700">{s.subtitle}</p>
                  <p className="text-xs text-slate-500 leading-relaxed mt-0.5">{s.text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// Export: list of all glossary terms for a dedicated learning page
export function DiveEducationPanel({ onClose }) {
  const [search, setSearch] = useState('');
  const entries = Object.entries(GLOSSARY).filter(([k, v]) =>
    !search || v.term.toLowerCase().includes(search.toLowerCase()) || v.simple.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-2 sm:p-4" onClick={onClose}>
      <div className="bg-white w-full max-w-2xl max-h-[85vh] rounded-2xl overflow-hidden shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="h-1 bg-gradient-to-r from-cyan-400 to-blue-400" />
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <h2 className="font-bold text-lg text-slate-800">Dive Terms Explained</h2>
            <p className="text-xs text-slate-400">Everything you need to know, in plain English</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
        </div>
        <div className="px-5 py-3 border-b border-slate-50">
          <input placeholder="Search terms..." value={search} onChange={e => setSearch(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-lg text-sm px-3 py-2 outline-none focus:border-cyan-400" />
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {entries.map(([key, entry]) => (
            <GlossaryCard key={key} entry={entry} />
          ))}
          {entries.length === 0 && <p className="text-center text-slate-400 text-sm py-8">No matching terms</p>}
        </div>
      </div>
    </div>
  );
}

function GlossaryCard({ entry }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="border border-slate-100 rounded-xl overflow-hidden hover:shadow-sm transition-shadow">
      <button onClick={() => setExpanded(!expanded)} className="w-full flex items-center justify-between p-3 text-left">
        <div>
          <p className="text-sm font-bold text-slate-800">{entry.term}</p>
          <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{entry.simple}</p>
        </div>
        <ChevronRight size={14} className={`text-slate-400 transition-transform ${expanded ? 'rotate-90' : ''}`} />
      </button>
      {expanded && (
        <div className="px-3 pb-3 space-y-2 border-t border-slate-50 pt-2">
          <div><p className="text-[9px] font-bold text-amber-600 uppercase">Why it matters</p><p className="text-xs text-slate-600 leading-relaxed">{entry.why}</p></div>
          <div className="bg-cyan-50 rounded-lg p-2"><p className="text-[9px] font-bold text-cyan-700 uppercase">Tip</p><p className="text-[11px] text-cyan-700">{entry.tip}</p></div>
          {entry.color && <div className="bg-slate-50 rounded-lg p-2"><p className="text-[9px] font-bold text-slate-500 uppercase">Colours</p><p className="text-[11px] text-slate-600">{entry.color}</p></div>}
        </div>
      )}
    </div>
  );
}

export { GLOSSARY, CHART_GUIDES };
