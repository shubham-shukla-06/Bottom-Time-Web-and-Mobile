import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator, Image, Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import Icon from '../../src/components/Icon';
import api from '../../src/api/client';
import useAuthStore from '../../src/stores/authStore';
import { Colors } from '../../src/constants/colors';

const SCREEN_WIDTH = Dimensions.get('window').width;

export default function ProductDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const [product, setProduct] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [imgIndex, setImgIndex] = useState(0);
  const [size, setSize] = useState<string | null>(null);
  const [qty, setQty] = useState(1);
  const [wishlisted, setWishlisted] = useState(false);
  const [adding, setAdding] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const fetchProduct = useCallback(async () => {
    try {
      const res = await api.get(`/products/${id}`);
      setProduct(res.data);
      if (res.data?.sizes?.length) setSize(res.data.sizes[0]);
    } catch {/* silent */}
    finally { setLoading(false); }
  }, [id]);

  const fetchWishlistState = useCallback(async () => {
    if (!user) return;
    try {
      const res = await api.get('/wishlist/products');
      const items = res.data?.products || [];
      setWishlisted(items.some((p: any) => p.id === id));
    } catch {/* silent */}
  }, [id, user]);

  useEffect(() => { fetchProduct(); }, [fetchProduct]);
  useFocusEffect(useCallback(() => { fetchWishlistState(); }, [fetchWishlistState]));

  const showFeedback = (msg: string) => {
    setFeedback(msg);
    setTimeout(() => setFeedback(null), 1800);
  };

  const addToCart = async () => {
    if (!user) { router.push('/welcome'); return; }
    if (product?.sizes?.length > 0 && !size) { showFeedback('Pick a size first'); return; }
    setAdding(true);
    try {
      const params = new URLSearchParams();
      params.set('product_id', String(id));
      params.set('quantity', String(qty));
      if (size) params.set('size', size);
      await api.post(`/cart/add?${params.toString()}`);
      showFeedback(`Added ${qty} to cart`);
    } catch (e: any) {
      showFeedback(e?.response?.data?.detail || 'Failed to add to cart');
    } finally { setAdding(false); }
  };

  const toggleWishlist = async () => {
    if (!user) { router.push('/welcome'); return; }
    try {
      await api.post(`/wishlist/product/${id}`);
      setWishlisted((prev) => !prev);
      showFeedback(wishlisted ? 'Removed from wishlist' : 'Added to wishlist');
    } catch {/* silent */}
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}><ActivityIndicator size="large" color={Colors.cyan400} /></View>
      </SafeAreaView>
    );
  }

  if (!product) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <Icon name="bag-handle-outline" size={40} color={Colors.slate300} />
          <Text style={styles.errorText}>Product not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  const images: string[] = product.images?.length ? product.images : product.image_url ? [product.image_url] : [];
  const hasDiscount = product.compare_at_price && product.compare_at_price > product.price;
  const discountPct = hasDiscount ? Math.round((1 - product.price / product.compare_at_price) * 100) : 0;

  return (
    <SafeAreaView style={styles.container} testID="product-detail-screen">
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} testID="prod-back-btn">
          <Icon name="arrow-back" size={22} color={Colors.slate900} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.push('/cart')} testID="prod-cart-btn">
          <Icon name="cart-outline" size={22} color={Colors.slate900} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 110 }}>
        <View style={styles.galleryWrap}>
          {images.length > 0 ? (
            <Image source={{ uri: images[imgIndex] }} style={styles.heroImage} />
          ) : (
            <View style={[styles.heroImage, { alignItems: 'center', justifyContent: 'center' }]}>
              <Icon name="image-outline" size={48} color={Colors.slate300} />
            </View>
          )}
          {images.length > 1 && (
            <ScrollView horizontal contentContainerStyle={styles.thumbsRow} showsHorizontalScrollIndicator={false}>
              {images.map((img, idx) => (
                <TouchableOpacity key={idx} onPress={() => setImgIndex(idx)}
                  style={[styles.thumb, idx === imgIndex && styles.thumbActive]}
                  testID={`thumb-${idx}`}>
                  <Image source={{ uri: img }} style={styles.thumbImage} />
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
          {hasDiscount && (
            <View style={styles.discountBadge}><Text style={styles.discountText}>{discountPct}% OFF</Text></View>
          )}
        </View>

        <View style={styles.content}>
          <View style={styles.titleRow}>
            <Text style={styles.title}>{product.name}</Text>
            <TouchableOpacity onPress={toggleWishlist} style={[styles.heartBtn, wishlisted && styles.heartBtnActive]} testID="prod-wishlist-btn">
              <Icon name={wishlisted ? 'heart' : 'heart-outline'} size={18} color={wishlisted ? Colors.white : Colors.slate600} />
            </TouchableOpacity>
          </View>

          {product.rating > 0 && (
            <View style={styles.ratingRow}>
              <Icon name="star" size={12} color="#f59e0b" />
              <Text style={styles.ratingText}>{product.rating}</Text>
              <Text style={styles.ratingCount}>({product.review_count || 0} reviews)</Text>
              {product.in_stock ? (
                <View style={[styles.stockPill, { backgroundColor: '#ecfdf5' }]}>
                  <Text style={[styles.stockText, { color: Colors.success }]}>In stock</Text>
                </View>
              ) : (
                <View style={[styles.stockPill, { backgroundColor: '#fef2f2' }]}>
                  <Text style={[styles.stockText, { color: Colors.accent }]}>Sold out</Text>
                </View>
              )}
            </View>
          )}

          <View style={styles.priceRow}>
            <Text style={styles.price}>${product.price?.toFixed(0)}</Text>
            {hasDiscount && <Text style={styles.compareAt}>${product.compare_at_price?.toFixed(0)}</Text>}
          </View>

          <Text style={styles.description}>{product.description}</Text>

          {product.sizes?.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Size</Text>
              <View style={styles.sizeRow}>
                {product.sizes.map((s: string) => (
                  <TouchableOpacity key={s} onPress={() => setSize(s)}
                    style={[styles.sizeChip, size === s && styles.sizeChipActive]}
                    testID={`size-${s}`}>
                    <Text style={[styles.sizeText, size === s && styles.sizeTextActive]}>{s}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Quantity</Text>
            <View style={styles.qtyRow}>
              <TouchableOpacity onPress={() => setQty((q) => Math.max(1, q - 1))} style={styles.qtyBtn} testID="qty-minus">
                <Icon name="remove" size={16} color={Colors.slate700} />
              </TouchableOpacity>
              <Text style={styles.qtyValue} testID="qty-value">{qty}</Text>
              <TouchableOpacity onPress={() => setQty((q) => q + 1)} style={styles.qtyBtn} testID="qty-plus">
                <Icon name="add" size={16} color={Colors.slate700} />
              </TouchableOpacity>
            </View>
          </View>

          {product.specifications && Object.keys(product.specifications).length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Specs</Text>
              {Object.entries(product.specifications).map(([k, v]) => (
                <View key={k} style={styles.specRow}>
                  <Text style={styles.specKey}>{k.replace(/_/g, ' ')}</Text>
                  <Text style={styles.specVal}>{String(v)}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      {feedback && (
        <View style={styles.toast} testID="prod-toast">
          <Text style={styles.toastText}>{feedback}</Text>
        </View>
      )}

      <View style={styles.footer}>
        <View style={{ flex: 1 }}>
          <Text style={styles.footerLabel}>Total</Text>
          <Text style={styles.footerTotal}>${(product.price * qty).toFixed(0)}</Text>
        </View>
        <TouchableOpacity onPress={addToCart} disabled={adding || !product.in_stock}
          style={[styles.addCartBtn, (adding || !product.in_stock) && { opacity: 0.6 }]}
          testID="add-to-cart-btn">
          {adding ? <ActivityIndicator size="small" color={Colors.white} /> : (
            <>
              <Icon name="cart" size={16} color={Colors.white} />
              <Text style={styles.addCartText}>{product.in_stock ? 'Add to cart' : 'Sold out'}</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.slate50 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorText: { fontSize: 15, color: Colors.slate500, marginTop: 12 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  galleryWrap: { backgroundColor: Colors.white, position: 'relative' },
  heroImage: { width: SCREEN_WIDTH, height: SCREEN_WIDTH },
  thumbsRow: { paddingHorizontal: 12, paddingVertical: 8, gap: 8 },
  thumb: { width: 56, height: 56, borderRadius: 8, overflow: 'hidden', borderWidth: 2, borderColor: 'transparent' },
  thumbActive: { borderColor: Colors.cyan400 },
  thumbImage: { width: '100%', height: '100%' },
  discountBadge: { position: 'absolute', top: 12, right: 12, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: Colors.success },
  discountText: { fontSize: 11, fontWeight: '700', color: Colors.white },
  content: { padding: 16, gap: 14, backgroundColor: Colors.slate50 },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  title: { flex: 1, fontSize: 22, fontWeight: '700', color: Colors.slate900 },
  heartBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: Colors.white, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.borderLight },
  heartBtnActive: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  ratingText: { fontSize: 12, fontWeight: '700', color: Colors.slate800 },
  ratingCount: { fontSize: 11, color: Colors.slate500 },
  stockPill: { marginLeft: 'auto', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  stockText: { fontSize: 10, fontWeight: '700' },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  price: { fontSize: 26, fontWeight: '700', color: Colors.slate900 },
  compareAt: { fontSize: 14, color: Colors.slate400, textDecorationLine: 'line-through' },
  description: { fontSize: 13, color: Colors.slate600, lineHeight: 19 },
  section: { backgroundColor: Colors.white, borderRadius: 12, padding: 14, gap: 8, borderWidth: 1, borderColor: Colors.borderLight },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: Colors.slate500, letterSpacing: 1, textTransform: 'uppercase' },
  sizeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  sizeChip: { minWidth: 44, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: Colors.slate50, borderWidth: 1, borderColor: Colors.border, alignItems: 'center' },
  sizeChipActive: { backgroundColor: Colors.cyan400, borderColor: Colors.cyan400 },
  sizeText: { fontSize: 13, fontWeight: '700', color: Colors.slate700 },
  sizeTextActive: { color: Colors.white },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  qtyBtn: { width: 36, height: 36, borderRadius: 8, backgroundColor: Colors.slate100, alignItems: 'center', justifyContent: 'center' },
  qtyValue: { fontSize: 18, fontWeight: '700', color: Colors.slate900, minWidth: 32, textAlign: 'center' },
  specRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  specKey: { fontSize: 12, color: Colors.slate500, textTransform: 'capitalize' },
  specVal: { fontSize: 12, color: Colors.slate900, fontWeight: '600' },
  toast: { position: 'absolute', bottom: 96, left: 16, right: 16, padding: 12, borderRadius: 10, backgroundColor: Colors.slate900, alignItems: 'center' },
  toastText: { color: Colors.white, fontSize: 13, fontWeight: '600' },
  footer: { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, backgroundColor: Colors.white, borderTopWidth: 1, borderTopColor: Colors.borderLight },
  footerLabel: { fontSize: 10, color: Colors.slate500, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  footerTotal: { fontSize: 18, fontWeight: '700', color: Colors.slate900 },
  addCartBtn: { flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 14, borderRadius: 999, backgroundColor: Colors.cyan500 },
  addCartText: { fontSize: 14, fontWeight: '700', color: Colors.white },
});
