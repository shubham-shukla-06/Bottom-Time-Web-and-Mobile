// Admin → Welcome Carousel
//
// Manage the mobile welcome-screen carousel: upload hi-res images, set
// focal-point + zoom with a visible-area guide (auth-sheet shading), tag
// photographer, toggle attribution, reorder, delete.
//
// Every write goes through /api/admin/welcome-slides*. The public mobile
// app fetches /api/welcome-slides on mount.
//
// Critical UX: when cropping, the admin sees the **mobile-frame guide**
// — a 9:19.5 vertical rectangle matching a real phone. The bottom
// ~53.5% is shaded because the auth sheet covers it on mobile; the
// unshaded top ~46.5% is the "visible area" where the subject must
// sit. Mirror math: welcome.tsx sets SHEET_H ≈ 0.535 * SCREEN_H.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import {
  ArrowDown, ArrowUp, Check, Loader2, Pencil, Plus, Trash2, Upload, X,
} from 'lucide-react';

// Must match the proportion used by the mobile renderer
// (welcome.tsx:SHEET_H = Math.round(SCREEN_H * 0.535)).
const AUTH_SHEET_RATIO = 0.535;
const PHONE_ASPECT = 9 / 19.5; // width / height

function clamp01(v) { return Math.max(0, Math.min(1, Number(v) || 0)); }
function toAbsoluteUrl(u) {
  if (!u) return u;
  if (/^https?:\/\//.test(u)) return u;
  const base = (axios.defaults?.baseURL || '').replace(/\/api\/?$/, '');
  return `${base}${u}`;
}

// ---- Focal-point / crop editor -------------------------------------------

function CropEditor({ imageUrl, focalPoint, zoom, onChange }) {
  const frameRef = useRef(null);

  const handlePointerDown = useCallback((e) => {
    const rect = frameRef.current?.getBoundingClientRect();
    if (!rect) return;
    const update = (ev) => {
      const x = clamp01((ev.clientX - rect.left) / rect.width);
      const y = clamp01((ev.clientY - rect.top) / rect.height);
      onChange({ focal_point: { x, y } });
    };
    update(e);
    const move = (ev) => update(ev);
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }, [onChange]);

  const fx = focalPoint.x * 100;
  const fy = focalPoint.y * 100;

  return (
    <div className="flex-1 min-w-0">
      <div className="mb-3 p-3 rounded-xl bg-cyan-50/60 border border-cyan-100 text-xs text-slate-700 leading-relaxed" data-testid="crop-editor-caption">
        Mobile target: <span className="font-semibold">1290 × 2796 px</span> (iPhone 15 Pro Max).
        The shaded area is hidden behind the sign-in sheet. Position your subject in the unshaded top portion.
      </div>

      <div
        ref={frameRef}
        onPointerDown={handlePointerDown}
        className="relative mx-auto rounded-xl overflow-hidden border border-slate-200 cursor-crosshair select-none bg-slate-900"
        style={{ aspectRatio: PHONE_ASPECT, maxHeight: 520 }}
        data-testid="crop-editor-frame"
      >
        {/* Source image with focal positioning + zoom applied (what mobile will render) */}
        <div className="absolute inset-0" style={{ transform: `scale(${zoom})`, transformOrigin: `${fx}% ${fy}%` }}>
          <img
            src={imageUrl}
            alt=""
            draggable={false}
            className="w-full h-full object-cover"
            style={{ objectPosition: `${fx}% ${fy}%` }}
          />
        </div>

        {/* Auth-sheet shaded overlay — hides the bottom AUTH_SHEET_RATIO */}
        <div
          className="absolute left-0 right-0 bottom-0 bg-slate-900/55 backdrop-blur-[1px] pointer-events-none flex items-start justify-center pt-2"
          style={{ height: `${AUTH_SHEET_RATIO * 100}%` }}
          data-testid="crop-editor-sheet-shade"
        >
          <span className="text-[10px] font-semibold text-white/70 uppercase tracking-widest">Auth sheet (hidden)</span>
        </div>

        {/* Divider line showing the top edge of the auth sheet */}
        <div
          className="absolute left-0 right-0 border-t-2 border-dashed border-white/60 pointer-events-none"
          style={{ bottom: `${AUTH_SHEET_RATIO * 100}%` }}
        />

        {/* Crosshair pin at focal point */}
        <div
          className="absolute pointer-events-none"
          style={{
            left: `${fx}%`, top: `${fy}%`,
            transform: 'translate(-50%, -50%)',
            width: 32, height: 32,
          }}
        >
          <div className="w-8 h-8 rounded-full border-2 border-white shadow-[0_0_0_2px_rgba(0,0,0,0.5)] bg-white/10" />
          <div className="absolute inset-[14px] bg-white rounded-full" />
        </div>
      </div>

      {/* Zoom slider */}
      <div className="mt-4">
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-xs font-semibold text-slate-700">Zoom</label>
          <span className="text-xs text-slate-500" data-testid="zoom-value">{zoom.toFixed(2)}×</span>
        </div>
        <input
          type="range" min="1.0" max="2.5" step="0.05" value={zoom}
          onChange={(e) => onChange({ zoom: parseFloat(e.target.value) })}
          className="w-full accent-cyan-400"
          data-testid="zoom-slider"
        />
      </div>

      <p className="mt-1 text-[11px] text-slate-500">
        Drag anywhere on the image to move the focal point. Both drag and zoom
        preview the exact pixels the mobile user will see — the shaded band
        is the auth sheet footprint.
      </p>
    </div>
  );
}

// ---- Phone preview -------------------------------------------------------

function PhonePreview({ imageUrl, focalPoint, zoom, credit, showAttribution }) {
  const fx = focalPoint.x * 100;
  const fy = focalPoint.y * 100;
  return (
    <div className="shrink-0">
      <div className="text-[10px] font-semibold text-cyan-500 uppercase tracking-widest mb-2 text-center">Mobile preview</div>
      <div
        className="relative rounded-[32px] overflow-hidden border-[6px] border-slate-900 shadow-xl bg-slate-900"
        style={{ width: 200, aspectRatio: PHONE_ASPECT }}
        data-testid="phone-preview"
      >
        <div className="absolute inset-0" style={{ transform: `scale(${zoom})`, transformOrigin: `${fx}% ${fy}%` }}>
          <img
            src={imageUrl}
            alt=""
            draggable={false}
            className="w-full h-full object-cover"
            style={{ objectPosition: `${fx}% ${fy}%` }}
          />
        </div>
        {/* Auth-sheet mock */}
        <div
          className="absolute left-0 right-0 bottom-0 bg-white rounded-t-[20px]"
          style={{ height: `${AUTH_SHEET_RATIO * 100}%` }}
        >
          <div className="h-full flex flex-col items-center pt-4 px-3">
            <div className="w-8 h-1 bg-slate-200 rounded-full mb-3" />
            <div className="text-[10px] font-semibold text-slate-700 mb-2">Log in or sign up</div>
            <div className="w-full h-5 rounded-md bg-slate-100 mb-2" />
            <div className="w-full h-5 rounded-md bg-cyan-400" />
          </div>
        </div>
        {/* Credit line — just above the sheet, to match mobile */}
        {showAttribution && credit ? (
          <div
            className="absolute left-0 right-0 text-center text-[8px] font-medium text-white/80"
            style={{
              bottom: `calc(${AUTH_SHEET_RATIO * 100}% + 6px)`,
              textShadow: '0 1px 3px rgba(0,0,0,0.6)',
            }}
            data-testid="phone-preview-credit"
          >
            {credit}
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ---- Editor modal --------------------------------------------------------

const EMPTY = {
  id: null,
  image_url: '',
  original_filename: null,
  photographer_name: '',
  show_attribution: true,
  focal_point: { x: 0.5, y: 0.5 },
  zoom: 1.0,
  active: true,
};

function EditorModal({ initial, onClose, onSaved }) {
  const [state, setState] = useState(() => ({ ...EMPTY, ...(initial || {}) }));
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef(null);

  const patch = useCallback((p) => setState((s) => ({ ...s, ...p })), []);

  const pickFile = () => fileRef.current?.click();

  const handleUpload = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await axios.post('/admin/welcome-slides/upload', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      patch({
        image_url: res.data.image_url,
        original_filename: res.data.original_filename,
      });
      toast.success(`Uploaded ${res.data.width}×${res.data.height}`);
    } catch (err) {
      const msg = err?.response?.data?.detail || err?.message || 'Upload failed';
      toast.error(typeof msg === 'string' ? msg : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!state.image_url) { toast.error('Upload an image first'); return; }
    setSaving(true);
    try {
      const payload = {
        image_url: state.image_url,
        original_filename: state.original_filename || null,
        photographer_name: state.photographer_name || null,
        show_attribution: !!state.show_attribution,
        focal_point: state.focal_point,
        zoom: state.zoom,
        active: !!state.active,
      };
      if (state.id) {
        await axios.patch(`/admin/welcome-slides/${state.id}`, payload);
      } else {
        await axios.post('/admin/welcome-slides', payload);
      }
      toast.success(state.id ? 'Slide updated' : 'Slide added');
      onSaved();
    } catch (err) {
      const msg = err?.response?.data?.detail || err?.message || 'Save failed';
      toast.error(typeof msg === 'string' ? msg : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 flex items-center justify-center p-4 overflow-y-auto" data-testid="welcome-editor-modal">
      <div className="bg-white rounded-2xl w-full max-w-5xl shadow-2xl my-8">
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
          <h3 className="text-sm font-bold text-slate-900">
            {state.id ? 'Edit slide' : 'Add slide'}
          </h3>
          <button onClick={onClose} className="p-1.5 rounded-md hover:bg-slate-100 text-slate-500" data-testid="welcome-editor-close"><X size={16} /></button>
        </div>

        <div className="p-5 flex flex-col lg:flex-row gap-5">
          {/* Left: upload + editor */}
          {!state.image_url ? (
            <div
              className="flex-1 min-h-[320px] flex flex-col items-center justify-center gap-3 border-2 border-dashed border-slate-200 rounded-xl p-8 text-slate-500"
              data-testid="welcome-editor-empty"
            >
              <Upload size={28} className="text-slate-300" />
              <p className="text-sm font-semibold text-slate-700">Upload an image to begin</p>
              <p className="text-xs text-slate-500 text-center max-w-xs">
                JPEG, PNG or WebP · max 10 MB · long edge ≥ 1500 px.
              </p>
              <button
                onClick={pickFile}
                disabled={uploading}
                className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-cyan-400 text-slate-900 text-xs font-bold hover:bg-cyan-500 disabled:opacity-40 transition-colors"
                data-testid="welcome-editor-upload-btn"
              >
                {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                {uploading ? 'Uploading…' : 'Choose file'}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => handleUpload(e.target.files?.[0])}
                data-testid="welcome-editor-file-input"
              />
            </div>
          ) : (
            <CropEditor
              imageUrl={toAbsoluteUrl(state.image_url)}
              focalPoint={state.focal_point}
              zoom={state.zoom}
              onChange={patch}
            />
          )}

          {/* Right: live preview + metadata */}
          {state.image_url ? (
            <div className="flex flex-col gap-4">
              <PhonePreview
                imageUrl={toAbsoluteUrl(state.image_url)}
                focalPoint={state.focal_point}
                zoom={state.zoom}
                credit={state.photographer_name ? `Photo by ${state.photographer_name}` : ''}
                showAttribution={state.show_attribution}
              />

              <div className="flex flex-col gap-3 w-[200px]">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">Photographer</label>
                  <input
                    type="text"
                    value={state.photographer_name || ''}
                    onChange={(e) => patch({ photographer_name: e.target.value })}
                    placeholder="e.g. Kevin Charit"
                    className="w-full text-xs px-2.5 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-cyan-400"
                    data-testid="welcome-editor-photographer-input"
                  />
                </div>

                <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer select-none" data-testid="welcome-editor-attr-toggle">
                  <input
                    type="checkbox"
                    checked={state.show_attribution}
                    onChange={(e) => patch({ show_attribution: e.target.checked })}
                    className="accent-cyan-400"
                  />
                  Show attribution on image
                </label>

                <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={state.active}
                    onChange={(e) => patch({ active: e.target.checked })}
                    className="accent-cyan-400"
                  />
                  Active (visible in carousel)
                </label>
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-slate-100 bg-slate-50 rounded-b-2xl">
          <button onClick={onClose} className="text-xs font-semibold text-slate-500 hover:text-slate-700 px-3 py-2 rounded-lg hover:bg-slate-100" data-testid="welcome-editor-cancel">Cancel</button>
          <button
            onClick={handleSave}
            disabled={saving || !state.image_url}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-cyan-400 text-slate-900 text-xs font-bold hover:bg-cyan-500 disabled:opacity-40 transition-colors"
            data-testid="welcome-editor-save"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            {saving ? 'Saving…' : state.id ? 'Save changes' : 'Add slide'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---- List row ------------------------------------------------------------

function SlideRow({ s, idx, total, onEdit, onDelete, onMove, onToggle }) {
  const fx = (s.focal_point?.x ?? 0.5) * 100;
  const fy = (s.focal_point?.y ?? 0.5) * 100;
  return (
    <div className="flex items-center gap-3 p-3 border border-slate-100 rounded-xl bg-white" data-testid={`welcome-slide-row-${s.id}`}>
      <div className="flex flex-col gap-0.5">
        <button onClick={() => onMove(s.id, idx, -1)} disabled={idx === 0} className="p-1 rounded hover:bg-slate-100 disabled:opacity-30" data-testid={`welcome-slide-up-${s.id}`}>
          <ArrowUp size={12} />
        </button>
        <button onClick={() => onMove(s.id, idx, +1)} disabled={idx === total - 1} className="p-1 rounded hover:bg-slate-100 disabled:opacity-30" data-testid={`welcome-slide-down-${s.id}`}>
          <ArrowDown size={12} />
        </button>
      </div>
      <div className="shrink-0 w-[70px] aspect-[9/19.5] rounded-lg overflow-hidden bg-slate-100 border border-slate-200">
        <img
          src={toAbsoluteUrl(s.image_url)}
          alt=""
          className="w-full h-full object-cover"
          style={{ objectPosition: `${fx}% ${fy}%`, transform: `scale(${s.zoom || 1})`, transformOrigin: `${fx}% ${fy}%` }}
        />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-slate-900 truncate">
          {s.photographer_name ? `Photo by ${s.photographer_name}` : '(no photographer)'}
        </p>
        <p className="text-[11px] text-slate-500">
          Focal {s.focal_point?.x?.toFixed(2)}, {s.focal_point?.y?.toFixed(2)} · Zoom {Number(s.zoom || 1).toFixed(2)}×
        </p>
        <div className="flex gap-2 mt-1">
          <button onClick={() => onToggle(s, 'active')} className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${s.active ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-500'}`} data-testid={`welcome-slide-active-${s.id}`}>
            {s.active ? 'Active' : 'Hidden'}
          </button>
          <button onClick={() => onToggle(s, 'show_attribution')} className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${s.show_attribution ? 'bg-cyan-100 text-cyan-500' : 'bg-slate-100 text-slate-500'}`} data-testid={`welcome-slide-attr-${s.id}`}>
            {s.show_attribution ? 'Credit on' : 'Credit off'}
          </button>
        </div>
      </div>
      <button onClick={() => onEdit(s)} className="text-slate-400 hover:text-cyan-500 p-2 rounded-lg hover:bg-cyan-50" data-testid={`welcome-slide-edit-${s.id}`}><Pencil size={16} /></button>
      <button onClick={() => onDelete(s)} className="text-slate-400 hover:text-red-500 p-2 rounded-lg hover:bg-red-50" data-testid={`welcome-slide-delete-${s.id}`}><Trash2 size={16} /></button>
    </div>
  );
}

// ---- Section root --------------------------------------------------------

export default function WelcomeCarouselSection() {
  const [slides, setSlides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // null | 'new' | slide
  const [confirmDelete, setConfirmDelete] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await axios.get('/admin/welcome-slides');
      setSlides(r.data?.slides || []);
    } catch {
      toast.error('Could not load slides');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleMove = async (id, idx, delta) => {
    const target = idx + delta;
    if (target < 0 || target >= slides.length) return;
    const next = [...slides];
    [next[idx], next[target]] = [next[target], next[idx]];
    setSlides(next);  // optimistic
    try {
      await axios.post('/admin/welcome-slides/reorder', { ids: next.map((s) => s.id) });
    } catch {
      toast.error('Reorder failed');
      load();
    }
  };

  const handleToggle = async (s, field) => {
    const patchPayload = { [field]: !s[field] };
    try {
      await axios.patch(`/admin/welcome-slides/${s.id}`, patchPayload);
      await load();
    } catch {
      toast.error('Update failed');
    }
  };

  const handleDelete = async (s) => {
    try {
      await axios.delete(`/admin/welcome-slides/${s.id}`);
      toast.success('Slide deleted');
      setConfirmDelete(null);
      await load();
    } catch {
      toast.error('Delete failed');
    }
  };

  const initialForEditor = useMemo(() => {
    if (editing === 'new' || editing === null) return null;
    return editing;
  }, [editing]);

  return (
    <div data-testid="welcome-carousel-section">
      <div className="flex items-start justify-between gap-3 mb-5">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Welcome Carousel</h2>
          <p className="text-xs text-slate-500 mt-1 max-w-xl">
            Photos shown behind the mobile welcome screen's sign-in sheet. Drag the focal point so
            your subject lands in the unshaded top portion — that's the part users actually see.
            Empty list = mobile app falls back to its baked-in 4 slides.
          </p>
        </div>
        <button
          onClick={() => setEditing('new')}
          className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-cyan-400 text-slate-900 text-xs font-bold hover:bg-cyan-500"
          data-testid="welcome-carousel-add-btn"
        >
          <Plus size={14} /> Add slide
        </button>
      </div>

      {loading ? (
        <div className="text-xs text-slate-400 py-6" data-testid="welcome-carousel-loading">Loading…</div>
      ) : slides.length === 0 ? (
        <div className="text-sm text-slate-500 py-8 text-center border border-dashed border-slate-200 rounded-xl" data-testid="welcome-carousel-empty">
          No admin slides yet. Mobile is using the baked-in default set.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {slides.map((s, idx) => (
            <SlideRow
              key={s.id} s={s} idx={idx} total={slides.length}
              onEdit={(slide) => setEditing(slide)}
              onDelete={(slide) => setConfirmDelete(slide)}
              onMove={handleMove}
              onToggle={handleToggle}
            />
          ))}
        </div>
      )}

      {editing !== null && (
        <EditorModal
          initial={initialForEditor}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 flex items-center justify-center p-4" data-testid="welcome-delete-confirm">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-2xl">
            <h4 className="text-sm font-bold text-slate-900 mb-1">Delete this slide?</h4>
            <p className="text-xs text-slate-500 mb-4">
              This removes the slide and its uploaded image. Cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmDelete(null)} className="text-xs font-semibold text-slate-500 px-3 py-2 rounded-lg hover:bg-slate-100" data-testid="welcome-delete-cancel">Cancel</button>
              <button onClick={() => handleDelete(confirmDelete)} className="text-xs font-bold text-white bg-red-500 hover:bg-red-600 px-3 py-2 rounded-lg" data-testid="welcome-delete-confirm-btn">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
