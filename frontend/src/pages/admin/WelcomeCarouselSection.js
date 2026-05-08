// Admin → Welcome Carousel
//
// Manage the mobile welcome-screen carousel. The cropper rectangle is fixed
// to MOBILE_VISIBLE_ASPECT_RATIO — exactly the area on the phone that is
// NOT covered by the auth sheet. Whatever the admin frames in this rectangle
// is what mobile renders, full-stop. There is no phone frame, no
// auth-sheet shading, no mobile preview pane — the cropper IS the preview.
//
// Backend contract:
//   GET    /admin/welcome-slides
//   POST   /admin/welcome-slides/upload    → { image_url_original, ... }
//   POST   /admin/welcome-slides           → body: { image_url_original,
//                                                    original_filename,
//                                                    attribution_text,
//                                                    show_attribution,
//                                                    crop_box: {x,y,w,h fractions},
//                                                    active }
//   PATCH  /admin/welcome-slides/{id}      → optional crop_box / attribution / active
//   DELETE /admin/welcome-slides/{id}
//   POST   /admin/welcome-slides/reorder
//
// Cropper UX (react-easy-crop):
//   • Aspect locked to MOBILE_VISIBLE_ASPECT_RATIO (0.7388, iPhone 15 Pro Max
//     visible-area aspect: 430 / 582). The library renders a standard dark
//     scrim outside the crop rectangle.
//   • Drag pans, scroll/pinch zooms.
//   • On save we read croppedAreaPixels → divide by the natural image dims
//     to produce a `crop_box` of fractions. Server crops with Pillow and
//     stores a cropped JPEG; the public payload returns only `image_url`
//     (the cropped JPEG), `attribution_text`, `show_attribution`, `id`,
//     `sort_order` — mobile does zero math.
//   • Editing reopens at the saved crop via `initialCroppedAreaPixels`.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import Cropper from 'react-easy-crop';
import {
  ArrowDown, ArrowUp, Check, Loader2, Pencil, Plus, Trash2, Upload, X,
} from 'lucide-react';

// Hardcoded twin of backend `welcome_visible.MOBILE_VISIBLE_ASPECT_RATIO`.
// Keep these in sync — both files reference each other in their header
// comment for traceability.
const MOBILE_VISIBLE_ASPECT_RATIO = 0.7388; // 430 / 582 — iPhone 15 Pro Max

// Crop frame size in the modal — narrower side fits comfortably alongside
// the form column on a 1280-wide viewport.
const CROP_FRAME_W = 320;
const CROP_FRAME_H = Math.round(CROP_FRAME_W / MOBILE_VISIBLE_ASPECT_RATIO); // 433

function clamp01(v) { return Math.max(0, Math.min(1, Number(v) || 0)); }
function toAbsoluteUrl(u) {
  if (!u) return u;
  if (/^https?:\/\//.test(u)) return u;
  const base = (axios.defaults?.baseURL || '').replace(/\/api\/?$/, '');
  return `${base}${u}`;
}

// ---- Cropper -------------------------------------------------------------

function CropEditor({ imageUrl, initialCropBox, onCropChange }) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [imageSize, setImageSize] = useState(null);

  // Pre-load natural dimensions so we can both seed `initialCroppedAreaPixels`
  // and convert the cropper's pixel rect → fractional `crop_box` on save.
  useEffect(() => {
    if (!imageUrl) { setImageSize(null); return; }
    let cancelled = false;
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (!cancelled) setImageSize({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => { if (!cancelled) setImageSize(null); };
    img.src = imageUrl;
    return () => { cancelled = true; };
  }, [imageUrl]);

  // Re-seed crop position on image change so the cropper opens centered.
  useEffect(() => {
    setCrop({ x: 0, y: 0 });
    setZoom(1);
  }, [imageUrl]);

  // When editing an existing slide we feed react-easy-crop the saved
  // crop rectangle (in source pixels) — the library reverse-engineers a
  // matching crop/zoom and the user sees the same composition they saved.
  const initialCroppedAreaPixels = useMemo(() => {
    if (!imageSize || !initialCropBox) return undefined;
    const { width: iw, height: ih } = imageSize;
    return {
      x: Math.round(initialCropBox.x * iw),
      y: Math.round(initialCropBox.y * ih),
      width: Math.round(initialCropBox.width * iw),
      height: Math.round(initialCropBox.height * ih),
    };
  }, [imageSize, initialCropBox]);

  const onCropComplete = useCallback((_percent, pixels) => {
    if (!imageSize || !pixels) return;
    const { width: iw, height: ih } = imageSize;
    if (!iw || !ih) return;
    const cb = {
      x: clamp01(pixels.x / iw),
      y: clamp01(pixels.y / ih),
      width: clamp01(pixels.width / iw),
      height: clamp01(pixels.height / ih),
    };
    onCropChange(cb);
  }, [imageSize, onCropChange]);

  return (
    <div className="flex-shrink-0" style={{ width: CROP_FRAME_W }}>
      <div className="mb-3 p-3 rounded-xl bg-cyan-50/60 border border-cyan-100 text-[11px] text-slate-700 leading-relaxed" data-testid="crop-editor-caption">
        Drag to pan. Scroll or pinch to zoom. The framed area is exactly what mobile shows.
      </div>

      <div
        className="relative bg-slate-900 rounded-xl overflow-hidden"
        style={{ width: CROP_FRAME_W, height: CROP_FRAME_H }}
        data-testid="crop-editor-frame"
      >
        {imageUrl ? (
          <Cropper
            image={imageUrl}
            crop={crop}
            zoom={zoom}
            aspect={MOBILE_VISIBLE_ASPECT_RATIO}
            minZoom={1}
            maxZoom={5}
            zoomSpeed={0.3}
            objectFit="contain"
            showGrid={false}
            restrictPosition
            initialCroppedAreaPixels={initialCroppedAreaPixels}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
            classes={{ containerClassName: 'rec-cropper-container' }}
          />
        ) : null}
      </div>
    </div>
  );
}

// ---- Editor modal --------------------------------------------------------

function SlideEditorModal({ slide, onClose, onSaved }) {
  const isNew = !slide?.id;
  // For editing: source-of-truth for the cropper is `image_url_original`.
  // For a fresh add: we set it after upload.
  const [imageUrlOriginal, setImageUrlOriginal] = useState(slide?.image_url_original || '');
  const [originalFilename, setOriginalFilename] = useState(slide?.original_filename || '');
  const [attributionText, setAttributionText] = useState(slide?.attribution_text ?? '');
  const [showAttribution, setShowAttribution] = useState(slide?.show_attribution ?? true);
  const [active, setActive] = useState(slide?.active ?? true);
  // Default crop_box for a fresh upload: largest centered rectangle of the
  // canonical aspect — actual value gets replaced as soon as the cropper
  // emits its first onCropComplete callback.
  const [cropBox, setCropBox] = useState(slide?.crop_box || null);
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
      setImageUrlOriginal(res.data.image_url_original);
      setOriginalFilename(res.data.original_filename);
      setCropBox(null); // cropper will emit a centered default
      toast.success(`Uploaded ${res.data.width}×${res.data.height}`);
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Upload failed');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const onSave = async () => {
    if (!imageUrlOriginal) { toast.error('Please upload an image first'); return; }
    if (!cropBox) { toast.error('Move the crop a little to set the framing'); return; }
    setSaving(true);
    try {
      let row;
      if (isNew) {
        const r = await axios.post('/admin/welcome-slides', {
          image_url_original: imageUrlOriginal,
          original_filename: originalFilename,
          attribution_text: attributionText || null,
          show_attribution: showAttribution,
          crop_box: cropBox,
          active,
        });
        row = r.data;
      } else {
        const r = await axios.patch(`/admin/welcome-slides/${slide.id}`, {
          attribution_text: attributionText || null,
          show_attribution: showAttribution,
          crop_box: cropBox,
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
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h3 className="text-base font-semibold text-slate-900">{isNew ? 'Add slide' : 'Edit slide'}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700" data-testid="welcome-editor-close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 flex gap-6 items-start">
          {/* LEFT: cropper */}
          <div>
            {imageUrlOriginal ? (
              <CropEditor
                imageUrl={toAbsoluteUrl(imageUrlOriginal)}
                initialCropBox={cropBox}
                onCropChange={setCropBox}
              />
            ) : (
              <div
                className="flex items-center justify-center rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 cursor-pointer hover:border-cyan-400 transition-colors"
                style={{ width: CROP_FRAME_W, height: CROP_FRAME_H }}
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
            {imageUrlOriginal ? (
              <button
                onClick={onPick}
                disabled={uploading}
                className="mt-3 px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors flex items-center justify-center gap-2"
                style={{ width: CROP_FRAME_W }}
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
            disabled={saving || !imageUrlOriginal}
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
      {/* Thumbnail uses the cropped JPEG directly — no client-side math. */}
      <div
        className="relative rounded-lg overflow-hidden bg-slate-900 flex-shrink-0"
        style={{ width: 64, aspectRatio: MOBILE_VISIBLE_ASPECT_RATIO }}
      >
        <img
          src={toAbsoluteUrl(slide.image_url)}
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
        />
        {!isActive ? <div className="absolute inset-0 bg-white/60 flex items-center justify-center text-[9px] font-semibold text-slate-700">HIDDEN</div> : null}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-slate-900 truncate">
          {slide.attribution_text || <span className="text-slate-400 italic">No attribution</span>}
        </div>
        <div className="text-xs text-slate-500 mt-0.5 truncate">{slide.original_filename || slide.image_url}</div>
        <div className="text-[11px] text-slate-400 mt-1">
          Cropped on save · {slide.show_attribution ? 'credit shown' : 'credit hidden'}
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
    <div className="flex flex-col gap-6" data-testid="welcome-carousel-section">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Welcome carousel</h2>
          <p className="text-sm text-slate-500 mt-1">
            Hi-res images shown on the mobile welcome screen. Cropping is server-side — the cropped JPEG is what mobile downloads, no client-side math involved.
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
        <div className="flex flex-col gap-2" data-testid="welcome-carousel-list">
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
