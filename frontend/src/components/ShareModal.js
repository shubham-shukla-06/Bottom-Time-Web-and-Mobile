import { useState, useEffect, useCallback, useMemo } from 'react';
import { X, Copy, Check, Plus, Trash2, ExternalLink, Mail, MessageCircle, Send, Twitter, Facebook, Linkedin, Smartphone, Instagram, Globe, Sparkles, ShieldCheck, MapPin, Image as ImageIcon, Waves, Download } from 'lucide-react';
import axios from 'axios';
import { toast } from 'sonner';
import { useListingShare } from '../hooks/useListingShare';


// Default platforms (operator picks any subset; can also add custom).
const KNOWN_PLATFORMS = {
  whatsapp:  { label: 'WhatsApp',    icon: MessageCircle, accent: 'bg-emerald-500',  open: (url, text) => `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}` },
  x:         { label: 'X / Twitter', icon: Twitter,       accent: 'bg-slate-800',    open: (url, text) => `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}` },
  facebook:  { label: 'Facebook',    icon: Facebook,      accent: 'bg-blue-600',     open: (url) => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}` },
  telegram:  { label: 'Telegram',    icon: Send,          accent: 'bg-sky-500',      open: (url, text) => `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}` },
  linkedin:  { label: 'LinkedIn',    icon: Linkedin,      accent: 'bg-sky-700',      open: (url) => `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}` },
  email:     { label: 'Email',       icon: Mail,          accent: 'bg-slate-600',    open: (url, text) => `mailto:?subject=${encodeURIComponent(text)}&body=${encodeURIComponent(`${text}\n\n${url}`)}` },
  sms:       { label: 'SMS',         icon: Smartphone,    accent: 'bg-violet-500',   open: (url, text) => `sms:?body=${encodeURIComponent(`${text} ${url}`)}` },
  instagram: { label: 'Instagram',   icon: Instagram,     accent: 'bg-pink-500',     open: null },
};

const PLATFORM_ORDER = ['whatsapp', 'instagram', 'x', 'facebook', 'telegram', 'linkedin', 'email', 'sms'];


function slugify(s) {
  return (s || '').toLowerCase().trim().replace(/[^a-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
}


function buildTrackedUrl(baseUrl, utm) {
  const u = new URL(baseUrl);
  if (utm.utm_source) u.searchParams.set('utm_source', utm.utm_source);
  if (utm.utm_medium) u.searchParams.set('utm_medium', utm.utm_medium);
  if (utm.utm_campaign) u.searchParams.set('utm_campaign', utm.utm_campaign);
  return u.toString();
}


/** Short, brandable, server-rendered redirect URL. Embeds OG meta for crawlers. */
function shortLink(slug) {
  if (!slug) return '';
  return `${window.location.origin}/api/r/${slug}`;
}


/** Pretty display form: "host.com/r/whatsapp_x4f2k" */
function compactShortUrl(slug) {
  if (!slug) return '';
  try {
    return `${window.location.host}/r/${slug}`;
  } catch {
    return slug;
  }
}


/** Themed share card preview (Glass/Dark/Light) — exported as PNG via html-to-image.
 *  Matches the Spotify-style preview-and-pick UX from DiveShareModal.
 *  Aspect ratio 4:5 (1080×1350 at 3× pixelRatio) — best for Instagram feed/Stories.
 */
function ThemedListingCard({ overlayRef, theme, parsed }) {
  return (
    <div
      ref={overlayRef}
      className="rounded-2xl relative overflow-hidden"
      style={{
        width: '320px',
        height: '400px',
        background: theme.bgFill,
        border: `1px solid ${theme.border}`,
      }}
      data-testid="themed-share-card"
    >
      {theme.showPhoto && parsed.photoUrl && (
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `url(${parsed.photoUrl})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        />
      )}
      {/* Bottom plate (frosted) */}
      <div
        className="absolute inset-x-0 bottom-0 px-5"
        style={{
          background: theme.plate,
          backdropFilter: theme.showPhoto ? 'blur(14px)' : 'none',
          WebkitBackdropFilter: theme.showPhoto ? 'blur(14px)' : 'none',
          paddingTop: '18px',
          paddingBottom: '18px',
          borderTop: theme.showPhoto ? `1px solid ${theme.border}` : 'none',
        }}
      >
        <div style={{ fontSize: '9px', fontWeight: 900, letterSpacing: '0.18em', color: theme.accent, marginBottom: '8px' }}>
          {parsed.tagline}
        </div>
        <div style={{ fontSize: '22px', fontWeight: 900, color: theme.text, lineHeight: 1.1, letterSpacing: '-0.025em', marginBottom: '6px' }}>
          {parsed.title}
        </div>
        {parsed.location && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', fontWeight: 500, color: theme.sub }}>
            <MapPin size={10} style={{ color: theme.accent }} />
            {parsed.location}
          </div>
        )}
      </div>
      {/* Top-right brand lockup */}
      <div className="absolute" style={{ top: '14px', right: '14px', display: 'flex', alignItems: 'center', gap: '5px' }}>
        <Waves size={18} style={{ color: theme.accent }} />
        <span style={{ fontSize: '13px', fontWeight: 700, color: theme.text, letterSpacing: '-0.02em' }}>Bottom Time</span>
        <span style={{ fontSize: '7px', fontWeight: 600, color: theme.sub, marginLeft: '-2px', alignSelf: 'flex-start', marginTop: '1px' }}>™</span>
      </div>
    </div>
  );
}


function ThemedShareSection({ listing }) {
  const { theme, setTheme, exporting, overlayRef, parsed, THEMES, downloadPNG } = useListingShare(listing);
  return (
    <div className="space-y-3" data-testid="themed-share-section">
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Style</span>
        {THEMES.map(t => (
          <button
            key={t.id}
            onClick={() => setTheme(t)}
            className={`px-3 py-1 rounded-full text-[10px] font-semibold transition-all ${
              theme.id === t.id
                ? 'bg-cyan-50 text-cyan-600 border border-cyan-200'
                : 'bg-slate-50 text-slate-500 border border-slate-200 hover:bg-slate-100'
            }`}
            data-testid={`theme-${t.id}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div
        className="relative rounded-2xl overflow-hidden flex justify-center py-4"
        style={theme.transparent ? { background: 'repeating-conic-gradient(#e2e8f0 0% 25%, #fff 0% 50%) 50% / 16px 16px' } : { background: '#f8fafc' }}
      >
        <ThemedListingCard overlayRef={overlayRef} theme={theme} parsed={parsed} />
      </div>
      <p className="text-[10px] text-slate-400 text-center">
        {theme.transparent
          ? 'Checkerboard = transparent. Overlay on your photos or stories.'
          : 'Save the image and share it directly to your stories or feed.'}
      </p>
      <button
        onClick={downloadPNG}
        disabled={exporting}
        className="w-full flex items-center justify-center gap-2 p-3 bg-cyan-500 hover:bg-cyan-600 text-white rounded-xl font-bold text-sm transition-colors disabled:opacity-50"
        data-testid="download-listing-png-btn"
      >
        <Download size={14} />
        {exporting ? 'Exporting…' : (theme.transparent ? 'Download PNG Overlay' : 'Save Image')}
      </button>
    </div>
  );
}


/** Buttons to validate (and force-refresh) the OG preview card on social platforms.
 *  The OG payload is identical across all presets of one listing, so we validate
 *  using the canonical diver short-link `/api/d/{listingId}`.
 */
function PreviewValidators({ listingId, compact = false }) {
  if (!listingId) return null;
  const shareUrl = `${window.location.origin}/api/d/${listingId}`;
  const enc = encodeURIComponent(shareUrl);
  const validators = [
    { key: 'linkedin', label: 'LinkedIn',  Icon: Linkedin, color: 'text-sky-700',     href: `https://www.linkedin.com/post-inspector/inspect/${enc}` },
    { key: 'facebook', label: 'Facebook',  Icon: Facebook, color: 'text-blue-600',    href: `https://developers.facebook.com/tools/debug/?q=${enc}` },
    { key: 'x',        label: 'X / Twitter', Icon: Twitter, color: 'text-slate-800', href: `https://cards-dev.twitter.com/validator` },
    { key: 'whatsapp', label: 'WhatsApp',  Icon: MessageCircle, color: 'text-emerald-500', href: `https://www.opengraph.xyz/url/${enc}` },
  ];
  return (
    <div className={compact ? '' : 'pt-2'} data-testid="preview-validators">
      <div className="flex items-center gap-2 mb-2.5">
        <span className="w-7 h-7 rounded-lg bg-emerald-50 border border-emerald-100 flex items-center justify-center">
          <ShieldCheck size={13} className="text-emerald-500" />
        </span>
        <div className="flex-1">
          <h3 className="text-[11px] font-bold text-slate-700 uppercase tracking-[0.14em]">Validate preview card</h3>
          <p className="text-[11px] text-slate-400 mt-0.5">Open each platform's official inspector to preview &amp; force-refresh the cached card.</p>
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {validators.map(v => (
          <a
            key={v.key}
            href={v.href}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex items-center gap-2 px-3 py-2.5 rounded-xl border border-slate-100 hover:border-cyan-300 hover:bg-cyan-50/30 transition-all"
            title={`Open ${v.label} preview validator`}
            data-testid={`validate-${v.key}`}
          >
            <span className={`flex-shrink-0 ${v.color}`}><v.Icon size={14} /></span>
            <span className="text-[12px] font-semibold text-slate-700 group-hover:text-cyan-700 truncate">{v.label}</span>
            <ExternalLink size={11} className="ml-auto text-slate-300 group-hover:text-cyan-400 flex-shrink-0" />
          </a>
        ))}
      </div>
    </div>
  );
}


// ─── DIVER VIEW ─────────────────────────────────────────────────────
function DiverShareView({ listing, listingId, shareText }) {
  const [copied, setCopied] = useState(false);
  const url = useMemo(() => `${window.location.origin}/api/d/${listingId}`, [listingId]);

  const open = (key) => {
    const p = KNOWN_PLATFORMS[key];
    if (!p?.open) return;
    window.open(p.open(url, shareText), '_blank', 'noopener,noreferrer');
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success('Link copied');
      setTimeout(() => setCopied(false), 2200);
    } catch { toast.error('Could not copy'); }
  };

  return (
    <div className="px-7 py-6 space-y-5">
      <ThemedShareSection listing={listing} />
      <div className="border-t border-slate-100 pt-5 grid grid-cols-3 sm:grid-cols-4 gap-2.5">
        {PLATFORM_ORDER.filter(k => KNOWN_PLATFORMS[k].open).map(key => {
          const p = KNOWN_PLATFORMS[key];
          return (
            <button key={key} onClick={() => open(key)}
              className="group flex flex-col items-center justify-center gap-2 px-3 py-4 rounded-2xl border border-slate-100 hover:border-cyan-300 hover:bg-cyan-50/40 transition-all"
              data-testid={`diver-share-${key}`}>
              <span className={`w-9 h-9 rounded-full ${p.accent} flex items-center justify-center text-white group-hover:scale-110 transition-transform`}>
                <p.icon size={16} />
              </span>
              <span className="text-[11px] font-semibold text-slate-700">{p.label}</span>
            </button>
          );
        })}
        <button onClick={copy} className="group flex flex-col items-center justify-center gap-2 px-3 py-4 rounded-2xl border border-slate-100 hover:border-cyan-300 hover:bg-cyan-50/40 transition-all" data-testid="diver-share-copy">
          <span className="w-9 h-9 rounded-full bg-slate-100 group-hover:bg-cyan-400 flex items-center justify-center text-slate-700 group-hover:text-white transition-colors">
            {copied ? <Check size={16} /> : <Copy size={16} />}
          </span>
          <span className="text-[11px] font-semibold text-slate-700">{copied ? 'Copied' : 'Copy link'}</span>
        </button>
      </div>
      <div className="border-t border-slate-100 pt-5">
        <PreviewValidators listingId={listingId} compact />
      </div>
    </div>
  );
}


// ─── OPERATOR — one row per platform ────────────────────────────────
function PlatformRow({
  platformKey, platform, label, isActive, preset, baseUrl, shareText,
  onActivate, onCopy, onOpen, onRemove, copiedNow, isPending, isCustom,
}) {
  const Icon = platform?.icon || Globe;
  const accent = platform?.accent || 'bg-slate-500';
  const slug = preset?.slug;
  const displayUrl = slug ? compactShortUrl(slug) : '';

  return (
    <div
      className={`relative rounded-2xl border transition-all overflow-hidden ${
        isActive
          ? 'bg-white border-cyan-300 shadow-[0_4px_20px_-8px_rgba(34,211,238,0.4)]'
          : 'bg-slate-50/60 border-transparent hover:bg-white hover:border-slate-200'
      }`}
      data-testid={`platform-row-${platformKey}`}
    >
      {isActive && <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-cyan-300 to-cyan-500" />}
      <div className="flex items-center gap-3 px-4 py-3">
        <span
          className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-all ${
            isActive ? `${accent} text-white` : 'bg-white border border-slate-200 text-slate-400'
          }`}
        >
          <Icon size={15} />
        </span>
        <div className="flex-1 min-w-0">
          <div className={`text-sm font-bold transition-colors ${isActive ? 'text-slate-800' : 'text-slate-500'}`}>
            {label}
            {isCustom && isActive && <span className="ml-1.5 text-[10px] font-semibold text-cyan-500 uppercase tracking-wider">Custom</span>}
          </div>
          {isActive ? (
            <div className="text-[11px] font-mono text-slate-500 truncate mt-0.5" title={displayUrl}>{displayUrl}</div>
          ) : (
            <div className="text-[11px] text-slate-400 mt-0.5">No link yet</div>
          )}
        </div>
        {isActive ? (
          <div className="flex items-center gap-0.5 flex-shrink-0">
            <button onClick={onCopy} className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-500 transition-colors" title="Copy link" data-testid={`copy-${platformKey}`}>
              {copiedNow ? <Check size={13} className="text-emerald-500" /> : <Copy size={13} />}
            </button>
            <button
              onClick={onOpen}
              className="w-8 h-8 rounded-lg hover:bg-cyan-50 flex items-center justify-center text-cyan-500 transition-colors"
              title={platform?.open ? 'Open share dialog' : `Copy & paste — ${label} has no web share`}
              data-testid={`open-${platformKey}`}
            >
              <ExternalLink size={13} />
            </button>
            <button onClick={onRemove} className="w-8 h-8 rounded-lg hover:bg-red-50 flex items-center justify-center text-slate-400 hover:text-red-500 transition-colors" title="Remove" data-testid={`remove-${platformKey}`}>
              <Trash2 size={13} />
            </button>
          </div>
        ) : (
          <button
            onClick={onActivate}
            disabled={isPending}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-[11px] font-bold border border-slate-200 hover:border-cyan-400 hover:text-cyan-500 hover:bg-white transition-all flex-shrink-0 ${isPending ? 'opacity-50' : ''}`}
            data-testid={`activate-${platformKey}`}
          >
            <Plus size={11} /> {isPending ? 'Adding…' : 'Activate'}
          </button>
        )}
      </div>
    </div>
  );
}


function OperatorShareView({ listing, baseUrl, shareText }) {
  const [presets, setPresets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(null);
  const [customName, setCustomName] = useState('');
  const [copiedId, setCopiedId] = useState(null);

  const fetchPresets = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`/listings/${listing.id}/share-presets`);
      setPresets(res.data.presets || []);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [listing?.id]);

  useEffect(() => { fetchPresets(); }, [fetchPresets]);

  const presetByKey = useMemo(() => Object.fromEntries(presets.map(p => [p.utm_source, p])), [presets]);
  const customPresets = useMemo(() => presets.filter(p => !KNOWN_PLATFORMS[p.utm_source]), [presets]);
  const activeCount = presets.length;

  const activate = async (key, label) => {
    if (pending) return;
    setPending(key);
    try {
      const res = await axios.post(`/listings/${listing.id}/share-presets`, {
        channel: KNOWN_PLATFORMS[key] ? key : 'custom',
        label: label || KNOWN_PLATFORMS[key]?.label || key,
        utm_source: key,
        utm_medium: 'share',
        utm_campaign: '',
      });
      setPresets(prev => [res.data, ...prev]);
      toast.success(`${label || KNOWN_PLATFORMS[key]?.label || key} link generated`);
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Could not generate link');
    } finally { setPending(null); }
  };

  const addCustom = async () => {
    const slug = slugify(customName);
    if (!slug) { toast.error('Please enter a platform name'); return; }
    if (presetByKey[slug]) { toast.error('Already added'); return; }
    await activate(slug, customName.trim());
    setCustomName('');
  };

  const remove = async (id) => {
    try {
      await axios.delete(`/share-presets/${id}`);
      setPresets(prev => prev.filter(p => p.id !== id));
    } catch { toast.error('Failed to remove'); }
  };

  const copyLink = async (preset) => {
    const url = preset.slug ? shortLink(preset.slug) : buildTrackedUrl(baseUrl, preset);
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(preset.id);
      toast.success('Link copied');
      setTimeout(() => setCopiedId(null), 2200);
    } catch { toast.error('Could not copy'); }
  };

  const openIntent = (preset) => {
    const platform = KNOWN_PLATFORMS[preset.utm_source];
    // Share the SHORT link — crawlers (WhatsApp, Twitter, etc.) hit it,
    // get proper OG meta, and unfurl with our PNG card.
    const url = preset.slug ? shortLink(preset.slug) : buildTrackedUrl(baseUrl, preset);
    if (platform?.open) {
      window.open(platform.open(url, shareText), '_blank', 'noopener,noreferrer');
    } else {
      navigator.clipboard?.writeText(url).then(() => {
        setCopiedId(preset.id);
        setTimeout(() => setCopiedId(null), 2200);
        toast.info(`${preset.label} doesn't support pre-filled posts. Link copied — paste into your post, bio or story.`);
      }).catch(() => toast.error('Could not copy link'));
    }
  };

  return (
    <div className="px-7 py-6 space-y-7">
      <ThemedShareSection listing={listing} />
      {/* Hero explainer */}
      <div className="relative rounded-2xl bg-gradient-to-br from-cyan-50 via-white to-violet-50 border border-cyan-100/70 px-5 py-4 overflow-hidden">
        <div className="absolute -right-4 -top-4 w-24 h-24 rounded-full bg-cyan-200/30 blur-2xl" />
        <div className="absolute -left-4 -bottom-4 w-20 h-20 rounded-full bg-violet-200/30 blur-2xl" />
        <div className="relative flex items-start gap-3">
          <span className="w-8 h-8 rounded-xl bg-white shadow-sm border border-cyan-100 flex items-center justify-center flex-shrink-0">
            <Sparkles size={14} className="text-cyan-400" />
          </span>
          <div>
            <p className="text-sm font-bold text-slate-800 leading-snug">One unique link per platform</p>
            <p className="text-xs text-slate-600 leading-relaxed mt-0.5">Activate a platform below to generate its own tracked link. Each link tells us where divers came from — see clicks &amp; bookings split by platform in <span className="font-semibold text-slate-700">Share Tracking</span>.</p>
          </div>
        </div>
      </div>

      {/* Stats / progress chip */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-[0.14em]">Platforms</h3>
          <p className="text-[11px] text-slate-400 mt-0.5">Click <span className="font-semibold text-slate-600">Activate</span> to generate that platform's tracked link</p>
        </div>
        <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${activeCount > 0 ? 'bg-cyan-50 text-cyan-600' : 'bg-slate-100 text-slate-500'}`}>
          {activeCount} active
        </span>
      </div>

      {/* Unified table — all known platforms + custom presets */}
      <div className="space-y-2" data-testid="platforms-table">
        {loading && <div className="h-12 rounded-2xl bg-slate-50 animate-pulse" />}
        {!loading && PLATFORM_ORDER.map(key => {
          const platform = KNOWN_PLATFORMS[key];
          const preset = presetByKey[key];
          return (
            <PlatformRow
              key={key}
              platformKey={key}
              platform={platform}
              label={platform.label}
              isActive={!!preset}
              preset={preset}
              baseUrl={baseUrl}
              shareText={shareText}
              isPending={pending === key}
              copiedNow={copiedId && preset && copiedId === preset.id}
              onActivate={() => activate(key)}
              onCopy={() => copyLink(preset)}
              onOpen={() => openIntent(preset)}
              onRemove={() => remove(preset.id)}
            />
          );
        })}
        {!loading && customPresets.map(p => (
          <PlatformRow
            key={p.id}
            platformKey={p.utm_source}
            platform={null}
            label={p.label}
            isActive
            preset={p}
            baseUrl={baseUrl}
            shareText={shareText}
            isCustom
            copiedNow={copiedId === p.id}
            onActivate={() => {}}
            onCopy={() => copyLink(p)}
            onOpen={() => openIntent(p)}
            onRemove={() => remove(p.id)}
          />
        ))}
      </div>

      {/* Custom platform input — looks like another row */}
      <div>
        <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-[0.14em] mb-2.5">Add a custom platform</h3>
        <div className="flex items-center gap-2 rounded-2xl border border-slate-200 hover:border-cyan-300 transition-colors px-2 py-2 focus-within:border-cyan-400 focus-within:ring-2 focus-within:ring-cyan-100">
          <span className="w-9 h-9 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-400 flex-shrink-0">
            <Globe size={15} />
          </span>
          <input
            type="text"
            value={customName}
            onChange={e => setCustomName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addCustom(); }}
            placeholder="e.g. Newsletter, MyDiveApp, PrintFlyer"
            className="flex-1 bg-transparent text-sm text-slate-700 placeholder-slate-400 focus:outline-none px-1"
            maxLength={40}
            data-testid="custom-platform-input"
          />
          <button
            onClick={addCustom}
            disabled={!customName.trim() || !!pending}
            className="flex items-center gap-1 px-4 py-2 rounded-xl bg-cyan-400 hover:bg-cyan-500 text-white text-xs font-bold disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            data-testid="add-custom-platform-btn"
          >
            <Plus size={12} /> Generate link
          </button>
        </div>
      </div>

      {/* Validate preview card on social platforms */}
      <div className="border-t border-slate-100 pt-5">
        <PreviewValidators listingId={listing.id} compact />
      </div>
    </div>
  );
}


// ─── ROOT ───────────────────────────────────────────────────────────
export default function ShareModal({ open, onClose, listing, isOperator = false }) {
  const baseUrl = useMemo(() => listing?.id ? `${window.location.origin}/listing/${listing.id}` : '', [listing?.id]);
  const shareText = useMemo(() => listing ? `Check out "${listing.name || listing.title}" on Bottom Time` : '', [listing]);

  if (!open || !listing) return null;

  return (
    <div className="fixed inset-0 z-[60] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto" onClick={onClose} data-testid="share-modal">
      <div className="bg-white rounded-3xl w-full max-w-xl shadow-[0_30px_60px_-15px_rgba(15,23,42,0.3)] max-h-[90vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-7 py-5 border-b border-slate-100 flex items-start justify-between flex-shrink-0">
          <div className="min-w-0 pr-4">
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">{isOperator ? 'Share & track' : 'Share this listing'}</h2>
            <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{listing.name || listing.title}</p>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-700 transition-colors flex-shrink-0" data-testid="share-close-btn"><X size={16} /></button>
        </div>
        <div className="overflow-y-auto">
          {isOperator
            ? <OperatorShareView listing={listing} baseUrl={baseUrl} shareText={shareText} />
            : <DiverShareView listing={listing} listingId={listing.id} shareText={shareText} />
          }
        </div>
      </div>
    </div>
  );
}
