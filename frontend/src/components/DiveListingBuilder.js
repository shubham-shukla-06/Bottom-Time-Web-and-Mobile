import { useState, useRef, useCallback, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { X, Send, Loader2, Check } from 'lucide-react';
import { GEAR_ITEMS, SECTION_CONFIG } from './listing-builder/constants';
import { BasicSection, MediaSection, DiveSection, GearSection, DatesSection, AccommodationSection, InclusionsSection, PricingSection, PoliciesSection, DirectionsSection, MedicalSection } from './listing-builder/Sections';

const AUTOSAVE_DEBOUNCE_MS = 1200;

export default function DiveListingBuilder({ listing, onClose, onSaved }) {
  const isEdit = !!listing;
  const fileInputRef = useRef(null);
  const videoInputRef = useRef(null);
  const [activeSection, setActiveSection] = useState('basic');
  const [publishing, setPublishing] = useState(false);
  const [uploading, setUploading] = useState(false);
  // Authoritative server-side version of the listing — bumps `updated_at` on
  // every persisted change so SocialPreview cache-busts correctly.
  const [persistedListing, setPersistedListing] = useState(listing || null);
  // Auto-save status: 'idle' | 'saving' | 'saved' | 'error'
  const [status, setStatus] = useState({ state: persistedListing ? 'saved' : 'idle', at: persistedListing ? Date.now() : null });
  const dirtyRef = useRef(false);
  const debounceRef = useRef(null);
  const inflightRef = useRef(false);
  const persistedRef = useRef(persistedListing);
  useEffect(() => { persistedRef.current = persistedListing; }, [persistedListing]);

  const [form, setForm] = useState({
    title: '', description: '', listing_type: 'day_dive',
    location: '', country: '',
    photos: [], videos: [],
    dive_sites: [{ name: '', description: '', max_depth: 0, difficulty: 'beginner' }],
    num_dives: 1, nitrox_available: false, nitrox_price: 0,
    max_depth: 30, difficulty_level: 'beginner', certification_required: 'Open Water',
    gear_rental: { included: false, price: 0, items: GEAR_ITEMS.map(g => ({ name: g, price: 0, included: false })) },
    arrival_date: '', departure_date: '', duration_days: 1,
    schedule_type: 'on_demand', max_slots: 20, max_per_booking: 6,
    accommodation: { included: false, rooms: [] },
    inclusions: [''], exclusions: [''],
    price: 0, currency: 'USD',
    cancellation_policy: '', refund_policy: '', terms_conditions: '', legal_disclaimer: '',
    tcs_compliance: { applicable: false, rate: 5.0, disclaimer: 'TCS of 5% is applicable on overseas tour packages for Indian residents as per Section 206C(1G) of the Income Tax Act.' },
    directions: { text: '', nearest_airport: '', transfers_available: false, transfer_price: 0 },
    medical_waiver_required: true,
    ...(listing || {}),
  });

  const set = (path, value) => {
    setForm(prev => {
      const copy = { ...prev };
      const keys = path.split('.');
      let obj = copy;
      for (let i = 0; i < keys.length - 1; i++) { obj[keys[i]] = { ...obj[keys[i]] }; obj = obj[keys[i]]; }
      obj[keys[keys.length - 1]] = value;
      return copy;
    });
    scheduleAutoSave();
  };

  // ─── Persist engine ──────────────────────────────────────────────
  // Normalizes the form into a payload, then POST creates or PUT updates.
  // Used by both the debounced auto-save effect and the explicit Publish action.
  const buildPayload = useCallback((source) => {
    const f = source;
    return {
      ...f,
      price: parseFloat(f.price) || 0,
      num_dives: parseInt(f.num_dives) || 1,
      max_depth: parseFloat(f.max_depth) || 0,
      duration_days: parseInt(f.duration_days) || 1,
      max_slots: parseInt(f.max_slots) || 20,
      max_per_booking: parseInt(f.max_per_booking) || 6,
      inclusions: (f.inclusions || []).filter(Boolean),
      exclusions: (f.exclusions || []).filter(Boolean),
    };
  }, []);

  const persist = useCallback(async (formSnapshot) => {
    // Guard: skip if a save is already in flight (debounce will retry)
    if (inflightRef.current) return null;
    // Don't autosave empty drafts — wait for at least a title
    if (!persistedRef.current?.id && !(formSnapshot.title || '').trim()) return null;
    inflightRef.current = true;
    setStatus({ state: 'saving', at: null });
    try {
      const payload = buildPayload(formSnapshot);
      const id = persistedRef.current?.id;
      const res = id
        ? await axios.put(`/operator-listings/listings/${id}`, payload)
        : await axios.post('/operator-listings/listings', payload);
      setPersistedListing(res.data);
      setStatus({ state: 'saved', at: Date.now() });
      dirtyRef.current = false;
      return res.data;
    } catch (err) {
      setStatus({ state: 'error', at: Date.now() });
      toast.error(err.response?.data?.detail || 'Auto-save failed');
      return null;
    } finally {
      inflightRef.current = false;
    }
  }, [buildPayload]);

  // Patch just the media fields (used right after upload/delete/reorder).
  const autoSaveMedia = useCallback(async (next) => {
    if (!persistedRef.current?.id) {
      // No listing yet — fall back to a full persist so we get an id.
      await persist(next);
      return;
    }
    setStatus({ state: 'saving', at: null });
    try {
      const res = await axios.put(`/operator-listings/listings/${persistedRef.current.id}`, {
        photos: next.photos, videos: next.videos,
      });
      setPersistedListing(res.data);
      setStatus({ state: 'saved', at: Date.now() });
    } catch (err) {
      setStatus({ state: 'error', at: Date.now() });
      toast.error('Auto-save failed — your changes are unsaved');
    }
  }, [persist]);

  // Mark form as dirty whenever a non-media field changes — schedules a
  // debounced auto-save. Called by the wrapped `set` below.
  const scheduleAutoSave = useCallback(() => {
    dirtyRef.current = true;
    setStatus(s => (s.state === 'saved' || s.state === 'idle') ? { state: 'pending', at: null } : s);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      // Read latest form via a fresh setForm callback (avoids stale closure)
      setForm(prev => { persist(prev); return prev; });
    }, AUTOSAVE_DEBOUNCE_MS);
  }, [persist]);

  // Cleanup pending timeouts on unmount
  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current); }, []);

  const handleFileUpload = async (e, type) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    setUploading(true);
    try {
      let latest;
      for (const file of files) {
        const fd = new FormData(); fd.append('file', file);
        const res = await axios.post('/operator-listings/upload', fd);
        // Functional setState avoids stale-closure clobber on multi-upload.
        setForm(prev => {
          const next = type === 'photo'
            ? { ...prev, photos: [...prev.photos, { url: res.data.url, caption: file.name, order: prev.photos.length }] }
            : { ...prev, videos: [...prev.videos, { url: res.data.url, caption: file.name }] };
          latest = next;
          return next;
        });
      }
      toast.success(`${files.length} file(s) uploaded`);
      if (latest) await autoSaveMedia(latest);
    } catch (err) { toast.error('Upload failed'); }
    finally { setUploading(false); e.target.value = ''; }
  };

  const removePhoto = (idx) => setForm(prev => {
    const next = { ...prev, photos: prev.photos.filter((_, i) => i !== idx).map((p, i) => ({ ...p, order: i })) };
    autoSaveMedia(next);
    return next;
  });
  const removeVideo = (idx) => setForm(prev => {
    const next = { ...prev, videos: prev.videos.filter((_, i) => i !== idx) };
    autoSaveMedia(next);
    return next;
  });
  const reorderPhotos = (from, to) => setForm(prev => {
    if (from === to || from < 0 || to < 0 || from >= prev.photos.length || to >= prev.photos.length) return prev;
    const photos = [...prev.photos];
    const [moved] = photos.splice(from, 1);
    photos.splice(to, 0, moved);
    const next = { ...prev, photos: photos.map((p, i) => ({ ...p, order: i })) };
    autoSaveMedia(next);
    return next;
  });
  const reorderVideos = (from, to) => setForm(prev => {
    if (from === to || from < 0 || to < 0 || from >= prev.videos.length || to >= prev.videos.length) return prev;
    const videos = [...prev.videos];
    const [moved] = videos.splice(from, 1);
    videos.splice(to, 0, moved);
    const next = { ...prev, videos };
    autoSaveMedia(next);
    return next;
  });
  const addDiveSite = () => set('dive_sites', [...form.dive_sites, { name: '', description: '', max_depth: 0, difficulty: 'beginner' }]);
  const removeDiveSite = (idx) => set('dive_sites', form.dive_sites.filter((_, i) => i !== idx));
  const updateDiveSite = (idx, field, value) => { const sites = [...form.dive_sites]; sites[idx] = { ...sites[idx], [field]: value }; set('dive_sites', sites); };
  const addRoom = () => { const rooms = [...(form.accommodation?.rooms || [])]; rooms.push({ type: 'Double', name: '', description: '', photos: [], occupancy: 2, amenities: [], price_single: 0, price_double: 0, price_shared: 0 }); set('accommodation.rooms', rooms); };
  const removeRoom = (idx) => set('accommodation.rooms', form.accommodation.rooms.filter((_, i) => i !== idx));
  const updateRoom = (idx, field, value) => { const rooms = [...form.accommodation.rooms]; rooms[idx] = { ...rooms[idx], [field]: value }; set('accommodation.rooms', rooms); };
  const addListItem = (field) => set(field, [...(form[field] || ['']), '']);
  const removeListItem = (field, idx) => set(field, form[field].filter((_, i) => i !== idx));
  const updateListItem = (field, idx, value) => { const items = [...form[field]]; items[idx] = value; set(field, items); };

  // Flush any pending debounced save synchronously (used before publish/close).
  const flushPending = useCallback(async () => {
    if (debounceRef.current) { clearTimeout(debounceRef.current); debounceRef.current = null; }
    if (!dirtyRef.current) return persistedRef.current;
    return await new Promise(resolve => {
      setForm(prev => { persist(prev).then(resolve); return prev; });
    });
  }, [persist]);

  const handleClose = useCallback(async () => {
    await flushPending();
    onClose();
  }, [flushPending, onClose]);

  const handlePublish = async () => {
    if (!form.title) { toast.error('Title is required'); setActiveSection('basic'); return; }
    if (!form.description) { toast.error('Description is required'); setActiveSection('basic'); return; }
    if (!form.location) { toast.error('Location is required'); setActiveSection('basic'); return; }
    if (!form.country) { toast.error('Country is required'); setActiveSection('basic'); return; }
    setPublishing(true);
    try {
      const saved = await flushPending();
      const id = saved?.id || persistedRef.current?.id;
      if (!id) { toast.error('Could not publish — please try again'); return; }
      await axios.put(`/operator-listings/listings/${id}/publish`);
      toast.success('Listing published!');
      onSaved();
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed to publish'); }
    finally { setPublishing(false); }
  };

  // Status pill helper
  const statusPill = () => {
    if (status.state === 'saving') return { label: 'Saving…', className: 'bg-cyan-50 text-cyan-600 border-cyan-100', Icon: Loader2, spin: true };
    if (status.state === 'pending') return { label: 'Unsaved changes', className: 'bg-amber-50 text-amber-600 border-amber-100', Icon: Loader2, spin: false };
    if (status.state === 'error') return { label: 'Save failed — retry', className: 'bg-red-50 text-red-600 border-red-100', Icon: X, spin: false };
    if (status.state === 'saved') return { label: 'All changes saved', className: 'bg-emerald-50 text-emerald-600 border-emerald-100', Icon: Check, spin: false };
    return { label: 'Start typing to save', className: 'bg-slate-50 text-slate-500 border-slate-100', Icon: Check, spin: false };
  };

  const sectionProps = { form, set };
  const sp = statusPill();

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" data-testid="dive-listing-builder">
      <div className="bg-white rounded-2xl w-full max-w-5xl h-[90vh] flex flex-col overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900">{isEdit ? 'Edit Listing' : 'Create Dive Listing'}</h2>
              <p className="text-xs text-slate-500">Changes save automatically as you type</p>
            </div>
            <span className={`flex items-center gap-1.5 px-3 py-1 rounded-full border text-[11px] font-semibold ${sp.className}`} data-testid="autosave-status">
              <sp.Icon size={11} className={sp.spin ? 'animate-spin' : ''} /> {sp.label}
            </span>
          </div>
          <button onClick={handleClose} className="p-2 rounded-lg hover:bg-slate-200 text-slate-400" data-testid="close-builder"><X size={18} /></button>
        </div>
        <div className="flex flex-1 min-h-0">
          <nav className="w-52 bg-slate-50 border-r border-slate-100 overflow-y-auto flex-shrink-0 py-3">
            {SECTION_CONFIG.map(s => (
              <button key={s.key} onClick={() => setActiveSection(s.key)}
                className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-[12px] font-medium transition-all ${activeSection === s.key ? 'bg-white text-cyan-600 border-r-2 border-cyan-500 shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-white/50'}`}
                data-testid={`section-nav-${s.key}`}><s.icon size={14} />{s.label}</button>
            ))}
          </nav>
          <div className="flex-1 overflow-y-auto p-6 space-y-5">
            {activeSection === 'basic' && <BasicSection {...sectionProps} />}
            {activeSection === 'media' && <MediaSection {...sectionProps} listing={persistedListing} fileInputRef={fileInputRef} videoInputRef={videoInputRef} uploading={uploading} handleFileUpload={handleFileUpload} removePhoto={removePhoto} removeVideo={removeVideo} reorderPhotos={reorderPhotos} reorderVideos={reorderVideos} />}
            {activeSection === 'dive' && <DiveSection {...sectionProps} addDiveSite={addDiveSite} removeDiveSite={removeDiveSite} updateDiveSite={updateDiveSite} />}
            {activeSection === 'gear' && <GearSection {...sectionProps} />}
            {activeSection === 'dates' && <DatesSection {...sectionProps} />}
            {activeSection === 'accommodation' && <AccommodationSection {...sectionProps} addRoom={addRoom} removeRoom={removeRoom} updateRoom={updateRoom} />}
            {activeSection === 'inclusions' && <InclusionsSection form={form} addListItem={addListItem} removeListItem={removeListItem} updateListItem={updateListItem} />}
            {activeSection === 'pricing' && <PricingSection {...sectionProps} />}
            {activeSection === 'policies' && <PoliciesSection {...sectionProps} />}
            {activeSection === 'directions' && <DirectionsSection {...sectionProps} />}
            {activeSection === 'medical' && <MedicalSection {...sectionProps} />}
          </div>
        </div>
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 bg-slate-50/50">
          <button onClick={handleClose} className="px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-100" data-testid="close-builder-bottom">Done</button>
          <button onClick={handlePublish} disabled={publishing} className="px-5 py-2.5 bg-cyan-500 text-white text-sm font-semibold rounded-xl hover:bg-cyan-600 disabled:opacity-50 flex items-center gap-2" data-testid="publish-btn"><Send size={14} /> {publishing ? 'Publishing…' : 'Publish'}</button>
        </div>
      </div>
    </div>
  );
}
