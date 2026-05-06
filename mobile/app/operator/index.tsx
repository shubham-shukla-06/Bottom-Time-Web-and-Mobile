import React, { useCallback, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator, RefreshControl, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import api from '../../src/api/client';
import useAuthStore from '../../src/stores/authStore';
import { Colors } from '../../src/constants/colors';
import { confirmDialog } from '../../src/utils/confirm';

type Tab = 'overview' | 'bookings' | 'listings' | 'payouts';

export default function OperatorDashboardScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const [tab, setTab] = useState<Tab>('overview');

  const [stats, setStats] = useState<any>(null);
  const [analytics, setAnalytics] = useState<any>(null);
  const [bookings, setBookings] = useState<any[]>([]);
  const [listings, setListings] = useState<any[]>([]);
  const [payouts, setPayouts] = useState<any[]>([]);
  const [payoutSettings, setPayoutSettings] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const isOperator = user && (user.role === 'operator' || user.role === 'instructor');

  const load = useCallback(async () => {
    if (!isOperator) { setLoading(false); return; }
    try {
      const [s, a, b, l, p, ps] = await Promise.all([
        api.get('/operator/stats').catch(() => ({ data: null })),
        api.get('/operator/analytics').catch(() => ({ data: null })),
        api.get('/bookings/operator').catch(() => ({ data: { bookings: [] } })),
        api.get('/operator/listings').catch(() => ({ data: { listings: [] } })),
        api.get('/payouts').catch(() => ({ data: { payouts: [] } })),
        api.get('/operator/payout-settings').catch(() => ({ data: null })),
      ]);
      setStats(s.data); setAnalytics(a.data);
      setBookings(b.data?.bookings || []);
      setListings(l.data?.listings || []);
      setPayouts(p.data?.payouts || []);
      setPayoutSettings(ps.data);
    } catch {/* silent */} finally { setLoading(false); setRefreshing(false); }
  }, [isOperator]);

  useFocusEffect(useCallback(() => { setLoading(true); load(); }, [load]));

  const updateBooking = async (id: string, status: 'confirmed' | 'rejected') => {
    if (status === 'rejected') {
      const ok = await confirmDialog({
        title: 'Decline booking?',
        message: 'The customer will be notified. This cannot be undone.',
        confirmText: 'Decline', cancelText: 'Keep', destructive: true,
      });
      if (!ok) return;
    }
    try {
      await api.put(`/bookings/${id}/status`, { status });
      await load();
    } catch {/* silent */}
  };

  if (!user) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <Ionicons name="briefcase" size={36} color={Colors.cyan500} />
          <Text style={styles.emptyTitle}>Sign in to access the dashboard</Text>
          <TouchableOpacity onPress={() => router.push('/auth')} style={styles.signinBtn} testID="op-signin-btn">
            <Text style={styles.signinText}>Sign in</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }
  if (!isOperator) {
    return (
      <SafeAreaView style={styles.container} testID="operator-dashboard-screen">
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} testID="op-back-btn">
            <Ionicons name="arrow-back" size={22} color={Colors.slate900} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Operator Dashboard</Text>
          <View style={{ width: 22 }} />
        </View>
        <View style={styles.center}>
          <Ionicons name="lock-closed-outline" size={42} color={Colors.slate300} />
          <Text style={styles.emptyTitle}>Operator-only area</Text>
          <Text style={styles.emptySub}>Apply to become a dive operator to access listings, bookings and payouts.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} testID="operator-dashboard-screen">
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} testID="op-back-btn">
          <Ionicons name="arrow-back" size={22} color={Colors.slate900} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Dashboard</Text>
        <View style={{ width: 22 }} />
      </View>
      <View style={styles.tabs}>
        {(['overview', 'bookings', 'listings', 'payouts'] as Tab[]).map((t) => (
          <TouchableOpacity key={t} onPress={() => setTab(t)} style={[styles.tab, tab === t && styles.tabActive]} testID={`op-tab-${t}`}>
            <Text style={[styles.tabText, tab === t && { color: Colors.cyan500 }]}>{t}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={Colors.cyan400} /></View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 12 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.cyan400} />}>
          {tab === 'overview' && <OverviewTab stats={stats} analytics={analytics} />}
          {tab === 'bookings' && <BookingsTab bookings={bookings} onUpdate={updateBooking} />}
          {tab === 'listings' && <ListingsTab listings={listings} />}
          {tab === 'payouts' && <PayoutsTab payouts={payouts} settings={payoutSettings} />}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function OverviewTab({ stats, analytics }: any) {
  return (
    <View style={{ gap: 12 }} testID="op-overview-tab">
      <View style={styles.statGrid}>
        <StatCard icon="cash" label="Revenue" value={`$${(analytics?.total_revenue || 0).toLocaleString()}`} tone={Colors.success} />
        <StatCard icon="receipt" label="Bookings" value={String(stats?.total_bookings || 0)} tone={Colors.cyan500} />
        <StatCard icon="bookmark" label="Active listings" value={String(stats?.active_listings || 0)} tone="#0ea5e9" />
        <StatCard icon="star" label="Avg rating" value={String(analytics?.avg_rating || 0)} tone="#f59e0b" />
      </View>
      <View style={styles.section} testID="op-status-card">
        <Text style={styles.sectionTitle}>Booking status</Text>
        {Object.entries(analytics?.status_counts || {}).map(([status, count]: any) => (
          <View key={status} style={styles.statusRow}>
            <Text style={styles.statusLabel}>{status}</Text>
            <Text style={styles.statusCount}>{count}</Text>
          </View>
        ))}
        <Text style={styles.confirmRate}>Confirmation rate: <Text style={{ color: Colors.success }}>{analytics?.confirm_rate || 0}%</Text></Text>
      </View>
      {(analytics?.popular_listings || []).length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Top listings</Text>
          {(analytics.popular_listings || []).map((l: any, i: number) => (
            <View key={i} style={styles.popularRow} testID={`op-popular-${i}`}>
              <Text style={styles.popularName} numberOfLines={1}>{l.name}</Text>
              <Text style={styles.popularRev}>${l.revenue?.toFixed?.(0) || 0}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

function BookingsTab({ bookings, onUpdate }: any) {
  if (!bookings || bookings.length === 0) {
    return <View style={styles.empty}><Ionicons name="receipt-outline" size={36} color={Colors.slate300} /><Text style={styles.emptyTitle}>No bookings yet</Text></View>;
  }
  return (
    <View style={{ gap: 10 }} testID="op-bookings-tab">
      {bookings.map((b: any) => (
        <View key={b.id} style={styles.bookingCard} testID={`op-booking-${b.id}`}>
          <View style={styles.bookingTop}>
            <Text style={styles.bookingName} numberOfLines={1}>{b.listing_name || 'Listing'}</Text>
            <View style={[styles.bookingPill, { backgroundColor: STATUS_BG[b.status] || Colors.slate100 }]}>
              <Text style={[styles.bookingPillText, { color: STATUS_FG[b.status] || Colors.slate700 }]}>{b.status}</Text>
            </View>
          </View>
          <Text style={styles.bookingMeta}><Ionicons name="person-outline" size={11} /> {b.customer_name || b.user_email || 'Customer'}</Text>
          {b.dive_date && <Text style={styles.bookingMeta}><Ionicons name="calendar-outline" size={11} /> {new Date(b.dive_date).toLocaleDateString()}</Text>}
          <Text style={styles.bookingMeta}>Participants: {b.participants || 1} · {b.currency || 'USD'} {b.price || 0}</Text>
          {b.status === 'pending' && (
            <View style={styles.bookingActions}>
              <TouchableOpacity onPress={() => onUpdate(b.id, 'confirmed')} style={styles.confirmBtn} testID={`op-confirm-${b.id}`}>
                <Ionicons name="checkmark" size={14} color={Colors.white} />
                <Text style={styles.confirmText}>Confirm</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => onUpdate(b.id, 'rejected')} style={styles.declineBtn} testID={`op-decline-${b.id}`}>
                <Ionicons name="close" size={14} color={Colors.accent} />
                <Text style={styles.declineText}>Decline</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      ))}
    </View>
  );
}

function ListingsTab({ listings }: any) {
  if (!listings || listings.length === 0) {
    return <View style={styles.empty}><Ionicons name="bookmark-outline" size={36} color={Colors.slate300} /><Text style={styles.emptyTitle}>No listings yet</Text></View>;
  }
  return (
    <View style={{ gap: 10 }} testID="op-listings-tab">
      {listings.map((l: any) => (
        <View key={l.id} style={styles.listingCard} testID={`op-listing-${l.id}`}>
          {l.photos?.[0]?.url ? <Image source={{ uri: l.photos[0].url }} style={styles.listingImg} /> : (
            <View style={[styles.listingImg, { backgroundColor: Colors.slate100, alignItems: 'center', justifyContent: 'center' }]}>
              <Ionicons name="image-outline" size={20} color={Colors.slate300} />
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={styles.listingName} numberOfLines={1}>{l.name}</Text>
            <Text style={styles.listingMeta} numberOfLines={1}><Ionicons name="location-outline" size={11} /> {l.location}</Text>
            <View style={styles.listingFooter}>
              <View style={[styles.listingStatus, { backgroundColor: l.status === 'active' ? '#dcfce7' : Colors.slate100 }]}>
                <Text style={[styles.listingStatusText, { color: l.status === 'active' ? Colors.success : Colors.slate600 }]}>{l.status}</Text>
              </View>
              <Text style={styles.listingPrice}>{l.currency || 'USD'} {l.price}</Text>
            </View>
          </View>
        </View>
      ))}
    </View>
  );
}

function PayoutsTab({ payouts, settings }: any) {
  return (
    <View style={{ gap: 12 }} testID="op-payouts-tab">
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Payout settings</Text>
        {settings ? (
          <>
            <Row label="Method" value={settings.payout_method || '–'} />
            <Row label="Currency" value={settings.payout_currency || '–'} />
            <Row label="Status" value={settings.kyc_verified ? 'Verified ✓' : 'Pending'} />
          </>
        ) : <Text style={styles.emptySub}>Configure payout method on web to receive payments.</Text>}
      </View>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Recent payouts ({payouts.length})</Text>
        {payouts.length === 0 ? (
          <Text style={styles.emptySub}>No payouts yet. Confirmed bookings auto-generate payouts.</Text>
        ) : (
          payouts.map((p: any) => (
            <View key={p.id} style={styles.payoutRow} testID={`op-payout-${p.id}`}>
              <View style={{ flex: 1 }}>
                <Text style={styles.payoutAmount}>{p.currency} {p.net_amount?.toFixed?.(2) || p.gross_amount?.toFixed?.(2)}</Text>
                <Text style={styles.payoutDate}>{p.created_at ? new Date(p.created_at).toLocaleDateString() : ''}</Text>
              </View>
              <View style={[styles.payoutPill, { backgroundColor: STATUS_BG[p.status] || Colors.slate100 }]}>
                <Text style={[styles.payoutPillText, { color: STATUS_FG[p.status] || Colors.slate700 }]}>{p.status}</Text>
              </View>
            </View>
          ))
        )}
      </View>
    </View>
  );
}

function StatCard({ icon, label, value, tone }: any) {
  return (
    <View style={[styles.statCard]}>
      <View style={[styles.statIcon, { backgroundColor: tone + '20' }]}>
        <Ionicons name={icon} size={16} color={tone} />
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}
function Row({ label, value }: any) {
  return (
    <View style={styles.kvRow}>
      <Text style={styles.kvLabel}>{label}</Text>
      <Text style={styles.kvValue}>{value}</Text>
    </View>
  );
}

const STATUS_BG: Record<string, string> = { pending: '#fef3c7', confirmed: '#dcfce7', completed: '#dcfce7', rejected: '#fee2e2', cancelled: '#fee2e2', paid: '#dbeafe', processing: '#fef3c7' };
const STATUS_FG: Record<string, string> = { pending: '#b45309', confirmed: Colors.success, completed: Colors.success, rejected: Colors.accent, cancelled: Colors.accent, paid: '#1d4ed8', processing: '#b45309' };

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.slate50 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 24 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  headerTitle: { fontSize: 17, fontWeight: '700', color: Colors.slate900 },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: Colors.slate800, marginTop: 8 },
  emptySub: { fontSize: 12, color: Colors.slate500, textAlign: 'center' },
  empty: { alignItems: 'center', paddingVertical: 60, paddingHorizontal: 32, gap: 6 },
  signinBtn: { marginTop: 14, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 999, backgroundColor: Colors.cyan500 },
  signinText: { color: Colors.white, fontWeight: '700', fontSize: 13 },
  tabs: { flexDirection: 'row', gap: 4, padding: 8, backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  tab: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8, backgroundColor: Colors.slate50 },
  tabActive: { backgroundColor: Colors.cyan100 },
  tabText: { fontSize: 11, fontWeight: '700', color: Colors.slate600, textTransform: 'uppercase', letterSpacing: 0.5 },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  statCard: { flexBasis: '48%', flexGrow: 1, backgroundColor: Colors.white, borderRadius: 14, padding: 12, gap: 6, borderWidth: 1, borderColor: Colors.borderLight },
  statIcon: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  statValue: { fontSize: 22, fontWeight: '700', color: Colors.slate900 },
  statLabel: { fontSize: 11, color: Colors.slate500, fontWeight: '600' },
  section: { backgroundColor: Colors.white, borderRadius: 14, padding: 14, gap: 8, borderWidth: 1, borderColor: Colors.borderLight },
  sectionTitle: { fontSize: 11, fontWeight: '700', color: Colors.slate500, textTransform: 'uppercase', letterSpacing: 1 },
  statusRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  statusLabel: { fontSize: 12, color: Colors.slate700, textTransform: 'capitalize' },
  statusCount: { fontSize: 12, fontWeight: '700', color: Colors.slate900 },
  confirmRate: { fontSize: 12, color: Colors.slate600, marginTop: 6, fontWeight: '600' },
  popularRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  popularName: { fontSize: 12, color: Colors.slate800, flex: 1, marginRight: 10 },
  popularRev: { fontSize: 12, fontWeight: '700', color: Colors.success },
  bookingCard: { backgroundColor: Colors.white, borderRadius: 12, padding: 12, gap: 4, borderWidth: 1, borderColor: Colors.borderLight },
  bookingTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  bookingName: { flex: 1, fontSize: 13, fontWeight: '700', color: Colors.slate900 },
  bookingPill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  bookingPillText: { fontSize: 9, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  bookingMeta: { fontSize: 11, color: Colors.slate500 },
  bookingActions: { flexDirection: 'row', gap: 8, marginTop: 8 },
  confirmBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 8, borderRadius: 999, backgroundColor: Colors.success },
  confirmText: { color: Colors.white, fontSize: 12, fontWeight: '700' },
  declineBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: Colors.accent, backgroundColor: Colors.white },
  declineText: { color: Colors.accent, fontSize: 12, fontWeight: '700' },
  listingCard: { flexDirection: 'row', gap: 12, padding: 12, backgroundColor: Colors.white, borderRadius: 12, borderWidth: 1, borderColor: Colors.borderLight },
  listingImg: { width: 70, height: 70, borderRadius: 10 },
  listingName: { fontSize: 13, fontWeight: '700', color: Colors.slate900 },
  listingMeta: { fontSize: 11, color: Colors.slate500 },
  listingFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 },
  listingStatus: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999 },
  listingStatusText: { fontSize: 9, fontWeight: '700', textTransform: 'uppercase' },
  listingPrice: { fontSize: 12, fontWeight: '700', color: Colors.cyan500 },
  payoutRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  payoutAmount: { fontSize: 13, fontWeight: '700', color: Colors.slate900 },
  payoutDate: { fontSize: 10, color: Colors.slate500 },
  payoutPill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  payoutPillText: { fontSize: 9, fontWeight: '700', textTransform: 'uppercase' },
  kvRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  kvLabel: { fontSize: 12, color: Colors.slate500, fontWeight: '600' },
  kvValue: { fontSize: 12, color: Colors.slate900, fontWeight: '700' },
});
