import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Check, CheckCheck, MessageCircle, UserPlus, UserCheck, Package, Star, Inbox, X } from 'lucide-react';
import axios from 'axios';
import { toast } from 'sonner';
import useAuthStore from '../stores/authStore';
import { resolveNotificationTarget } from '../utils/notificationTarget';

const ICON_MAP = {
  booking_new: Inbox,
  booking_update: Package,
  connection_request: UserPlus,
  connection_accepted: UserCheck,
  new_message: MessageCircle,
  listing_approved: Check,
  listing_rejected: X,
};

const COLOR_MAP = {
  booking_new: 'bg-cyan-100 text-cyan-700',
  booking_update: 'bg-cyan-50 text-cyan-600',
  connection_request: 'bg-slate-100 text-slate-700',
  connection_accepted: 'bg-cyan-100 text-cyan-700',
  new_message: 'bg-slate-100 text-slate-700',
  listing_approved: 'bg-cyan-100 text-cyan-700',
  listing_rejected: 'bg-red-100 text-red-600',
};

export default function NotificationBell() {
  const user = useAuthStore(s => s.user);
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unread, setUnread] = useState(0);
  const [prevUnread, setPrevUnread] = useState(0);
  const ref = useRef(null);

  const fetchNotifications = async () => {
    try {
      const res = await axios.get('/notifications?limit=15');
      setNotifications(res.data.notifications);
      setPrevUnread(unread);
      setUnread(res.data.unread_count);
    } catch (e) { /* silent */ }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!user) return;
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 20000);
    return () => clearInterval(interval);
  }, [user]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const markRead = async (id) => {
    await axios.put(`/notifications/${id}/read`).catch(() => {});
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    setUnread(prev => Math.max(0, prev - 1));
  };

  const markAllRead = async () => {
    await axios.put('/notifications/read-all').catch(() => {});
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    setUnread(0);
  };

  const handleClick = async (n) => {
    if (!n.read) markRead(n.id);
    setOpen(false);
    const target = await resolveNotificationTarget(n);
    if (target.error) {
      toast.error(target.error);
      return;
    }
    navigate(target.path);
  };

  const timeAgo = (iso) => {
    const diff = (Date.now() - new Date(iso).getTime()) / 1000;
    if (diff < 60) return 'now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
    return `${Math.floor(diff / 86400)}d`;
  };

  if (!user) return null;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className={`relative p-2 rounded-lg transition-colors ${open ? 'bg-cyan-50 text-cyan-400' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'}`}
        data-testid="notification-bell"
      >
        <Bell size={18} />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4.5 h-4.5 min-w-[18px] px-1 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center" data-testid="notif-badge">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 bg-white rounded-2xl border border-slate-100 shadow-[0_20px_60px_rgb(0,0,0,0.15)] z-50 overflow-hidden" data-testid="notif-dropdown">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <h3 className="font-bold text-sm">Notifications</h3>
            <div className="flex items-center gap-2">
              {unread > 0 && (
                <button onClick={markAllRead} className="text-xs text-cyan-400 font-semibold hover:underline flex items-center gap-1" data-testid="mark-all-read">
                  <CheckCheck size={12} /> Mark all read
                </button>
              )}
              <button onClick={() => { setOpen(false); navigate('/notifications'); }} className="text-xs text-slate-400 hover:text-slate-600 font-medium" data-testid="view-all-notifs">
                View all
              </button>
            </div>
          </div>

          {/* Notification list */}
          <div className="max-h-[400px] overflow-y-auto">
            {notifications.length > 0 ? notifications.map(n => {
              const Icon = ICON_MAP[n.type] || Bell;
              const colors = COLOR_MAP[n.type] || 'bg-slate-100 text-slate-600';
              return (
                <button
                  key={n.id}
                  onClick={() => handleClick(n)}
                  className={`w-full flex items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50 ${!n.read ? 'bg-cyan-50/40' : ''}`}
                  data-testid="notif-item"
                >
                  <div className={`w-8 h-8 rounded-lg ${colors} flex items-center justify-center flex-shrink-0 mt-0.5`}>
                    <Icon size={14} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className={`text-sm line-clamp-1 ${!n.read ? 'font-semibold' : 'font-medium text-slate-600'}`}>{n.title}</p>
                      {!n.read && <div className="w-2 h-2 rounded-full bg-cyan-500 flex-shrink-0" />}
                    </div>
                    <p className="text-xs text-slate-400 line-clamp-1 mt-0.5">{n.message}</p>
                    <span className="text-[10px] text-slate-300 mt-0.5">{timeAgo(n.created_at)}</span>
                  </div>
                </button>
              );
            }) : (
              <div className="py-12 text-center text-slate-400 text-sm">
                <Bell size={24} className="mx-auto mb-2 opacity-40" />
                <p>No notifications yet</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
