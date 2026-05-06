import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { X, Fish, Plus, Search, Loader2 } from 'lucide-react';
import axios from 'axios';
import { toast } from 'sonner';

const API = process.env.REACT_APP_BACKEND_URL;

const DEFAULT_FORM = {
  site_name: '',
  location: '',
  date: new Date().toISOString().split('T')[0],
  max_depth: '',
  duration: '',
  water_temp: '',
  visibility: '',
  dive_type: 'recreational',
  buddy: '',
  notes: '',
  rating: 0,
};

export default function LogDiveModal({ onClose, onLogged, dive }) {
  const isEdit = !!dive;
  const [form, setForm] = useState(dive ? {
    site_name: dive.site_name || '',
    location: dive.location || '',
    date: dive.date?.slice(0, 10) || new Date().toISOString().split('T')[0],
    max_depth: dive.max_depth?.toString() || '',
    duration: dive.duration?.toString() || '',
    water_temp: dive.water_temp?.toString() || '',
    visibility: dive.visibility || '',
    dive_type: dive.dive_type || 'recreational',
    buddy: dive.buddy || '',
    notes: dive.notes || '',
    rating: dive.rating || 0,
    sightings: dive.sightings || [],
  } : { ...DEFAULT_FORM, sightings: [] });
  const [saving, setSaving] = useState(false);
  const [speciesResults, setSpeciesResults] = useState([]);
  const [speciesSearch, setSpeciesSearch] = useState('');
  const [speciesLoading, setSpeciesLoading] = useState(false);
  const [showSpeciesPicker, setShowSpeciesPicker] = useState(false);
  const searchTimer = useRef(null);

  const filteredSpecies = useMemo(() =>
    speciesResults.filter(sp => !form.sightings?.some(s => s.species === sp.name)).slice(0, 12),
    [speciesResults, form.sightings]
  );

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const searchSpecies = useCallback((q) => {
    if (q.length < 2) { setSpeciesResults([]); return; }
    setSpeciesLoading(true);
    axios.get(`${API}/api/marine-life/autocomplete`, { params: { q } })
      .then(r => setSpeciesResults(r.data.results || []))
      .catch(() => {})
      .finally(() => setSpeciesLoading(false));
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const set = useCallback((key, value) => {
    setForm(prev => ({ ...prev, [key]: value }));
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const submit = useCallback(async () => {
    if (!form.site_name) {
      toast.error('Site name required');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        max_depth: form.max_depth ? parseFloat(form.max_depth) : null,
        duration: form.duration ? parseInt(form.duration) : null,
        water_temp: form.water_temp ? parseFloat(form.water_temp) : null,
      };
      if (isEdit) {
        await axios.put(`/dive-log/${dive.id}`, payload);
        toast.success('Dive updated!');
      } else {
        await axios.post('/dive-log', payload);
        toast.success('Dive logged!');
      }
      onLogged();
    } catch (e) {
      toast.error(isEdit ? 'Failed to update dive' : 'Failed to log dive');
    } finally {
      setSaving(false);
    }
  }, [form, onLogged, isEdit, dive]);

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()} data-testid="log-dive-modal">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 sticky top-0 bg-white z-10">
          <h2 className="font-bold text-lg">{isEdit ? 'Edit Dive' : 'Log a Dive'}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400" data-testid="log-dive-modal-close-btn"><X size={16} /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Dive Site *</label>
            <input className="w-full h-10 bg-white border border-slate-200 rounded-xl text-sm px-3 outline-none focus:border-cyan-400" placeholder="e.g., Blue Hole, Belize" value={form.site_name} onChange={e => set('site_name', e.target.value)} data-testid="log-site" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Location</label>
              <input className="w-full h-10 bg-white border border-slate-200 rounded-xl text-sm px-3 outline-none focus:border-cyan-400" placeholder="Belize" value={form.location} onChange={e => set('location', e.target.value)} data-testid="log-location" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Date</label>
              <input type="date" className="w-full h-10 bg-white border border-slate-200 rounded-xl text-sm px-3 outline-none focus:border-cyan-400" value={form.date} onChange={e => set('date', e.target.value)} data-testid="log-date" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Depth (m)</label>
              <input type="number" className="w-full h-10 bg-white border border-slate-200 rounded-xl text-sm px-3 outline-none focus:border-cyan-400" placeholder="18" value={form.max_depth} onChange={e => set('max_depth', e.target.value)} data-testid="log-depth" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Time (min)</label>
              <input type="number" className="w-full h-10 bg-white border border-slate-200 rounded-xl text-sm px-3 outline-none focus:border-cyan-400" placeholder="45" value={form.duration} onChange={e => set('duration', e.target.value)} data-testid="log-duration" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Temp (°C)</label>
              <input type="number" className="w-full h-10 bg-white border border-slate-200 rounded-xl text-sm px-3 outline-none focus:border-cyan-400" placeholder="28" value={form.water_temp} onChange={e => set('water_temp', e.target.value)} data-testid="log-temp" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Dive Type</label>
            <select className="w-full h-10 bg-white border border-slate-200 rounded-xl text-sm px-3 outline-none focus:border-cyan-400" value={form.dive_type} onChange={e => set('dive_type', e.target.value)} data-testid="log-type">
              {['recreational', 'reef', 'wreck', 'night', 'cave', 'drift', 'deep', 'shore', 'boat'].map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Buddy</label>
            <input className="w-full h-10 bg-white border border-slate-200 rounded-xl text-sm px-3 outline-none focus:border-cyan-400" placeholder="Who did you dive with?" value={form.buddy} onChange={e => set('buddy', e.target.value)} data-testid="log-buddy" />
          </div>

          {/* Species Tagging */}
          <div data-testid="species-tagging-section">
            <label className="block text-xs font-semibold text-slate-500 mb-1.5 flex items-center gap-1">
              <Fish size={12} className="text-cyan-500" /> What did you see?
            </label>
            {form.sightings?.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {form.sightings.map((s, i) => (
                  <span key={`k${i}`} className="inline-flex items-center gap-1 px-2.5 py-1 bg-cyan-50 text-cyan-600 rounded-full text-xs font-semibold">
                    {s.species}
                    <button onClick={() => setForm(prev => ({ ...prev, sightings: prev.sightings.filter((_, idx) => idx !== i) }))} className="ml-0.5 hover:text-red-500 transition-colors" data-testid="remove-species-tag">
                      <X size={10} />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <button onClick={() => setShowSpeciesPicker(!showSpeciesPicker)} className="h-8 px-3 border border-dashed border-slate-200 rounded-lg text-xs text-slate-400 hover:border-cyan-300 hover:text-cyan-500 flex items-center gap-1 transition-colors" data-testid="add-species-btn">
              <Plus size={12} /> Tap to tag species
            </button>
            {showSpeciesPicker && (
              <div className="mt-2 border border-slate-200 rounded-xl bg-white p-2.5 max-h-56 overflow-y-auto">
                <div className="relative mb-2">
                  <Search className="absolute left-2.5 top-2 text-slate-300" size={12} />
                  <input className="w-full h-8 text-xs pl-8 pr-2 bg-slate-50 rounded-lg outline-none border-0" placeholder="Search iNaturalist species..." value={speciesSearch} onChange={e => { setSpeciesSearch(e.target.value); clearTimeout(searchTimer.current); searchTimer.current = setTimeout(() => searchSpecies(e.target.value), 350); }} autoFocus data-testid="species-search-input" />
                  {speciesLoading && <Loader2 className="absolute right-2.5 top-2 animate-spin text-cyan-400" size={12} />}
                </div>
                {speciesSearch.length < 2 ? (
                  <p className="text-[10px] text-slate-400 text-center py-3">Type at least 2 characters to search...</p>
                ) : (
                <div className="grid grid-cols-3 gap-1.5">
                  {filteredSpecies
                    .map(sp => (
                      <button key={sp.taxon_id} onClick={() => { setForm(prev => ({ ...prev, sightings: [...(prev.sightings || []), { species: sp.name, taxon_id: sp.taxon_id, scientific_name: sp.scientific_name }] })); setSpeciesSearch(''); setSpeciesResults([]); }}
                        className="flex flex-col items-center p-1.5 rounded-lg hover:bg-cyan-50 transition-colors text-center" data-testid="species-option">
                        <div className="w-10 h-10 rounded-lg bg-slate-100 overflow-hidden flex items-center justify-center mb-0.5">
                          {sp.photo_square ? <img src={sp.photo_square} alt={sp.name} className="w-full h-full object-cover" /> : <Fish size={14} className="text-cyan-400" />}
                        </div>
                        <span className="text-[9px] font-medium text-slate-600 leading-tight line-clamp-2">{sp.name}</span>
                      </button>
                    ))}
                </div>
                )}
              </div>
            )}
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Notes</label>
            <textarea className="w-full bg-white border border-slate-200 rounded-xl text-sm px-3 py-2 outline-none focus:border-cyan-400 h-16 resize-none" placeholder="How was the dive?" value={form.notes} onChange={e => set('notes', e.target.value)} data-testid="log-notes" />
          </div>
        </div>
        <div className="flex gap-3 px-5 py-4 border-t border-slate-100 sticky bottom-0 bg-white">
          <button onClick={onClose} className="flex-1 h-10 border border-slate-200 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-50" data-testid="log-dive-modal-cancel-btn">Cancel</button>
          <button onClick={submit} disabled={saving} className="flex-1 h-10 bg-cyan-400 hover:bg-cyan-500 text-white rounded-xl text-sm font-bold disabled:opacity-50" data-testid="submit-log-btn">
            {saving ? 'Saving...' : isEdit ? 'Update Dive' : 'Log Dive'}
          </button>
        </div>
      </div>
    </div>
  );
}