import { useState, useEffect, useCallback } from 'react';
import useAuthStore from '../stores/authStore';
import useUIStore from '../stores/uiStore';
import Navbar from '../components/Navbar';
import { Calendar, MapPin, Clock, Users, Check, Filter, Loader } from 'lucide-react';
import { EventGridSkeleton } from '../components/Skeletons';
import axios from 'axios';
import { toast } from 'sonner';
import Footer from '../components/Footer';
import { useInfiniteScroll } from '../hooks/useInfiniteScroll';

const EVENT_TYPES = [
  { value: '', label: 'All Events' },
  { value: 'meetup', label: 'Meetups' },
  { value: 'social_dive', label: 'Social Dives' },
  { value: 'cleanup', label: 'Cleanups' },
  { value: 'workshop', label: 'Workshops' },
  { value: 'group_trip', label: 'Group Trips' }
];

export default function Events() {
  const user = useAuthStore(s => s.user);
  const openAuth = useUIStore(s => s.openAuth);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [typeFilter, setTypeFilter] = useState('');

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchEvents(); }, []);

  const fetchEvents = async (type, append = false) => {
    if (append) setLoadingMore(true);
    else setLoading(true);
    try {
      const params = new URLSearchParams();
      const t = type !== undefined ? type : typeFilter;
      if (t) params.append('event_type', t);
      params.append('limit', '10');
      if (append) params.append('skip', String(events.length));
      const res = await axios.get(`/events?${params.toString()}`);
      if (append) {
        setEvents(prev => [...prev, ...res.data.events]);
      } else {
        setEvents(res.data.events);
      }
      setHasMore(res.data.has_more || false);
    } catch (e) { toast.error('Failed to load events'); }
    finally { setLoading(false); setLoadingMore(false); }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const loadMoreEvents = useCallback(() => fetchEvents(undefined, true), [events.length, typeFilter]);
  const sentinelRef = useInfiniteScroll(loadMoreEvents, hasMore, loading || loadingMore);

  const handleRsvp = async (eventId) => {
    if (!user) { openAuth(); return; }
    try {
      const res = await axios.post(`/events/${eventId}/rsvp`);
      toast.success(res.data.attending ? 'RSVP confirmed!' : 'RSVP removed');
      fetchEvents();
    } catch (e) { toast.error('Failed to RSVP'); }
  };

  const handleTypeChange = (type) => {
    setTypeFilter(type);
    fetchEvents(type);
  };

  const formatDate = (dateStr) => {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <Navbar />
      <div className="flex-1 max-w-[1600px] mx-auto w-full px-6 lg:px-10 py-12" data-testid="events-page">
        <div className="mb-10">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight leading-none mb-4">Events & Meetups</h1>
          <p className="text-sm text-slate-600">Join the community — dive together, learn together</p>
        </div>

        {/* Type pills */}
        <div className="flex flex-wrap gap-2 mb-8" data-testid="event-type-pills">
          {EVENT_TYPES.map(t => (
            <button
              key={t.value}
              onClick={() => handleTypeChange(t.value)}
              className={`px-4 py-2 rounded-full text-sm font-semibold transition-all duration-300 ${
                typeFilter === t.value
                  ? 'bg-cyan-400 text-white shadow-lg shadow-cyan-400/20'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
              data-testid={`event-pill-${t.value || 'all'}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {loading && events.length === 0 ? (
          <EventGridSkeleton count={4} />
        ) : events.length > 0 ? (
          <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {events.map(event => {
              const isAttending = user && event.attendees?.includes(user.id);
              const spotsLeft = event.max_attendees - (event.attendees?.length || 0);

              return (
                <div key={event.id} className="group rounded-2xl border border-slate-100 bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_20px_50px_rgb(0,0,0,0.08)] transition-all duration-500 overflow-hidden" data-testid="event-card">
                  <div className="relative h-44 overflow-hidden">
                    <img src={event.image_url} alt={event.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" loading="lazy" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
                    <div className="absolute top-3 left-3 px-3 py-1 rounded-full text-xs font-semibold bg-white/90 text-slate-700 capitalize">
                      {event.event_type?.replace('_', ' ')}
                    </div>
                    <div className="absolute bottom-3 left-3 text-white">
                      <div className="text-base font-bold">{formatDate(event.date)}</div>
                    </div>
                  </div>

                  <div className="p-5">
                    <h3 className="text-sm sm:text-base font-bold mb-2 line-clamp-1 group-hover:text-cyan-400 transition-colors">{event.title}</h3>
                    <p className="text-slate-500 text-sm mb-4 line-clamp-2">{event.description}</p>

                    <div className="space-y-1.5 mb-4">
                      <div className="flex items-center gap-2 text-sm text-slate-500">
                        <MapPin size={14} className="flex-shrink-0" />
                        <span className="line-clamp-1">{event.location}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-slate-500">
                        <Clock size={14} className="flex-shrink-0" />
                        <span>{event.time}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-slate-500">
                        <Users size={14} className="flex-shrink-0" />
                        <span>{event.attendees?.length || 0} attending &middot; {spotsLeft > 0 ? `${spotsLeft} spots left` : 'Full'}</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                      <span className="text-xs text-slate-400">by {event.organizer}</span>
                      <button
                        onClick={() => handleRsvp(event.id)}
                        className={`px-4 py-2 rounded-full text-sm font-semibold transition-all ${
                          isAttending
                            ? 'bg-green-50 text-green-700 border border-green-200'
                            : 'border border-slate-200 text-slate-600 group-hover:bg-cyan-400 group-hover:text-white group-hover:border-cyan-400'
                        }`}
                        data-testid="rsvp-btn"
                      >
                        {isAttending ? (
                          <><Check size={14} className="inline mr-1" />Going</>
                        ) : 'RSVP'}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          {(hasMore || loadingMore) && (
            <div ref={sentinelRef} className="flex justify-center py-8" data-testid="events-infinite-scroll">
              {loadingMore && <Loader className="animate-spin text-cyan-400" size={24} />}
            </div>
          )}
          </>
        ) : (
          <div className="text-center py-20">
            <Calendar className="text-slate-300 mx-auto mb-4" size={56} />
            <h3 className="text-lg font-bold mb-2">No events found</h3>
            <p className="text-slate-500">Check back soon for upcoming events in your area</p>
          </div>
        )}
      </div>
      <Footer />
    </div>
  );
}
