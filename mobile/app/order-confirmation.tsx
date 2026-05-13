import React, { useEffect, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView } from 'react-native';
import { Text } from '../src/components/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Icon from '../src/components/Icon';
import api from '../src/api/client';
import { Colors } from '../src/constants/colors';

export default function OrderConfirmation() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    api.get(`/orders/${id}`).then((r) => setOrder(r.data)).catch(() => {}).finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}><ActivityIndicator size="large" color={Colors.cyan400} /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} testID="order-confirmation-screen">
      <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 40, gap: 18 }}>
        <View style={styles.heroIcon}>
          <Icon name="checkmark" size={42} color={Colors.white} />
        </View>
        <View style={{ alignItems: 'center', gap: 6 }}>
          <Text style={styles.title}>Order placed!</Text>
          <Text style={styles.subtitle}>Thanks for your purchase. We'll notify you when it ships.</Text>
        </View>

        {order && (
          <View style={styles.summaryCard}>
            <Row label="Order ID" value={`#${(order.id || '').slice(0, 8)}`} />
            <Row label="Status" value={(order.status || 'placed').toUpperCase()} />
            <Row label="Items" value={String((order.items || []).length)} />
            <Row label="Total" value={`$${order.total?.toFixed(2)}`} bold />
            {order.shipping?.address_line1 && (
              <View style={{ marginTop: 8 }}>
                <Text style={styles.addrTitle}>Shipping to</Text>
                <Text style={styles.addrText}>{order.shipping.name}</Text>
                <Text style={styles.addrText}>{order.shipping.address_line1}{order.shipping.address_line2 ? `, ${order.shipping.address_line2}` : ''}</Text>
                <Text style={styles.addrText}>{order.shipping.city}, {order.shipping.state} {order.shipping.pincode}</Text>
              </View>
            )}
          </View>
        )}

        <View style={{ gap: 10 }}>
          <TouchableOpacity onPress={() => router.replace('/orders')} style={styles.primaryBtn} testID="view-orders-btn">
            <Icon name="receipt" size={16} color={Colors.white} />
            <Text style={styles.primaryText}>View my orders</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.replace('/shop')} style={styles.secondaryBtn} testID="continue-shopping-btn">
            <Icon name="bag-handle-outline" size={16} color={Colors.slate700} />
            <Text style={styles.secondaryText}>Continue shopping</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, bold && { fontSize: 16, fontWeight: '700' }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.slate50 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  heroIcon: { width: 80, height: 80, borderRadius: 40, backgroundColor: Colors.success, alignSelf: 'center', alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 24, fontWeight: '700', color: Colors.slate900 },
  subtitle: { fontSize: 13, color: Colors.slate500, textAlign: 'center', maxWidth: 280 },
  summaryCard: { backgroundColor: Colors.white, borderRadius: 14, padding: 16, gap: 10, borderWidth: 1, borderColor: Colors.borderLight },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  rowLabel: { fontSize: 12, color: Colors.slate500, fontWeight: '600' },
  rowValue: { fontSize: 13, color: Colors.slate900, fontWeight: '700' },
  addrTitle: { fontSize: 11, color: Colors.slate500, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 },
  addrText: { fontSize: 12, color: Colors.slate700 },
  primaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 14, borderRadius: 999, backgroundColor: Colors.cyan500 },
  primaryText: { color: Colors.white, fontWeight: '700', fontSize: 14 },
  secondaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 14, borderRadius: 999, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.borderLight },
  secondaryText: { color: Colors.slate700, fontWeight: '700', fontSize: 14 },
});
