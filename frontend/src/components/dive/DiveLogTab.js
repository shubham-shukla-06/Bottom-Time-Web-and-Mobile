import { useState, useRef, useEffect, Suspense, lazy, useCallback, useMemo, memo } from 'react';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import {
  Search, Anchor, Download, Monitor, X, Upload, ChevronDown, Check,
  Waves, Clock, Thermometer, Eye, Users, Wind, Gauge, Star, Tag, MapPin,
  Activity, Share2, Trash2, Edit3, HelpCircle
} from 'lucide-react';
import { AreaChart, Area, YAxis, ResponsiveContainer } from 'recharts';
import axios from 'axios';
import { toast } from 'sonner';
import { HelpTip } from '../DiveEducation';
import { MiniStat, ContextHelp, TYPE_COLORS } from './SharedComponents';

const EnhancedProfileViewer = lazy(() => import('../EnhancedProfileViewer'));

function DiveLogTab({ logs, stats, refreshLogs, onShare, onEdit }) {
  const [search, setSearch] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [profileDive, setProfileDive] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [viewportWidth, setViewportWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1200);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const deleteLog = useCallback(async (id) => {
    if (!window.confirm('Delete this dive log?')) return;
    try {
      await axios.delete(`/dive-log/${id}`);
      toast.success('Deleted');
      refreshLogs(search);
    } catch (e) { toast.error('Failed'); }
  }, [refreshLogs, search]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const exportPDF = useCallback(async () => {
    setExporting(true);
    try {
      const res = await axios.get('/dive-log/export-pdf');
      const blob = new Blob([res.data.html], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const w = window.open(url, '_blank');
      if (w) w.print();
      toast.success(`Logbook exported (${res.data.dive_count} dives)`);
    } catch (e) { toast.error('Export failed'); }
    finally { setExporting(false); }
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const handleSearchChange = useCallback((event) => {
    setSearch(event.target.value);
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const openImport = useCallback(() => setShowImport(true), []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const closeImport = useCallback(() => setShowImport(false), []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const closeProfile = useCallback(() => setProfileDive(null), []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const handleImportDone = useCallback(() => {
    setShowImport(false);
    refreshLogs();
  }, [refreshLogs]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const handleResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const filteredLogs = useMemo(() => {
    if (!search) return logs;
    const term = search.toLowerCase();
    return logs.filter(l =>
      l.site_name?.toLowerCase().includes(term) ||
      l.location?.toLowerCase().includes(term) ||
      (l.tags || []).some(t => t.toLowerCase().includes(term))
    );
  }, [search, logs]);

  const columns = useMemo(() => (viewportWidth >= 1024 ? 2 : 1), [viewportWidth]);
  const rowCount = useMemo(() => Math.ceil(filteredLogs.length / columns), [filteredLogs.length, columns]);
  const rowVirtualizer = useWindowVirtualizer({
    count: rowCount,
    estimateSize: () => 340,
    overscan: 4,
  });

  const [showHelp, setShowHelp] = useState(true);

  return (
    <div className="space-y-5" data-testid="log-tab">
      <ContextHelp show={showHelp} onDismiss={() => setShowHelp(false)} onShow={() => setShowHelp(true)}
        title="Your dive logbook"
        text="Each card is one dive. The wavy chart at the top is your depth profile — it shows how deep you went, like a mountain turned upside down. Every number is labelled (Depth, Time, Temp, etc). Tap the (?) icons to learn what each means. Hit 'Dive Profile' to see a detailed interactive chart of your dive."
      />

      <div className="space-y-2.5">
        <div className="relative">
          <Search className="absolute left-3.5 top-3 text-slate-400" size={16} />
          <input placeholder="Search sites, locations, tags..." className="w-full h-10 bg-white border border-slate-200 rounded-xl text-sm pl-10 pr-4 outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-100 transition-colors"
            value={search} onChange={handleSearchChange} data-testid="dive-search" />
        </div>
        <div className="flex gap-2">
          <button onClick={exportPDF} disabled={exporting} className="h-9 px-3 border border-slate-200 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-50 flex items-center gap-1.5 transition-colors" data-testid="export-pdf-btn">
            <Download size={13} /> PDF
          </button>
          <button onClick={openImport} className="h-9 px-3 border border-slate-200 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-50 flex items-center gap-1.5 transition-colors" data-testid="import-computer-btn">
            <Monitor size={13} /> Import
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2.5 sm:gap-3">
        <MiniStat label="Total" value={stats.total || 0} />
        <MiniStat label="Depth" value={`${stats.max_depth || 0}m`} />
        <MiniStat label="Avg" value={`${stats.avg_depth || 0}m`} />
        <MiniStat label="Bottom Time" value={(() => { const t = stats.total_time || 0; return t >= 60 ? `${Math.floor(t/60)}h ${t%60}m` : `${t}min`; })()} />
        <MiniStat label="Sites" value={stats.unique_sites || 0} />
      </div>

      {filteredLogs.length > 0 ? (
        <div className="mt-5" style={{ height: rowVirtualizer.getTotalSize(), position: 'relative' }}>
          {rowVirtualizer.getVirtualItems().map(virtualRow => {
            const startIndex = virtualRow.index * columns;
            const rowItems = filteredLogs.slice(startIndex, startIndex + columns);
            return (
              <div
                key={virtualRow.index}
                data-index={virtualRow.index}
                ref={rowVirtualizer.measureElement}
                className={`grid gap-3 ${columns === 2 ? 'lg:grid-cols-2' : 'grid-cols-1'} pb-3`}
                style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${virtualRow.start}px)` }}
              >
                {rowItems.map(log => (
                  <LogCard key={log.id} log={log} onDelete={deleteLog}
                    onViewProfile={setProfileDive}
                    onShare={onShare}
                    onEdit={onEdit} />
                ))}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-16 bg-white rounded-2xl border border-slate-100">
          <Anchor className="text-slate-200 mx-auto mb-3" size={40} />
          <p className="font-bold text-slate-700 mb-1">{search ? 'No matches' : 'No dives logged'}</p>
          <p className="text-sm text-slate-400">{search ? 'Try different search' : 'Import from your dive computer or log manually'}</p>
        </div>
      )}

      {showImport && <ImportModal onClose={closeImport} onDone={handleImportDone} />}
      {profileDive && (
        <Suspense fallback={null}>
          <EnhancedProfileViewer dive={profileDive} onClose={closeProfile} />
        </Suspense>
      )}
    </div>
  );
}

export default memo(DiveLogTab);

const LogCard = memo(function LogCard({ log, onDelete, onViewProfile, onShare, onEdit }) {
  const hasProfile = log.profile?.length > 2;
  const profileData = useMemo(() => {
    if (!hasProfile) return [];
    const step = Math.max(1, Math.floor(log.profile.length / 60));
    return log.profile.filter((_, i) => i % step === 0);
  }, [hasProfile, log.profile]);

  return (
    <div className={`bg-white rounded-2xl border overflow-hidden hover:shadow-md transition-all border-slate-100`} data-testid="dive-log-entry">
      {hasProfile && (
        <div className="px-4 pt-3 cursor-pointer" onClick={() => onViewProfile(log)} title="Tap for full dive profile analysis">
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1">
            <Waves size={9} className="text-cyan-500" /> Depth Profile <span className="font-normal normal-case text-slate-300">— how deep you went over time</span>
          </p>
          <div className="h-14">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={profileData}>
                <defs><linearGradient id={`lp-${log.id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#0891b2" stopOpacity={0.15} /><stop offset="95%" stopColor="#0891b2" stopOpacity={0.02} /></linearGradient></defs>
                <YAxis reversed hide domain={['dataMin', 'dataMax']} />
                <Area type="monotone" dataKey="depth" stroke="#0891b2" strokeWidth={1.5} fill={`url(#lp-${log.id})`} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
      <div className="px-4 pb-3 pt-2">
        <div className="flex items-start justify-between mb-1">
          <div className="flex items-start gap-2 flex-1 min-w-0">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <h3 className="font-bold text-sm text-slate-800">{log.site_name || 'Unknown'}</h3>
                {log.dive_type && <span className="px-2 py-0.5 rounded-full text-[9px] font-bold capitalize" style={{ background: (TYPE_COLORS[log.dive_type] || '#94a3b8') + '15', color: TYPE_COLORS[log.dive_type] || '#64748b' }}>{log.dive_type}</span>}
                {log.source && log.source !== 'manual' && <span className="px-1.5 py-0.5 bg-cyan-50 text-cyan-600 rounded text-[8px] font-bold">{log.source}</span>}
                {(log.tags || []).slice(0, 3).map(tag => (
                  <span key={tag} className="px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded text-[8px] font-semibold flex items-center gap-0.5"><Tag size={7} />{tag}</span>
                ))}
              </div>
              <p className="text-[10px] text-slate-400 flex items-center gap-1"><MapPin size={9} /> {log.location} <span className="ml-1">{log.date?.slice(0, 10)}</span></p>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-600 mt-1">
          {log.max_depth > 0 && (
            <span className="flex items-center gap-1" title="Deepest point reached during this dive">
              <Waves size={11} className="text-blue-500" /> <span className="text-slate-400">Depth</span> <span className="font-semibold">{log.max_depth}m</span>
              <HelpTip termKey="depth" size={10} />
            </span>
          )}
          {log.duration > 0 && (
            <span className="flex items-center gap-1" title="Total time spent underwater">
              <Clock size={11} className="text-violet-500" /> <span className="text-slate-400">Time</span> <span className="font-semibold">{log.duration}min</span>
              <HelpTip termKey="duration" size={10} />
            </span>
          )}
          {log.water_temp != null && (
            <span className="flex items-center gap-1" title="Water temperature">
              <Thermometer size={11} className="text-amber-500" /> <span className="text-slate-400">Temp</span> <span className="font-semibold">{log.water_temp}°C</span>
            </span>
          )}
          {log.visibility && (
            <span className="flex items-center gap-1" title="How far you could see underwater">
              <Eye size={11} className="text-cyan-500" /> <span className="text-slate-400">Vis</span> <span className="font-semibold">{log.visibility}</span>
            </span>
          )}
          {log.buddy && (
            <span className="flex items-center gap-1 text-slate-400" title="Who you dived with">
              <Users size={11} /> {log.buddy}
            </span>
          )}
          {log.gas_mix && log.gas_mix !== 'Air' && (
            <span className="flex items-center gap-1" title="Breathing gas used">
              <Wind size={11} className="text-cyan-600" /> <span className="font-semibold text-cyan-600">{log.gas_mix}</span>
              <HelpTip termKey="nitrox" size={10} />
            </span>
          )}
          {log.sac_rate > 0 && (
            <span className="flex items-center gap-1" title="How efficiently you used your air">
              <Gauge size={11} className="text-emerald-500" /> <span className="text-slate-400">SAC</span> <span className="font-semibold">{log.sac_rate}L/min</span>
              <HelpTip termKey="sac" size={10} />
            </span>
          )}
        </div>
        {log.rating > 0 && <div className="flex gap-0.5 mt-1">{[1,2,3,4,5].map(s => <Star key={s} size={11} className={s <= log.rating ? 'text-amber-400 fill-amber-400' : 'text-slate-200'} />)}</div>}
        <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-slate-50">
          {hasProfile && (
            <button onClick={() => onViewProfile(log)} className="px-2.5 py-1 rounded-lg bg-cyan-50 text-cyan-600 hover:bg-cyan-100 text-[10px] font-semibold flex items-center gap-1" data-testid="view-profile-btn">
              <Activity size={10} /> Dive Profile
            </button>
          )}
          <button onClick={() => onShare(log)} className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-500 hover:bg-slate-200 text-[10px] font-semibold flex items-center gap-1" data-testid="share-dive-btn">
            <Share2 size={10} /> Share
          </button>
          <button onClick={() => onEdit(log)} className="px-2.5 py-1 rounded-lg bg-cyan-50 text-cyan-600 hover:bg-cyan-100 text-[10px] font-semibold flex items-center gap-1" data-testid="edit-dive-btn">
            <Edit3 size={10} /> Edit
          </button>
          <button onClick={() => onDelete(log.id)} className="px-2.5 py-1 rounded-lg bg-red-50 text-red-500 hover:bg-red-100 text-[10px] font-semibold flex items-center gap-1 ml-auto" data-testid="delete-btn">
            <Trash2 size={10} /> Delete
          </button>
        </div>
      </div>
    </div>
  );
});

function ImportModal({ onClose, onDone }) {
  const [brands, setBrands] = useState([]);
  const [parsed, setParsed] = useState(null);
  const [srcFile, setSrcFile] = useState('');
  const [uploading, setUploading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const ref = useRef(null);

  useEffect(() => { axios.get('/dive-import/supported-brands').then(r => setBrands(r.data.brands || [])).catch(() => {}); }, []);

  const upload = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    setUploading(true);
    try { const fd = new FormData(); fd.append('file', file); const r = await axios.post('/dive-import/parse', fd); setParsed(r.data.dives); setSrcFile(file.name); toast.success(`Found ${r.data.count} dive(s)`); }
    catch (err) { toast.error(err.response?.data?.detail || 'Parse failed'); }
    finally { setUploading(false); e.target.value = ''; }
  };

  const doImport = async () => {
    if (!parsed?.length) return; setImporting(true);
    try { await axios.post('/dive-import/import', { dives: parsed, source_file: srcFile }); toast.success('Imported!'); onDone(); }
    catch (err) { toast.error('Import failed'); } finally { setImporting(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div><h2 className="font-bold">Import from Dive Computer</h2><p className="text-[10px] text-slate-400">FIT, UDDF, or Subsurface XML</p></div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400"><X size={16} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div onClick={() => ref.current?.click()} className="border-2 border-dashed border-slate-200 rounded-xl p-6 text-center cursor-pointer hover:border-cyan-300 transition-all">
            <Upload size={28} className="text-slate-300 mx-auto mb-2" />
            <p className="text-sm font-semibold text-slate-600">{uploading ? 'Parsing...' : 'Click to upload'}</p>
            <p className="text-[10px] text-slate-400">.fit .uddf .xml</p>
            <input ref={ref} type="file" accept=".fit,.uddf,.xml" className="hidden" onChange={upload} />
          </div>
          {parsed && (
            <div className="space-y-2">
              <p className="text-sm font-bold text-slate-700 flex items-center gap-1.5"><Check size={14} className="text-emerald-500" /> {parsed.length} dive(s) from {srcFile}</p>
              {parsed.map((d, i) => (
                <div key={`k${i}`} className="flex items-center justify-between bg-slate-50 rounded-lg p-2.5 text-xs">
                  <span className="font-medium text-slate-700">{d.date ? new Date(d.date).toLocaleDateString() : 'No date'}</span>
                  <div className="flex gap-3 text-slate-500"><span>{d.max_depth}m</span><span>{d.duration_minutes}min</span></div>
                </div>
              ))}
            </div>
          )}
          {!parsed && brands.length > 0 && (
            <div>
              <p className="text-xs font-bold text-slate-500 mb-2">Supported Computers</p>
              {brands.slice(0, 8).map(b => (
                <button key={b.brand} onClick={() => setExpanded(expanded === b.brand ? null : b.brand)} className="w-full flex items-center justify-between px-3 py-2 border-b border-slate-50 hover:bg-slate-50 text-left">
                  <span className="text-xs font-semibold text-slate-600">{b.brand} <span className="text-slate-400 font-normal">({b.formats.join(', ')})</span></span>
                  <ChevronDown size={12} className={`text-slate-400 ${expanded === b.brand ? 'rotate-180' : ''}`} />
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex justify-between px-5 py-3 border-t border-slate-100">
          <button onClick={onClose} className="text-sm text-slate-500 font-semibold">Cancel</button>
          {parsed && <button onClick={doImport} disabled={importing} className="btn-primary text-sm px-5 py-2">
            {importing ? 'Importing...' : `Import ${parsed.length} Dive${parsed.length !== 1 ? 's' : ''}`}
          </button>}
        </div>
      </div>
    </div>
  );
}
