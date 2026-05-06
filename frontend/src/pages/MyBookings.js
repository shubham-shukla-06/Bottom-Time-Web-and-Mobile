import { useState, useEffect } from 'react';
import useAuthStore from '../stores/authStore';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { Calendar, MapPin, Users, Clock, MessageCircle, CheckCircle, XCircle, Loader } from 'lucide-react';
import { BookingListSkeleton } from '../components/Skeletons';
import axios from 'axios';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import useHighlightOnNavigate from '../hooks/useHighlightOnNavigate';

const STATUS_STYLES = {
  pending: { bg: 'bg-amber-50 text-amber-700 border-amber-200', label: 'Pending', icon: Clock },
  confirmed: { bg: 'bg-emerald-50 text-emerald-700 border-emerald-200', label: 'Confirmed', icon: CheckCircle },
  rejected: { bg: 'bg-red-50 text-red-600 border-red-200', label: 'Declined', icon: XCircle },
  cancelled: { bg: 'bg-slate-100 text-slate-500 border-slate-200', label: 'Cancelled', icon: XCircle },
};

export default function MyBookings() {
  const user = useAuthStore(s => s.user);
  const navigate = useNavigate();
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchBookings(); }, []);

  const fetchBookings = async () => {
    setLoading(true);
    try {
      const res = await axios.get('/bookings');
      setBookings(res.data.bookings);
    } catch (e) { toast.error('Failed to load bookings'); }
    finally { setLoading(false); }
  };

  const cancelBooking = async (id) => {
    if (!window.confirm('Cancel this booking?')) return;
    try {
      await axios.put(`/bookings/${id}/status?status=cancelled`);
      toast.success('Booking cancelled');
      fetchBookings();
    } catch (e) { toast.error('Failed to cancel booking'); }
  };

  const filtered = filter === 'all' ? bookings : bookings.filter(b => b.status === filter);

  // ?highlight=<booking_id> from a booking_update notification → scroll + ring
  useHighlightOnNavigate({
    ready: !loading,
    onMissing: () => toast.error('That booking no longer exists.'),
  });

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  };

  const timeAgo = (dateStr) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <Navbar />
      <div className="flex-1 max-w-[1600px] mx-auto w-full px-6 lg:px-10 py-12" data-testid="my-bookings-page">
        <div className="mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold mb-2">My Bookings</h1>
          <p className="text-slate-500">Track and manage your dive bookings</p>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2 mb-8" data-testid="booking-filters">
          {['all', 'pending', 'confirmed', 'rejected', 'cancelled'].map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${filter === f ? 'bg-cyan-400 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
              data-testid={`filter-${f}`}
            >
              {f === 'all' ? 'All' : STATUS_STYLES[f]?.label || f}
              {f === 'all' && ` (${bookings.length})`}
              {f !== 'all' && ` (${bookings.filter(b => b.status === f).length})`}
            </button>
          ))}
        </div>

        {loading && filtered.length === 0 ? (
          <BookingListSkeleton count={4} />
        ) : filtered.length === 0 ? (
          <div className="text-center py-20" data-testid="no-bookings">
            <Calendar className="mx-auto mb-4 text-slate-300" size={48} />
            <h3 className="text-xl font-bold mb-2 text-slate-700">No bookings yet</h3>
            <p className="text-slate-500 mb-6">Discover amazing dive experiences and make your first booking</p>
            <button onClick={() => navigate('/discover')} className="btn-primary px-6 py-3 text-sm" data-testid="browse-listings-btn">
              Browse Listings
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-4" data-testid="bookings-list">
            {filtered.map(booking => {
              const style = STATUS_STYLES[booking.status] || STATUS_STYLES.pending;
              const StatusIcon = style.icon;
              return (
                <div key={booking.id} data-highlight-id={booking.id} className="border border-slate-200 rounded-2xl p-5 hover:shadow-md transition-shadow" data-testid="booking-card">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <h3 className="font-bold text-lg truncate" data-testid="booking-name">{booking.listing_name}</h3>
                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium border ${style.bg}`} data-testid="booking-status">
                          <StatusIcon size={12} />
                          {style.label}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-slate-500">
                        <span className="flex items-center gap-1.5">
                          <Calendar size={14} />
                          {formatDate(booking.date)}
                        </span>
                        <span className="flex items-center gap-1.5">
                          <Users size={14} />
                          {booking.participants} {booking.participants === 1 ? 'person' : 'people'}
                        </span>
                        {booking.price && (
                          <span className="flex items-center gap-1.5 font-medium text-slate-700">
                            ${booking.price}
                          </span>
                        )}
                      </div>
                      {booking.notes && (
                        <p className="text-sm text-slate-400 mt-2 truncate">Note: {booking.notes}</p>
                      )}
                      <p className="text-xs text-slate-400 mt-2">Booked {timeAgo(booking.created_at)}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {booking.status === 'confirmed' && booking.operator_id && (
                        <button
                          onClick={() => navigate(`/messages?with=${booking.operator_id}`)}
                          className="flex items-center gap-1.5 px-3 py-2 text-sm bg-cyan-50 text-cyan-400 rounded-lg hover:bg-cyan-100 transition-colors font-medium"
                          data-testid="message-operator-btn"
                        >
                          <MessageCircle size={14} /> Message
                        </button>
                      )}
                      {booking.status === 'pending' && (
                        <button
                          onClick={() => cancelBooking(booking.id)}
                          className="px-3 py-2 text-sm text-red-500 bg-red-50 rounded-lg hover:bg-red-100 transition-colors font-medium"
                          data-testid="cancel-booking-btn"
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <Footer />
    </div>
  );
}
