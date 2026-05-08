// Admin → Welcome Carousel
//
// Manage the mobile welcome-screen carousel: upload hi-res images, crop with a
// real fixed-stencil cropper (drag to pan, scroll/pinch to zoom), set the raw
// attribution text, toggle visibility/active, reorder, delete.
//
// Backend contract:
//   GET    /admin/welcome-slides
//   POST   /admin/welcome-slides/upload
//   POST   /admin/welcome-slides           — body uses attribution_text
//   PATCH  /admin/welcome-slides/{id}      — body uses attribution_text
//   DELETE /admin/welcome-slides/{id}
//   POST   /admin/welcome-slides/reorder
//
// Cropper UX (react-advanced-cropper FixedCropper):
//   • Stencil is fixed at 9:19.5 phone-screen aspect — locked size,
//     no resize/move handles.
//   • Image inside the stencil is freely draggable + zoomable, can overflow
//     the stencil edges (imageRestriction="none").
//   • On every change we read `cropper.getCoordinates()` (the rectangle of
//     the source image currently visible in the stencil) and translate it
//     to the existing backend payload:
//         focal_point.x = (left + width/2)  / sourceImageWidth
//         focal_point.y = (top  + height/2) / sourceImageHeight
//         zoom          = sourceImageWidth / width
//     The mobile renderer (welcome.tsx) consumes the same focal_point + zoom
//     unchanged.
//   • Editing reopens at the saved crop via `defaultPosition` + `defaultSize`
//     (in source-image pixel space).
//   • The auth-sheet shaded band is rendered as a sibling overlay aligned to
//     the stencil rectangle so it doesn't interfere with drag.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { FixedCropper, ImageRestriction } from 'react-advanced-cropper';
import 'react-advanced-cropper/dist/style.css';
import {
  ArrowDown, ArrowUp, Check, Loader2, Pencil, Plus, Trash2, Upload, X,
} from 'lucide-react';

// Mobile auth-sheet covers the bottom 53.5% of the screen — keep this in
// sync with `welcome.tsx` SHEET_H = round(SCREEN_H * 0.535).
const AUTH_SHEET_RATIO = 0.535;
const PHONE_ASPECT_W = 9;
const PHONE_ASPECT_H = 19.5;

// Stencil — sized to fit comfortably in the modal (≈ 280 × 607 keeps the
// 9:19.5 aspect on a 1440-wide viewport without overflowing the form pane).
const STENCIL_W = 280;
const STENCIL_H = Math.round((STENCIL_W / PHONE_ASPECT_W) * PHONE_ASPECT_H); // 607

function clamp01(v) { return Math.max(0, Math.min(1, Number(v) || 0)); }
function toAbsoluteUrl(u) {
  if (!u) return u;
  if (/^https?:\/\//.test(u)) return u;
  const base = (axios.defaults?.baseURL || '').replace(/\/api\/?$/, '');
  return `${base}${u}`;
}

// ---- Cropper -------------------------------------------------------------

function CropEditor({ imageUrl, focalPoint, zoom, onChange }) {
  const cropperRef = useRef(null);
  const [imageSize, setImageSize] = useState(null); // { width, height }

  // Pre-load image dimensions BEFORE the Cropper mounts so we can pass
  // `defaultPosition`/`defaultSize` and reopen at the saved crop. The
  // Cropper reads those props at mount-time only.
  useEffect(() => {
    if (!imageUrl) { setImageSize(null); return; }
    let cancelled = false;
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (cancelled) return;
      setImageSize({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => { if (!cancelled) setImageSize(null); };
    img.src = imageUrl;
    return () => { cancelled = true; };
  }, [imageUrl]);

  // Translate the cropper's pixel coordinates into the backend contract
  // (focal_point + zoom). Called on every drag/zoom/transition end.
  const handleChange = useCallback((cropper) => {
    if (!cropper) return;
    const coords = cropper.getCoordinates();
    const img = cropper.getImage();
    if (!coords || !img || !img.width || !img.height || !coords.width) return;
    const cx = coords.left + coords.width / 2;
    const cy = coords.top + coords.height / 2;
    onChange({
      focal_point: { x: clamp01(cx / img.width), y: clamp01(cy / img.height) },
      zoom: Math.max(1, Math.min(3, img.width / coords.width)),
    });
  }, [onChange]);

  // Compute the initial visible rectangle (in source-image px) from the
  // saved focal_point + zoom so the editor reopens at the same crop.
  // Falls back to a centered, full-cover rect for fresh uploads.
  const defaultRect = useMemo(() => {
    const z = Number(zoom) > 1 ? Number(zoom) : 1;
    if (!imageSize) return null;
    const { width: iw, height: ih } = imageSize;
    // Crop must keep stencil aspect (9:19.5).
    const stencilAspect = PHONE_ASPECT_W / PHONE_ASPECT_H; // 0.4615…
    // Largest rectangle of stencil aspect that fits inside the image (zoom=1).
    const baseW = iw / ih < stencilAspect ? iw : ih * stencilAspect;
    const baseH = baseW / stencilAspect;
    const w = baseW / z;
    const h = baseH / z;
    const fx = clamp01(focalPoint?.x ?? 0.5);
    const fy = clamp01(focalPoint?.y ?? 0.5);
    return {
      width: w,
      height: h,
      // Shift so the saved focal_point lands at the rect's center.
      left: Math.max(0, Math.min(iw - w, fx * iw - w / 2)),
      top: Math.max(0, Math.min(ih - h, fy * ih - h / 2)),
    };
  }, [imageSize, focalPoint, zoom]);

  return (
    <div className="flex-shrink-0" style={{ width: STENCIL_W }}>
      <div className="mb-3 p-3 rounded-xl bg-cyan-50/60 border border-cyan-100 text-[11px] text-slate-700 leading-relaxed" data-testid="crop-editor-caption">
        Drag to compose. Scroll to zoom. What sits in the frame is exactly what mobile shows.
        The shaded band is hidden behind the sign-in sheet — keep your subject above it.
      </div>

      <div
        className="relative"
        style={{ width: STENCIL_W, height: STENCIL_H }}
        data-testid="crop-editor-frame"
      >
        <FixedCropper
          ref={cropperRef}
          src={imageUrl}
          className="w-full h-full rounded-xl overflow-hidden"
          backgroundClassName="bg-slate-900"
          stencilSize={{ width: STENCIL_W, height: STENCIL_H }}
          stencilProps={{
            handlers: false,
            lines: false,
            movable: false,
            resizable: false,
            grid: false,
            overlayClassName: '!bg-black/30',
          }}
          imageRestriction={ImageRestriction.none}
          transitions
          // Re-key on imageUrl so each new upload remounts the cropper —
          // otherwise the old image's defaults bleed into the new one.
          key={`cropper-${imageUrl}`}
          defaultPosition={defaultRect ? { left: defaultRect.left, top: defaultRect.top } : undefined}
          defaultSize={defaultRect ? { width: defaultRect.width, height: defaultRect.height } : undefined}
          onChange={handleChange}
        />

        {/* Auth-sheet shaded overlay — sibling so cropper drag isn't blocked. */}
        <div
          className="absolute left-0 right-0 bottom-0 bg-slate-900/55 backdrop-blur-[1px] pointer-events-none flex items-start justify-center pt-2 rounded-b-xl"
          style={{ height: `${AUTH_SHEET_RATIO * 100}%` }}
          data-testid="crop-editor-sheet-shade"
        >
          <span className="text-[10px] font-semibold text-white/80 uppercase tracking-widest">Auth sheet (hidden)</span>
        </div>
        <div
          className="absolute left-0 right-0 border-t-2 border-dashed border-white/70 pointer-events-none"
          style={{ bottom: `${AUTH_SHEET_RATIO * 100}%` }}
        />
      </div>
    </div>
  );
}

// ---- Editor modal --------------------------------------------------------

function SlideEditorModal({ slide, onClose, onSaved }) {
  const isNew = !slide?.id;
  const [imageUrl, setImageUrl] = useState(slide?.image_url || '');
  const [originalFilename, setOriginalFilename] = useState(slide?.original_filename || '');
  const [attributionText, setAttributionText] = useState(slide?.attribution_text ?? '');
  const [showAttribution, setShowAttribution] = useState(slide?.show_attribution ?? true);
  const [active, setActive] = useState(slide?.active ?? true);
  const [focalPoint, setFocalPoint] = useState(slide?.focal_point ?? { x: 0.5, y: 0.5 });
  const [zoom, setZoom] = useState(slide?.zoom ?? 1.0);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef(null);

  const onPick = () => fileRef.current?.click();

  const onFile = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', f);
      const res = await axios.post('/admin/welcome-slides/upload', fd);
      setImageUrl(res.data.image_url);
      setOriginalFilename(res.data.original_filename);
      // Reset crop to centered for a fresh upload.
      setFocalPoint({ x: 0.5, y: 0.5 });
      setZoom(1.0);
      toast.success(`Uploaded ${res.data.width}×${res.data.height}`);
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Upload failed');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const onSave = async () => {
    if (!imageUrl) { toast.error('Please upload an image first'); return; }
    setSaving(true);
    try {
      const payload = {
        image_url: imageUrl,
        original_filename: originalFilename,
        attribution_text: attributionText || null,
        show_attribution: showAttribution,
        focal_point: { x: clamp01(focalPoint.x), y: clamp01(focalPoint.y) },
        zoom: Math.max(1, Math.min(3, Number(zoom) || 1)),
        active,
      };
      let row;
      if (isNew) {
        const r = await axios.post('/admin/welcome-slides', payload);
        row = r.data;
      } else {
        const r = await axios.patch(`/admin/welcome-slides/${slide.id}`, {
          attribution_text: attributionText || null,
          show_attribution: showAttribution,
          focal_point: payload.focal_point,
          zoom: payload.zoom,
          active,
        });
        row = r.data;
      }
      toast.success(isNew ? 'Slide added' : 'Slide updated');
      onSaved(row);
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/55 flex items-center justify-center p-4" data-testid="welcome-editor-modal">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h3 className="text-base font-semibold text-slate-900">{isNew ? 'Add slide' : 'Edit slide'}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700" data-testid="welcome-editor-close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 flex gap-6 items-start">
          {/* LEFT: cropper */}
          <div>
            {imageUrl ? (
              <CropEditor
                imageUrl={toAbsoluteUrl(imageUrl)}
                focalPoint={focalPoint}
                zoom={zoom}
                onChange={(patch) => {
                  if (patch.focal_point) setFocalPoint(patch.focal_point);
                  if (patch.zoom !== undefined) setZoom(patch.zoom);
                }}
              />
            ) : (
              <div
                className="flex items-center justify-center rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 cursor-pointer hover:border-cyan-400 transition-colors"
                style={{ width: STENCIL_W, height: STENCIL_H }}
                onClick={onPick}
                data-testid="welcome-editor-empty-zone"
              >
                <div className="text-center px-6">
                  {uploading ? (
                    <Loader2 className="w-7 h-7 animate-spin text-cyan-500 mx-auto mb-3" />
                  ) : (
                    <Upload className="w-7 h-7 text-slate-400 mx-auto mb-3" />
                  )}
                  <p className="text-sm font-semibold text-slate-700 mb-1">Upload an image</p>
                  <p className="text-xs text-slate-500">JPEG / PNG / WebP · 1500px+ long edge</p>
                </div>
              </div>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={onFile}
              className="hidden"
              data-testid="welcome-editor-file-input"
            />
            {imageUrl ? (
              <button
                onClick={onPick}
                disabled={uploading}
                className="mt-3 w-full px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors flex items-center justify-center gap-2"
                data-testid="welcome-editor-replace-btn"
              >
                {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                Replace image
              </button>
            ) : null}
          </div>

          {/* RIGHT: form */}
          <div className="flex-1 min-w-0 space-y-5">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">Attribution text</label>
              <input
                type="text"
                value={attributionText}
                onChange={(e) => setAttributionText(e.target.value)}
                placeholder="e.g. Kevin Charit · leave blank for no credit"
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400"
                data-testid="welcome-editor-attribution-input"
              />
              <p className="mt-1 text-[11px] text-slate-500">
                Rendered verbatim on mobile. Type the credit exactly as you want it shown
                (e.g. <span className="font-mono text-[10px]">Photo: Kevin Charit / Unsplash</span>).
              </p>
            </div>

            <label className="flex items-center gap-3 cursor-pointer" data-testid="welcome-editor-show-attribution-row">
              <input
                type="checkbox"
                checked={showAttribution}
                onChange={(e) => setShowAttribution(e.target.checked)}
                className="w-4 h-4 accent-cyan-500"
                data-testid="welcome-editor-show-attribution"
              />
              <span className="text-sm text-slate-700">Show attribution text on the slide</span>
            </label>

            <label className="flex items-center gap-3 cursor-pointer" data-testid="welcome-editor-active-row">
              <input
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
                className="w-4 h-4 accent-cyan-500"
                data-testid="welcome-editor-active"
              />
              <span className="text-sm text-slate-700">Active (visible in carousel)</span>
            </label>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-end gap-3 bg-slate-50">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl text-sm font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
            data-testid="welcome-editor-cancel"
          >
            Cancel
          </button>
          <button
            onClick={onSave}
            disabled={saving || !imageUrl}
            className="px-5 py-2 rounded-xl bg-cyan-500 text-white text-sm font-semibold hover:bg-cyan-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            data-testid="welcome-editor-save"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            {isNew ? 'Add slide' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---- Slide list row ------------------------------------------------------

function SlideRow({ slide, index, total, onEdit, onDelete, onMove }) {
  const isActive = slide.active !== false;
  return (
    <div
      className="flex items-center gap-4 p-3 rounded-xl border border-slate-200 bg-white hover:border-cyan-300 hover:shadow-sm transition-all"
      data-testid={`welcome-slide-row-${slide.id}`}
    >
      <div
        className="relative w-16 h-32 rounded-lg overflow-hidden bg-slate-900 flex-shrink-0"
        style={{ aspectRatio: PHONE_ASPECT_W / PHONE_ASPECT_H }}
      >
        <img
          src={toAbsoluteUrl(slide.image_url)}
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
          style={{
            objectPosition: `${(slide.focal_point?.x ?? 0.5) * 100}% ${(slide.focal_point?.y ?? 0.5) * 100}%`,
            transform: slide.zoom > 1 ? `scale(${slide.zoom})` : undefined,
            transformOrigin: `${(slide.focal_point?.x ?? 0.5) * 100}% ${(slide.focal_point?.y ?? 0.5) * 100}%`,
          }}
        />
        {!isActive ? <div className="absolute inset-0 bg-white/60 flex items-center justify-center text-[9px] font-semibold text-slate-700">HIDDEN</div> : null}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-slate-900 truncate">
          {slide.attribution_text || <span className="text-slate-400 italic">No attribution</span>}
        </div>
        <div className="text-xs text-slate-500 mt-0.5 truncate">{slide.original_filename || slide.image_url}</div>
        <div className="text-[11px] text-slate-400 mt-1">
          Position {(slide.focal_point?.x ?? 0.5).toFixed(2)}, {(slide.focal_point?.y ?? 0.5).toFixed(2)} · Zoom {(slide.zoom ?? 1).toFixed(2)}×
          {slide.show_attribution ? '' : ' · credit hidden'}
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => onMove(slide.id, -1)}
          disabled={index === 0}
          className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30 disabled:cursor-not-allowed"
          title="Move up"
          data-testid={`welcome-slide-up-${slide.id}`}
        >
          <ArrowUp className="w-4 h-4" />
        </button>
        <button
          onClick={() => onMove(slide.id, 1)}
          disabled={index === total - 1}
          className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30 disabled:cursor-not-allowed"
          title="Move down"
          data-testid={`welcome-slide-down-${slide.id}`}
        >
          <ArrowDown className="w-4 h-4" />
        </button>
        <button
          onClick={() => onEdit(slide)}
          className="p-2 rounded-lg text-cyan-600 hover:bg-cyan-50"
          title="Edit"
          data-testid={`welcome-slide-edit-${slide.id}`}
        >
          <Pencil className="w-4 h-4" />
        </button>
        <button
          onClick={() => onDelete(slide)}
          className="p-2 rounded-lg text-rose-500 hover:bg-rose-50"
          title="Delete"
          data-testid={`welcome-slide-delete-${slide.id}`}
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// ---- Top-level section ---------------------------------------------------

export default function WelcomeCarouselSection() {
  const [slides, setSlides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // null = closed, {} = new, slide = edit
  const [confirmDelete, setConfirmDelete] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const r = await axios.get('/admin/welcome-slides');
      setSlides(r.data?.slides || []);
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to load slides');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const handleSaved = useCallback(() => {
    setEditing(null);
    refresh();
  }, [refresh]);

  const onMove = useCallback(async (id, direction) => {
    const idx = slides.findIndex((s) => s.id === id);
    if (idx < 0) return;
    const nextIdx = idx + direction;
    if (nextIdx < 0 || nextIdx >= slides.length) return;
    const next = slides.slice();
    [next[idx], next[nextIdx]] = [next[nextIdx], next[idx]];
    setSlides(next);
    try {
      await axios.post('/admin/welcome-slides/reorder', { ids: next.map((s) => s.id) });
    } catch (err) {
      toast.error('Reorder failed');
      refresh();
    }
  }, [slides, refresh]);

  const onDelete = useCallback(async () => {
    if (!confirmDelete) return;
    try {
      await axios.delete(`/admin/welcome-slides/${confirmDelete.id}`);
      toast.success('Slide deleted');
      setConfirmDelete(null);
      refresh();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Delete failed');
    }
  }, [confirmDelete, refresh]);

  return (
    <div className="space-y-6" data-testid="welcome-carousel-section">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Welcome carousel</h2>
          <p className="text-sm text-slate-500 mt-1">
            Hi-res images shown on the mobile welcome screen. The mobile app falls back to the bundled defaults when this list is empty.
          </p>
        </div>
        <button
          onClick={() => setEditing({})}
          className="px-4 py-2 rounded-xl bg-cyan-500 text-white text-sm font-semibold hover:bg-cyan-600 flex items-center gap-2"
          data-testid="welcome-carousel-add-btn"
        >
          <Plus className="w-4 h-4" />
          Add slide
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-cyan-500" />
        </div>
      ) : slides.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 py-12 px-6 text-center">
          <p className="text-sm font-semibold text-slate-700">No slides yet</p>
          <p className="text-xs text-slate-500 mt-1">Add slides to override the bundled mobile defaults.</p>
        </div>
      ) : (
        <div className="space-y-2" data-testid="welcome-carousel-list">
          {slides.map((s, i) => (
            <SlideRow
              key={s.id}
              slide={s}
              index={i}
              total={slides.length}
              onEdit={(slide) => setEditing(slide)}
              onDelete={(slide) => setConfirmDelete(slide)}
              onMove={onMove}
            />
          ))}
        </div>
      )}

      {editing !== null ? (
        <SlideEditorModal
          slide={editing}
          onClose={() => setEditing(null)}
          onSaved={handleSaved}
        />
      ) : null}

      {confirmDelete ? (
        <div className="fixed inset-0 z-50 bg-black/55 flex items-center justify-center p-4" data-testid="welcome-delete-confirm-modal">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="p-6">
              <h3 className="text-base font-semibold text-slate-900">Delete this slide?</h3>
              <p className="text-sm text-slate-500 mt-2">
                The image file will also be removed if no other slide references it.
              </p>
            </div>
            <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-end gap-3 bg-slate-50">
              <button
                onClick={() => setConfirmDelete(null)}
                className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-700 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                onClick={onDelete}
                className="px-4 py-2 rounded-xl bg-rose-500 text-white text-sm font-semibold hover:bg-rose-600 flex items-center gap-2"
                data-testid="welcome-delete-confirm-btn"
              >
                <Trash2 className="w-4 h-4" />
                Delete
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
