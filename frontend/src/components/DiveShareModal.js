import { Share2, Copy, X, Check, Waves, Image, Droplets, Clock, Thermometer, ArrowDown, Wind, MapPin, Calendar, Gauge, Users, Eye, Anchor } from 'lucide-react';
import { AreaChart, Area, YAxis, ResponsiveContainer } from 'recharts';
import { useDiveShare } from '../hooks/useDiveShare';

function StatBox({ icon: Icon, label, value, unit, theme }) {
  return (
    <div style={{ textAlign: 'left' }}>
      <div className={theme.accent} style={{ display: 'flex', alignItems: 'center', gap: '2px', marginBottom: '4px' }}>
        <Icon size={8} />
        <span style={{ fontSize: '6px', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>{label}</span>
      </div>
      <p className={theme.text} style={{ fontSize: '18px', fontWeight: 900, lineHeight: 1 }}>{value}<span className={theme.sub} style={{ fontSize: '9px', fontWeight: 600, marginLeft: '2px' }}>{unit}</span></p>
    </div>
  );
}

function DetailPills({ parsed, theme }) {
  const { gasStr, vis, buddy, current } = parsed;
  if (!gasStr && !vis && !buddy && !current) return null;
  const pillStyle = { fontSize: '7px', padding: '2px 7px', borderRadius: '999px', fontWeight: 700 };
  return (
    <div className="flex flex-wrap" style={{ gap: '4px', marginBottom: '8px' }}>
      {gasStr && gasStr !== 'Air' && <span className={`flex items-center gap-1 ${theme.pill} ${theme.sub}`} style={pillStyle}><Droplets size={7} /> {gasStr}</span>}
      {gasStr === 'Air' && <span className={`flex items-center gap-1 ${theme.pill} ${theme.sub}`} style={pillStyle}><Wind size={7} /> Air</span>}
      {vis > 0 && <span className={`flex items-center gap-1 ${theme.pill} ${theme.sub}`} style={pillStyle}><Eye size={7} /> {vis}m vis</span>}
      {current && <span className={`capitalize ${theme.pill} ${theme.sub}`} style={pillStyle}>{current} current</span>}
      {buddy && <span className={`flex items-center gap-1 ${theme.pill} ${theme.sub}`} style={pillStyle}><Users size={7} /> {buddy}</span>}
    </div>
  );
}

function DiveCardPreview({ overlayRef, theme, parsed }) {
  const hasProfile = parsed.profile.length > 2;
  return (
    <div ref={overlayRef} className="rounded-2xl" style={{ padding: '16px', maxWidth: '320px', width: '100%', background: theme.bgStyle, border: `1px solid ${theme.borderColor}` }} data-testid="share-overlay-card">
      {hasProfile && (
        <div style={{ height: '48px', marginBottom: '10px', opacity: 0.7, pointerEvents: 'none' }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={parsed.profile.filter((_, i) => i % Math.max(1, Math.floor(parsed.profile.length / 40)) === 0)}>
              <defs>
                <linearGradient id={`sg-${theme.id}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={theme.profileStroke} stopOpacity={0.4} />
                  <stop offset="95%" stopColor={theme.profileStroke} stopOpacity={0} />
                </linearGradient>
              </defs>
              <YAxis reversed hide domain={['dataMin', 'dataMax']} />
              <Area type="monotone" dataKey={parsed.profile[0]?.d !== undefined ? 'd' : 'depth'} stroke={theme.profileStroke} strokeWidth={2} fill={`url(#sg-${theme.id})`} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      <div style={{ marginBottom: '16px' }}>
        <h4 className={theme.text} style={{ fontSize: '16px', fontWeight: 900, lineHeight: 1.2 }}>{parsed.siteName}</h4>
        <div className={`flex items-center gap-2 ${theme.sub}`} style={{ marginTop: '4px' }}>
          {parsed.location && <><MapPin size={10} /><span style={{ fontSize: '10px', fontWeight: 500 }}>{parsed.location}</span></>}
          <Calendar size={10} />
          <span style={{ fontSize: '10px', fontWeight: 500 }}>{parsed.date}</span>
          {parsed.diveType && <span className={`capitalize ${theme.pill}`} style={{ fontSize: '9px', padding: '1px 6px', borderRadius: '999px', fontWeight: 700 }}>{parsed.diveType}</span>}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: parsed.avgDepth ? 'repeat(4, 1fr)' : 'repeat(3, 1fr)', gap: '8px', marginBottom: '10px' }}>
        <StatBox icon={ArrowDown} label="Max Depth" value={parsed.depth} unit="m" theme={theme} />
        {parsed.avgDepth > 0 && <StatBox icon={Gauge} label="Avg Depth" value={parsed.avgDepth} unit="m" theme={theme} />}
        <StatBox icon={Clock} label="Bottom Time" value={parsed.duration} unit="min" theme={theme} />
        <StatBox icon={Thermometer} label="Water Temp" value={parsed.temp || '—'} unit={parsed.temp ? '°C' : ''} theme={theme} />
      </div>

      <DetailPills parsed={parsed} theme={theme} />

      {parsed.species.length > 0 && (
        <div className={`flex items-center gap-1.5 ${theme.sub}`} style={{ marginBottom: '8px' }}>
          <Anchor size={7} />
          <span style={{ fontSize: '7px', fontWeight: 700 }}>{parsed.species.slice(0, 4).join(' / ')}{parsed.species.length > 4 ? ` +${parsed.species.length - 4}` : ''}</span>
        </div>
      )}

      <div className="flex items-center" style={{ paddingTop: '10px', borderTopWidth: '1px', borderTopStyle: 'solid', borderTopColor: theme.borderColor }}>
        <Waves size={14} className={theme.accent} />
        <span style={{ fontSize: '12px', fontWeight: 900, letterSpacing: '-0.02em', marginLeft: '4px', color: theme.id === 'light' ? '#0f172a' : '#ffffff' }}>Bottom Time</span>
        <span className={theme.sub} style={{ fontSize: '6px', fontWeight: 600, verticalAlign: 'super', marginLeft: '1px', marginTop: '-4px' }}>TM</span>
        {parsed.diverName && <span className={theme.sub} style={{ fontSize: '8px', marginLeft: 'auto' }}>{parsed.diverName}</span>}
      </div>
    </div>
  );
}

export default function DiveShareModal({ dive, onClose }) {
  const { loading, copied, exporting, theme, setTheme, overlayRef, parsed, THEMES, downloadPNG, shareNative, copyText } = useDiveShare(dive);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white w-full sm:w-[420px] max-h-[90vh] rounded-t-2xl sm:rounded-2xl overflow-hidden shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
          <h3 className="font-bold text-sm text-slate-800 flex items-center gap-2"><Share2 size={14} className="text-cyan-500" /> Share Dive</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={16} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Style</span>
            {THEMES.map(t => (
              <button key={t.id} onClick={() => setTheme(t)}
                className={`px-3 py-1 rounded-full text-[10px] font-semibold transition-all ${theme.id === t.id ? 'bg-cyan-50 text-cyan-600 border border-cyan-200' : 'bg-slate-50 text-slate-500 border border-slate-200 hover:bg-slate-100'}`}
              >{t.label}</button>
            ))}
          </div>

          <div className="relative rounded-2xl overflow-hidden flex justify-center" style={theme.transparent ? { background: 'repeating-conic-gradient(#e2e8f0 0% 25%, #fff 0% 50%) 50% / 16px 16px' } : {}}>
            <DiveCardPreview overlayRef={overlayRef} theme={theme} parsed={parsed} />
          </div>

          <p className="text-[10px] text-slate-400 text-center">
            {theme.transparent ? 'Checkerboard = transparent. Overlay on your photos or stories.' : 'Export and share directly on your stories.'}
          </p>

          <button onClick={downloadPNG} disabled={exporting === 'png'}
            className="w-full flex items-center justify-center gap-2 p-3.5 bg-cyan-500 hover:bg-cyan-600 text-white rounded-xl font-bold text-sm transition-colors disabled:opacity-50" data-testid="download-png-btn">
            <Image size={16} />
            {exporting === 'png' ? 'Exporting...' : theme.transparent ? 'Download PNG Overlay' : 'Save Image'}
          </button>

          <div className="grid grid-cols-2 gap-2">
            <button onClick={shareNative} className="flex items-center gap-2 p-3 bg-slate-50 border border-slate-200 rounded-xl hover:bg-slate-100 transition-colors" data-testid="share-native-btn">
              <Share2 size={14} className="text-cyan-600" />
              <div className="text-left"><p className="text-xs font-bold text-slate-700">Share</p><p className="text-[9px] text-slate-400">Instagram, WhatsApp</p></div>
            </button>
            <button onClick={copyText}
              className="flex items-center gap-2 p-3 bg-slate-50 border border-slate-200 rounded-xl hover:bg-slate-100 transition-colors" data-testid="copy-text-btn">
              {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} className="text-slate-500" />}
              <div className="text-left"><p className="text-xs font-bold text-slate-700">{copied ? 'Copied!' : 'Copy text'}</p><p className="text-[9px] text-slate-400">Paste anywhere</p></div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
