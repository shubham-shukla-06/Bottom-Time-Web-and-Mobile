import React, { useEffect, useState } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { Text } from '../../src/components/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Icon from '../../src/components/Icon';
import api from '../../src/api/client';
import { Colors } from '../../src/constants/colors';
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

export default function BookingConfirmationScreen() {
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();
  const router = useRouter();
  const { format } = useCurrency();
  const [booking, setBooking] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    api.get('/bookings').then((res) => {
      const list = res.data?.bookings || [];
      const match = list.find((b: any) => b.id === bookingId);
      if (mounted) {
        setBooking(match || null);
        setLoading(false);
      }
    }).catch(() => {
      if (mounted) setLoading(false);
    });
    return () => { mounted = false; };
  }, [bookingId]);

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}><ActivityIndicator size="large" color={Colors.cyan400} /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} testID="booking-confirmation-screen">
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.iconWrap}>
          <View style={styles.successCircle}>
            <Icon name="checkmark" size={42} color={Colors.white} />
          </View>
        </View>
        <Text style={styles.heading}>Booking received</Text>
        <Text style={styles.sub}>The operator will confirm your dates shortly.</Text>

        {booking ? (
          <View style={styles.card}>
            <Row label="Listing" value={booking.listing_name || booking.listing_id} />
            <Row label="Date" value={formatDate(booking.date)} />
            <Row label="Divers" value={String(booking.participants || 1)} />
            <Row
              label="Status"
              valueNode={
                <View style={[styles.statusPill, { backgroundColor: statusColor(booking.status) + '22' }]}>
                  <Text style={[styles.statusText, { color: statusColor(booking.status) }]}>
                    {booking.status}
                  </Text>
                </View>
              }
            />
            <Row label="Total" value={format(Number(booking.price || 0), booking.currency || 'USD')} bold />
            <Row label="Booking ID" value={booking.id} small />
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.sub}>Booking details unavailable.</Text>
          </View>
        )}

        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={() => router.replace('/my-bookings')}
          testID="view-my-bookings-btn"
        >
          <Text style={styles.primaryText}>View my bookings</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.secondaryBtn}
          onPress={() => router.replace('/')}
          testID="back-to-discover-btn"
        >
          <Text style={styles.secondaryText}>Back to Discover</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

function formatDate(d: string) {
  if (!d) return '';
  try {
    return new Date(d + 'T00:00:00').toLocaleDateString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
    });
  } catch { return d; }
}

function Row({ label, value, valueNode, bold, small }: { label: string; value?: string; valueNode?: React.ReactNode; bold?: boolean; small?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      {valueNode ? valueNode : (
        <Text style={[styles.rowValue, bold && { fontWeight: '700', fontSize: 18 }, small && { fontSize: 11, color: Colors.slate500 }]} numberOfLines={small ? 1 : 2}>
          {value}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.slate50 },
  scroll: { padding: 24, alignItems: 'stretch' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  iconWrap: { alignItems: 'center', marginTop: 16, marginBottom: 16 },
  successCircle: { width: 76, height: 76, borderRadius: 38, backgroundColor: Colors.cyan400, alignItems: 'center', justifyContent: 'center' },
  heading: { fontSize: 22, fontWeight: '700', color: Colors.slate900, textAlign: 'center' },
  sub: { fontSize: 14, color: Colors.slate500, textAlign: 'center', marginTop: 4, marginBottom: 20 },
  card: { backgroundColor: Colors.white, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: Colors.borderLight, gap: 12 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  rowLabel: { fontSize: 13, color: Colors.slate500, fontWeight: '600' },
  rowValue: { flex: 1, textAlign: 'right', fontSize: 14, color: Colors.slate900, fontWeight: '500' },
  statusPill: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999 },
  statusText: { fontSize: 12, fontWeight: '700', textTransform: 'capitalize' },
  primaryBtn: { backgroundColor: Colors.cyan400, paddingVertical: 16, borderRadius: 999, alignItems: 'center', marginTop: 24 },
  primaryText: { fontSize: 15, fontWeight: '700', color: Colors.slate900 },
  secondaryBtn: { paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  secondaryText: { fontSize: 14, fontWeight: '600', color: Colors.slate600 },
});
