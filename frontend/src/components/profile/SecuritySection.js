// Phase B (web passkeys) — Profile → Security section.
//
// Two stacked cards inside Profile.js:
//   1. Passkeys: list, "Add passkey", per-row Remove
//   2. Active sessions: list, per-row Sign out, "Sign out everywhere"
//
// Reuses Phase A endpoints (GET /auth/sessions, POST /auth/session/revoke,
// /revoke-all) and the new Phase B endpoints (/auth/webauthn/passkeys,
// /auth/webauthn/register/*).

import { useEffect, useState, useCallback } from 'react';
import { Section } from '../../pages/profile/ProfileSections';
import { Shield, KeyRound, Smartphone, Monitor, Trash2, Loader, Plus } from 'lucide-react';
import { toast } from 'sonner';
import {
  passkeysSupported, registerPasskey, listPasskeys, deletePasskey,
  listSessions, revokeSession, revokeAllSessions,
  setPasskeyOnDeviceFlag, clearPasskeyOnDeviceFlag,
} from '../../api/webauthnClient';

function formatRelative(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    const diff = Math.max(0, Date.now() - d.getTime());
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m} min ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h} hr ago`;
    const days = Math.floor(h / 24);
    if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
    return d.toLocaleDateString();
  } catch { return '—'; }
}

function PasskeyRow({ pk, onRemove, removing }) {
  const Icon = pk.device_type === 'multi_device' ? KeyRound : Smartphone;
  return (
    <div
      className="flex items-center gap-3 p-3 border border-slate-100 rounded-xl bg-white"
      data-testid={`passkey-row-${pk.passkey_id}`}
    >
      <div className="w-9 h-9 rounded-lg bg-cyan-50 text-cyan-500 flex items-center justify-center shrink-0">
        <Icon size={18} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm text-slate-900 truncate">{pk.label || 'Passkey'}</p>
        <p className="text-xs text-slate-500">
          Added {formatRelative(pk.created_at)}
          {pk.last_used_at ? ` · used ${formatRelative(pk.last_used_at)}` : ' · never used'}
          {pk.backed_up ? ' · synced' : ''}
        </p>
      </div>
      <button
        onClick={onRemove}
        disabled={removing}
        className="text-slate-400 hover:text-red-500 transition-colors disabled:opacity-40 p-2 rounded-lg hover:bg-red-50"
        title="Remove passkey"
        data-testid={`passkey-remove-${pk.passkey_id}`}
      >
        {removing ? <Loader size={16} className="animate-spin" /> : <Trash2 size={16} />}
      </button>
    </div>
  );
}

function SessionRow({ s, onRevoke, revoking }) {
  const Icon = s.platform === 'ios' || s.platform === 'android' ? Smartphone : Monitor;
  return (
    <div
      className="flex items-center gap-3 p-3 border border-slate-100 rounded-xl bg-white"
      data-testid={`session-row-${s.session_id}`}
    >
      <div className="w-9 h-9 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center shrink-0">
        <Icon size={18} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm text-slate-900 truncate">
          {s.device_name || 'Unknown device'}
          {s.is_current && (
            <span className="ml-2 text-[10px] font-bold uppercase tracking-wider text-cyan-500" data-testid="session-current-badge">
              This device
            </span>
          )}
        </p>
        <p className="text-xs text-slate-500">
          {s.platform || 'web'} · last active {formatRelative(s.last_used_at)}
        </p>
      </div>
      <button
        onClick={onRevoke}
        disabled={revoking}
        className="text-xs font-semibold text-slate-500 hover:text-red-500 disabled:opacity-40 px-2 py-1 rounded-md hover:bg-red-50"
        data-testid={`session-revoke-${s.session_id}`}
      >
        {revoking ? '…' : 'Sign out'}
      </button>
    </div>
  );
}

export default function SecuritySection() {
  const [passkeys, setPasskeys] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [loadingPk, setLoadingPk] = useState(true);
  const [loadingSess, setLoadingSess] = useState(true);
  const [adding, setAdding] = useState(false);
  const [removingId, setRemovingId] = useState(null);
  const [revokingId, setRevokingId] = useState(null);
  const [revokingAll, setRevokingAll] = useState(false);

  const supported = passkeysSupported();

  const loadPasskeys = useCallback(async () => {
    setLoadingPk(true);
    try { setPasskeys(await listPasskeys()); }
    catch { /* swallow — surface via empty state */ }
    finally { setLoadingPk(false); }
  }, []);

  const loadSessions = useCallback(async () => {
    setLoadingSess(true);
    try { setSessions(await listSessions()); }
    catch { /* swallow */ }
    finally { setLoadingSess(false); }
  }, []);

  useEffect(() => { loadPasskeys(); loadSessions(); }, [loadPasskeys, loadSessions]);

  const handleAdd = async () => {
    if (!supported) { toast.error('Your browser does not support passkeys'); return; }
    setAdding(true);
    try {
      const result = await registerPasskey();
      setPasskeyOnDeviceFlag(result?.credentialId);
      toast.success(`Passkey added: ${result.label}`);
      await loadPasskeys();
    } catch (err) {
      const name = err?.name || '';
      if (name === 'NotAllowedError' || name === 'AbortError') {
        // user cancelled — no-op
      } else if (name === 'InvalidStateError') {
        toast.error('That passkey is already registered for this account');
      } else {
        const msg = err?.response?.data?.detail || err?.message || 'Failed to add passkey';
        toast.error(typeof msg === 'string' ? msg : 'Failed to add passkey');
      }
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (pk) => {
    setRemovingId(pk.passkey_id);
    try {
      await deletePasskey(pk.passkey_id);
      toast.success('Passkey removed');
      setPasskeys((curr) => {
        const next = curr.filter((p) => p.passkey_id !== pk.passkey_id);
        // Last passkey gone → clear the local "passkey on this device" flag
        // so the login screen reverts to the muted "no passkey here" state.
        if (next.length === 0) clearPasskeyOnDeviceFlag();
        return next;
      });
    } catch {
      toast.error('Failed to remove passkey');
    } finally {
      setRemovingId(null);
    }
  };

  const handleRevoke = async (s) => {
    setRevokingId(s.session_id);
    try {
      await revokeSession(s.session_id);
      toast.success('Signed out from that device');
      setSessions((curr) => curr.filter((x) => x.session_id !== s.session_id));
    } catch {
      toast.error('Failed to sign out');
    } finally {
      setRevokingId(null);
    }
  };

  const handleRevokeAll = async () => {
    setRevokingAll(true);
    try {
      await revokeAllSessions();
      toast.success('Signed out from every device');
      await loadSessions();
    } catch {
      toast.error('Failed to sign out everywhere');
    } finally {
      setRevokingAll(false);
    }
  };

  return (
    <Section title="Security" icon={<Shield size={18} />}>
      <div data-testid="security-section">
        {/* Passkeys card */}
        <div className="mb-4" data-testid="passkeys-card">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">Passkeys</p>
              <p className="text-xs text-slate-500 mt-0.5">
                Sign in with Touch ID, Face ID, Windows Hello or a security key — no OTP needed.
              </p>
            </div>
            <button
              onClick={handleAdd}
              disabled={adding || !supported}
              className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-cyan-400 text-slate-900 text-xs font-bold hover:bg-cyan-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              data-testid="add-passkey-btn"
            >
              {adding ? <Loader size={14} className="animate-spin" /> : <Plus size={14} />}
              {adding ? 'Adding…' : 'Add passkey'}
            </button>
          </div>

          {!supported && (
            <p
              className="text-xs text-amber-600 bg-amber-50 px-3 py-2 rounded-lg"
              data-testid="passkeys-unsupported-note"
            >
              This browser does not support passkeys. Try Chrome, Edge, Safari or Firefox on a modern device.
            </p>
          )}

          {loadingPk ? (
            <div className="text-xs text-slate-400 py-3" data-testid="passkeys-loading">Loading…</div>
          ) : passkeys.length === 0 ? (
            <p className="text-xs text-slate-500 py-2" data-testid="passkeys-empty">
              No passkeys yet. Add one to skip OTP next time.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {passkeys.map((pk) => (
                <PasskeyRow
                  key={pk.passkey_id}
                  pk={pk}
                  onRemove={() => handleRemove(pk)}
                  removing={removingId === pk.passkey_id}
                />
              ))}
            </div>
          )}
        </div>

        {/* Sessions card */}
        <div data-testid="sessions-card">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">Active sessions</p>
              <p className="text-xs text-slate-500 mt-0.5">
                Devices currently signed in to your account.
              </p>
            </div>
            <button
              onClick={handleRevokeAll}
              disabled={revokingAll || sessions.length === 0}
              className="shrink-0 text-xs font-semibold text-red-500 hover:text-red-600 disabled:opacity-40 px-3 py-2 rounded-xl hover:bg-red-50 transition-colors"
              data-testid="revoke-all-btn"
            >
              {revokingAll ? 'Signing out…' : 'Sign out everywhere'}
            </button>
          </div>

          {loadingSess ? (
            <div className="text-xs text-slate-400 py-3" data-testid="sessions-loading">Loading…</div>
          ) : sessions.length === 0 ? (
            <p className="text-xs text-slate-500 py-2" data-testid="sessions-empty">
              No active sessions on record.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {sessions.map((s) => (
                <SessionRow
                  key={s.session_id}
                  s={s}
                  onRevoke={() => handleRevoke(s)}
                  revoking={revokingId === s.session_id}
                />
              ))}
            </div>
          )}
          <p className="text-[10px] text-slate-400 mt-3">
            Changing your email also signs you out of every device.
          </p>
        </div>
      </div>
    </Section>
  );
}
