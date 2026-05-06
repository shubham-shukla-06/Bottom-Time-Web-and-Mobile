import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import useAuthStore from '../stores/authStore';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import {
  ArrowLeft, MapPin, Calendar, Users, ThumbsUp, UserPlus, Send, Trash2,
  Check, X, Star, Anchor, Globe, Clock, Edit3, Search
} from 'lucide-react';
import axios from 'axios';
import { toast } from 'sonner';
import { TripDetailSkeleton } from '../components/Skeletons';
import { Skeleton } from '../components/ui/skeleton';

const STATUS_STYLES = {
  planning: 'bg-amber-50 text-amber-600 border-amber-200',
  confirmed: 'bg-emerald-50 text-emerald-600 border-emerald-200',
  completed: 'bg-slate-100 text-slate-500 border-slate-200',
};

export default function TripDetail() {
  const { tripId } = useParams();
  const navigate = useNavigate();
  const user = useAuthStore(s => s.user);
  const [trip, setTrip] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [showAddListing, setShowAddListing] = useState(false);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchTrip(); }, [tripId]);

  const fetchTrip = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`/trips/${tripId}`);
      setTrip(res.data);
    } catch (e) {
      toast.error('Failed to load trip');
      navigate('/trips');
    } finally { setLoading(false); }
  };

  const handleRsvp = async (action) => {
    try {
      await axios.put(`/trips/${tripId}/rsvp`, { action });
      toast.success(action === 'accept' ? 'You joined the trip!' : 'Declined');
      fetchTrip();
    } catch (e) { toast.error('Failed'); }
  };

  const handleVote = async (listingId) => {
    try {
      await axios.post(`/trips/${tripId}/listings/${listingId}/vote`);
      fetchTrip();
    } catch (e) { toast.error('Failed to vote'); }
  };

  const handleDelete = async () => {
    if (!window.confirm('Delete this trip?')) return;
    try {
      await axios.delete(`/trips/${tripId}`);
      toast.success('Trip deleted');
      navigate('/trips');
    } catch (e) { toast.error('Failed'); }
  };

  const confirmedMembers = useMemo(() => trip?.members?.filter(m => m.status === 'confirmed') || [], [trip?.members]);
  const invitedMembers = useMemo(() => trip?.members?.filter(m => m.status === 'invited') || [], [trip?.members]);
  const sortedListings = useMemo(() => [...(trip?.listings || [])].sort((a, b) => (b.votes?.length || 0) - (a.votes?.length || 0)), [trip?.listings]);

  if (loading) return (
    <div className="min-h-screen bg-slate-50"><Navbar /><TripDetailSkeleton /></div>
  );

  if (!trip) return null;

  const isOrganizer = trip.creator_id === user?.id;
  const myMembership = trip.members?.find(m => m.user_id === user?.id);
  const isInvited = myMembership?.status === 'invited';

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Navbar />
      <div className="flex-1 max-w-6xl mx-auto w-full px-4 sm:px-6 py-6" data-testid="trip-detail-page">
        <button onClick={() => navigate('/trips')} className="flex items-center gap-1.5 text-slate-400 hover:text-slate-700 mb-4 text-sm" data-testid="back-btn">
          <ArrowLeft size={16} /> All Trips
        </button>

        {/* Invitation Banner */}
        {isInvited && (
          <div className="bg-cyan-50 border border-cyan-200 rounded-2xl p-4 sm:p-5 mb-5 flex flex-col sm:flex-row items-start sm:items-center gap-3" data-testid="invite-banner">
            <div className="flex-1">
              <p className="font-bold text-cyan-800">You're invited!</p>
              <p className="text-sm text-cyan-600">{trip.creator_name} invited you to this trip.</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => handleRsvp('accept')} className="h-9 px-4 bg-cyan-400 text-white rounded-xl text-sm font-bold hover:bg-cyan-500 flex items-center gap-1.5" data-testid="accept-trip-btn"><Check size={14} /> Join</button>
              <button onClick={() => handleRsvp('decline')} className="h-9 px-4 border border-slate-200 text-slate-600 rounded-xl text-sm font-semibold hover:bg-slate-50 flex items-center gap-1.5" data-testid="decline-trip-btn"><X size={14} /> Decline</button>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="bg-white rounded-2xl border border-slate-100 p-5 sm:p-6 mb-5" data-testid="trip-header">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-4">
            <div>
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <h1 className="text-xl sm:text-2xl font-bold text-slate-900">{trip.name}</h1>
                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold capitalize border ${STATUS_STYLES[trip.status] || STATUS_STYLES.planning}`}>{trip.status}</span>
              </div>
              {trip.destination && <p className="text-sm text-slate-500 flex items-center gap-1"><MapPin size={13} /> {trip.destination}{trip.country ? `, ${trip.country}` : ''}</p>}
              {trip.description && <p className="text-sm text-slate-600 mt-2">{trip.description}</p>}
            </div>
            {isOrganizer && (
              <div className="flex gap-2 flex-shrink-0">
                <button onClick={handleDelete} className="h-9 px-3 border border-red-200 text-red-500 rounded-xl text-xs font-semibold hover:bg-red-50 flex items-center gap-1" data-testid="delete-trip-btn"><Trash2 size={13} /> Delete</button>
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-4 text-xs text-slate-500">
            {trip.start_date && <span className="flex items-center gap-1 bg-slate-50 px-3 py-1.5 rounded-lg"><Calendar size={12} /> {trip.start_date}{trip.end_date ? ` to ${trip.end_date}` : ''}</span>}
            <span className="flex items-center gap-1 bg-slate-50 px-3 py-1.5 rounded-lg"><Users size={12} /> {confirmedMembers.length}/{trip.max_members || 8} confirmed</span>
            <span className="flex items-center gap-1 bg-slate-50 px-3 py-1.5 rounded-lg"><Globe size={12} /> Organized by {trip.creator_name}</span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Members */}
          <div className="lg:col-span-1 flex flex-col gap-4">
            <div className="bg-white rounded-2xl border border-slate-100 p-4" data-testid="trip-members">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-bold text-slate-700 flex items-center gap-1.5"><Users size={14} className="text-cyan-500" /> Members</p>
                <button onClick={() => setShowInvite(true)} className="text-[10px] text-cyan-500 font-bold hover:text-cyan-600 flex items-center gap-0.5" data-testid="invite-btn"><UserPlus size={11} /> Invite</button>
              </div>
              <div className="flex flex-col gap-2">
                {confirmedMembers.map(m => (
                  <MemberRow key={m.user_id} member={m} isOrganizer={m.role === 'organizer'} />
                ))}
                {invitedMembers.map(m => (
                  <MemberRow key={m.user_id} member={m} isPending />
                ))}
              </div>
            </div>
          </div>

          {/* Listings */}
          <div className="lg:col-span-2 flex flex-col gap-4">
            <div className="bg-white rounded-2xl border border-slate-100 p-4" data-testid="trip-listings">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-bold text-slate-700 flex items-center gap-1.5"><Anchor size={14} className="text-violet-500" /> Suggested Listings</p>
                <button onClick={() => setShowAddListing(true)} className="h-8 px-3 bg-cyan-400 hover:bg-cyan-500 text-white rounded-lg text-[11px] font-bold flex items-center gap-1" data-testid="add-listing-btn"><Search size={11} /> Browse</button>
              </div>

              {trip.listings?.length > 0 ? (
                <div className="flex flex-col gap-3">
                  {sortedListings.map(l => (
                    <div key={l.listing_id} className="flex items-start gap-3 bg-slate-50 rounded-xl p-3" data-testid="trip-listing-card">
                      {l.image_url && <img src={l.image_url} alt="" className="w-16 h-16 sm:w-20 sm:h-20 rounded-lg object-cover flex-shrink-0" loading="lazy" />}
                      <div className="flex-1 min-w-0">
                        <h4 className="font-bold text-sm text-slate-800 truncate cursor-pointer hover:text-cyan-500" onClick={() => navigate(`/listing/${l.listing_id}`)}>{l.name}</h4>
                        <p className="text-[10px] text-slate-400 flex items-center gap-1"><MapPin size={9} /> {l.location}</p>
                        {l.price && <p className="text-xs font-bold text-cyan-600 mt-1">{l.currency} {l.price}</p>}
                        <p className="text-[9px] text-slate-300 mt-1">Added by {l.added_by_name}</p>
                      </div>
                      <button onClick={() => handleVote(l.listing_id)}
                        className={`flex flex-col items-center gap-0.5 px-3 py-2 rounded-xl transition-colors flex-shrink-0 ${l.votes?.includes(user?.id) ? 'bg-cyan-100 text-cyan-600' : 'bg-white text-slate-400 hover:bg-cyan-50'}`}
                        data-testid={`vote-btn-${l.listing_id}`}>
                        <ThumbsUp size={16} />
                        <span className="text-xs font-black">{l.votes?.length || 0}</span>
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-slate-400">
                  <Anchor className="mx-auto mb-2 text-slate-200" size={32} />
                  <p className="text-xs">No listings added yet. Browse and add dive experiences!</p>
                </div>
              )}
            </div>

            {/* Group Book Button */}
            {isOrganizer && trip.status === 'planning' && trip.listings?.length > 0 && (
              <GroupBookSection trip={trip} onBooked={fetchTrip} />
            )}

            {/* Booking Confirmation */}
            {trip.status === 'confirmed' && trip.booking_id && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4" data-testid="booking-confirmed">
                <div className="flex items-center gap-2 mb-2">
                  <Check size={16} className="text-emerald-600" />
                  <p className="text-sm font-bold text-emerald-700">Trip Booked!</p>
                </div>
                <p className="text-xs text-emerald-600">The group booking has been submitted to the operator. Check your bookings for updates.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {showInvite && <InviteModal tripId={tripId} existingMemberIds={trip.members?.map(m => m.user_id) || []} onClose={() => setShowInvite(false)} onInvited={fetchTrip} />}
      {showAddListing && <AddListingModal tripId={tripId} existingIds={trip.listings?.map(l => l.listing_id) || []} onClose={() => setShowAddListing(false)} onAdded={fetchTrip} />}
      <Footer />
    </div>
  );
}

function MemberRow({ member: m, isOrganizer, isPending }) {
  const navigate = useNavigate();
  return (
    <div className="flex items-center gap-2.5 py-1.5 cursor-pointer" onClick={() => navigate(`/user/${m.user_id}`)} data-testid="member-row">
      {m.profile_photo ? (
        <img src={m.profile_photo} alt="" className="w-8 h-8 rounded-full object-cover" loading="lazy" />
      ) : (
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-cyan-400 to-teal-500 flex items-center justify-center text-white text-[10px] font-bold">{m.name?.charAt(0)}</div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-slate-700 truncate">{m.name}</p>
        <p className="text-[9px] text-slate-400">{isOrganizer ? 'Organizer' : isPending ? 'Invited' : 'Member'}</p>
      </div>
      {isPending && <span className="px-2 py-0.5 bg-amber-50 text-amber-500 text-[9px] font-bold rounded-full">Pending</span>}
      {isOrganizer && <Star size={12} className="text-amber-400" />}
    </div>
  );
}

function InviteModal({ tripId, existingMemberIds, onClose, onInvited }) {
  const [buddies, setBuddies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [inviting, setInviting] = useState(null);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    (async () => {
      try {
        const res = await axios.get('/community/connections');
        setBuddies((res.data.buddies || []).filter(b => !existingMemberIds.includes(b.buddy?.id)));
      } catch (e) { /* silent */ }
      finally { setLoading(false); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const invite = async (userId) => {
    setInviting(userId);
    try {
      await axios.post(`/trips/${tripId}/invite`, { user_id: userId });
      toast.success('Invited!');
      setBuddies(prev => prev.filter(b => b.buddy?.id !== userId));
      onInvited();
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed'); }
    finally { setInviting(null); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md max-h-[70vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()} data-testid="invite-modal">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h2 className="font-bold">Invite Buddies</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400"><X size={16} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex-col gap-2 py-2">{Array.from({ length: 4 }).map((_, i) => <div key={`k${i}`} className="flex items-center gap-3 p-3"><Skeleton className="w-9 h-9 rounded-full flex-shrink-0" /><div className="flex-1 space-y-1.5"><Skeleton className="h-3.5 w-28" /><Skeleton className="h-3 w-20" /></div></div>)}</div>
          ) : buddies.length > 0 ? (
            <div className="flex flex-col gap-2">
              {buddies.map(b => (
                <div key={b.buddy?.id} className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50" data-testid="invite-buddy-row">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-cyan-400 to-teal-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                    {b.buddy?.name?.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{b.buddy?.name}</p>
                    {b.buddy?.location_country && <p className="text-[10px] text-slate-400">{b.buddy.location_country}</p>}
                  </div>
                  <button onClick={() => invite(b.buddy?.id)} disabled={inviting === b.buddy?.id}
                    className="h-8 px-3 bg-cyan-400 text-white rounded-lg text-xs font-bold hover:bg-cyan-500 disabled:opacity-50 flex items-center gap-1" data-testid={`invite-${b.buddy?.id}`}>
                    <Send size={11} /> Invite
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-slate-400">
              <Users className="mx-auto mb-2 text-slate-200" size={32} />
              <p className="text-xs">No buddies available to invite. Connect with more divers first!</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function AddListingModal({ tripId, existingIds, onClose, onAdded }) {
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(null);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchListings(); }, []);

  const fetchListings = async () => {
    setLoading(true);
    try {
      const params = search ? `?search=${encodeURIComponent(search)}&limit=20` : '?limit=20';
      const res = await axios.get(`/listings${params}`);
      setListings((res.data.listings || []).filter(l => !existingIds.includes(l.id)));
    } catch (e) { /* silent */ }
    finally { setLoading(false); }
  };

  const addListing = async (listingId) => {
    setAdding(listingId);
    try {
      await axios.post(`/trips/${tripId}/listings`, { listing_id: listingId });
      toast.success('Listing added!');
      setListings(prev => prev.filter(l => l.id !== listingId));
      onAdded();
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed'); }
    finally { setAdding(null); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[80vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()} data-testid="add-listing-modal">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h2 className="font-bold">Add Listing to Trip</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400"><X size={16} /></button>
        </div>
        <div className="px-5 py-3 border-b border-slate-100">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 text-slate-400" size={14} />
            <input placeholder="Search listings..." className="w-full h-9 bg-slate-50 border border-slate-200 rounded-lg text-xs pl-9 pr-3 outline-none focus:border-cyan-400"
              value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && fetchListings()} data-testid="listing-search" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex-col gap-2 py-2">{Array.from({ length: 3 }).map((_, i) => <div key={`k${i}`} className="flex items-center gap-3 p-3"><Skeleton className="w-14 h-14 rounded-lg flex-shrink-0" /><div className="flex-1 space-y-1.5"><Skeleton className="h-3.5 w-32" /><Skeleton className="h-3 w-20" /></div></div>)}</div>
          ) : listings.length > 0 ? (
            <div className="flex flex-col gap-2">
              {listings.map(l => (
                <div key={l.id} className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50" data-testid="search-listing-row">
                  {l.image_url && <img src={l.image_url} alt="" className="w-14 h-14 rounded-lg object-cover flex-shrink-0" loading="lazy" />}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{l.name}</p>
                    <p className="text-[10px] text-slate-400 flex items-center gap-1"><MapPin size={9} /> {l.location}</p>
                    {l.price && <p className="text-xs font-bold text-cyan-600">${l.price}</p>}
                  </div>
                  <button onClick={() => addListing(l.id)} disabled={adding === l.id}
                    className="h-8 px-3 bg-cyan-400 text-white rounded-lg text-xs font-bold hover:bg-cyan-500 disabled:opacity-50" data-testid={`add-${l.id}`}>
                    Add
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-center text-xs text-slate-400 py-8">No listings found</p>
          )}
        </div>
      </div>
    </div>
  );
}

function GroupBookSection({ trip, onBooked }) {
  const [bookingDate, setBookingDate] = useState('');
  const [booking, setBooking] = useState(false);
  const [result, setResult] = useState(null);

  const topListing = [...(trip.listings || [])].sort((a, b) => (b.votes?.length || 0) - (a.votes?.length || 0))[0];
  const confirmedCount = trip.members?.filter(m => m.status === 'confirmed').length || 0;

  if (!topListing) return null;

  const handleGroupBook = async () => {
    if (!bookingDate) { toast.error('Select a date'); return; }
    setBooking(true);
    try {
      const res = await axios.post(`/trips/${trip.id}/group-book`, { listing_id: topListing.listing_id, date: bookingDate });
      setResult(res.data.summary);
      toast.success('Group booking submitted!');
      onBooked();
    } catch (e) { toast.error(e.response?.data?.detail || 'Booking failed'); }
    finally { setBooking(false); }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-4" data-testid="group-book-section">
      <p className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-1.5"><Users size={14} className="text-emerald-500" /> Book for Group</p>

      {result ? (
        <div className="bg-emerald-50 rounded-xl p-4 space-y-2 text-sm">
          <p className="font-bold text-emerald-700">Booking Submitted!</p>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <span className="text-slate-500">Listing</span><span className="font-semibold">{result.listing}</span>
            <span className="text-slate-500">Date</span><span className="font-semibold">{result.date}</span>
            <span className="text-slate-500">Divers</span><span className="font-semibold">{result.members}</span>
            <span className="text-slate-500">Per person</span><span className="font-semibold">{result.currency} {result.per_person}</span>
            <span className="text-slate-500 font-bold">Total</span><span className="font-black text-emerald-700">{result.currency} {result.total}</span>
          </div>
        </div>
      ) : (
        <>
          <div className="bg-slate-50 rounded-xl p-3 mb-3">
            <div className="flex items-center gap-2 mb-1">
              <ThumbsUp size={12} className="text-cyan-500" />
              <span className="text-xs font-bold text-slate-700">Top voted: {topListing.name}</span>
              <span className="text-[10px] text-cyan-500 font-bold">{topListing.votes?.length || 0} votes</span>
            </div>
            <p className="text-[10px] text-slate-400">{confirmedCount} confirmed divers x {topListing.currency} {topListing.price || 0} = <span className="font-bold text-slate-600">{topListing.currency} {(topListing.price || 0) * confirmedCount}</span></p>
          </div>
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <label className="block text-[10px] text-slate-400 font-semibold mb-1">Trip Date</label>
              <input type="date" className="w-full h-9 bg-white border border-slate-200 rounded-lg text-xs px-3 outline-none focus:border-cyan-400"
                value={bookingDate} onChange={e => setBookingDate(e.target.value)} min={new Date().toISOString().split('T')[0]} data-testid="group-book-date" />
            </div>
            <button onClick={handleGroupBook} disabled={booking || !bookingDate}
              className="h-9 px-4 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-xs font-bold disabled:opacity-50 flex items-center gap-1.5" data-testid="group-book-btn">
              {booking ? 'Booking...' : 'Book Group'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

