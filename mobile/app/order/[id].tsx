import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Image,
} from 'react-native';
import { HapticTouchable as TouchableOpacity } from '../../src/components/HapticTouchable';
import { Text } from '../../src/components/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Icon from '../../src/components/Icon';
import api from '../../src/api/client';
import { Colors } from '../../src/constants/colors';

const STATUS_COLOURS: Record<string, { bg: string; fg: string }> = {
  placed: { bg: Colors.cyan100, fg: Colors.cyan500 },
  paid: { bg: '#dcfce7', fg: Colors.success },
  shipped: { bg: '#ede9fe', fg: '#6d28d9' },
  delivered: { bg: '#dcfce7', fg: '#15803d' },
  cancelled: { bg: '#fee2e2', fg: Colors.accent },
};

export default function OrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await api.get(`/orders/${id}`);
      setOrder(res.data);
    } catch {/* silent */} finally { setLoading(false); }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}><ActivityIndicator size="large" color={Colors.cyan400} /></View>
      </SafeAreaView>
    );
  }

  if (!order) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <Icon name="receipt-outline" size={40} color={Colors.slate300} />
          <Text style={styles.emptyText}>Order not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  const status = (order.status || 'placed').toLowerCase();
  const colors = STATUS_COLOURS[status] || { bg: Colors.slate100, fg: Colors.slate600 };

  return (
    <SafeAreaView style={styles.container} testID="order-detail-screen">
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} testID="order-back-btn">
          <Icon name="arrow-back" size={22} color={Colors.slate900} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Order #{(order.id || '').slice(0, 8)}</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 14 }}>
        <View style={styles.statusCard}>
          <View style={[styles.statusBadge, { backgroundColor: colors.bg }]}>
            <Icon
              name={status === 'shipped' ? 'cube' : status === 'delivered' ? 'checkmark-done-circle' : status === 'cancelled' ? 'close-circle' : status === 'paid' ? 'card' : 'receipt'}
              size={14} color={colors.fg} />
            <Text style={[styles.statusBadgeText, { color: colors.fg }]}>{status.toUpperCase()}</Text>
          </View>
          <Text style={styles.placedAt}>Placed {new Date(order.created_at).toLocaleString()}</Text>
          {order.tracking_url && (
            <View style={styles.trackingBox}>
              <Icon name="navigate" size={14} color={Colors.cyan500} />
              <Text style={styles.trackingText}>Tracking: {order.tracking_id || '—'}</Text>
            </View>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Items</Text>
          {(order.items || []).map((it: any, idx: number) => (
            <View key={idx} style={styles.itemRow}>
              {it.product_image ? (
                <Image source={{ uri: it.product_image }} style={styles.itemImg} />
              ) : (
                <View style={[styles.itemImg, { backgroundColor: Colors.slate100, alignItems: 'center', justifyContent: 'center' }]}>
                  <Icon name="image-outline" size={18} color={Colors.slate300} />
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.itemName} numberOfLines={2}>{it.product_name}</Text>
                {it.size && <Text style={styles.itemSub}>Size: {it.size}</Text>}
                <Text style={styles.itemSub}>Qty: {it.quantity} × ${it.unit_price?.toFixed(2)}</Text>
              </View>
              <Text style={styles.itemTotal}>${it.line_total?.toFixed(2)}</Text>
            </View>
          ))}
        </View>

        {order.shipping && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Shipping address</Text>
            <Text style={styles.addrName}>{order.shipping.name}</Text>
            <Text style={styles.addrLine}>{order.shipping.address_line1}{order.shipping.address_line2 ? `, ${order.shipping.address_line2}` : ''}</Text>
            <Text style={styles.addrLine}>{order.shipping.city}, {order.shipping.state} {order.shipping.pincode}</Text>
            <Text style={styles.addrLine}>{order.shipping.country}</Text>
            {order.shipping.phone && <Text style={styles.addrLine}>{order.shipping.country_code || ''} {order.shipping.phone}</Text>}
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Summary</Text>
          <Row label="Sub-total" value={`$${(order.subtotal || order.total || 0).toFixed(2)}`} />
          {order.gst_amount > 0 && <Row label="GST" value={`$${order.gst_amount.toFixed(2)}`} />}
          {order.shipping_amount > 0 && <Row label="Shipping" value={`$${order.shipping_amount.toFixed(2)}`} />}
          {order.discount > 0 && <Row label="Discount" value={`-$${order.discount.toFixed(2)}`} positive />}
          <View style={{ borderTopWidth: 1, borderTopColor: Colors.borderLight, marginTop: 6, paddingTop: 6 }}>
            <Row label="Total" value={`$${order.total?.toFixed(2)}`} bold />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ label, value, bold, positive }: { label: string; value: string; bold?: boolean; positive?: boolean }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={[styles.summaryLabel, bold && { fontWeight: '700', color: Colors.slate900, fontSize: 14 }]}>{label}</Text>
      <Text style={[styles.summaryValue, bold && { fontSize: 16, fontWeight: '700' }, positive && { color: Colors.success }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.slate50 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontSize: 14, color: Colors.slate500, marginTop: 12 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  headerTitle: { fontSize: 16, fontWeight: '700', color: Colors.slate900 },
  statusCard: { backgroundColor: Colors.white, borderRadius: 14, padding: 14, gap: 6, borderWidth: 1, borderColor: Colors.borderLight, alignItems: 'flex-start' },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  statusBadgeText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  placedAt: { fontSize: 11, color: Colors.slate500 },
  trackingBox: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6, padding: 8, borderRadius: 8, backgroundColor: Colors.cyan50 },
  trackingText: { fontSize: 12, color: Colors.cyan500, fontWeight: '700' },
  section: { backgroundColor: Colors.white, borderRadius: 14, padding: 14, gap: 8, borderWidth: 1, borderColor: Colors.borderLight },
  sectionTitle: { fontSize: 11, fontWeight: '700', color: Colors.slate500, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 },
  itemRow: { flexDirection: 'row', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  itemImg: { width: 50, height: 50, borderRadius: 8 },
  itemName: { fontSize: 13, fontWeight: '700', color: Colors.slate900 },
  itemSub: { fontSize: 11, color: Colors.slate500, marginTop: 2 },
  itemTotal: { fontSize: 13, fontWeight: '700', color: Colors.slate900, alignSelf: 'flex-start' },
  addrName: { fontSize: 13, fontWeight: '700', color: Colors.slate900 },
  addrLine: { fontSize: 12, color: Colors.slate600, marginTop: 2 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between' },
  summaryLabel: { fontSize: 12, color: Colors.slate600, fontWeight: '600' },
  summaryValue: { fontSize: 12, color: Colors.slate900, fontWeight: '700' },
});
