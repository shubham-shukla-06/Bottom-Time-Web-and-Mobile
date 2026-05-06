import { useState, useEffect, useRef, useCallback, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import useAuthStore from '../../stores/authStore';
import useUIStore from '../../stores/uiStore';
import { Save, Shield, Camera, Download, Trash2, Bell, DollarSign } from 'lucide-react';
import axios from 'axios';
import { toast } from 'sonner';
import { CURRENCY_OPTIONS } from '../../hooks/useDiscoverFilters';

export const Section = memo(function Section({ title, icon, children, editing, onEdit, onSave, onCancel, saving }) {
  return (
    <div className="mb-6 bg-white rounded-2xl border border-slate-100 shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden" data-testid={`section-${title.toLowerCase().replace(/\s/g, '-')}`}>
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
        <div className="flex items-center gap-2 text-slate-700"><span className="text-cyan-400">{icon}</span><h2 className="font-bold text-base">{title}</h2></div>
        {onEdit && !editing && <button onClick={onEdit} className="text-cyan-400 text-sm font-semibold hover:text-cyan-400" data-testid={`edit-${title.toLowerCase().replace(/\s/g, '-')}-btn`}>Edit</button>}
        {editing && (
          <div className="flex items-center gap-2">
            <button onClick={onCancel} className="text-slate-500 text-sm font-medium" data-testid="cancel-edit-btn">Cancel</button>
            <button onClick={onSave} disabled={saving} className="bg-cyan-400 text-white text-sm font-semibold px-4 py-1.5 rounded-full hover:bg-cyan-300 flex items-center gap-1" data-testid="save-edit-btn"><Save size={14} />{saving ? 'Saving...' : 'Save'}</button>
          </div>
        )}
      </div>
      <div className="px-6 py-4">{children}</div>
    </div>
  );
});

export const ReadField = memo(function ReadField({ label, value }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
      <span className="text-sm text-slate-500">{label}</span>
      <span className={`text-sm font-medium ${value ? 'text-slate-800' : 'text-slate-300'}`}>{value || 'Not set'}</span>
    </div>
  );
});

export const ProfilePhotoUpload = memo(function ProfilePhotoUpload({ user, onUpdated }) {
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const initials = (user?.name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

  const handleUpload = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error('File too large (max 5MB)'); return; }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await axios.put('/auth/profile-photo', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      onUpdated(res.data.url);
      toast.success('Photo updated!');
    } catch (e) { toast.error(e.response?.data?.detail || 'Upload failed'); }
    finally { setUploading(false); }
  }, [onUpdated]);

  return (
    <div className="flex items-center gap-5 mb-8" data-testid="profile-photo-section">
      <div className="relative group">
        {user?.profile_photo ? (
          <img src={user.profile_photo} alt={user.name} className="w-20 h-20 rounded-full object-cover border-2 border-slate-100" loading="lazy" />
        ) : (
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-cyan-500 to-teal-600 flex items-center justify-center text-white text-xl font-bold border-2 border-slate-100">
            {initials}
          </div>
        )}
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="absolute inset-0 rounded-full bg-black/0 group-hover:bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
          data-testid="upload-photo-btn"
        >
          <Camera size={20} className="text-white" />
        </button>
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleUpload} data-testid="photo-file-input" />
      </div>
      <div>
        <p className="font-bold">{user?.name}</p>
        <button onClick={() => fileRef.current?.click()} disabled={uploading} className="text-sm text-cyan-400 hover:underline font-medium" data-testid="change-photo-link">
          {uploading ? 'Uploading...' : user?.profile_photo ? 'Change photo' : 'Add photo'}
        </button>
      </div>
    </div>
  );
});

export function PrivacyDataSection({ user }) {
  const navigate = useNavigate();
  const logout = useAuthStore(s => s.logout);
  const [downloading, setDownloading] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');

  const handleDownloadData = async () => {
    setDownloading(true);
    try {
      const res = await axios.get('/user/download-data');
      const dataStr = JSON.stringify(res.data, null, 2);
      const blob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `bottomtime-data-${user?.email?.split('@')[0] || 'user'}-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('Your data has been downloaded');
    } catch (e) {
      toast.error('Failed to download data');
    } finally {
      setDownloading(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== 'DELETE') {
      toast.error('Please type DELETE to confirm');
      return;
    }
    setDeleting(true);
    try {
      await axios.delete('/user/delete-account');
      toast.success('Your account has been deleted');
      logout();
      navigate('/');
    } catch (e) {
      toast.error('Failed to delete account');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="mb-6 bg-white rounded-2xl border border-slate-100 shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden" data-testid="section-privacy-data">
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
        <div className="flex items-center gap-2 text-slate-700">
          <span className="text-cyan-400"><Shield size={18} /></span>
          <h2 className="font-bold text-base">Privacy & Data</h2>
        </div>
      </div>
      <div className="px-6 py-4 space-y-4">
        <p className="text-sm text-slate-500">
          Manage your personal data in accordance with our <a href="/privacy" className="text-cyan-500 hover:underline">Privacy Policy</a>. 
          You have the right to access, download, and delete your data.
        </p>
        
        {/* Download Data */}
        <div className="flex items-center justify-between py-3 border-b border-slate-100">
          <div>
            <p className="text-sm font-medium text-slate-800">Download My Data</p>
            <p className="text-xs text-slate-500 mt-0.5">Get a copy of all your personal data in JSON format</p>
          </div>
          <button
            onClick={handleDownloadData}
            disabled={downloading}
            className="flex items-center gap-2 px-4 py-2 bg-cyan-50 text-cyan-600 rounded-full text-sm font-medium hover:bg-cyan-100 transition-colors disabled:opacity-50"
            data-testid="download-data-btn"
          >
            <Download size={16} />
            {downloading ? 'Preparing...' : 'Download'}
          </button>
        </div>

        {/* Delete Account */}
        <div className="pt-2">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-800">Delete Account</p>
              <p className="text-xs text-slate-500 mt-0.5">Permanently delete your account and all data</p>
            </div>
            {!showDeleteConfirm && (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-600 rounded-full text-sm font-medium hover:bg-red-100 transition-colors"
                data-testid="delete-account-btn"
              >
                <Trash2 size={16} />
                Delete
              </button>
            )}
          </div>

          {showDeleteConfirm && (
            <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-xl" data-testid="delete-confirm-dialog">
              <p className="text-sm font-semibold text-red-800 mb-2">⚠️ This action cannot be undone</p>
              <p className="text-xs text-red-700 mb-3">
                Deleting your account will permanently remove all your data including your profile, bookings, dive logs, messages, and connections.
              </p>
              <div className="mb-3">
                <label className="block text-xs font-medium text-red-700 mb-1">
                  Type DELETE to confirm:
                </label>
                <input
                  type="text"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  className="w-full px-3 py-2 border border-red-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
                  placeholder="DELETE"
                  data-testid="delete-confirm-input"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => { setShowDeleteConfirm(false); setDeleteConfirmText(''); }}
                  className="flex-1 px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50"
                  data-testid="cancel-delete-btn"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteAccount}
                  disabled={deleting || deleteConfirmText !== 'DELETE'}
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  data-testid="confirm-delete-btn"
                >
                  {deleting ? 'Deleting...' : 'Permanently Delete'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


const NOTIF_TYPES = [
  { key: 'new_message', label: 'Messages', desc: 'New chat messages from buddies and groups' },
  { key: 'booking_new', label: 'New Bookings', desc: 'When someone books your listing' },
  { key: 'booking_update', label: 'Booking Updates', desc: 'Confirmations, cancellations, and changes' },
  { key: 'connection_request', label: 'Connection Requests', desc: 'When a diver wants to connect' },
  { key: 'connection_accepted', label: 'Connections Accepted', desc: 'When your request is accepted' },
  { key: 'listing_approved', label: 'Listing Approved', desc: 'When your listing goes live' },
  { key: 'listing_rejected', label: 'Listing Rejected', desc: 'When a listing needs changes' },
  { key: 'trip_shared', label: 'Trip Plans', desc: 'When someone shares a trip with you' },
];

export function NotificationPreferencesSection() {
  const [prefs, setPrefs] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    axios.get('/notifications/preferences')
      .then(r => setPrefs(r.data.preferences))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const toggle = async (key) => {
    const updated = { ...prefs, [key]: !prefs[key] };
    setPrefs(updated);
    setSaving(true);
    try {
      await axios.put('/notifications/preferences', updated);
    } catch (e) {
      toast.error('Failed to save');
      setPrefs(prefs);
    } finally {
      setSaving(false);
    }
  };

  if (loading || !prefs) return null;

  return (
    <div className="mb-6 bg-white rounded-2xl border border-slate-100 shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden" data-testid="section-notification-prefs">
      <div className="p-5 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-cyan-50 flex items-center justify-center">
            <Bell size={18} className="text-cyan-400" />
          </div>
          <div>
            <h2 className="text-base font-bold">Notification Preferences</h2>
            <p className="text-xs text-slate-500">Choose which events send you push notifications</p>
          </div>
        </div>
      </div>
      <div className="divide-y divide-slate-50">
        {NOTIF_TYPES.map(({ key, label, desc }) => (
          <div key={key} className="flex items-center justify-between px-5 py-4" data-testid={`notif-pref-${key}`}>
            <div>
              <p className="text-sm font-medium text-slate-800">{label}</p>
              <p className="text-xs text-slate-400 mt-0.5">{desc}</p>
            </div>
            <button
              onClick={() => toggle(key)}
              disabled={saving}
              className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${prefs[key] ? 'bg-cyan-400' : 'bg-slate-200'}`}
              data-testid={`notif-toggle-${key}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${prefs[key] ? 'translate-x-5' : 'translate-x-0'}`} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}



export const CurrencyPreference = memo(function CurrencyPreference() {
  const currency = useUIStore(s => s.currency);
  const setCurrency = useUIStore(s => s.setCurrency);
  const setUser = useAuthStore(s => s.setUser);

  const handleChange = async (code) => {
    setCurrency(code);
    try {
      const res = await axios.put('/auth/profile', { currency: code });
      setUser(res.data);
    } catch (e) { /* silent */ }
  };

  return (
    <Section title="Default Currency" icon={<DollarSign size={18} />}>
      <p className="text-xs text-slate-500 mb-3">This currency will be used across all pages.</p>
      <div className="flex flex-wrap gap-2">
        {CURRENCY_OPTIONS.map(c => (
          <button
            key={c.code}
            onClick={() => handleChange(c.code)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
              currency === c.code
                ? 'bg-cyan-400 text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
            data-testid={`currency-pref-${c.code}`}
          >
            {c.label}
          </button>
        ))}
      </div>
    </Section>
  );
});
