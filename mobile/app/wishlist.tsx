import React, { useCallback, useState } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity, ActivityIndicator, RefreshControl, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import api from '../src/api/client';
import { Colors } from '../src/constants/colors';
import { confirmDialog } from '../src/utils/confirm';

export default function WishlistScreen() {
  const router = useRouter();
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await api.get('/wishlist/products');
      setProducts(res.data?.products || []);
    } catch {/* silent */}
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useFocusEffect(useCallback(() => { setLoading(true); fetchData(); }, [fetchData]));

  const remove = async (productId: string, name: string) => {
    const ok = await confirmDialog({
      title: 'Remove from wishlist?',
      message: `Remove "${name}" from your wishlist?`,
      confirmText: 'Remove', cancelText: 'Keep', destructive: true,
    });
    if (!ok) return;
    try {
      await api.post(`/wishlist/product/${productId}`); // toggles off
      fetchData();
    } catch {/* silent */}
  };

  const moveToCart = async (productId: string) => {
    try {
      await api.post(`/cart/add?product_id=${productId}&quantity=1`);
      await api.post(`/wishlist/product/${productId}`); // remove from wishlist
      fetchData();
    } catch {/* silent */}
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}><ActivityIndicator size="large" color={Colors.cyan400} /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} testID="wishlist-screen">
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} testID="wl-back-btn">
          <Ionicons name="arrow-back" size={22} color={Colors.slate900} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Wishlist</Text>
        <View style={{ width: 22 }} />
      </View>

      <FlatList
        data={products}
        keyExtractor={(p) => p.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 10 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData(); }} tintColor={Colors.cyan400} />}
        ListEmptyComponent={
          <View style={styles.empty} testID="wl-empty">
            <Ionicons name="heart-outline" size={40} color={Colors.slate300} />
            <Text style={styles.emptyTitle}>Your wishlist is empty</Text>
            <Text style={styles.emptySubtitle}>Tap the heart on any product to save it for later.</Text>
            <TouchableOpacity onPress={() => router.push('/shop')} style={styles.shopBtn}>
              <Text style={styles.shopBtnText}>Browse Shop</Text>
            </TouchableOpacity>
          </View>
        }
        renderItem={({ item: p }) => (
          <View style={styles.card} testID={`wl-item-${p.id}`}>
            <TouchableOpacity onPress={() => router.push({ pathname: '/product/[id]', params: { id: p.id } })}>
              {p.image_url ? (
                <Image source={{ uri: p.image_url }} style={styles.img} />
              ) : (
                <View style={[styles.img, { backgroundColor: Colors.slate100, alignItems: 'center', justifyContent: 'center' }]}>
                  <Ionicons name="image-outline" size={20} color={Colors.slate300} />
                </View>
              )}
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text style={styles.name} numberOfLines={2}>{p.name}</Text>
              <Text style={styles.desc} numberOfLines={1}>{p.description}</Text>
              <View style={styles.priceRow}>
                <Text style={styles.price}>${p.price?.toFixed(0)}</Text>
                {p.compare_at_price > p.price && <Text style={styles.compareAt}>${p.compare_at_price?.toFixed(0)}</Text>}
              </View>
              <View style={styles.actions}>
                <TouchableOpacity onPress={() => moveToCart(p.id)} disabled={!p.in_stock}
                  style={[styles.cartBtn, !p.in_stock && { opacity: 0.4 }]} testID={`wl-cart-${p.id}`}>
                  <Ionicons name="cart" size={12} color={Colors.white} />
                  <Text style={styles.cartText}>{p.in_stock ? 'Move to cart' : 'Sold out'}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => remove(p.id, p.name)} style={styles.removeBtn} testID={`wl-remove-${p.id}`}>
                  <Ionicons name="trash-outline" size={14} color={Colors.accent} />
                </TouchableOpacity>
              </View>
            </View>
          </View>
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
  empty: { alignItems: 'center', paddingVertical: 60, paddingHorizontal: 32 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: Colors.slate800, marginTop: 12 },
  emptySubtitle: { fontSize: 13, color: Colors.slate500, marginTop: 6, textAlign: 'center' },
  shopBtn: { marginTop: 14, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 999, backgroundColor: Colors.cyan500 },
  shopBtnText: { color: Colors.white, fontWeight: '700' },
  card: { flexDirection: 'row', gap: 12, padding: 12, borderRadius: 14, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.borderLight },
  img: { width: 80, height: 80, borderRadius: 10 },
  name: { fontSize: 13, fontWeight: '700', color: Colors.slate900 },
  desc: { fontSize: 11, color: Colors.slate500, marginTop: 2 },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 4 },
  price: { fontSize: 16, fontWeight: '700', color: Colors.slate900 },
  compareAt: { fontSize: 11, color: Colors.slate400, textDecorationLine: 'line-through' },
  actions: { flexDirection: 'row', gap: 8, marginTop: 8, alignItems: 'center' },
  cartBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: Colors.cyan500 },
  cartText: { color: Colors.white, fontSize: 11, fontWeight: '700' },
  removeBtn: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.accent },
});
