import React, { useCallback, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import Icon from '../../src/components/Icon';
import api from '../../src/api/client';
import { Colors } from '../../src/constants/colors';
import { confirmDialog } from '../../src/utils/confirm';
import useCurrency from '../../src/hooks/useCurrency';

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
      weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
    });
  } catch { return d; }
}

export default function BookingDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { format } = useCurrency();
  const [booking, setBooking] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await api.get('/bookings');
      const list = res.data?.bookings || [];
      const b = list.find((x: any) => x.id === id);
      setBooking(b || null);
      if (!b) setError('Booking not found.');
    } catch (e: any) {
      setError(e?.response?.data?.detail || e?.message || 'Failed to load booking');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(useCallback(() => { setLoading(true); load(); }, [load]));

  const onCancel = async () => {
    const ok = await confirmDialog({
      title: 'Cancel booking?',
      message: 'This will request a cancellation with the operator. This cannot be undone.',
      confirmText: 'Cancel booking',
      cancelText: 'Keep booking',
      destructive: true,
    });
    if (!ok) return;
    setError(null);
    setCancelling(true);
    try {
      await api.put(`/bookings/${booking.id}/status`, null, { params: { status: 'cancelled' } });
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.detail || e?.message || 'Failed to cancel booking');
    } finally {
      setCancelling(false);
    }
  };

  if (loading) {
    return <SafeAreaView style={styles.container}><View style={styles.center}><ActivityIndicator size="large" color={Colors.cyan400} /></View></SafeAreaView>;
  }

  return (
    <SafeAreaView style={styles.container} testID="booking-detail-screen">
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} testID="bd-back-btn">
          <Icon name="arrow-back" size={22} color={Colors.slate900} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Booking</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40, gap: 16 }}>
        {error && (
          <View style={styles.errorBanner}>
            <Icon name="alert-circle" size={16} color={Colors.accent} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {booking && (
          <>
            <View style={styles.heroCard}>
              <View style={styles.heroIcon}>
                <Icon name="water" size={28} color={Colors.cyan500} />
              </View>
              <Text style={styles.heroTitle} numberOfLines={2}>{booking.listing_name}</Text>
              <View style={[styles.statusPill, { backgroundColor: statusColor(booking.status) + '22' }]}>
                <Text style={[styles.statusText, { color: statusColor(booking.status) }]}>{booking.status}</Text>
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Trip details</Text>
              <Row label="Date" value={formatDate(booking.date)} />
              <Row label="Divers" value={String(booking.participants)} />
              <Row label="Type" value={booking.listing_type || '—'} />
              {booking.notes && <Row label="Notes" value={booking.notes} />}
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Payment</Text>
              <Row label="Price per diver" value={format(Number(booking.price || 0), booking.currency || 'USD')} />
              <Row label="Total" value={format(Number(booking.price || 0), booking.currency || 'USD')} bold />
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Reference</Text>
              <Row label="Booking ID" value={booking.id} mono />
              <Row label="Created" value={booking.created_at ? new Date(booking.created_at).toLocaleString() : '—'} />
            </View>

            {booking.listing_id && (
              <TouchableOpacity
                style={styles.linkBtn}
                onPress={() => router.push({ pathname: '/listing/[id]', params: { id: booking.listing_id } })}
                testID="bd-view-listing-btn"
              >
                <Icon name="open-outline" size={16} color={Colors.cyan500} />
                <Text style={styles.linkText}>View listing</Text>
              </TouchableOpacity>
            )}

            {booking.status !== 'cancelled' && booking.status !== 'rejected' && (
              <TouchableOpacity
                style={[styles.cancelBtn, cancelling && { opacity: 0.6 }]}
                onPress={onCancel}
                disabled={cancelling}
                testID="cancel-booking-btn"
              >
                {cancelling ? <ActivityIndicator size="small" color={Colors.accent} /> : (
                  <>
                    <Icon name="close-circle-outline" size={18} color={Colors.accent} />
                    <Text style={styles.cancelText}>Cancel booking</Text>
                  </>
                )}
              </TouchableOpacity>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ label, value, bold, mono }: { label: string; value: string; bold?: boolean; mono?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[
        styles.rowValue,
        bold && { fontWeight: '700', fontSize: 16 },
        mono && { fontFamily: 'Outfit_400Regular', fontSize: 11, color: Colors.slate500 },
      ]} numberOfLines={3}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.slate50 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  headerTitle: { fontSize: 17, fontWeight: '700', color: Colors.slate900 },
  errorBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 10, backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fecaca' },
  errorText: { flex: 1, fontSize: 13, color: Colors.accent },
  heroCard: { backgroundColor: Colors.white, borderRadius: 18, padding: 20, borderWidth: 1, borderColor: Colors.borderLight, alignItems: 'center', gap: 10 },
  heroIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: Colors.cyan50, alignItems: 'center', justifyContent: 'center' },
  heroTitle: { fontSize: 18, fontWeight: '700', color: Colors.slate900, textAlign: 'center' },
  statusPill: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 999 },
  statusText: { fontSize: 12, fontWeight: '700', textTransform: 'capitalize' },
  section: { backgroundColor: Colors.white, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: Colors.borderLight, gap: 10 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: Colors.slate700, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  rowLabel: { fontSize: 13, color: Colors.slate500, fontWeight: '600' },
  rowValue: { flex: 1, textAlign: 'right', fontSize: 14, color: Colors.slate900, fontWeight: '500' },
  linkBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12 },
  linkText: { fontSize: 14, fontWeight: '600', color: Colors.cyan500 },
  cancelBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 14, borderRadius: 999, borderWidth: 1, borderColor: Colors.accent, backgroundColor: Colors.white },
  cancelText: { fontSize: 14, fontWeight: '700', color: Colors.accent },
});
