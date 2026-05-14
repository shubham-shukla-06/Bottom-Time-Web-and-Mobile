import React, { useCallback, useState } from 'react';
import {
  View,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Image,
} from 'react-native';
import { HapticTouchable as TouchableOpacity } from '../src/components/HapticTouchable';
import { Text } from '../src/components/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import Icon from '../src/components/Icon';
import api from '../src/api/client';
import { Colors } from '../src/constants/colors';
import { withRefreshHaptic } from '../src/utils/withRefreshHaptic';
import { OrdersListSkeleton } from '../src/components/skeletons/OrdersListSkeleton';

const STATUS_COLOURS: Record<string, { bg: string; fg: string }> = {
  placed: { bg: Colors.cyan100, fg: Colors.cyan500 },
  paid: { bg: '#dcfce7', fg: Colors.success },
  shipped: { bg: '#ede9fe', fg: '#6d28d9' },
  delivered: { bg: '#dcfce7', fg: '#15803d' },
  cancelled: { bg: '#fee2e2', fg: Colors.accent },
};

export default function OrdersScreen() {
  const router = useRouter();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchOrders = useCallback(async () => {
    try {
      const res = await api.get('/orders');
      setOrders(res.data?.orders || []);
    } catch {/* silent */}
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useFocusEffect(useCallback(() => { setLoading(true); fetchOrders(); }, [fetchOrders]));

  return (
    <SafeAreaView style={styles.container} testID="orders-screen">
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} testID="orders-back-btn">
          <Icon name="arrow-back" size={22} color={Colors.slate900} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My orders</Text>
        <View style={{ width: 22 }} />
      </View>

      {loading ? (
        <OrdersListSkeleton />
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(o) => o.id}
          contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 10 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={withRefreshHaptic(() => { setRefreshing(true); fetchOrders(); })} tintColor={Colors.cyan400} />}
          ListEmptyComponent={
            <View style={styles.empty} testID="orders-empty">
              <Icon name="receipt-outline" size={40} color={Colors.slate300} />
              <Text style={styles.emptyTitle}>No orders yet</Text>
              <Text style={styles.emptySubtitle}>Your purchase history will appear here.</Text>
              <TouchableOpacity onPress={() => router.push('/shop')} style={styles.shopBtn}>
                <Text style={styles.shopBtnText}>Browse Shop</Text>
              </TouchableOpacity>
            </View>
          }
          renderItem={({ item: o }) => {
            const status = (o.status || 'placed').toLowerCase();
            const colors = STATUS_COLOURS[status] || { bg: Colors.slate100, fg: Colors.slate600 };
            return (
              <TouchableOpacity onPress={() => router.push({ pathname: '/order/[id]', params: { id: o.id } })}
                style={styles.orderCard} testID={`order-${o.id}`}>
                <View style={styles.orderHeader}>
                  <View>
                    <Text style={styles.orderNumber}>Order #{(o.id || '').slice(0, 8)}</Text>
                    <Text style={styles.orderDate}>{new Date(o.created_at).toLocaleDateString()}</Text>
                  </View>
                  <View style={[styles.statusPill, { backgroundColor: colors.bg }]}>
                    <Text style={[styles.statusText, { color: colors.fg }]}>{status}</Text>
                  </View>
                </View>
                <View style={styles.itemThumbs}>
                  {(o.items || []).slice(0, 3).map((it: any, idx: number) => (
                    it.product_image ? (
                      <Image key={idx} source={{ uri: it.product_image }} style={styles.thumbImg} />
                    ) : (
                      <View key={idx} style={[styles.thumbImg, { backgroundColor: Colors.slate100, alignItems: 'center', justifyContent: 'center' }]}>
                        <Icon name="image-outline" size={14} color={Colors.slate300} />
                      </View>
                    )
                  ))}
                  {(o.items || []).length > 3 && (
                    <View style={[styles.thumbImg, { backgroundColor: Colors.slate100, alignItems: 'center', justifyContent: 'center' }]}>
                      <Text style={styles.moreText}>+{o.items.length - 3}</Text>
                    </View>
                  )}
                </View>
                <View style={styles.orderFooter}>
                  <Text style={styles.itemCount}>{(o.items || []).length} item{(o.items || []).length === 1 ? '' : 's'}</Text>
                  <Text style={styles.orderTotal}>${o.total?.toFixed(2)}</Text>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.slate50 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  headerTitle: { fontSize: 17, fontWeight: '700', color: Colors.slate900 },
  empty: { alignItems: 'center', paddingVertical: 60, paddingHorizontal: 32 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: Colors.slate800, marginTop: 12 },
  emptySubtitle: { fontSize: 13, color: Colors.slate500, marginTop: 6, textAlign: 'center' },
  shopBtn: { marginTop: 14, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 999, backgroundColor: Colors.cyan500 },
  shopBtnText: { color: Colors.white, fontWeight: '700' },
  orderCard: { backgroundColor: Colors.white, borderRadius: 14, padding: 14, gap: 12, borderWidth: 1, borderColor: Colors.borderLight },
  orderHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  orderNumber: { fontSize: 14, fontWeight: '700', color: Colors.slate900 },
  orderDate: { fontSize: 11, color: Colors.slate500, marginTop: 2 },
  statusPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  statusText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  itemThumbs: { flexDirection: 'row', gap: 6 },
  thumbImg: { width: 44, height: 44, borderRadius: 8 },
  moreText: { fontSize: 11, fontWeight: '700', color: Colors.slate600 },
  orderFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 10, borderTopWidth: 1, borderTopColor: Colors.borderLight },
  itemCount: { fontSize: 12, color: Colors.slate500, fontWeight: '600' },
  orderTotal: { fontSize: 16, fontWeight: '700', color: Colors.slate900 },
});
