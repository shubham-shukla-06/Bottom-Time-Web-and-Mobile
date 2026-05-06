import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import useAuthStore from '../stores/authStore';
import useUIStore from '../stores/uiStore';
import Navbar from '../components/Navbar';
import { Bell, Check, CheckCheck, MessageCircle, UserPlus, UserCheck, Package, Inbox, X, Trash2 } from 'lucide-react';
import { NotificationListSkeleton } from '../components/Skeletons';
import axios from 'axios';
import { toast } from 'sonner';
import Footer from '../components/Footer';
import { resolveNotificationTarget } from '../utils/notificationTarget';

const ICON_MAP = {
  booking_new: Inbox, booking_update: Package,
  connection_request: UserPlus, connection_accepted: UserCheck,
  new_message: MessageCircle, listing_approved: Check, listing_rejected: X,
  operator_application: Inbox, operator_approved: UserCheck, operator_declined: X,
};
const COLOR_MAP = {
  booking_new: 'bg-cyan-100 text-cyan-400', booking_update: 'bg-green-100 text-green-700',
  connection_request: 'bg-blue-100 text-blue-700', connection_accepted: 'bg-emerald-100 text-emerald-700',
  new_message: 'bg-violet-100 text-violet-700', listing_approved: 'bg-green-100 text-green-700',
  listing_rejected: 'bg-red-100 text-red-600',
  operator_application: 'bg-amber-100 text-amber-700', operator_approved: 'bg-green-100 text-green-700',
  operator_declined: 'bg-red-100 text-red-600',
};

export default function Notifications() {
  const user = useAuthStore(s => s.user);
  const openAuth = useUIStore(s => s.openAuth);
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchNotifications = async () => {
    try {
      const res = await axios.get('/notifications?limit=100');
      setNotifications(res.data.notifications);
      setUnread(res.data.unread_count);
    } catch (e) { /* silent */ }
    finally { setLoading(false); }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchNotifications(); }, []);

  const markAllRead = async () => {
    await axios.put('/notifications/read-all').catch(() => {});
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    setUnread(0);
    toast.success('All notifications marked as read');
  };

  const handleDelete = async (id) => {
    await axios.delete(`/notifications/${id}`).catch(() => {});
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const handleClick = async (n) => {
    if (!n.read) {
      axios.put(`/notifications/${n.id}/read`).catch(() => {});
      setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, read: true } : x));
      setUnread(prev => Math.max(0, prev - 1));
    }
    const target = await resolveNotificationTarget(n);
    if (target.error) {
      toast.error(target.error);
      return;
    }
    navigate(target.path);
  };

  const formatTime = (iso) => {
    const d = new Date(iso);
    const now = new Date();
    const diff = (now - d) / 1000;
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} hours ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)} days ago`;
    return d.toLocaleDateString();
  };

  if (!user) return (
    <div className="min-h-screen bg-white"><Navbar />
      <div className="max-w-2xl mx-auto px-6 py-20 text-center">
        <Bell size={48} className="mx-auto mb-4 text-slate-300" />
        <h2 className="text-2xl font-bold mb-2"><button onClick={openAuth} className="text-cyan-400 hover:underline" data-testid="dive-in-link">Dive in</button> to view notifications</h2>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Navbar />
      <div className="flex-1 max-w-2xl mx-auto w-full px-4 sm:px-6 py-8" data-testid="notifications-page">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tighter">Notifications</h1>
            {unread > 0 && <p className="text-sm text-slate-500 mt-0.5">{unread} unread</p>}
          </div>
          {unread > 0 && (
            <button onClick={markAllRead} className="text-sm text-cyan-400 font-semibold hover:underline flex items-center gap-1.5" data-testid="mark-all-read-page">
              <CheckCheck size={16} /> Mark all read
            </button>
          )}
        </div>

        {loading && notifications.length === 0 ? (
          <NotificationListSkeleton count={6} />
        ) : notifications.length > 0 ? (
          <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden divide-y divide-slate-50">
            {notifications.map(n => {
              const Icon = ICON_MAP[n.type] || Bell;
              const colors = COLOR_MAP[n.type] || 'bg-slate-100 text-slate-600';
              return (
                <div key={n.id} className={`flex items-start gap-3 p-4 transition-colors hover:bg-slate-50 ${!n.read ? 'bg-cyan-50/30' : ''}`} data-testid="notif-page-item">
                  <button onClick={() => handleClick(n)} className="flex items-start gap-3 flex-1 text-left min-w-0">
                    <div className={`w-10 h-10 rounded-xl ${colors} flex items-center justify-center flex-shrink-0`}>
                      <Icon size={16} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className={`text-sm ${!n.read ? 'font-bold' : 'font-medium text-slate-600'}`}>{n.title}</p>
                        {!n.read && <div className="w-2 h-2 rounded-full bg-cyan-500 flex-shrink-0" />}
                      </div>
                      <p className="text-sm text-slate-500 mt-0.5">{n.message}</p>
                      <span className="text-xs text-slate-300 mt-1 block">{formatTime(n.created_at)}</span>
                    </div>
                  </button>
                  <button onClick={() => handleDelete(n.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-slate-300 hover:text-red-400 transition-colors flex-shrink-0 mt-1" data-testid="delete-notif">
                    <Trash2 size={14} />
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-20 bg-white rounded-2xl border border-slate-100">
            <Bell size={40} className="mx-auto mb-3 text-slate-300" />
            <h3 className="text-lg font-bold mb-1">All caught up!</h3>
            <p className="text-slate-500 text-sm">You'll see notifications here when something happens</p>
          </div>
        )}
      </div>
      <Footer />
    </div>
  );
}
