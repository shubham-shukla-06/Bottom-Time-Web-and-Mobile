import React, { useCallback, useState } from 'react';
import {
  View,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { HapticTouchable as TouchableOpacity } from '../src/components/HapticTouchable';
import { Text } from '../src/components/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import Icon from '../src/components/Icon';
import api from '../src/api/client';
import { Colors } from '../src/constants/colors';
import useAuthStore from '../src/stores/authStore';

const FILTERS = ['all', 'pending', 'confirmed', 'cancelled'] as const;
type Filter = typeof FILTERS[number];

function statusColor(status: string) {
  switch (status) {
    case 'confirmed': return Colors.success;
    case 'pending': return Colors.warning;
    case 'rejected':
    case 'cancelled': return Colors.accent;
    default: return Colors.slate500;
  }
}

function formatDate(d: string) {
  if (!d) return '';
  try {
    return new Date(d + 'T00:00:00').toLocaleDateString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric',
    });
  } catch { return d; }
}

export default function MyBookingsScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const [bookings, setBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await api.get('/bookings');
      setBookings(res.data?.bookings || []);
    } catch (e: any) {
      setError(e?.response?.data?.detail || e?.message || 'Failed to load bookings');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (user) {
        setLoading(true);
        load();
      } else {
        setLoading(false);
      }
    }, [user, load])
  );

  const filtered = filter === 'all' ? bookings : bookings.filter((b) => b.status === filter);

  if (!user) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.empty}>
          <View style={styles.emptyIcon}>
            <Icon name="lock-closed" size={28} color={Colors.cyan400} />
          </View>
          <Text style={styles.emptyTitle}>Sign in to see bookings</Text>
          <Text style={styles.emptySub}>Your bookings live in your account.</Text>
          <TouchableOpacity style={styles.signInBtn} onPress={() => router.push('/welcome')} testID="bookings-signin-btn">
            <Text style={styles.signInText}>Sign in</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}><ActivityIndicator size="large" color={Colors.cyan400} /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} testID="my-bookings-screen">
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} testID="bookings-back-btn">
          <Icon name="arrow-back" size={22} color={Colors.slate900} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Bookings</Text>
        <View style={{ width: 22 }} />
      </View>

      <View style={styles.filterRow}>
        {FILTERS.map((f) => (
          <TouchableOpacity
            key={f}
            style={[styles.filterChip, filter === f && styles.filterChipActive]}
            onPress={() => setFilter(f)}
            testID={`filter-${f}`}
          >
            <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>{f}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {error && (
        <View style={styles.errorBanner}>
          <Icon name="alert-circle" size={16} color={Colors.accent} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <FlatList
        data={filtered}
        keyExtractor={(b) => b.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 12 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); load(); }}
            tintColor={Colors.cyan400}
          />
        }
        ListEmptyComponent={() => (
          <View style={styles.empty}>
            <View style={styles.emptyIcon}>
              <Icon name="calendar-outline" size={28} color={Colors.cyan400} />
            </View>
            <Text style={styles.emptyTitle}>No bookings yet</Text>
            <Text style={styles.emptySub}>Pick something from Discover and book your first dive.</Text>
            <TouchableOpacity style={styles.signInBtn} onPress={() => router.replace('/')} testID="goto-discover-btn">
              <Text style={styles.signInText}>Browse Discover</Text>
            </TouchableOpacity>
          </View>
        )}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            onPress={() => router.push({ pathname: '/booking/[id]', params: { id: item.id } })}
            testID={`booking-row-${item.id}`}
          >
            <View style={styles.cardLeft}>
              <View style={styles.thumb}>
                <Icon name="water" size={22} color={Colors.cyan500} />
              </View>
            </View>
            <View style={styles.cardBody}>
              <Text style={styles.cardTitle} numberOfLines={1}>{item.listing_name || 'Booking'}</Text>
              <View style={styles.cardMetaRow}>
                <Icon name="calendar-outline" size={12} color={Colors.slate500} />
                <Text style={styles.cardMeta}>{formatDate(item.date)}</Text>
                <Text style={styles.dot}>·</Text>
                <Icon name="people-outline" size={12} color={Colors.slate500} />
                <Text style={styles.cardMeta}>{item.participants}</Text>
              </View>
              <View style={styles.cardFooter}>
                <Text style={styles.cardPrice}>{(item.currency || 'USD')} {Number(item.price || 0).toFixed(0)}</Text>
                <View style={[styles.statusPill, { backgroundColor: statusColor(item.status) + '22' }]}>
                  <Text style={[styles.statusText, { color: statusColor(item.status) }]}>{item.status}</Text>
                </View>
              </View>
            </View>
            <Icon name="chevron-forward" size={18} color={Colors.slate400} />
          </TouchableOpacity>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.slate50 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  headerTitle: { fontSize: 17, fontWeight: '700', color: Colors.slate900 },
  filterRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  filterChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, backgroundColor: Colors.slate100 },
  filterChipActive: { backgroundColor: Colors.cyan50, borderWidth: 1, borderColor: Colors.cyan400 },
  filterText: { fontSize: 12, fontWeight: '600', color: Colors.slate600, textTransform: 'capitalize' },
  filterTextActive: { color: Colors.cyan500 },
  errorBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginTop: 12, padding: 10, borderRadius: 10, backgroundColor: '#fef2f2' },
  errorText: { flex: 1, fontSize: 13, color: Colors.accent },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Colors.white, borderRadius: 14, padding: 12, borderWidth: 1, borderColor: Colors.borderLight },
  cardLeft: {},
  thumb: { width: 48, height: 48, borderRadius: 12, backgroundColor: Colors.cyan50, alignItems: 'center', justifyContent: 'center' },
  cardBody: { flex: 1, gap: 4 },
  cardTitle: { fontSize: 14, fontWeight: '700', color: Colors.slate900 },
  cardMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  cardMeta: { fontSize: 12, color: Colors.slate500 },
  dot: { fontSize: 12, color: Colors.slate400 },
  cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  cardPrice: { fontSize: 14, fontWeight: '700', color: Colors.slate900 },
  statusPill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  statusText: { fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
  empty: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, paddingVertical: 80 },
  emptyIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: Colors.cyan50, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: Colors.slate900, marginBottom: 4 },
  emptySub: { fontSize: 13, color: Colors.slate500, textAlign: 'center', marginBottom: 16 },
  signInBtn: { backgroundColor: Colors.cyan400, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 999 },
  signInText: { fontSize: 14, fontWeight: '700', color: Colors.slate900 },
});
