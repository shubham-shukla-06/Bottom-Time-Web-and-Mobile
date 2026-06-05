/**
 * GatingPageEditor — CMS editor for the public "Coming Soon" / gating page.
 *
 * Layout: Left sidebar (toggle + fields) | Right pane (live iframe preview of the gating page).
 *
 * Flow:
 *   - Load { published, draft, has_unpublished_changes } from GET /admin/gate-content.
 *   - Every field edit → debounced save to PUT /admin/gate-content/draft.
 *   - Iframe loads the gating page in preview mode (?gate_preview=1&preview_draft=1)
 *     so it renders unconditionally regardless of access cookie.
 *   - Publish promotes draft → published via POST /admin/gate-content/publish.
 *   - Discard deletes the draft via POST /admin/gate-content/discard-draft.
 *
 * The "Site gating" toggle controls whether ComingSoon is shown to public visitors.
 * When OFF, App.useSiteGate skips the gate entirely (no access key required).
 */
import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Eye, Pencil, Undo2, Monitor, Smartphone, RefreshCw, CheckCircle2, AlertCircle, Lock, Unlock, X, Eye as EyeIcon } from 'lucide-react';
import SchedulePublishMenu from '../../components/admin/SchedulePublishMenu';
import HistoryPanel from '../../components/admin/HistoryPanel';

export default function GatingPageEditor() {
  const [published, setPublished] = useState(null);
  const [draft, setDraft] = useState(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [publishedAt, setPublishedAt] = useState(null);
  const [scheduledAt, setScheduledAt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState('edit');
  const [viewport, setViewport] = useState('desktop');
  const [publishing, setPublishing] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const [saving, setSaving] = useState(false);
  const [previewingVersion, setPreviewingVersion] = useState(null);
  const iframeRef = useRef(null);
  const iframeReadyRef = useRef(false);
  const pendingRef = useRef(null);
  const saveTimerRef = useRef(null);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadContent(); }, []);

  const loadContent = async () => {
    setLoading(true);
    try {
      const { data } = await axios.get('/admin/gate-content');
      setPublished(data.published);
      setDraft(data.draft);
      setHasChanges(data.has_unpublished_changes);
      setPublishedAt(data.published_updated_at);
      setScheduledAt(data.scheduled_publish_at || null);
    } catch (e) {
      toast.error('Failed to load gating page content');
    } finally {
      setLoading(false);
    }
  };

  const pushPreview = useCallback((content) => {
    const f = iframeRef.current;
    if (!f || !f.contentWindow) { pendingRef.current = content; return; }
    if (!iframeReadyRef.current) { pendingRef.current = content; return; }
    f.contentWindow.postMessage({ type: 'cms-preview-gating', content }, '*');
  }, []);

  useEffect(() => {
    const target = previewingVersion?.content || draft;
    if (!target) return;
    pushPreview(target);
  }, [draft, previewingVersion, pushPreview]);

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

  const scheduleSave = useCallback((next) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      setSaving(true);
      try {
        await axios.put('/admin/gate-content/draft', next);
        setSavedAt(new Date());
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

  const handlePublish = async () => {
    if (!hasChanges) return;
    setPublishing(true);
    try {
      await axios.post('/admin/gate-content/publish');
      toast.success('Published — gating page is now live');
      await loadContent();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Publish failed');
    } finally {
      setPublishing(false);
    }
  };

  const handleSchedule = async ({ publish_at }) => {
    await axios.post('/admin/gate-content/schedule', { publish_at });
    toast.success('Scheduled');
    await loadContent();
  };

  const handleCancelSchedule = async () => {
    try {
      await axios.post('/admin/gate-content/cancel-schedule');
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
      await axios.post('/admin/gate-content/discard-draft');
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
    // Render the gating page unconditionally — gate_preview bypasses the gate logic;
    // preview_draft tells ComingSoon to listen for postMessage updates.
    return `${origin}/?gate_preview=1&preview_draft=1`;
  }, []);

  if (loading) return <div className="text-center py-20"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-cyan-400 mx-auto" /></div>;

  const d = draft || {};
  const savedLabel = saving ? 'Saving…' : savedAt ? `Saved ${timeAgo(savedAt)}` : '';
  const gateOn = d.gate_enabled !== false;

  return (
    <div className="flex flex-col h-[calc(100vh-200px)] min-h-[700px] bg-white rounded-2xl border border-slate-100 overflow-hidden" data-testid="gating-page-editor">
      {/* Top toolbar */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-slate-100 bg-slate-50/50 flex-wrap">
        <h2 className="text-sm font-bold text-slate-900">Gating Page</h2>

        <div className="flex items-center gap-1 bg-white rounded-lg p-0.5 border border-slate-200">
          <button onClick={() => setMode('edit')} className={`px-2.5 py-1 rounded text-[11px] font-semibold inline-flex items-center gap-1 transition-colors ${mode === 'edit' ? 'bg-cyan-500 text-white' : 'text-slate-500 hover:bg-slate-50'}`} data-testid="gate-mode-edit-btn">
            <Pencil size={11} /> Edit
          </button>
          <button onClick={() => setMode('preview')} className={`px-2.5 py-1 rounded text-[11px] font-semibold inline-flex items-center gap-1 transition-colors ${mode === 'preview' ? 'bg-cyan-500 text-white' : 'text-slate-500 hover:bg-slate-50'}`} data-testid="gate-mode-preview-btn">
            <Eye size={11} /> Preview
          </button>
        </div>

        <div className="flex items-center gap-1 bg-white rounded-lg p-0.5 border border-slate-200">
          <button onClick={() => setViewport('desktop')} className={`px-2 py-1 rounded text-[11px] inline-flex items-center gap-1 transition-colors ${viewport === 'desktop' ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-50'}`} data-testid="gate-viewport-desktop-btn">
            <Monitor size={11} /> Desktop
          </button>
          <button onClick={() => setViewport('mobile')} className={`px-2 py-1 rounded text-[11px] inline-flex items-center gap-1 transition-colors ${viewport === 'mobile' ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-50'}`} data-testid="gate-viewport-mobile-btn">
            <Smartphone size={11} /> Mobile
          </button>
        </div>

        <button type="button" onClick={() => { iframeReadyRef.current = false; if (iframeRef.current) iframeRef.current.src = previewUrl; }} title="Refresh preview" className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100" data-testid="gate-preview-refresh-btn">
          <RefreshCw size={12} />
        </button>

        <div className="flex-1" />

        <div className="flex items-center gap-1.5 text-[11px] font-semibold">
          {hasChanges ? (
            <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full border border-amber-100" data-testid="gate-status-unpublished">
              <AlertCircle size={10} /> Unpublished changes
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full border border-emerald-100" data-testid="gate-status-published">
              <CheckCircle2 size={10} /> Published
            </span>
          )}
          {savedLabel && <span className="text-slate-400 font-medium">· {savedLabel}</span>}
        </div>

        <button type="button" onClick={handleDiscard} disabled={!hasChanges || discarding || publishing} className="text-xs text-slate-500 hover:text-slate-800 inline-flex items-center gap-1 disabled:opacity-30" data-testid="gate-discard-btn">
          <Undo2 size={12} /> Discard
        </button>
        <SchedulePublishMenu
          hasChanges={hasChanges}
          publishing={publishing}
          scheduledAt={scheduledAt}
          onPublish={handlePublish}
          onSchedule={handleSchedule}
          onCancelSchedule={handleCancelSchedule}
          testidPrefix="gating"
        />
      </div>

      {/* Body */}
      <div className="flex flex-1 min-h-0">
        {mode === 'edit' && (
          <aside className="w-[380px] flex-shrink-0 border-r border-slate-100 overflow-y-auto" data-testid="gate-editor-sidebar">
            <div className="p-4 flex flex-col gap-6">
              {/* Gating toggle */}
              <EditorSection title="Site gating" sub="When ON, every public visitor sees this page until they enter the access key.">
                <button
                  type="button"
                  onClick={() => setField('gate_enabled', !gateOn)}
                  className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl border-2 transition-all ${gateOn ? 'border-cyan-200 bg-cyan-50/50' : 'border-slate-200 bg-white hover:bg-slate-50'}`}
                  data-testid="gate-enabled-toggle"
                >
                  <div className="flex items-center gap-2">
                    {gateOn ? <Lock size={14} className="text-cyan-600" /> : <Unlock size={14} className="text-slate-400" />}
                    <div className="text-left">
                      <p className="text-xs font-bold text-slate-900">{gateOn ? 'Gating ON' : 'Gating OFF'}</p>
                      <p className="text-[10px] text-slate-500">{gateOn ? 'Visitors see this page first' : 'Visitors land directly on the live site'}</p>
                    </div>
                  </div>
                  <span className={`relative inline-block w-9 h-5 rounded-full transition-colors ${gateOn ? 'bg-cyan-500' : 'bg-slate-300'}`}>
                    <span
                      className="absolute left-0.5 top-1/2 w-4 h-4 rounded-full bg-white shadow transition-transform duration-150"
                      style={{ transform: `translate(${gateOn ? 16 : 0}px, -50%)` }}
                    />
                  </span>
                </button>
                <p className="text-[10px] text-slate-400">Publish your changes for the toggle to take effect on the live site.</p>
              </EditorSection>

              <EditorSection title="Copy" sub="Edit the gating page text. Use this for launch announcements, maintenance notices, etc. The hero image is fixed and ships with the site so it always renders instantly.">
                <Field label="Pill badge text" value={d.badge_text || ''} onChange={(v) => setField('badge_text', v)} testid="gate-badge-input" placeholder="Under Development" />
                <Field label="Headline — accent (white)" value={d.accent_title || ''} onChange={(v) => setField('accent_title', v)} testid="gate-accent-title-input" placeholder="The ocean is calling." />
                <Field label="Headline — slate (cyan)" value={d.slate_title || ''} onChange={(v) => setField('slate_title', v)} testid="gate-slate-title-input" placeholder="We're getting ready." />
                <TextArea label="Description paragraph" value={d.description || ''} onChange={(v) => setField('description', v)} testid="gate-description-input" placeholder="Short paragraph above the email signup." />
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Email placeholder" value={d.email_placeholder || ''} onChange={(v) => setField('email_placeholder', v)} testid="gate-email-placeholder-input" placeholder="Enter your email" />
                  <Field label="Submit button label" value={d.submit_label || ''} onChange={(v) => setField('submit_label', v)} testid="gate-submit-label-input" placeholder="Notify me" />
                </div>
                <Field label="Footer text" value={d.footer_text || ''} onChange={(v) => setField('footer_text', v)} testid="gate-footer-text-input" placeholder="© Bottom Time. All rights reserved." />
              </EditorSection>

              <HistoryPanel
                apiBase="/admin/gate-content"
                testidPrefix="gating"
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

        <div className="flex-1 bg-slate-100 flex flex-col overflow-hidden" data-testid="gate-preview-pane">
          {previewingVersion && (
            <div className="flex items-center gap-2 px-4 py-2 bg-violet-600 text-white text-[11px] font-semibold" data-testid="gating-preview-version-banner">
              <EyeIcon size={12} />
              <span>Previewing v{previewingVersion.version} — published {previewingVersion.meta?.published_by_name ? `by ${previewingVersion.meta.published_by_name}` : ''}</span>
              <span className="flex-1" />
              <button
                type="button"
                onClick={() => setPreviewingVersion(null)}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white/15 hover:bg-white/25 transition-colors"
                data-testid="gating-preview-version-exit"
              >
                <X size={11} /> Exit preview
              </button>
            </div>
          )}
          <div className="flex-1 flex items-center justify-center overflow-auto p-4">
            <div
              className="bg-white shadow-2xl transition-all duration-300 overflow-hidden rounded-xl"
              style={{
                width: viewport === 'mobile' ? 390 : '100%',
                height: viewport === 'mobile' ? 780 : '100%',
                maxHeight: '100%',
              }}
            >
              <iframe
                ref={iframeRef}
                src={previewUrl}
                title="Gating page preview"
                className="w-full h-full border-0"
                data-testid="gate-preview-iframe"
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
        rows={4}
        data-testid={testid}
        className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100 transition-colors resize-none"
      />
    </label>
  );
}
