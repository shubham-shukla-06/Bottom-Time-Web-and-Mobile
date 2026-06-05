import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Upload, Download, Image as ImageIcon, CheckCircle, AlertTriangle, Loader2 } from 'lucide-react';

// Phase 5-A — Branding & App Icon admin section.
// Locked behavior — see /app/memory/BRANDING_ASSETS_LOCKED.md.

export default function BrandingSection() {
  const [info, setInfo] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [validating, setValidating] = useState(false);
  const [cacheBust, setCacheBust] = useState(Date.now());
  const fileRef = useRef(null);

  const fetchInfo = async () => {
    try {
      const res = await axios.get('/admin/branding/app-icon/info');
      setInfo(res.data);
    } catch (e) {
      toast.error('Could not load branding info');
    }
  };

  useEffect(() => { fetchInfo(); }, []);

  const validateAndUpload = async (file) => {
    if (!file) return;
    if (!file.type.includes('png')) {
      toast.error('Only PNG files are accepted'); return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error('File is too large (max 10 MB)'); return;
    }
    setValidating(true);
    try {
      // Client-side dimension check before sending
      const dataUrl = await new Promise((resolve, reject) => {
        const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = reject; r.readAsDataURL(file);
      });
      const img = await new Promise((resolve, reject) => {
        const i = new Image(); i.onload = () => resolve(i); i.onerror = reject; i.src = dataUrl;
      });
      if (img.width !== img.height) {
        toast.error(`Icon must be square. Got ${img.width}×${img.height}.`); setValidating(false); return;
      }
      if (img.width < 1024) {
        toast.error(`Icon must be at least 1024×1024. Got ${img.width}×${img.width}.`); setValidating(false); return;
      }
    } catch (e) {
      toast.error('Could not decode PNG locally'); setValidating(false); return;
    }
    setValidating(false);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await axios.post('/admin/branding/app-icon', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      toast.success(`Regenerated ${res.data.regenerated_sizes.length} sizes + favicon.ico`);
      setCacheBust(Date.now());
      await fetchInfo();
    } catch (e) {
      const msg = e.response?.data?.detail || e.message;
      toast.error(`Upload failed: ${msg}`);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const onFile = (e) => validateAndUpload(e.target.files?.[0]);

  const onDrop = (e) => {
    e.preventDefault();
    validateAndUpload(e.dataTransfer.files?.[0]);
  };

  const onDownloadZip = () => {
    // Triggered as a normal navigation so axios doesn't try to parse the binary
    window.location.href = '/api/branding/app-icon.zip';
  };

  const iconUrl = (size) => `/api/branding/app-icon?size=${size}&_=${cacheBust}`;

  return (
    <div className="space-y-6" data-testid="branding-section">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">Branding & App Icon</h2>
          <p className="text-sm text-slate-500 mt-1 max-w-2xl">
            Master app store icon. Upload a square PNG (1024×1024 or larger) and the platform will regenerate every derivative size needed for iOS, Android, the PWA manifest, and browser favicons.
          </p>
        </div>
        <button onClick={onDownloadZip} className="flex items-center gap-2 px-3 py-2 text-xs font-semibold border border-slate-200 rounded-lg hover:bg-slate-50" data-testid="branding-download-zip">
          <Download size={14} /> App Store submission .zip
        </button>
      </header>

      {/* Current icon preview */}
      <div className="bg-white rounded-2xl border border-slate-100 p-6">
        <h3 className="text-sm font-bold text-slate-900 mb-4">Current icon</h3>
        <div className="flex flex-wrap items-end gap-8" data-testid="branding-previews">
          <div className="flex flex-col items-center gap-2">
            <img src={iconUrl(100)} alt="App icon 100" className="rounded-2xl shadow-sm" width={100} height={100} data-testid="preview-100" />
            <span className="text-[10px] uppercase tracking-wider font-bold text-slate-400">100 × 100</span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <img src={iconUrl(512)} alt="App icon 512" className="rounded-2xl shadow-sm" width={200} height={200} data-testid="preview-512" />
            <span className="text-[10px] uppercase tracking-wider font-bold text-slate-400">512 × 512 (displayed at 200)</span>
          </div>
          <div className="ml-auto text-right">
            <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400">Last updated</p>
            <p className="text-sm font-semibold text-slate-700 mt-0.5">{info?.updated_at ? new Date(info.updated_at).toLocaleString() : '—'}</p>
            <p className="text-[11px] text-slate-500 mt-0.5">{info?.uploaded_by || 'Master image (initial)'}</p>
          </div>
        </div>
      </div>

      {/* Available sizes */}
      <div className="bg-white rounded-2xl border border-slate-100 p-6">
        <h3 className="text-sm font-bold text-slate-900 mb-4">Available sizes</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3" data-testid="branding-size-grid">
          {(info?.sizes || []).map((s) => (
            <a key={s.size} href={`${s.url}&_=${cacheBust}`} download={`app_icon_${s.size}.png`}
              className="flex items-center gap-3 p-3 rounded-xl border border-slate-100 hover:border-cyan-200 hover:bg-cyan-50/30 transition-colors group"
              data-testid={`branding-size-${s.size}`}>
              <img src={iconUrl(s.size)} alt={`${s.size}x${s.size}`} className="w-10 h-10 rounded-lg" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-slate-900">{s.size} × {s.size}</p>
                <p className="text-[10px] text-slate-400">{(s.bytes / 1024).toFixed(1)} KB</p>
              </div>
              <Download size={14} className="text-slate-300 group-hover:text-cyan-400" />
            </a>
          ))}
          {info?.favicon_ico_exists && (
            <a href={`/api/branding/favicon.ico?_=${cacheBust}`} download="favicon.ico"
              className="flex items-center gap-3 p-3 rounded-xl border border-slate-100 hover:border-cyan-200 hover:bg-cyan-50/30 transition-colors group"
              data-testid="branding-favicon-link">
              <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center"><ImageIcon size={16} className="text-slate-500" /></div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-slate-900">favicon.ico</p>
                <p className="text-[10px] text-slate-400">Multi-size 16/32/48/64</p>
              </div>
              <Download size={14} className="text-slate-300 group-hover:text-cyan-400" />
            </a>
          )}
        </div>
      </div>

      {/* Upload new */}
      <div className="bg-white rounded-2xl border border-slate-100 p-6">
        <h3 className="text-sm font-bold text-slate-900 mb-1">Upload new icon</h3>
        <p className="text-xs text-slate-500 mb-4">PNG only. Must be square, at least 1024×1024. All derivative sizes regenerate automatically.</p>
        <div onDragOver={(e) => e.preventDefault()} onDrop={onDrop}
          className="border-2 border-dashed border-slate-200 rounded-2xl p-8 text-center hover:border-cyan-300 transition-colors"
          data-testid="branding-upload-zone">
          {uploading ? (
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="animate-spin text-cyan-500" size={28} />
              <p className="text-sm font-semibold text-slate-700">Regenerating all derivatives…</p>
            </div>
          ) : validating ? (
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="animate-spin text-slate-400" size={20} />
              <p className="text-xs text-slate-500">Validating dimensions…</p>
            </div>
          ) : (
            <>
              <Upload className="mx-auto text-slate-300 mb-3" size={32} />
              <p className="text-sm font-semibold text-slate-700">Drop PNG here</p>
              <p className="text-[11px] text-slate-400 mt-1">or</p>
              <button onClick={() => fileRef.current?.click()} className="mt-3 px-4 py-2 bg-cyan-500 text-white rounded-lg text-xs font-semibold hover:bg-cyan-600" data-testid="branding-upload-btn">
                Choose file
              </button>
              <input ref={fileRef} type="file" accept="image/png" className="hidden" onChange={onFile} data-testid="branding-file-input" />
            </>
          )}
        </div>
      </div>

      {/* Warning card */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3" data-testid="branding-warning">
        <AlertTriangle className="text-amber-600 flex-shrink-0 mt-0.5" size={16} />
        <div className="text-xs text-amber-900 leading-relaxed">
          <p className="font-semibold mb-1">Super-admin only · destructive</p>
          <p>Uploading regenerates every derivative + the favicon. Browsers and the PWA manifest cache app icons aggressively — users may need a hard refresh to see the new icon. Mobile app icon changes ship with the next native build.</p>
        </div>
      </div>

      <p className="text-[11px] text-slate-400 text-center pt-2 flex items-center justify-center gap-1.5" data-testid="branding-lock-note">
        <CheckCircle size={11} /> Locked by /app/memory/BRANDING_ASSETS_LOCKED.md
      </p>
    </div>
  );
}
