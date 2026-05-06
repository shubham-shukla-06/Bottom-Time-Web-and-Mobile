/**
 * SchedulePublishMenu — split publish button + IST schedule modal.
 *
 * Behaviour:
 *   - Primary "Publish" button publishes immediately (calls onPublish).
 *   - Chevron opens a menu with "Schedule…" → opens an inline modal asking for
 *     date + time in IST. Submitting calls onSchedule({ publish_at }) where
 *     publish_at is a UTC ISO string converted from the IST input.
 *   - When `scheduledAt` is provided, the button collapses into a "Scheduled
 *     for …" chip with a Cancel button (calls onCancelSchedule).
 *
 * Time conversion is explicit (IST is UTC+5:30, no DST) so we never rely on the
 * admin's browser timezone — the input is always interpreted as IST regardless
 * of where the admin sits.
 */
import { useEffect, useRef, useState } from 'react';
import { CalendarClock, ChevronDown, Loader2, Send, X, Check } from 'lucide-react';

const IST_OFFSET_MINUTES = 5 * 60 + 30; // UTC+5:30

function pad2(n) { return String(n).padStart(2, '0'); }

/** Default value for the datetime-local input — current IST + 30 minutes. */
function defaultIstLocal() {
  const future = new Date(Date.now() + 30 * 60 * 1000);
  // Render in Asia/Kolkata regardless of admin's local TZ.
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(future).filter(p => p.type !== 'literal').map(p => [p.type, p.value]));
  // 24:00 → 00:00 normalisation that some locales emit
  const hour = parts.hour === '24' ? '00' : parts.hour;
  return `${parts.year}-${parts.month}-${parts.day}T${hour}:${parts.minute}`;
}

/** Convert "YYYY-MM-DDTHH:MM" interpreted as IST → UTC ISO string. */
export function istLocalToUtcIso(istLocal) {
  const [d, t] = istLocal.split('T');
  const [y, mo, da] = d.split('-').map(Number);
  const [hh, mm] = t.split(':').map(Number);
  const utcMs = Date.UTC(y, mo - 1, da, hh, mm) - IST_OFFSET_MINUTES * 60 * 1000;
  return new Date(utcMs).toISOString();
}

/** Friendly IST display for any UTC ISO string. */
export function utcIsoToIstDisplay(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const fmt = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit', month: 'short', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  });
  return `${fmt.format(d)} IST`;
}

export default function SchedulePublishMenu({
  hasChanges,
  publishing,
  scheduledAt,            // UTC ISO string or null
  onPublish,              // () => Promise — publish now
  onSchedule,             // ({ publish_at }) => Promise
  onCancelSchedule,       // () => Promise
  testidPrefix = 'cms',
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [picked, setPicked] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const menuRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onDoc = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [menuOpen]);

  const openSchedule = () => {
    setMenuOpen(false);
    setError('');
    setPicked(defaultIstLocal());
    setModalOpen(true);
  };

  const submitSchedule = async () => {
    if (!picked) { setError('Pick a date and time'); return; }
    let utcIso;
    try { utcIso = istLocalToUtcIso(picked); } catch { setError('Invalid date/time'); return; }
    if (new Date(utcIso).getTime() <= Date.now()) {
      setError('Pick a moment in the future');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await onSchedule({ publish_at: utcIso });
      setModalOpen(false);
    } catch (e) {
      setError(e?.response?.data?.detail || 'Failed to schedule');
    } finally {
      setSubmitting(false);
    }
  };

  // ---- When a schedule is pending, render a chip-style status + Cancel ----
  if (scheduledAt) {
    return (
      <div className="flex items-center gap-2" data-testid={`${testidPrefix}-scheduled-chip`}>
        <span className="inline-flex items-center gap-1.5 bg-violet-50 text-violet-700 border border-violet-200 px-2.5 py-1 rounded-full text-[11px] font-semibold">
          <CalendarClock size={11} /> Scheduled for {utcIsoToIstDisplay(scheduledAt)}
        </span>
        <button
          type="button"
          onClick={onCancelSchedule}
          className="text-xs text-slate-500 hover:text-red-600 inline-flex items-center gap-1 font-semibold"
          data-testid={`${testidPrefix}-schedule-cancel`}
        >
          <X size={12} /> Cancel schedule
        </button>
      </div>
    );
  }

  // ---- Normal state — split button "Publish" | ▼ ----
  return (
    <>
      <div className="inline-flex rounded-lg shadow-sm" ref={menuRef}>
        <button
          type="button"
          onClick={onPublish}
          disabled={!hasChanges || publishing}
          className="px-3 py-1.5 bg-cyan-500 hover:bg-cyan-400 text-white text-xs font-bold rounded-l-lg inline-flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          data-testid={`${testidPrefix}-publish-btn`}
        >
          {publishing ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
          {publishing ? 'Publishing…' : 'Publish'}
        </button>
        <button
          type="button"
          onClick={() => setMenuOpen(o => !o)}
          disabled={!hasChanges || publishing}
          className="px-1.5 py-1.5 bg-cyan-500 hover:bg-cyan-400 text-white text-xs rounded-r-lg border-l border-cyan-400/40 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          aria-label="Open publish options"
          data-testid={`${testidPrefix}-publish-menu-btn`}
        >
          <ChevronDown size={12} />
        </button>
        {menuOpen && (
          <div className="absolute mt-9 right-0 z-30">
            <div className="bg-white rounded-xl border border-slate-200 shadow-xl py-1 w-56" role="menu">
              <button
                type="button"
                onClick={() => { setMenuOpen(false); onPublish(); }}
                className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50 flex items-start gap-2"
                data-testid={`${testidPrefix}-menu-publish-now`}
              >
                <Send size={12} className="text-cyan-500 mt-0.5" />
                <div>
                  <p className="font-semibold text-slate-800">Publish now</p>
                  <p className="text-[10px] text-slate-500">Goes live instantly.</p>
                </div>
              </button>
              <button
                type="button"
                onClick={openSchedule}
                className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50 flex items-start gap-2"
                data-testid={`${testidPrefix}-menu-schedule`}
              >
                <CalendarClock size={12} className="text-violet-500 mt-0.5" />
                <div>
                  <p className="font-semibold text-slate-800">Schedule…</p>
                  <p className="text-[10px] text-slate-500">Pick a date &amp; time in IST.</p>
                </div>
              </button>
            </div>
          </div>
        )}
      </div>

      {modalOpen && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4"
          onClick={() => !submitting && setModalOpen(false)}
          data-testid={`${testidPrefix}-schedule-modal`}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-violet-50 flex items-center justify-center">
                <CalendarClock size={14} className="text-violet-600" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Schedule publish</h3>
                <p className="text-[11px] text-slate-500">All times are India Standard Time (IST, UTC+5:30).</p>
              </div>
            </div>

            <div className="px-5 py-4 space-y-3">
              <label className="flex flex-col gap-1.5">
                <span className="text-[11px] font-semibold text-slate-600">Publish at (IST)</span>
                <input
                  type="datetime-local"
                  value={picked}
                  onChange={(e) => { setPicked(e.target.value); setError(''); }}
                  className="h-10 bg-white border border-slate-200 rounded-lg px-3 text-sm outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
                  data-testid={`${testidPrefix}-schedule-datetime`}
                />
              </label>
              {picked && !error && (
                <p className="text-[11px] text-slate-500" data-testid={`${testidPrefix}-schedule-preview`}>
                  Will publish at <strong className="text-slate-800">
                    {(() => { try { return utcIsoToIstDisplay(istLocalToUtcIso(picked)); } catch { return ''; } })()}
                  </strong>
                </p>
              )}
              {error && (
                <p className="text-[11px] text-red-600 font-semibold" data-testid={`${testidPrefix}-schedule-error`}>{error}</p>
              )}
              <p className="text-[10px] text-slate-400">
                Edits you make to the draft after scheduling will be included in the publish.
                Discarding the draft cancels the schedule.
              </p>
            </div>

            <div className="px-5 py-3 border-t border-slate-100 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                disabled={submitting}
                className="px-3 py-1.5 text-xs font-semibold text-slate-600 rounded-lg hover:bg-slate-100 disabled:opacity-40"
                data-testid={`${testidPrefix}-schedule-cancel-btn`}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitSchedule}
                disabled={submitting}
                className="px-4 py-1.5 text-xs font-bold text-white bg-violet-600 hover:bg-violet-500 rounded-lg inline-flex items-center gap-1.5 disabled:opacity-50"
                data-testid={`${testidPrefix}-schedule-confirm-btn`}
              >
                {submitting ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                {submitting ? 'Scheduling…' : 'Schedule'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
