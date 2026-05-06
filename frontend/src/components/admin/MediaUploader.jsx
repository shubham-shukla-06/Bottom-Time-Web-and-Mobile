/**
 * MediaUploader — combined upload + crop/zoom/rotate modal for admin Site Content.
 *
 * Behaviour:
 * 1. User picks a file → we validate extension (hard block) and size.
 * 2. Images → open a react-easy-crop modal for crop + zoom + rotate. Confirm → POST the
 *    cropped blob to /admin/site-content/upload and return the final URL via onUploaded.
 * 3. Videos → skip the crop modal, upload directly (dimension warnings only).
 * 4. Dimension warnings (soft) are shown on the slot after upload if below recommended.
 */
import { useState, useCallback, useRef } from 'react';
import Cropper from 'react-easy-crop';
import axios from 'axios';
import { toast } from 'sonner';
import { Upload, X, RotateCw, ZoomIn, ZoomOut, Check, AlertTriangle, Loader2, Video as VideoIcon, Image as ImageIcon, Eye, Trash2, Crop as CropIcon } from 'lucide-react';

const IMAGE_EXT = ['jpg', 'jpeg', 'png', 'webp'];
const VIDEO_EXT = ['mp4', 'webm', 'mov'];

async function cropImageToBlob(src, cropPixels, rotation = 0, format = 'jpeg') {
  // Load source image
  const image = await new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
  const rad = (rotation * Math.PI) / 180;
  const sin = Math.abs(Math.sin(rad));
  const cos = Math.abs(Math.cos(rad));
  // Bounding box size of rotated image
  const rotW = Math.ceil(image.width * cos + image.height * sin);
  const rotH = Math.ceil(image.width * sin + image.height * cos);
  // Draw rotated image onto an intermediate canvas
  const rotCanvas = document.createElement('canvas');
  rotCanvas.width = rotW;
  rotCanvas.height = rotH;
  const rotCtx = rotCanvas.getContext('2d');
  if (!rotCtx) throw new Error('Canvas context unavailable');
  rotCtx.translate(rotW / 2, rotH / 2);
  rotCtx.rotate(rad);
  rotCtx.drawImage(image, -image.width / 2, -image.height / 2);
  // Now crop directly — react-easy-crop's cropPixels are relative to the rotated image.
  const out = document.createElement('canvas');
  out.width = Math.round(cropPixels.width);
  out.height = Math.round(cropPixels.height);
  const ctx = out.getContext('2d');
  if (!ctx) throw new Error('Canvas context unavailable');
  ctx.drawImage(
    rotCanvas,
    Math.round(cropPixels.x), Math.round(cropPixels.y),
    Math.round(cropPixels.width), Math.round(cropPixels.height),
    0, 0,
    out.width, out.height,
  );
  // Wrap toBlob in a Promise that REJECTS on null — older browsers and very large
  // canvases may pass null when the encoder can't allocate memory or hits a size
  // limit. Without this guard we'd silently upload an empty file.
  const blob = await new Promise((resolve) => out.toBlob(resolve, `image/${format}`, 0.92));
  if (!blob || blob.size === 0) {
    throw new Error('The image is too large to crop in your browser. Please pick a smaller file (under ~10 MB).');
  }
  return blob;
}

export default function MediaUploader({
  label,
  currentUrl,
  currentMediaType, // 'image' | 'video' | undefined
  slot,             // human label, e.g. "Hero", "About"
  aspect,           // number (w/h) — applied only to images
  acceptVideo = false,
  recommendedWidth,
  recommendedHeight,
  onUploaded,       // ({ url, width, height, kind }) => void
  onRemove,         // optional () => void — clears the slot
  testid,
}) {
  const fileRef = useRef(null);
  const pendingRef = useRef(null);
  const recropRef = useRef(null);
  const rotationRef = useRef(0);
  const [pending, setPending] = useState(null); // { src, ext, isVideo }
  const [cropArea, setCropArea] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [busy, setBusy] = useState(false);
  const [uploadPct, setUploadPct] = useState(0); // 0–100, only meaningful while busy
  const [dimWarn, setDimWarn] = useState(null); // string | null
  const [lightbox, setLightbox] = useState(false);
  const [recropSrc, setRecropSrc] = useState(null); // string | null — opens cropper on existing image
  const [lastUploadedSrc, setLastUploadedSrc] = useState(null); // keeps just-uploaded data URL in-memory for instant re-crop
  const [livePreview, setLivePreview] = useState(null); // dataURL of current crop — updated as user drags/zooms/rotates

  // Keep refs in sync so onCropComplete always reads latest values without re-creating the callback
  pendingRef.current = pending?.src || null;
  recropRef.current = recropSrc;
  rotationRef.current = rotation;

  const onCropComplete = useCallback(async (_, areaPixels) => {
    setCropArea(areaPixels);
    // Live preview: re-render the cropped area into a small canvas so the user can
    // see exactly what will be saved (Instagram-style "as you crop" preview).
    const src = pendingRef.current || recropRef.current;
    if (!src || !areaPixels?.width) return;
    try {
      const blob = await cropImageToBlob(src, areaPixels, rotationRef.current || 0, 'jpeg');
      if (!blob) return;
      const reader = new FileReader();
      reader.onload = () => setLivePreview(reader.result);
      reader.readAsDataURL(blob);
    } catch { /* ignore preview errors */ }
  }, []);

  const handlePick = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    const isImage = IMAGE_EXT.includes(ext);
    const isVideo = VIDEO_EXT.includes(ext);
    if (!isImage && !(acceptVideo && isVideo)) {
      toast.error(`Unsupported format .${ext}. Allowed: ${acceptVideo ? [...IMAGE_EXT, ...VIDEO_EXT].join(', ') : IMAGE_EXT.join(', ')}`);
      e.target.value = '';
      return;
    }
    const maxMB = isVideo ? 50 : 15;
    if (file.size > maxMB * 1024 * 1024) {
      toast.error(`File too large — max ${maxMB} MB`);
      e.target.value = '';
      return;
    }
    if (isVideo) {
      uploadBlob(file, ext, 'video');
    } else {
      const reader = new FileReader();
      reader.onload = () => {
        setPending({ src: reader.result, ext: ext === 'jpg' ? 'jpeg' : ext, isVideo: false });
        setLastUploadedSrc(reader.result); // keep in-memory copy for instant re-crop
      };
      reader.readAsDataURL(file);
      setZoom(1); setRotation(0); setCrop({ x: 0, y: 0 }); setLivePreview(null);
    }
    e.target.value = '';
  };

  const uploadBlob = async (blob, ext, kind) => {
    if (!blob || blob.size === 0) {
      toast.error('Upload failed: file is empty.');
      return;
    }
    setBusy(true);
    setUploadPct(0);
    try {
      const fd = new FormData();
      fd.append('file', blob, `upload.${ext}`);
      const res = await axios.post('/admin/site-content/upload', fd, {
        onUploadProgress: (evt) => {
          if (!evt.total) return;
          const pct = Math.round((evt.loaded * 100) / evt.total);
          setUploadPct(pct);
        },
      });
      const { url, width, height } = res.data;
      if (kind === 'image' && recommendedWidth && recommendedHeight && width && height) {
        if (width < recommendedWidth || height < recommendedHeight) {
          setDimWarn(`Uploaded ${width}×${height}. Recommended ≥ ${recommendedWidth}×${recommendedHeight} for best quality.`);
        } else {
          setDimWarn(null);
        }
      }
      onUploaded?.({ url, width, height, kind });
      toast.success(`${slot || 'Media'} uploaded`);
      setPending(null);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Upload failed');
    } finally {
      setBusy(false);
      setUploadPct(0);
    }
  };

  const closeCropper = () => {
    if (busy) return;
    setPending(null);
    setRecropSrc(null);
    setLivePreview(null);
    setCropArea(null);
  };

  const confirmCrop = async () => {
    const src = pending?.src || recropSrc;
    const ext = pending?.ext || 'jpeg';
    if (!src || !cropArea) return;
    setBusy(true);
    try {
      const blob = await cropImageToBlob(src, cropArea, rotation, ext === 'png' ? 'png' : 'jpeg');
      const outExt = ext === 'png' ? 'png' : 'jpeg';
      await uploadBlob(blob, outExt, 'image');
      // On success uploadBlob already clears pending; also clear the rest.
      setRecropSrc(null);
      setLivePreview(null);
      setCropArea(null);
    } catch (e) {
      // Surface the actual reason (e.g. "image too large to crop") instead of a generic message.
      toast.error(e?.message || 'Failed to process image');
      setBusy(false);
    }
  };

  const openRecrop = async () => {
    if (!currentUrl) return;
    // If we have an in-memory data URL from a recent upload, use it directly (no fetch, no CORS).
    if (lastUploadedSrc) {
      setRecropSrc(lastUploadedSrc);
      setZoom(1); setRotation(0); setCrop({ x: 0, y: 0 }); setLivePreview(null);
      return;
    }
    // Otherwise, fetch the current image as a data URL so the cropper can operate on it.
    try {
      const res = await fetch(currentUrl, { credentials: 'omit' });
      const blob = await res.blob();
      const reader = new FileReader();
      reader.onload = () => {
        setRecropSrc(reader.result);
        setZoom(1); setRotation(0); setCrop({ x: 0, y: 0 }); setLivePreview(null);
      };
      reader.readAsDataURL(blob);
    } catch {
      toast.error('Unable to load image for editing. Use Change to upload a new one.');
    }
  };

  const handleRemove = () => {
    if (!onRemove) return;
    if (!window.confirm(`Remove the ${slot || 'media'}? The slot will fall back to the default.`)) return;
    onRemove();
    setDimWarn(null);
  };

  const isVideoSlot = currentMediaType === 'video' && currentUrl;
  const isImageSlot = !!currentUrl && !isVideoSlot;
  const hasMedia = !!currentUrl;
  const cropSrc = pending?.src || recropSrc;

  return (
    <div className="space-y-2" data-testid={testid}>
      <div className="flex items-center justify-between">
        <label className="text-xs font-semibold text-slate-600">{label}</label>
        {recommendedWidth && recommendedHeight && (
          <span className="text-[10px] text-slate-400">Recommended {recommendedWidth}×{recommendedHeight}</span>
        )}
      </div>
      {/* Preview */}
      <div className="relative rounded-xl overflow-hidden border border-slate-200 bg-slate-50 aspect-[16/9]">
        {isVideoSlot ? (
          <video src={currentUrl} autoPlay muted loop playsInline className="w-full h-full object-cover" />
        ) : isImageSlot ? (
          <button type="button" onClick={() => setLightbox(true)} className="w-full h-full block cursor-zoom-in" data-testid={`${testid || slot}-zoom-btn`}>
            <img src={currentUrl} alt={label} className="w-full h-full object-cover" loading="lazy" />
          </button>
        ) : (
          <button type="button" onClick={() => fileRef.current?.click()} className="w-full h-full flex flex-col items-center justify-center text-slate-400 text-xs gap-1.5 hover:bg-slate-100/50 transition-colors" data-testid={`${testid || slot}-empty-upload`}>
            {acceptVideo ? <VideoIcon size={18} /> : <ImageIcon size={18} />}
            <span className="font-semibold">Click to upload</span>
            <span className="text-[10px]">Drop an image{acceptVideo ? ' or video' : ''} here</span>
          </button>
        )}
      </div>

      {/* Always-visible action bar */}
      {hasMedia && (
        <div className="flex items-center gap-1.5 text-[11px] font-semibold flex-wrap">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="inline-flex items-center gap-1 px-2.5 py-1 bg-cyan-500 hover:bg-cyan-400 text-white rounded-md transition-colors"
            data-testid={`${testid || slot}-change-btn`}
          >
            <Upload size={11} /> Change
          </button>
          {isImageSlot && (
            <button
              type="button"
              onClick={openRecrop}
              className="inline-flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-md transition-colors"
              data-testid={`${testid || slot}-recrop-btn`}
            >
              <CropIcon size={11} /> Crop
            </button>
          )}
          {isImageSlot && (
            <button
              type="button"
              onClick={() => setLightbox(true)}
              className="inline-flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-md transition-colors"
              data-testid={`${testid || slot}-view-btn`}
            >
              <Eye size={11} /> View
            </button>
          )}
          {onRemove && (
            <button
              type="button"
              onClick={handleRemove}
              className="inline-flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-red-50 text-red-500 hover:text-red-600 border border-slate-200 hover:border-red-200 rounded-md ml-auto transition-colors"
              data-testid={`${testid || slot}-remove-btn`}
            >
              <Trash2 size={11} /> Remove
            </button>
          )}
        </div>
      )}
      {!hasMedia && (
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 bg-cyan-500 hover:bg-cyan-400 text-white rounded-md transition-colors"
          data-testid={`${testid || slot}-upload-btn`}
        >
          <Upload size={11} /> Upload
        </button>
      )}
      {dimWarn && (
        <div className="flex items-start gap-1.5 text-[11px] text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-2.5 py-1.5">
          <AlertTriangle size={12} className="mt-0.5 flex-shrink-0" />
          <span>{dimWarn}</span>
        </div>
      )}
      {busy && !cropSrc && (
        <div className="space-y-1" data-testid={`${testid || slot}-upload-progress`}>
          <div className="flex items-center justify-between text-[10px] font-semibold text-slate-500">
            <span>Uploading…</span>
            <span data-testid={`${testid || slot}-upload-pct`}>{uploadPct}%</span>
          </div>
          <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-cyan-500 rounded-full transition-[width] duration-150 ease-out"
              style={{ width: `${uploadPct}%` }}
            />
          </div>
        </div>
      )}
      <input
        ref={fileRef}
        type="file"
        accept={acceptVideo ? [...IMAGE_EXT, ...VIDEO_EXT].map(e => `.${e}`).join(',') : IMAGE_EXT.map(e => `.${e}`).join(',')}
        onChange={handlePick}
        className="hidden"
        data-testid={`${testid || slot}-file-input`}
      />

      {/* Crop modal for images — Instagram-style: live preview on the right of the cropper */}
      {cropSrc && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/75 backdrop-blur-sm p-4" data-testid="media-crop-modal">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl flex flex-col overflow-hidden max-h-[92vh]">
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
              <div>
                <h2 className="text-sm font-bold text-slate-900">{pending ? `Crop ${slot || 'image'}` : `Re-crop ${slot || 'image'}`}</h2>
                <p className="text-[11px] text-slate-500">Drag to reposition · scroll or slider to zoom · rotate as needed</p>
              </div>
              <button type="button" onClick={closeCropper} className="text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-100" aria-label="Close" data-testid="media-crop-close">
                <X size={16} />
              </button>
            </div>

            <div className="flex flex-col lg:flex-row gap-3 p-4">
              {/* Cropper — fixed pixel height so react-easy-crop always renders */}
              <div className="relative bg-slate-900 rounded-xl overflow-hidden flex-1" style={{ height: 460, minHeight: 460 }}>
                <Cropper
                  image={cropSrc}
                  crop={crop}
                  zoom={zoom}
                  rotation={rotation}
                  aspect={aspect || 16 / 9}
                  onCropChange={setCrop}
                  onZoomChange={setZoom}
                  onRotationChange={setRotation}
                  onCropComplete={onCropComplete}
                  showGrid
                  objectFit="contain"
                  style={{ containerStyle: { background: '#0f172a' } }}
                />
              </div>

              {/* Live preview panel — Instagram-style "this is what will be saved" */}
              <div className="lg:w-[280px] flex-shrink-0 flex flex-col gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Live preview</span>
                <div
                  className="w-full rounded-xl overflow-hidden border border-slate-200 bg-slate-100"
                  style={{ aspectRatio: String(aspect || 16 / 9) }}
                >
                  {livePreview ? (
                    <img src={livePreview} alt="Live preview" className="w-full h-full object-cover" data-testid="media-crop-live-preview" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-[11px] text-slate-400">Initialising…</div>
                  )}
                </div>
                {recommendedWidth && recommendedHeight && (
                  <p className="text-[10px] text-slate-400">Exported at crop size · recommended ≥ {recommendedWidth}×{recommendedHeight}</p>
                )}
                <div className="mt-2 space-y-2">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setZoom(z => Math.max(1, +(z - 0.25).toFixed(2)))}
                      className="p-1 rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors disabled:opacity-40"
                      disabled={zoom <= 1}
                      aria-label="Zoom out"
                      data-testid="media-crop-zoom-out"
                    >
                      <ZoomOut size={14} />
                    </button>
                    <input
                      type="range" min={1} max={4} step={0.05}
                      value={zoom}
                      onChange={(e) => setZoom(Number(e.target.value))}
                      className="flex-1 accent-cyan-500"
                      aria-label="Zoom"
                      data-testid="media-crop-zoom"
                    />
                    <button
                      type="button"
                      onClick={() => setZoom(z => Math.min(4, +(z + 0.25).toFixed(2)))}
                      className="p-1 rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors disabled:opacity-40"
                      disabled={zoom >= 4}
                      aria-label="Zoom in"
                      data-testid="media-crop-zoom-in"
                    >
                      <ZoomIn size={14} />
                    </button>
                  </div>
                  <button type="button" onClick={() => setRotation(r => (r + 90) % 360)} className="w-full inline-flex items-center justify-center gap-1.5 text-xs font-semibold text-slate-700 border border-slate-200 rounded-lg px-2.5 py-1.5 hover:bg-slate-50" data-testid="media-crop-rotate">
                    <RotateCw size={13} /> Rotate 90°
                  </button>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 px-5 py-3 border-t border-slate-100 justify-end">
              {busy && (
                <div className="flex items-center gap-2 mr-auto" data-testid="media-crop-upload-progress">
                  <div className="h-1.5 w-32 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-cyan-500 rounded-full transition-[width] duration-150 ease-out"
                      style={{ width: `${uploadPct}%` }}
                    />
                  </div>
                  <span className="text-[11px] font-semibold text-slate-500" data-testid="media-crop-upload-pct">{uploadPct}%</span>
                </div>
              )}
              <button type="button" onClick={closeCropper} disabled={busy} className="px-3 py-1.5 text-xs font-semibold text-slate-600 rounded-lg hover:bg-slate-100 disabled:opacity-40" data-testid="media-crop-cancel">
                Cancel
              </button>
              <button type="button" onClick={confirmCrop} disabled={busy || !cropArea} className="px-4 py-1.5 text-xs font-bold text-white bg-cyan-500 rounded-lg hover:bg-cyan-400 inline-flex items-center gap-1.5 disabled:opacity-50" data-testid="media-crop-confirm">
                {busy ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                {busy ? 'Uploading…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox — full-size preview */}
      {lightbox && currentUrl && (
        <div className="fixed inset-0 z-[105] flex items-center justify-center bg-slate-900/85 backdrop-blur-sm p-6" onClick={() => setLightbox(false)} data-testid="media-lightbox">
          <button type="button" onClick={() => setLightbox(false)} className="absolute top-4 right-4 p-2 bg-white/10 hover:bg-white/20 text-white rounded-full" aria-label="Close" data-testid="media-lightbox-close">
            <X size={18} />
          </button>
          <img src={currentUrl} alt={label} className="max-w-[92vw] max-h-[88vh] object-contain rounded-lg shadow-2xl" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
}
