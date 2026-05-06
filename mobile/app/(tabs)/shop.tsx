import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, TextInput, StyleSheet, Image, ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import api from '../../src/api/client';
import useAuthStore from '../../src/stores/authStore';
import { Colors } from '../../src/constants/colors';
import Chip from '../../src/components/ui/Chip';

const CATEGORIES = [
  { value: '', label: 'All' },
  { value: 'merch', label: 'Merch' },
  { value: 'gear', label: 'Gear' },
  { value: 'essentials', label: 'Essentials' },
];

const SORT_OPTIONS = [
  { value: 'popular', label: 'Popular' },
  { value: 'newest', label: 'Newest' },
  { value: 'price_asc', label: 'Low → High' },
  { value: 'price_desc', label: 'High → Low' },
  { value: 'rating', label: 'Top Rated' },
];

export default function ShopScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const [products, setProducts] = useState<any[]>([]);
  const [category, setCategory] = useState('');
  const [sort, setSort] = useState('popular');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [cartCount, setCartCount] = useState(0);
  const [wishlistIds, setWishlistIds] = useState<string[]>([]);

  const fetchProducts = useCallback(async (q?: string) => {
    try {
      const params = new URLSearchParams();
      if (category) params.set('category', category);
      if ((q ?? search).trim()) params.set('search', (q ?? search).trim());
      params.set('sort_by', sort);
      params.set('limit', '50');
      const res = await api.get(`/products?${params.toString()}`);
      setProducts(res.data?.products || []);
    } catch {/* silent */}
    finally { setLoading(false); setRefreshing(false); }
  }, [category, sort, search]);

  const fetchCartAndWishlist = useCallback(async () => {
    if (!user) { setCartCount(0); setWishlistIds([]); return; }
    try {
      const [cartRes, wlRes] = await Promise.all([
        api.get('/cart').catch(() => ({ data: { items: [] } })),
        api.get('/wishlist/products').catch(() => ({ data: { products: [] } })),
      ]);
      const items = cartRes.data?.items || [];
      setCartCount(items.reduce((sum: number, i: any) => sum + (i.quantity || 0), 0));
      setWishlistIds((wlRes.data?.products || []).map((p: any) => p.id));
    } catch {/* silent */}
  }, [user]);

  useEffect(() => { fetchProducts(); }, [category, sort, fetchProducts]);
  useFocusEffect(useCallback(() => { fetchCartAndWishlist(); }, [fetchCartAndWishlist]));

  const onRefresh = () => { setRefreshing(true); fetchProducts(); fetchCartAndWishlist(); };

  const onSearchSubmit = () => {
    setLoading(true);
    fetchProducts(search);
  };

  const toggleWishlist = async (productId: string) => {
    if (!user) { router.push('/auth'); return; }
    try {
      await api.post(`/wishlist/product/${productId}`);
      setWishlistIds((prev) => prev.includes(productId) ? prev.filter((x) => x !== productId) : [...prev, productId]);
    } catch {/* silent */}
  };

  const addToCart = async (productId: string) => {
    if (!user) { router.push('/auth'); return; }
    try {
      await api.post(`/cart/add?product_id=${productId}&quantity=1`);
      fetchCartAndWishlist();
    } catch {/* silent */}
  };

  return (
    <SafeAreaView style={styles.container} testID="shop-screen">
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Shop</Text>
          <Text style={styles.subtitle}>Gear & merch for divers</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => router.push('/wishlist')} testID="open-wishlist-btn">
            <Ionicons name="heart-outline" size={20} color={Colors.slate700} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconBtn} onPress={() => router.push('/cart')} testID="open-cart-btn">
            <Ionicons name="cart-outline" size={20} color={Colors.slate700} />
            {cartCount > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{cartCount > 9 ? '9+' : cartCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.searchWrap}>
        <Ionicons name="search" size={14} color={Colors.slate400} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          onSubmitEditing={onSearchSubmit}
          placeholder="Search products…"
          placeholderTextColor={Colors.slate400}
          style={styles.searchInput}
          testID="shop-search"
        />
        {search ? (
          <TouchableOpacity onPress={() => { setSearch(''); fetchProducts(''); }} testID="clear-shop-search">
            <Ionicons name="close-circle" size={16} color={Colors.slate400} />
          </TouchableOpacity>
        ) : null}
      </View>

      <FlatList
        horizontal
        data={CATEGORIES}
        keyExtractor={(c) => c.value || 'all'}
        contentContainerStyle={styles.chipRow}
        showsHorizontalScrollIndicator={false}
        renderItem={({ item }) => {
          const active = category === item.value;
          return (
            <Chip
              active={active}
              onPress={() => setCategory(item.value)}
              testID={`shop-cat-${item.value || 'all'}`}
            >
              {item.label}
            </Chip>
          );
        }}
      />

      <FlatList
        horizontal
        data={SORT_OPTIONS}
        keyExtractor={(s) => s.value}
        contentContainerStyle={styles.sortRow}
        showsHorizontalScrollIndicator={false}
        renderItem={({ item }) => {
          const active = sort === item.value;
          return (
            <Chip
              active={active}
              onPress={() => setSort(item.value)}
              size="sm"
              testID={`shop-sort-${item.value}`}
            >
              {item.label}
            </Chip>
          );
        }}
      />

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={Colors.cyan400} /></View>
      ) : (
        <FlatList
          data={products}
          keyExtractor={(p) => p.id}
          numColumns={2}
          columnWrapperStyle={{ gap: 10, paddingHorizontal: 16 }}
          contentContainerStyle={{ paddingBottom: 40, gap: 10 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.cyan400} />}
          ListEmptyComponent={
            <View style={styles.empty} testID="shop-empty">
              <Ionicons name="bag-outline" size={40} color={Colors.slate300} />
              <Text style={styles.emptyTitle}>No products found</Text>
              <Text style={styles.emptySubtitle}>Try a different category or search.</Text>
            </View>
          }
          renderItem={({ item: p }) => (
            <ProductCard
              product={p}
              wishlisted={wishlistIds.includes(p.id)}
              onPress={() => router.push({ pathname: '/product/[id]', params: { id: p.id } })}
              onToggleWishlist={() => toggleWishlist(p.id)}
              onAddToCart={() => addToCart(p.id)}
            />
          )}
        />
      )}
    </SafeAreaView>
  );
}

function ProductCard({ product, wishlisted, onPress, onToggleWishlist, onAddToCart }: any) {
  const hasDiscount = product.compare_at_price && product.compare_at_price > product.price;
  const discountPct = hasDiscount ? Math.round((1 - product.price / product.compare_at_price) * 100) : 0;
  return (
    <TouchableOpacity onPress={onPress} style={styles.card} testID={`product-card-${product.id}`}>
      <View style={styles.imgWrap}>
        {product.image_url ? (
          <Image source={{ uri: product.image_url }} style={styles.image} />
        ) : (
          <View style={[styles.image, { backgroundColor: Colors.slate100, alignItems: 'center', justifyContent: 'center' }]}>
            <Ionicons name="image-outline" size={28} color={Colors.slate300} />
          </View>
        )}
        <TouchableOpacity onPress={onToggleWishlist} style={[styles.wishBtn, wishlisted && styles.wishBtnActive]} testID={`wishlist-btn-${product.id}`}>
          <Ionicons name={wishlisted ? 'heart' : 'heart-outline'} size={14} color={wishlisted ? Colors.white : Colors.slate500} />
        </TouchableOpacity>
        {hasDiscount && (
          <View style={styles.discountBadge}><Text style={styles.discountText}>{discountPct}% off</Text></View>
        )}
        {!product.in_stock && (
          <View style={styles.soldOut}><Text style={styles.soldOutText}>Sold out</Text></View>
        )}
      </View>
      <View style={styles.cardBody}>
        <Text style={styles.cardTitle} numberOfLines={1}>{product.name}</Text>
        <Text style={styles.cardDesc} numberOfLines={1}>{product.description}</Text>
        {product.rating > 0 && (
          <View style={styles.ratingRow}>
            <Ionicons name="star" size={10} color="#f59e0b" />
            <Text style={styles.ratingText}>{product.rating}</Text>
            <Text style={styles.ratingCount}>({product.review_count || 0})</Text>
          </View>
        )}
        <View style={styles.priceRow}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
            <Text style={styles.price}>${product.price?.toFixed(0)}</Text>
            {hasDiscount && <Text style={styles.compareAt}>${product.compare_at_price?.toFixed(0)}</Text>}
          </View>
          <TouchableOpacity onPress={onAddToCart} disabled={!product.in_stock} style={[styles.addBtn, !product.in_stock && { opacity: 0.4 }]} testID={`add-cart-${product.id}`}>
            <Ionicons name="add" size={14} color={Colors.white} />
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.slate50 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8 },
  title: { fontSize: 24, fontWeight: '700', color: Colors.slate900 },
  subtitle: { fontSize: 13, color: Colors.slate500, marginTop: 2 },
  iconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.borderLight, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: 4, right: 4, minWidth: 16, height: 16, borderRadius: 8, paddingHorizontal: 4, backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: Colors.white, fontSize: 9, fontWeight: '700' },
  searchWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginTop: 8, marginBottom: 8, paddingHorizontal: 12, paddingVertical: 9, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border, borderRadius: 12 },
  searchInput: { flex: 1, fontSize: 13, color: Colors.slate900 },
  chipRow: { paddingHorizontal: 16, gap: 8, paddingBottom: 10, alignItems: 'center' },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: Colors.slate100 },
  chipActive: { backgroundColor: Colors.cyan400 },
  chipText: { fontSize: 12, fontWeight: '700', color: Colors.slate600 },
  chipTextActive: { color: Colors.white },
  sortRow: { paddingHorizontal: 16, gap: 8, paddingBottom: 14, alignItems: 'center' },
  sortChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.borderLight },
  sortChipActive: { borderColor: Colors.cyan400, backgroundColor: Colors.cyan50 },
  sortText: { fontSize: 11, fontWeight: '600', color: Colors.slate500 },
  sortTextActive: { color: Colors.cyan500 },
  card: { flex: 1, backgroundColor: Colors.white, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: Colors.borderLight },
  imgWrap: { position: 'relative', height: 160 },
  image: { width: '100%', height: '100%' },
  wishBtn: { position: 'absolute', top: 8, left: 8, width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.9)', alignItems: 'center', justifyContent: 'center' },
  wishBtnActive: { backgroundColor: Colors.accent },
  discountBadge: { position: 'absolute', top: 8, right: 8, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: Colors.success },
  discountText: { fontSize: 9, fontWeight: '700', color: Colors.white },
  soldOut: { position: 'absolute', inset: 0, backgroundColor: 'rgba(15,23,42,0.45)', alignItems: 'center', justifyContent: 'center' },
  soldOutText: { color: Colors.white, fontWeight: '700', fontSize: 12, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 6 },
  cardBody: { padding: 10, gap: 4 },
  cardTitle: { fontSize: 13, fontWeight: '700', color: Colors.slate900 },
  cardDesc: { fontSize: 11, color: Colors.slate500 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  ratingText: { fontSize: 10, fontWeight: '700', color: Colors.slate700 },
  ratingCount: { fontSize: 9, color: Colors.slate400 },
  priceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 6, borderTopWidth: 1, borderTopColor: Colors.borderLight, marginTop: 4 },
  price: { fontSize: 16, fontWeight: '700', color: Colors.slate900 },
  compareAt: { fontSize: 11, color: Colors.slate400, textDecorationLine: 'line-through' },
  addBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: Colors.cyan500, alignItems: 'center', justifyContent: 'center' },
  empty: { alignItems: 'center', paddingVertical: 60, paddingHorizontal: 32 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: Colors.slate700, marginTop: 12 },
  emptySubtitle: { fontSize: 13, color: Colors.slate500, marginTop: 6 },
});
