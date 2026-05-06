/**
 * HistoryPanel — past published versions of a CMS doc, with Preview + Revert.
 *
 * Props:
 *   - apiBase: '/admin/site-content' or '/admin/gate-content'
 *   - testidPrefix: 'landing' | 'gating'
 *   - previewingVersion: { id, version } | null — the entry currently being previewed
 *   - onPreviewVersion(entry | null): toggle a version into / out of preview mode
 *   - onReverted: () => void — called after a successful revert (parent reloads editor)
 *   - publishedAt: ISO string of currently-published version (used to bold the live row)
 */
import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { History, Eye, EyeOff, RotateCcw, Loader2, Clock, User as UserIcon, AlertTriangle } from 'lucide-react';
import { utcIsoToIstDisplay } from './SchedulePublishMenu';

function timeAgo(iso) {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export default function HistoryPanel({
  apiBase,
  testidPrefix,
  previewingVersion,
  onPreviewVersion,
  onReverted,
  publishedAt,
}) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [reverting, setReverting] = useState(null); // version_id while loading
  const [confirmRevert, setConfirmRevert] = useState(null); // entry pending confirm

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await axios.get(`${apiBase}/history`);
      setItems(data.items || []);
    } catch {
      // Silent — empty history is also a valid state
    } finally {
      setLoading(false);
    }
  }, [apiBase]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { reload(); }, [reload, publishedAt]);

  const togglePreview = async (entry) => {
    if (previewingVersion?.id === entry.id) {
      onPreviewVersion(null);
      return;
    }
    try {
      const { data } = await axios.get(`${apiBase}/history/${entry.id}`);
      onPreviewVersion({ id: entry.id, version: entry.version, content: data.content, meta: entry });
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to load version');
    }
  };

  const doRevert = async (entry) => {
    setReverting(entry.id);
    try {
      await axios.post(`${apiBase}/revert`, { version_id: entry.id });
      toast.success(`Reverted to v${entry.version}. Review and publish to make it live.`);
      setConfirmRevert(null);
      // Exit any active preview — admin should now see the loaded draft
      if (previewingVersion) onPreviewVersion(null);
      onReverted?.();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Revert failed');
    } finally {
      setReverting(null);
    }
  };

  return (
    <section className="flex flex-col gap-3" data-testid={`${testidPrefix}-history-panel`}>
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-[11px] uppercase tracking-wider font-bold text-cyan-600 inline-flex items-center gap-1.5">
            <History size={11} /> Version history
          </h3>
          <p className="text-[11px] text-slate-500 mt-0.5">Every publish is recorded. Preview a version, or revert it into the draft to review and re-publish.</p>
        </div>
        {items.length > 0 && (
          <span className="text-[10px] font-semibold text-slate-400">{items.length} version{items.length === 1 ? '' : 's'}</span>
        )}
      </div>

      {loading && items.length === 0 ? (
        <div className="flex items-center gap-2 text-[11px] text-slate-400 py-2"><Loader2 size={12} className="animate-spin" /> Loading…</div>
      ) : items.length === 0 ? (
        <p className="text-[11px] text-slate-400 italic py-2">No published versions yet — publish at least once to start the history.</p>
      ) : (
        <ol className="flex flex-col gap-1.5">
          {items.map((entry) => {
            const isPreviewing = previewingVersion?.id === entry.id;
            const isLatest = publishedAt && entry.published_at === publishedAt;
            return (
              <li
                key={entry.id}
                className={`group flex items-start gap-2 px-2.5 py-2 rounded-lg border transition-colors ${isPreviewing ? 'border-violet-300 bg-violet-50/60' : isLatest ? 'border-emerald-200 bg-emerald-50/40' : 'border-slate-100 bg-white hover:bg-slate-50'}`}
                data-testid={`${testidPrefix}-history-row-${entry.version}`}
              >
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-slate-100 text-slate-600 text-[10px] font-bold flex items-center justify-center">
                  v{entry.version}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-1.5 flex-wrap">
                    <p className="text-[11px] font-semibold text-slate-800 truncate">
                      {utcIsoToIstDisplay(entry.published_at)}
                    </p>
                    {isLatest && (
                      <span className="inline-flex items-center gap-0.5 text-[9px] font-bold uppercase text-emerald-700 bg-emerald-100 px-1.5 py-px rounded">Live</span>
                    )}
                  </div>
                  <p className="text-[10px] text-slate-500 inline-flex items-center gap-2">
                    <span className="inline-flex items-center gap-0.5"><UserIcon size={9} />{entry.published_by_name || 'system'}</span>
                    <span className="inline-flex items-center gap-0.5"><Clock size={9} />{timeAgo(entry.published_at)}</span>
                  </p>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0 self-center">
                  <button
                    type="button"
                    onClick={() => togglePreview(entry)}
                    className={`p-1 rounded-md text-[10px] font-semibold transition-colors ${isPreviewing ? 'bg-violet-600 text-white' : 'text-slate-500 hover:bg-slate-200'}`}
                    title={isPreviewing ? 'Exit preview' : 'Preview this version'}
                    data-testid={`${testidPrefix}-history-preview-${entry.version}`}
                  >
                    {isPreviewing ? <EyeOff size={12} /> : <Eye size={12} />}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmRevert(entry)}
                    disabled={reverting === entry.id}
                    className="p-1 rounded-md text-slate-500 hover:bg-amber-100 hover:text-amber-700 disabled:opacity-40 transition-colors"
                    title="Revert this version into draft"
                    data-testid={`${testidPrefix}-history-revert-${entry.version}`}
                  >
                    {reverting === entry.id ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />}
                  </button>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {confirmRevert && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4"
          onClick={() => !reverting && setConfirmRevert(null)}
          data-testid={`${testidPrefix}-revert-confirm`}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-slate-100 flex items-start gap-2">
              <div className="w-8 h-8 rounded-full bg-amber-50 flex items-center justify-center flex-shrink-0">
                <AlertTriangle size={14} className="text-amber-600" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Revert to v{confirmRevert.version}?</h3>
                <p className="text-[11px] text-slate-500 mt-0.5">Published {utcIsoToIstDisplay(confirmRevert.published_at)} by {confirmRevert.published_by_name || 'system'}.</p>
              </div>
            </div>
            <div className="px-5 py-4 text-[12px] text-slate-600 space-y-2">
              <p>This will load v{confirmRevert.version} into your <strong>draft</strong> and replace any unsaved edits. Nothing changes on the live site until you click <strong>Publish</strong>.</p>
              {previewingVersion && previewingVersion.id !== confirmRevert.id && (
                <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-100 px-2 py-1 rounded">You're previewing a different version. Reverting will exit preview mode.</p>
              )}
            </div>
            <div className="px-5 py-3 border-t border-slate-100 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmRevert(null)}
                disabled={!!reverting}
                className="px-3 py-1.5 text-xs font-semibold text-slate-600 rounded-lg hover:bg-slate-100 disabled:opacity-40"
                data-testid={`${testidPrefix}-revert-cancel`}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => doRevert(confirmRevert)}
                disabled={!!reverting}
                className="px-4 py-1.5 text-xs font-bold text-white bg-amber-600 hover:bg-amber-500 rounded-lg inline-flex items-center gap-1.5 disabled:opacity-50"
                data-testid={`${testidPrefix}-revert-confirm-btn`}
              >
                {reverting ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />}
                {reverting ? 'Reverting…' : `Revert to v${confirmRevert.version}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
