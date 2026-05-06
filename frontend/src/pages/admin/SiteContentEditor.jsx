/**
 * SiteContentEditor — CMS-style editor for the landing page.
 *
 * Layout: Left sidebar (fields by section) | Right pane (live iframe preview of the landing page).
 *
 * Flow:
 *   - Load { published, draft, has_unpublished_changes } from GET /admin/site-content.
 *   - Every field edit → debounced save to PUT /admin/site-content/draft.
 *   - Iframe points at the real landing page with ?access={gate}&preview_draft=1.
 *     LandingPage listens for a `cms-preview` postMessage and re-renders with draft content.
 *   - Edit-mode vs Preview-mode toggle only changes whether the sidebar is visible.
 *   - Publish button promotes draft → published via POST /admin/site-content/publish.
 *   - Discard button deletes the draft via POST /admin/site-content/discard-draft.
 */
import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Eye, Pencil, Undo2, Monitor, Smartphone, RefreshCw, CheckCircle2, AlertCircle, X, Eye as EyeIcon } from 'lucide-react';
import MediaUploader from '../../components/admin/MediaUploader';
import SchedulePublishMenu from '../../components/admin/SchedulePublishMenu';
import HistoryPanel from '../../components/admin/HistoryPanel';

const SITE_ACCESS_KEY = 'bottomtime2026';

export default function SiteContentEditor() {
  const [published, setPublished] = useState(null);
  const [draft, setDraft] = useState(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [publishedAt, setPublishedAt] = useState(null);
  const [scheduledAt, setScheduledAt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState('edit'); // 'edit' | 'preview'
  const [viewport, setViewport] = useState('desktop'); // 'desktop' | 'mobile'
  const [publishing, setPublishing] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const [saving, setSaving] = useState(false);
  const [previewingVersion, setPreviewingVersion] = useState(null); // { id, version, content, meta }
  const iframeRef = useRef(null);
  const iframeReadyRef = useRef(false);
  const pendingRef = useRef(null);
  const saveTimerRef = useRef(null);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadContent(); }, []);

  const loadContent = async () => {
    setLoading(true);
    try {
      const { data } = await axios.get('/admin/site-content');
      setPublished(data.published);
      setDraft(data.draft);
      setHasChanges(data.has_unpublished_changes);
      setPublishedAt(data.published_updated_at);
      setScheduledAt(data.scheduled_publish_at || null);
    } catch (e) {
      toast.error('Failed to load site content');
    } finally {
      setLoading(false);
    }
  };

  // Push current draft into the iframe whenever draft changes and iframe is ready.
  // While previewing a historical version, push that version instead.
  const pushPreview = useCallback((content) => {
    const f = iframeRef.current;
    if (!f || !f.contentWindow) { pendingRef.current = content; return; }
    if (!iframeReadyRef.current) { pendingRef.current = content; return; }
    f.contentWindow.postMessage({ type: 'cms-preview', content }, '*');
  }, []);

  useEffect(() => {
    const target = previewingVersion?.content || draft;
    if (!target) return;
    pushPreview(target);
  }, [draft, previewingVersion, pushPreview]);

  // Listen for iframe "ready" signal
  useEffect(() => {
    const onMsg = (e) => {
      if (e?.data?.type === 'cms-preview-ready') {
        iframeReadyRef.current = true;
        const target = previewingVersion?.content || pendingRef.current || draft;
        if (target) pushPreview(target);
        pendingRef.current = null;
      }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [draft, previewingVersion, pushPreview]);

  // Debounced autosave whenever draft changes
  const scheduleSave = useCallback((next) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      setSaving(true);
      try {
        await axios.put('/admin/site-content/draft', next);
        setSavedAt(new Date());
        // Recompute hasChanges
        setHasChanges(JSON.stringify(stripMeta(next)) !== JSON.stringify(stripMeta(published || {})));
      } catch (e) {
        toast.error('Autosave failed');
      } finally {
        setSaving(false);
      }
    }, 600);
  }, [published]);

  const setField = (key, value) => {
    setDraft(prev => {
      const next = { ...(prev || {}), [key]: value };
      scheduleSave(next);
      return next;
    });
  };

  const setSectionImage = (slot, url) => {
    setDraft(prev => {
      const next = { ...(prev || {}), section_images: { ...(prev?.section_images || {}), [slot]: url } };
      scheduleSave(next);
      return next;
    });
  };

  const handlePublish = async () => {
    if (!hasChanges) return;
    setPublishing(true);
    try {
      await axios.post('/admin/site-content/publish');
      toast.success('Published — changes are now live');
      await loadContent();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Publish failed');
    } finally {
      setPublishing(false);
    }
  };

  const handleSchedule = async ({ publish_at }) => {
    await axios.post('/admin/site-content/schedule', { publish_at });
    toast.success('Scheduled');
    await loadContent();
  };

  const handleCancelSchedule = async () => {
    try {
      await axios.post('/admin/site-content/cancel-schedule');
      toast.success('Schedule cancelled');
      await loadContent();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to cancel schedule');
    }
  };

  const handleDiscard = async () => {
    if (!window.confirm('Discard all unpublished changes? This cannot be undone and any pending schedule will be cancelled.')) return;
    setDiscarding(true);
    try {
      await axios.post('/admin/site-content/discard-draft');
      toast.success('Draft discarded');
      await loadContent();
    } catch (e) {
      toast.error('Discard failed');
    } finally {
      setDiscarding(false);
    }
  };

  const previewUrl = useMemo(() => {
    const origin = window.location.origin;
    // Use /home (explicit LandingPage route) to avoid getHomeRedirect redirecting logged-in users away.
    return `${origin}/home?access=${SITE_ACCESS_KEY}&preview_draft=1`;
  }, []);

  if (loading) return <div className="text-center py-20"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-cyan-400 mx-auto" /></div>;

  const d = draft || {};
  const sectionImages = d.section_images || {};
  const savedLabel = saving ? 'Saving…' : savedAt ? `Saved ${timeAgo(savedAt)}` : '';

  return (
    <div className="flex flex-col h-[calc(100vh-200px)] min-h-[700px] bg-white rounded-2xl border border-slate-100 overflow-hidden" data-testid="site-content-editor">
      {/* Top toolbar */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-slate-100 bg-slate-50/50 flex-wrap">
        <h2 className="text-sm font-bold text-slate-900">Landing Page</h2>

        <div className="flex items-center gap-1 bg-white rounded-lg p-0.5 border border-slate-200">
          <button onClick={() => setMode('edit')} className={`px-2.5 py-1 rounded text-[11px] font-semibold inline-flex items-center gap-1 transition-colors ${mode === 'edit' ? 'bg-cyan-500 text-white' : 'text-slate-500 hover:bg-slate-50'}`} data-testid="mode-edit-btn">
            <Pencil size={11} /> Edit
          </button>
          <button onClick={() => setMode('preview')} className={`px-2.5 py-1 rounded text-[11px] font-semibold inline-flex items-center gap-1 transition-colors ${mode === 'preview' ? 'bg-cyan-500 text-white' : 'text-slate-500 hover:bg-slate-50'}`} data-testid="mode-preview-btn">
            <Eye size={11} /> Preview
          </button>
        </div>

        <div className="flex items-center gap-1 bg-white rounded-lg p-0.5 border border-slate-200">
          <button onClick={() => setViewport('desktop')} className={`px-2 py-1 rounded text-[11px] inline-flex items-center gap-1 transition-colors ${viewport === 'desktop' ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-50'}`} data-testid="viewport-desktop-btn">
            <Monitor size={11} /> Desktop
          </button>
          <button onClick={() => setViewport('mobile')} className={`px-2 py-1 rounded text-[11px] inline-flex items-center gap-1 transition-colors ${viewport === 'mobile' ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-50'}`} data-testid="viewport-mobile-btn">
            <Smartphone size={11} /> Mobile
          </button>
        </div>

        <button type="button" onClick={() => { iframeReadyRef.current = false; if (iframeRef.current) iframeRef.current.src = previewUrl; }} title="Refresh preview" className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100" data-testid="preview-refresh-btn">
          <RefreshCw size={12} />
        </button>

        <div className="flex-1" />

        {/* Status pill */}
        <div className="flex items-center gap-1.5 text-[11px] font-semibold">
          {hasChanges ? (
            <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full border border-amber-100" data-testid="status-unpublished">
              <AlertCircle size={10} /> Unpublished changes
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full border border-emerald-100" data-testid="status-published">
              <CheckCircle2 size={10} /> Published
            </span>
          )}
          {savedLabel && <span className="text-slate-400 font-medium">· {savedLabel}</span>}
        </div>

        <button type="button" onClick={handleDiscard} disabled={!hasChanges || discarding || publishing} className="text-xs text-slate-500 hover:text-slate-800 inline-flex items-center gap-1 disabled:opacity-30" data-testid="discard-btn">
          <Undo2 size={12} /> Discard
        </button>
        <SchedulePublishMenu
          hasChanges={hasChanges}
          publishing={publishing}
          scheduledAt={scheduledAt}
          onPublish={handlePublish}
          onSchedule={handleSchedule}
          onCancelSchedule={handleCancelSchedule}
          testidPrefix="landing"
        />
      </div>

      {/* Body: sidebar + iframe */}
      <div className="flex flex-1 min-h-0">
        {mode === 'edit' && (
          <aside className="w-[380px] flex-shrink-0 border-r border-slate-100 overflow-y-auto" data-testid="editor-sidebar">
            <div className="p-4 flex flex-col gap-6">
              <EditorSection title="Hero" sub="The very top of the landing page — full-screen banner, headline, and call-to-action button.">
                <Radio2 label="Background media" value={d.hero_media_type || 'image'} onChange={(v) => setField('hero_media_type', v)} options={[{ value: 'image', label: 'Image' }, { value: 'video', label: 'Video' }]} testid="hero-media-type" />
                {(d.hero_media_type || 'image') === 'image' ? (
                  <MediaUploader
                    label="Background image (used in: Hero banner)"
                    slot="hero"
                    testid="hero-image-upload"
                    currentUrl={d.hero_image}
                    currentMediaType="image"
                    aspect={16 / 9}
                    recommendedWidth={1920}
                    recommendedHeight={1080}
                    onUploaded={({ url }) => setField('hero_image', url)}
                    onRemove={() => setField('hero_image', '')}
                  />
                ) : (
                  <MediaUploader
                    label="Background video (used in: Hero banner)"
                    slot="hero-video"
                    testid="hero-video-upload"
                    currentUrl={d.hero_video}
                    currentMediaType="video"
                    acceptVideo
                    onUploaded={({ url }) => setField('hero_video', url)}
                    onRemove={() => setField('hero_video', '')}
                  />
                )}
                <Field label="Accent title (cyan)" value={d.hero_title || ''} onChange={(v) => setField('hero_title', v)} testid="hero-title-input" placeholder="The ocean is calling." />
                <Field label="Headline subtitle" value={d.hero_subtitle || ''} onChange={(v) => setField('hero_subtitle', v)} testid="hero-subtitle-input" placeholder="Find your next dive, gear, merch and buddy." />
                <TextArea label="Description" value={d.hero_description || ''} onChange={(v) => setField('hero_description', v)} testid="hero-description-input" placeholder="One short paragraph introducing the platform." />
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Primary button label" value={d.cta_primary_label || ''} onChange={(v) => setField('cta_primary_label', v)} testid="cta-primary-label" placeholder="Dive in" />
                  <Field label="Primary link" value={d.cta_primary_link || ''} onChange={(v) => setField('cta_primary_link', v)} testid="cta-primary-link" placeholder="/discover" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Secondary button label" value={d.cta_secondary_label || ''} onChange={(v) => setField('cta_secondary_label', v)} testid="cta-secondary-label" placeholder="Optional" />
                  <Field label="Secondary link" value={d.cta_secondary_link || ''} onChange={(v) => setField('cta_secondary_link', v)} testid="cta-secondary-link" placeholder="/signup" />
                </div>
              </EditorSection>

              <EditorSection title="Section images" sub="Each image powers one section of the landing page. Labels below describe where the image appears.">
                {[
                  { key: 'about', label: 'About section', sub: 'Headline: "What is Bottom Time?"' },
                  { key: 'curious', label: 'Beginner section', sub: 'Headline: "Never dived before?"' },
                  { key: 'operator', label: 'Operator section', sub: 'Headline: "For instructors & operators"' },
                  { key: 'community', label: 'Community section', sub: 'Headline: "More than a marketplace"' },
                ].map(s => (
                  <MediaUploader
                    key={s.key}
                    label={`${s.label} — ${s.sub}`}
                    slot={s.key}
                    testid={`section-image-${s.key}`}
                    currentUrl={sectionImages[s.key]}
                    currentMediaType="image"
                    aspect={3 / 2}
                    recommendedWidth={1200}
                    recommendedHeight={800}
                    onUploaded={({ url }) => setSectionImage(s.key, url)}
                    onRemove={() => setSectionImage(s.key, '')}
                  />
                ))}
              </EditorSection>

              <HistoryPanel
                apiBase="/admin/site-content"
                testidPrefix="landing"
                previewingVersion={previewingVersion}
                onPreviewVersion={setPreviewingVersion}
                onReverted={loadContent}
                publishedAt={published?.published_at}
              />

              <div className="text-[10px] text-slate-400">
                Last published: {publishedAt ? new Date(publishedAt).toLocaleString() : 'Never'}
              </div>
            </div>
          </aside>
        )}

        <div className="flex-1 bg-slate-100 flex flex-col overflow-hidden" data-testid="preview-pane">
          {previewingVersion && (
            <div className="flex items-center gap-2 px-4 py-2 bg-violet-600 text-white text-[11px] font-semibold" data-testid="landing-preview-version-banner">
              <EyeIcon size={12} />
              <span>Previewing v{previewingVersion.version} — published {previewingVersion.meta?.published_by_name ? `by ${previewingVersion.meta.published_by_name}` : ''}</span>
              <span className="flex-1" />
              <button
                type="button"
                onClick={() => setPreviewingVersion(null)}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white/15 hover:bg-white/25 transition-colors"
                data-testid="landing-preview-version-exit"
              >
                <X size={11} /> Exit preview
              </button>
            </div>
          )}
          <div className="flex-1 flex items-center justify-center overflow-auto p-4">
            <div
              className={`bg-white shadow-2xl transition-all duration-300 overflow-hidden rounded-xl`}
              style={{
                width: viewport === 'mobile' ? 390 : '100%',
                height: viewport === 'mobile' ? 780 : '100%',
                maxHeight: '100%',
              }}
            >
              <iframe
                ref={iframeRef}
                src={previewUrl}
                title="Landing page preview"
                className="w-full h-full border-0"
                data-testid="preview-iframe"
                sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


function stripMeta(obj) {
  const { updated_at, updated_by, published_at, published_by, key, _id, ...rest } = obj || {};
  return rest;
}

function timeAgo(date) {
  const s = Math.floor((Date.now() - date.getTime()) / 1000);
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return date.toLocaleTimeString();
}


function EditorSection({ title, sub, children }) {
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h3 className="text-[11px] uppercase tracking-wider font-bold text-cyan-600">{title}</h3>
        {sub && <p className="text-[11px] text-slate-500 mt-0.5">{sub}</p>}
      </div>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}

function Field({ label, value, onChange, placeholder, testid }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-semibold text-slate-600">{label}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        data-testid={testid}
        className="h-9 bg-white border border-slate-200 rounded-lg px-3 text-sm outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100 transition-colors"
      />
    </label>
  );
}

function TextArea({ label, value, onChange, placeholder, testid }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-semibold text-slate-600">{label}</span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={3}
        data-testid={testid}
        className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100 transition-colors resize-none"
      />
    </label>
  );
}

function Radio2({ label, value, onChange, options, testid }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] font-semibold text-slate-600">{label}</span>
      <div className="flex gap-1 bg-slate-50 rounded-lg p-0.5 border border-slate-200 w-fit" data-testid={testid}>
        {options.map(o => (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={`px-3 py-1 rounded text-[11px] font-semibold transition-colors ${value === o.value ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
            data-testid={`${testid}-${o.value}`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
