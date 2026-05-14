/**
 * Mobile Shop — pixel-mirrors web `frontend/src/pages/Shop.js` toolbar:
 *   • Categories (left, horizontal scroll, <Chip>) — All / Merch / Gear / Essentials
 *   • Sort dropdown (right, "Sort by Popular ▼")
 * Categories and sort live on the SAME row separated by space-between.
 *
 * Prices use `useCurrency().format(...)` so toggling the currency picker
 * elsewhere live-updates every product price across the app.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  FlatList,
  ScrollView,
  TextInput,
  StyleSheet,
  Image,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { HapticTouchable as TouchableOpacity } from '../../src/components/HapticTouchable';
import { Text } from '../../src/components/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import Icon from '../../src/components/Icon';
import api from '../../src/api/client';
import useAuthStore from '../../src/stores/authStore';
import { Colors } from '../../src/constants/colors';
import Chip from '../../src/components/ui/Chip';
import useCurrency from '../../src/hooks/useCurrency';
import useTabBarOnScroll from '../../src/hooks/useTabBarOnScroll';
import { triggerHaptic } from '../../src/utils/haptics';

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
  const { format } = useCurrency();
  const [products, setProducts] = useState<any[]>([]);
  const [category, setCategory] = useState('');
  const [sort, setSort] = useState('popular');
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [cartCount, setCartCount] = useState(0);
  const [wishlistIds, setWishlistIds] = useState<string[]>([]);
  const onListScroll = useTabBarOnScroll();

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

  const onRefresh = () => { try { void triggerHaptic('selection'); } catch {/* noop */} setRefreshing(true); fetchProducts(); fetchCartAndWishlist(); };
  const onSearchSubmit = () => { setLoading(true); fetchProducts(search); };

  const toggleWishlist = async (productId: string) => {
    if (!user) { router.push('/welcome'); return; }
    try {
      await api.post(`/wishlist/product/${productId}`);
      setWishlistIds((prev) => prev.includes(productId) ? prev.filter((x) => x !== productId) : [...prev, productId]);
    } catch {/* silent */}
  };

  const addToCart = async (productId: string) => {
    if (!user) { router.push('/welcome'); return; }
    try {
      await api.post(`/cart/add?product_id=${productId}&quantity=1`);
      fetchCartAndWishlist();
    } catch {/* silent */}
  };

  const sortLabel = SORT_OPTIONS.find((o) => o.value === sort)?.label || 'Popular';

  return (
    <SafeAreaView style={styles.container} testID="shop-screen">
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Shop</Text>
          <Text style={styles.subtitle}>Gear & merch for divers</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => router.push('/wishlist')} testID="open-wishlist-btn">
            <Icon name="heart-outline" size={20} color={Colors.slate700} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconBtn} onPress={() => router.push('/cart')} testID="open-cart-btn">
            <Icon name="cart-outline" size={20} color={Colors.slate700} />
            {cartCount > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{cartCount > 9 ? '9+' : cartCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.searchWrap}>
        <Icon name="search" size={14} color={Colors.slate400} />
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
            <Icon name="close-circle" size={16} color={Colors.slate400} />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Toolbar: categories (left, scroll) ←──→ sort (right) */}
      <View style={styles.toolbarRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.catRow} style={{ flexShrink: 1 }}>
          {CATEGORIES.map((c) => {
            const active = category === c.value;
            return (
              <Chip key={c.value || 'all'} active={active}
                onPress={() => setCategory(c.value)}
                testID={`shop-cat-${c.value || 'all'}`}>
                {c.label}
              </Chip>
            );
          })}
        </ScrollView>
        <View style={styles.sortGroup}>
          <Text style={styles.sortLabel}>Sort by</Text>
          <TouchableOpacity onPress={() => setSortMenuOpen((o) => !o)} style={styles.sortBtn} testID="shop-sort-btn">
            <Text style={styles.sortBtnText}>{sortLabel}</Text>
            <Icon name="chevron-down" size={12} color={Colors.slate600} />
          </TouchableOpacity>
        </View>
      </View>
      {sortMenuOpen ? (
        <View style={styles.sortMenu} testID="shop-sort-menu">
          {SORT_OPTIONS.map((o) => (
            <TouchableOpacity key={o.value}
              onPress={() => { setSort(o.value); setSortMenuOpen(false); }}
              style={styles.sortMenuItem}
              testID={`shop-sort-${o.value}`}>
              <Text style={[styles.sortMenuText, sort === o.value && { color: Colors.cyan500, fontWeight: '700' }]}>{o.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={Colors.cyan400} /></View>
      ) : (
        <FlatList
          data={products}
          keyExtractor={(p) => p.id}
          numColumns={2}
          columnWrapperStyle={{ gap: 10, paddingHorizontal: 16 }}
          contentContainerStyle={{ paddingBottom: 120, gap: 10, paddingTop: 4 }}
          onScroll={onListScroll}
          scrollEventThrottle={16}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.cyan400} />}
          ListEmptyComponent={
            <View style={styles.empty} testID="shop-empty">
              <Icon name="bag-outline" size={40} color={Colors.slate300} />
              <Text style={styles.emptyTitle}>No products found</Text>
              <Text style={styles.emptySubtitle}>Try a different category or search.</Text>
            </View>
          }
          renderItem={({ item: p }) => (
            <ProductCard
              product={p}
              wishlisted={wishlistIds.includes(p.id)}
              format={format}
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

function ProductCard({ product, wishlisted, format, onPress, onToggleWishlist, onAddToCart }: any) {
  const productCcy = product.currency || 'USD';
  const hasDiscount = product.compare_at_price && product.compare_at_price > product.price;
  const discountPct = hasDiscount ? Math.round((1 - product.price / product.compare_at_price) * 100) : 0;
  return (
    <TouchableOpacity onPress={onPress} style={styles.card} testID={`product-card-${product.id}`}>
      <View style={styles.imgWrap}>
        {product.image_url ? (
          <Image source={{ uri: product.image_url }} style={styles.image} />
        ) : (
          <View style={[styles.image, { backgroundColor: Colors.slate100, alignItems: 'center', justifyContent: 'center' }]}>
            <Icon name="image-outline" size={28} color={Colors.slate300} />
          </View>
        )}
        <TouchableOpacity onPress={onToggleWishlist} style={[styles.wishBtn, wishlisted && styles.wishBtnActive]} testID={`wishlist-btn-${product.id}`}>
          <Icon name={wishlisted ? 'heart' : 'heart-outline'} size={14} color={wishlisted ? Colors.white : Colors.slate500} />
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
            <Icon name="star" size={10} color="#f59e0b" />
            <Text style={styles.ratingText}>{product.rating}</Text>
            <Text style={styles.ratingCount}>({product.review_count || 0})</Text>
          </View>
        )}
        <View style={styles.priceRow}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4, flex: 1 }}>
            <Text style={styles.price} numberOfLines={1}>{format(product.price, productCcy)}</Text>
            {hasDiscount && <Text style={styles.compareAt} numberOfLines={1}>{format(product.compare_at_price, productCcy)}</Text>}
          </View>
          <TouchableOpacity onPress={onAddToCart} disabled={!product.in_stock} style={[styles.addBtn, !product.in_stock && { opacity: 0.4 }]} testID={`add-cart-${product.id}`}>
            <Icon name="add" size={14} color={Colors.white} />
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
  toolbarRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 16, paddingRight: 16, paddingBottom: 8, gap: 8 },
  catRow: { gap: 6, alignItems: 'center', paddingRight: 8 },
  sortGroup: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sortLabel: { fontSize: 11, color: Colors.slate400, fontWeight: '500' },
  sortBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 9999, backgroundColor: Colors.slate100 },
  sortBtnText: { fontSize: 12, fontWeight: '600', color: Colors.slate700 },
  sortMenu: { marginHorizontal: 16, marginBottom: 8, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.borderLight, borderRadius: 12, paddingVertical: 4, alignSelf: 'flex-end', minWidth: 160 },
  sortMenuItem: { paddingHorizontal: 14, paddingVertical: 8 },
  sortMenuText: { fontSize: 12, color: Colors.slate700, fontWeight: '500' },

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
  price: { fontSize: 15, fontWeight: '700', color: Colors.slate900 },
  compareAt: { fontSize: 11, color: Colors.slate400, textDecorationLine: 'line-through' },
  addBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: Colors.cyan500, alignItems: 'center', justifyContent: 'center' },
  empty: { alignItems: 'center', paddingVertical: 60, paddingHorizontal: 32 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: Colors.slate700, marginTop: 12 },
  emptySubtitle: { fontSize: 13, color: Colors.slate500, marginTop: 6 },
});
