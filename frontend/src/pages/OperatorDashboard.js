import { useState, useEffect, useCallback, useMemo, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import useAuthStore from '../stores/authStore';
import Navbar from '../components/Navbar';
import DiveListingBuilder from '../components/DiveListingBuilder';
import OperatorCustomers from '../components/OperatorCustomers';
import OperatorEquipment from '../components/OperatorEquipment';
import OperatorApplicationForm from '../components/OperatorApplicationForm';
import ShareModal from '../components/ShareModal';
import ShareAnalyticsTab from '../components/ShareAnalyticsTab';
import { Package, Inbox, CheckCircle, XCircle, Clock, BarChart3, TrendingUp, Wallet, Settings, Building2, Globe, Users, Wrench, FileText, Anchor, Shield, Star, Edit3, Trash2, Share2, Sparkles, X as XIcon } from 'lucide-react';
import axios from 'axios';
import { toast } from 'sonner';
import AnalyticsTab from './operator/AnalyticsTab';
import PayoutsTab from './operator/PayoutsTab';
import { StatCard, StatusBadge, Loader, EmptyState } from './operator/OperatorPrimitives';
import { OperatorDashboardSkeleton } from '../components/Skeletons';
import useTabParam from '../hooks/useTabParam';
import useHighlightOnNavigate from '../hooks/useHighlightOnNavigate';

const VALID_TAB_KEYS = ['overview', 'listings', 'bookings', 'customers', 'equipment', 'payouts', 'analytics', 'share-analytics'];

export default function OperatorDashboard() {
  const user = useAuthStore(s => s.user);
  const navigate = useNavigate();
  const [tab, setTab] = useTabParam('tab', 'overview', VALID_TAB_KEYS);
  const [stats, setStats] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [analytics, setAnalytics] = useState(null);
  const [payouts, setPayouts] = useState({ payouts: [], summary: {} });
  const [payoutSettings, setPayoutSettings] = useState({});
  const [payoutConfigured, setPayoutConfigured] = useState(false);
  const [savingPayout, setSavingPayout] = useState(false);

  const isPending = useMemo(() => user?.status === 'pending_approval', [user]);

  const [showDiveBuilder, setShowDiveBuilder] = useState(false);
  const [editingDiveListing, setEditingDiveListing] = useState(null);
  const [diveListings, setDiveListings] = useState([]);
  const [appStatus, setAppStatus] = useState(null); // null=loading, 'none'|'pending'|'approved'|'rejected'
  const [shareListing, setShareListing] = useState(null);
  const [shareCalloutDismissed, setShareCalloutDismissed] = useState(() => {
    try { return localStorage.getItem('bt_share_callout_dismissed') === '1'; } catch (e) { return false; }
  });
  const dismissCallout = () => {
    try { localStorage.setItem('bt_share_callout_dismissed', '1'); } catch (e) { /* ignore */ }
    setShareCalloutDismissed(true);
  };

  // Fetch application status for pending operators
  useEffect(() => {
    if (!isPending) { setAppStatus('approved'); return; }
    axios.get('/operator-listings/application/status')
      .then(r => {
        const app = r.data?.application;
        if (!app) setAppStatus('none');
        else setAppStatus(app.status);
      })
      .catch(() => setAppStatus('none'));
  }, [isPending]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const handleTabChange = useCallback((nextTab) => setTab(nextTab), [setTab]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const openDiveBuilder = useCallback(() => {
    setEditingDiveListing(null);
    setShowDiveBuilder(true);
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const fetchDiveListings = useCallback(async () => {
    try {
      const res = await axios.get('/operator-listings/listings');
      setDiveListings(res.data.listings || []);
    } catch (e) { /* silent */ }
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      if (tab === 'overview' || !stats) {
        const s = await axios.get('/operator/stats');
        setStats(s.data);
      }
      if (tab === 'bookings') {
        const res = await axios.get('/bookings/operator');
        setBookings(res.data.bookings);
      }
      if (tab === 'analytics') {
        const res = await axios.get('/operator/analytics');
        setAnalytics(res.data);
      }
      if (tab === 'listings' || tab === 'overview') {
        await fetchDiveListings();
      }
      if (tab === 'payouts') {
        const [payoutRes, settingsRes] = await Promise.all([
          axios.get('/payouts'),
          axios.get('/operator/payout-settings')
        ]);
        setPayouts(payoutRes.data);
        setPayoutSettings(settingsRes.data.payout_settings || {});
        setPayoutConfigured(settingsRes.data.payout_configured);
      }
    } catch (e) { toast.error('Failed to load data'); }
    finally { setLoading(false); }
  }, [tab, stats, fetchDiveListings]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchData(); }, [fetchData]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const handleBookingAction = useCallback(async (id, status) => {
    try {
      await axios.put(`/bookings/${id}/status?status=${status}`);
      toast.success(`Booking ${status}`);
      fetchData();
    } catch (e) { toast.error('Failed to update'); }
  }, [fetchData]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const handleSavePayoutSettings = useCallback(async () => {
    if (!payoutSettings.payout_country || !payoutSettings.payout_currency || !payoutSettings.bank_account_name) {
      toast.error('Please fill in required fields');
      return;
    }
    setSavingPayout(true);
    try {
      await axios.put('/operator/payout-settings', payoutSettings);
      toast.success('Payout settings saved');
      setPayoutConfigured(true);
    } catch (e) { toast.error('Failed to save'); }
    finally { setSavingPayout(false); }
  }, [payoutSettings]);

  const isInstructor = useMemo(() => user?.role === 'instructor', [user]);
  const title = useMemo(() => (isInstructor ? 'Instructor Dashboard' : 'Operator Dashboard'), [isInstructor]);

  const TABS = useMemo(() => ([
    { key: 'overview', label: 'Overview', icon: BarChart3 },
    { key: 'listings', label: 'My Listings', icon: Anchor, count: diveListings.length },
    { key: 'bookings', label: 'Bookings', icon: Inbox },
    { key: 'customers', label: 'Customers', icon: Users },
    { key: 'equipment', label: 'Equipment', icon: Wrench },
    { key: 'payouts', label: 'Payouts', icon: Wallet },
    { key: 'analytics', label: 'Analytics', icon: TrendingUp },
    { key: 'share-analytics', label: 'Share Tracking', icon: Share2 },
  ]), [diveListings.length]);

  const statusData = useMemo(() => {
    if (!analytics) return [];
    return [
      { name: 'Confirmed', value: analytics.status_counts.confirmed, color: '#10b981' },
      { name: 'Pending', value: analytics.status_counts.pending, color: '#f59e0b' },
      { name: 'Rejected', value: analytics.status_counts.rejected, color: '#ef4444' },
      { name: 'Cancelled', value: analytics.status_counts.cancelled, color: '#94a3b8' },
    ].filter(s => s.value > 0);
  }, [analytics]);

  const statusLegend = useMemo(() => statusData.map(({ name, value, color }) => ({ label: name, value, color })), [statusData]);
  const bookingTrend = useMemo(() => analytics?.booking_trend || [], [analytics]);
  const popularListings = useMemo(() => analytics?.popular_listings || [], [analytics]);

  // Notification deep-link: if URL has ?highlight=<id>, scroll to that booking row
  // (when on bookings tab) and animate the cyan ring. If the booking can't be
  // found after the list finished loading, surface a friendly toast.
  useHighlightOnNavigate({
    ready: tab === 'bookings' && !loading,
    onMissing: () => toast.error('That booking no longer exists.'),
  });

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-12 py-6 sm:py-8" data-testid="operator-dashboard">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-5 gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">{title}</h1>
            <p className="text-slate-500 text-sm mt-0.5">Manage your dive business</p>
          </div>
          {!isPending && (
            <div className="flex gap-2.5 self-start sm:self-auto">
              <button onClick={openDiveBuilder} className="h-10 px-5 bg-cyan-400 hover:bg-cyan-500 text-white rounded-full text-sm font-bold flex items-center gap-2 transition-colors shadow-sm" data-testid="create-dive-listing-btn-top">
                <Anchor size={15} /> Dive Trip
              </button>
            </div>
          )}
        </div>

        {isPending && appStatus === 'none' && (
          <div className="py-8">
            <OperatorApplicationForm onSubmitted={() => setAppStatus('pending')} />
          </div>
        )}

        {isPending && appStatus === 'pending' && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 mb-5 flex items-start gap-3" data-testid="pending-alert">
            <Clock className="text-amber-500 flex-shrink-0 mt-0.5" size={20} />
            <div>
              <h3 className="font-bold text-amber-800 mb-1">Application Under Review</h3>
              <p className="text-amber-700 text-sm">Your operator application is being reviewed by the Bottom Time Compliance team. You'll receive an email notification and can start creating listings once approved. This usually takes less than 48 hours.</p>
            </div>
          </div>
        )}

        {isPending && appStatus === 'rejected' && (
          <div className="py-8">
            <div className="bg-red-50 border border-red-200 rounded-2xl p-5 mb-6 flex items-start gap-3 max-w-2xl mx-auto" data-testid="rejected-alert">
              <XCircle className="text-red-500 flex-shrink-0 mt-0.5" size={20} />
              <div>
                <h3 className="font-bold text-red-800 mb-1">Application Not Approved</h3>
                <p className="text-red-700 text-sm">Your previous application was not approved. Please review the feedback sent to your email, update your details, and reapply below.</p>
              </div>
            </div>
            <OperatorApplicationForm onSubmitted={() => setAppStatus('pending')} />
          </div>
        )}

        {/* Tabs + Content — only when approved */}
        {!isPending && (
          <>
        <div className="flex gap-1.5 mb-6 bg-white rounded-xl p-1.5 shadow-sm border border-slate-100" data-testid="operator-tabs">
          {TABS.map(t => (
            <button key={t.key} onClick={() => handleTabChange(t.key)}
              className={`h-9 flex-1 rounded-lg text-xs sm:text-sm font-semibold transition-all flex items-center justify-center gap-1 whitespace-nowrap ${tab === t.key ? 'bg-cyan-400 text-white shadow-sm' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'}`}
              data-testid={`tab-${t.key}`}>
              <t.icon size={13} /> <span className="hidden sm:inline">{t.label}</span>
              {t.count > 0 && <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${tab === t.key ? 'bg-white/20' : 'bg-cyan-100 text-cyan-600'}`}>{t.count}</span>}
            </button>
          ))}
        </div>

        {loading && !stats ? <OperatorDashboardSkeleton /> : (
          <>
            {/* OVERVIEW TAB */}
            {tab === 'overview' && (
              <div className="space-y-6">
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  <StatCard label="Active Listings" value={stats?.active_listings} color="cyan" icon={<Package size={16} className="text-cyan-500" />} />
                  <StatCard label="Pending Bookings" value={stats?.pending_bookings} color="amber" icon={<Clock size={16} className="text-amber-500" />} />
                  <StatCard label="Confirmed" value={stats?.confirmed_bookings} color="emerald" icon={<CheckCircle size={16} className="text-emerald-500" />} />
                  <StatCard label="Total Bookings" value={stats?.total_bookings} color="blue" icon={<Inbox size={16} className="text-blue-500" />} />
                  <StatCard label="Reviews" value={stats?.total_reviews} color="amber" icon={<Star size={16} className="text-amber-400" />} />
                  <StatCard label="Total Listings" value={stats?.total_listings} color="slate" icon={<Package size={16} className="text-slate-400" />} />
                  <StatCard label="Pending Listings" value={stats?.pending_listings} color="slate" icon={<Clock size={16} className="text-slate-400" />} />
                </div>

                {/* Quick listing preview */}
                {diveListings.length > 0 && (
                  <div className="bg-white rounded-2xl border border-slate-100 p-6">
                    <div className="flex items-center justify-between mb-4">
                      <h2 className="text-lg font-bold">Your Listings</h2>
                      <button onClick={() => setTab('listings')} className="text-sm text-cyan-400 font-semibold hover:underline" data-testid="overview-view-all-listings">View all</button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {diveListings.slice(0, 3).map(dl => (
                        <button key={dl.id} onClick={() => navigate(`/listing/${dl.id}`)}
                          className="text-left bg-slate-50 rounded-xl overflow-hidden hover:shadow-md transition-all border border-slate-100">
                          {dl.photos?.[0]?.url && (
                            <img src={dl.photos[0].url.startsWith('/') ? `${process.env.REACT_APP_BACKEND_URL}${dl.photos[0].url}` : dl.photos[0].url}
                              alt="" className="w-full h-32 object-cover" loading="lazy" />
                          )}
                          <div className="p-3">
                            <h3 className="font-bold text-sm truncate">{dl.title || 'Untitled'}</h3>
                            <p className="text-xs text-slate-500 mt-0.5 truncate">{dl.location || 'Location not set'}{dl.country ? `, ${dl.country}` : ''}</p>
                            <p className="text-xs text-cyan-600 font-bold mt-1">{dl.currency} {dl.price}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* LISTINGS TAB */}
            {tab === 'listings' && (
              <div className="space-y-4" data-testid="dive-listings-tab">
                {!shareCalloutDismissed && (
                  <div className="relative bg-gradient-to-r from-cyan-50 via-violet-50 to-cyan-50 border border-cyan-100 rounded-2xl p-4" data-testid="share-callout">
                    <button onClick={dismissCallout} className="absolute top-3 right-3 text-slate-400 hover:text-slate-600" data-testid="dismiss-share-callout"><XIcon size={14} /></button>
                    <div className="flex items-start gap-3 pr-6">
                      <div className="w-9 h-9 rounded-full bg-cyan-400 flex items-center justify-center flex-shrink-0">
                        <Sparkles size={16} className="text-white" />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-slate-800 mb-0.5">One unique link per platform — see what's actually working</h3>
                        <p className="text-xs text-slate-600 leading-relaxed">Hit <strong>Share</strong> on any listing, pick where you'll post it (WhatsApp, Instagram, your newsletter…), and we generate a unique tracked link per platform. See clicks &amp; bookings broken down by platform in the new <button onClick={() => setTab('share-analytics')} className="text-cyan-600 font-semibold underline underline-offset-2">Share Tracking</button> tab.</p>
                      </div>
                    </div>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <p className="text-sm text-slate-500">{diveListings.length} listing{diveListings.length !== 1 ? 's' : ''}</p>
                </div>
                {diveListings.length > 0 ? (
                  <div className="flex flex-col gap-4">
                    {diveListings.map(dl => (
                      <div key={dl.id} className="bg-white rounded-2xl border border-slate-100 hover:border-cyan-300 p-5 hover:shadow-md transition-[box-shadow,border-color] duration-200 flex items-center gap-5" data-testid={`dive-listing-${dl.id}`}>
                        {/* Thumbnail (always rendered for consistent card height) */}
                        <div className="w-20 h-20 rounded-xl bg-slate-100 flex-shrink-0 overflow-hidden flex items-center justify-center">
                          {dl.photos?.[0]?.url ? (
                            <img src={dl.photos[0].url.startsWith('/') ? `${process.env.REACT_APP_BACKEND_URL}${dl.photos[0].url}` : dl.photos[0].url}
                              alt="" className="w-full h-full object-cover" loading="lazy" />
                          ) : (
                            <Anchor size={28} className="text-slate-300" />
                          )}
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-bold text-base truncate">{dl.title || 'Untitled'}</h3>
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold flex-shrink-0 ${
                              dl.status === 'active' ? 'bg-green-100 text-green-700' :
                              dl.status === 'pending' ? 'bg-amber-100 text-amber-700' :
                              dl.status === 'draft' ? 'bg-slate-100 text-slate-500' :
                              'bg-slate-100 text-slate-500'
                            }`}>{dl.status}</span>
                          </div>
                          <p className="text-xs text-slate-500 mb-2 truncate">{dl.listing_type?.replace('_', ' ')} &middot; {dl.location || 'Location not set'}{dl.country ? `, ${dl.country}` : ''}</p>
                          <div className="flex items-center gap-4 text-xs text-slate-400">
                            <span>{dl.difficulty_level}</span>
                            <span>{dl.max_depth}m max depth</span>
                            {dl.nitrox_available && <span className="text-cyan-600">Nitrox</span>}
                            <span className="font-bold text-slate-700">{dl.currency} {dl.price}</span>
                          </div>
                        </div>

                        {/* Actions — labeled pills, large hit-area, color-coded */}
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <button onClick={() => setShareListing(dl)}
                            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-slate-600 hover:bg-violet-50 hover:text-violet-600 border border-slate-200 hover:border-violet-200 transition-colors"
                            data-testid={`share-dive-${dl.id}`} title="Share with UTM tracking">
                            <Share2 size={16} /> Share
                          </button>
                          <button onClick={() => navigate(`/listing/${dl.id}`)}
                            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-900 border border-slate-200 transition-colors"
                            data-testid={`view-dive-${dl.id}`} title="View public listing">
                            <Globe size={16} /> View
                          </button>
                          <button onClick={() => { setEditingDiveListing(dl); setShowDiveBuilder(true); }}
                            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-slate-600 hover:bg-cyan-50 hover:text-cyan-600 border border-slate-200 hover:border-cyan-200 transition-colors"
                            data-testid={`edit-dive-${dl.id}`} title="Edit listing">
                            <Edit3 size={16} /> Edit
                          </button>
                          <button onClick={async () => { if (window.confirm('Delete?')) { await axios.delete(`/operator-listings/listings/${dl.id}`); fetchDiveListings(); }}}
                            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-slate-500 hover:bg-red-50 hover:text-red-600 border border-slate-200 hover:border-red-200 transition-colors"
                            data-testid={`delete-dive-${dl.id}`} title="Delete listing">
                            <Trash2 size={16} /> Delete
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState icon={<Anchor size={40} />} title="No listings yet" desc="Create your first dive listing with photos, dive sites, gear details, and more" />
                )}
              </div>
            )}

            {/* BOOKINGS TAB */}
            {tab === 'bookings' && (
              bookings.length > 0 ? (
                <div className="flex flex-col gap-4">
                  {bookings.map(b => (
                    <div key={b.id} data-highlight-id={b.id} className="bg-white rounded-2xl border border-slate-100 p-5" data-testid="booking-request">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <h3 className="font-bold">{b.user_name}</h3>
                          <p className="text-sm text-slate-500">{b.listing_name}</p>
                        </div>
                        <StatusBadge status={b.status} />
                      </div>
                      <div className="flex gap-6 text-sm text-slate-600 mb-4">
                        <span>Date: {b.date}</span>
                        <span>Participants: {b.participants}</span>
                        {b.price && <span>Price: ${b.price}</span>}
                      </div>
                      {b.notes && <p className="text-sm text-slate-500 mb-4 bg-slate-50 rounded-xl p-3">{b.notes}</p>}
                      {b.status === 'pending' && (
                        <div className="flex gap-2">
                          <button onClick={() => handleBookingAction(b.id, 'confirmed')} className="px-4 py-2 bg-cyan-500 text-white text-sm font-semibold rounded-lg hover:bg-cyan-600 flex items-center gap-1" data-testid="confirm-booking-btn">
                            <CheckCircle size={14} /> Confirm
                          </button>
                          <button onClick={() => handleBookingAction(b.id, 'rejected')} className="px-4 py-2 border border-red-200 text-red-500 text-sm font-semibold rounded-lg hover:bg-red-50 flex items-center gap-1" data-testid="reject-booking-btn">
                            <XCircle size={14} /> Decline
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState icon={<Inbox size={40} />} title="No booking requests" desc="Requests will appear here when divers book your listings" />
              )
            )}

            {/* CUSTOMERS TAB */}
            {tab === 'customers' && <OperatorCustomers />}

            {/* EQUIPMENT TAB */}
            {tab === 'equipment' && <OperatorEquipment />}

            {/* ANALYTICS TAB */}
            {tab === 'analytics' && <AnalyticsTab analytics={analytics} statusData={statusData} statusLegend={statusLegend} bookingTrend={bookingTrend} popularListings={popularListings} />}

            {tab === 'share-analytics' && <ShareAnalyticsTab scope="operator" />}

            {tab === 'payouts' && <PayoutsTab payouts={payouts} payoutSettings={payoutSettings} setPayoutSettings={setPayoutSettings} payoutConfigured={payoutConfigured} savingPayout={savingPayout} onSave={handleSavePayoutSettings} />}
          </>
        )}
          </>
        )}

        {showDiveBuilder && (
          <DiveListingBuilder
            listing={editingDiveListing}
            onClose={() => { setShowDiveBuilder(false); setEditingDiveListing(null); fetchDiveListings(); }}
            onSaved={() => { setShowDiveBuilder(false); setEditingDiveListing(null); fetchDiveListings(); }}
          />
        )}

        <ShareModal
          open={!!shareListing}
          onClose={() => setShareListing(null)}
          listing={shareListing}
          isOperator={true}
        />
      </div>
    </div>
  );
}

