import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  TextInput,
} from 'react-native';
import { Text } from '../src/components/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import Icon from '../src/components/Icon';
import api from '../src/api/client';
import { Colors } from '../src/constants/colors';
import { confirmDialog } from '../src/utils/confirm';
import useCurrency from '../src/hooks/useCurrency';

export default function CartScreen() {
  const router = useRouter();
  const { format } = useCurrency();
  const [items, setItems] = useState<any[]>([]);
  const [tax, setTax] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [promoCode, setPromoCode] = useState('');
  const [promoResult, setPromoResult] = useState<any>(null);
  const [promoError, setPromoError] = useState<string | null>(null);

  const fetchCart = useCallback(async () => {
    try {
      const [cartRes, taxRes] = await Promise.all([
        api.get('/cart').catch(() => ({ data: { items: [], total: 0 } })),
        api.post('/tax/calculate-cart', {}).catch(() => ({ data: null })),
      ]);
      setItems(cartRes.data?.items || []);
      setTax(taxRes.data);
    } catch {/* silent */}
    finally { setLoading(false); }
  }, []);

  useFocusEffect(useCallback(() => { setLoading(true); fetchCart(); }, [fetchCart]));

  const updateQty = async (productId: string, size: string | null, newQty: number) => {
    setBusy(`${productId}-${size || ''}`);
    try {
      if (newQty <= 0) {
        await api.delete(`/cart/${productId}`);
      } else {
        const params = new URLSearchParams();
        params.set('product_id', productId);
        params.set('quantity', String(newQty));
        if (size) params.set('size', size);
        await api.put(`/cart/update?${params.toString()}`);
      }
      fetchCart();
    } catch {/* silent */} finally { setBusy(null); }
  };

  const removeItem = async (productId: string, name: string) => {
    const ok = await confirmDialog({
      title: 'Remove from cart?',
      message: `Remove "${name}" from your cart?`,
      confirmText: 'Remove', cancelText: 'Keep', destructive: true,
    });
    if (!ok) return;
    try {
      await api.delete(`/cart/${productId}`);
      fetchCart();
    } catch {/* silent */}
  };

  const applyPromo = async () => {
    setPromoError(null);
    if (!promoCode.trim()) return;
    try {
      const subtotal = items.reduce((s, i) => s + ((i.product?.price || 0) * i.quantity), 0);
      const res = await api.post('/promo-codes/validate', {
        code: promoCode.trim(),
        order_total: subtotal,
        applies_to: 'shop',
      });
      setPromoResult(res.data);
    } catch (e: any) {
      setPromoResult(null);
      setPromoError(e?.response?.data?.detail || 'Invalid promo code');
    }
  };

  const subtotal = items.reduce((s, i) => s + ((i.product?.price || 0) * i.quantity), 0);
  const discount = promoResult?.discount_amount || 0;
  const lineCount = items.reduce((s, i) => s + i.quantity, 0);

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}><ActivityIndicator size="large" color={Colors.cyan400} /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} testID="cart-screen">
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} testID="cart-back-btn">
          <Icon name="arrow-back" size={22} color={Colors.slate900} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Your cart{lineCount > 0 ? ` (${lineCount})` : ''}</Text>
        <View style={{ width: 22 }} />
      </View>

      {items.length === 0 ? (
        <View style={styles.empty} testID="cart-empty">
          <Icon name="cart-outline" size={48} color={Colors.slate300} />
          <Text style={styles.emptyTitle}>Your cart is empty</Text>
          <Text style={styles.emptySubtitle}>Add some gear or merch to get started.</Text>
          <TouchableOpacity onPress={() => router.push('/shop')} style={styles.shopBtn} testID="empty-shop-btn">
            <Text style={styles.shopBtnText}>Browse Shop</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 200, gap: 10 }}>
            {items.map((item) => (
              <View key={`${item.product_id}-${item.size || ''}`} style={styles.itemCard} testID={`cart-item-${item.product_id}`}>
                {item.product?.image_url ? (
                  <Image source={{ uri: item.product.image_url }} style={styles.itemImg} />
                ) : (
                  <View style={[styles.itemImg, { backgroundColor: Colors.slate100, alignItems: 'center', justifyContent: 'center' }]}>
                    <Icon name="image-outline" size={20} color={Colors.slate300} />
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemName} numberOfLines={2}>{item.product?.name || 'Product'}</Text>
                  {item.size && <Text style={styles.itemSize}>Size: {item.size}</Text>}
                  <View style={styles.itemBottom}>
                    <Text style={styles.itemPrice}>{format((item.product?.price || 0) * item.quantity)}</Text>
                    <View style={styles.qtyControls}>
                      <TouchableOpacity onPress={() => updateQty(item.product_id, item.size, item.quantity - 1)}
                        disabled={busy === `${item.product_id}-${item.size || ''}`} style={styles.qtyMini} testID={`cart-minus-${item.product_id}`}>
                        <Icon name="remove" size={12} color={Colors.slate700} />
                      </TouchableOpacity>
                      <Text style={styles.qtyMiniValue}>{item.quantity}</Text>
                      <TouchableOpacity onPress={() => updateQty(item.product_id, item.size, item.quantity + 1)}
                        disabled={busy === `${item.product_id}-${item.size || ''}`} style={styles.qtyMini} testID={`cart-plus-${item.product_id}`}>
                        <Icon name="add" size={12} color={Colors.slate700} />
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
                <TouchableOpacity onPress={() => removeItem(item.product_id, item.product?.name || 'this item')} style={styles.removeBtn} testID={`cart-remove-${item.product_id}`}>
                  <Icon name="close" size={14} color={Colors.slate400} />
                </TouchableOpacity>
              </View>
            ))}

            <View style={styles.promoSection}>
              <Text style={styles.sectionLabel}>Promo code</Text>
              {promoResult ? (
                <View style={styles.promoApplied}>
                  <View>
                    <Text style={styles.promoCode}>{promoResult.code}</Text>
                    <Text style={styles.promoDesc}>{promoResult.description}</Text>
                  </View>
                  <TouchableOpacity onPress={() => { setPromoResult(null); setPromoCode(''); }} testID="cart-remove-promo">
                    <Text style={styles.removePromo}>Remove</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={{ gap: 6 }}>
                  <View style={styles.promoRow}>
                    <TextInput value={promoCode} onChangeText={setPromoCode} placeholder="Enter code" style={styles.promoInput} testID="promo-input" />
                    <TouchableOpacity onPress={applyPromo} style={styles.applyBtn} testID="apply-promo-btn">
                      <Text style={styles.applyBtnText}>Apply</Text>
                    </TouchableOpacity>
                  </View>
                  {promoError && <Text style={styles.promoError}>{promoError}</Text>}
                </View>
              )}
            </View>

            <View style={styles.summarySection}>
              <Text style={styles.sectionLabel}>Order summary</Text>
              <Row label="Sub-total" value={format(subtotal)} />
              <Row label="GST" value="Calculated at shipping" muted />
              <Row label="Shipping" value="Calculated at shipping" muted />
              {discount > 0 && <Row label="Discount" value={`-${format(discount)}`} positive />}
              <View style={{ borderTopWidth: 1, borderTopColor: Colors.borderLight, marginTop: 6, paddingTop: 6 }}>
                <Row label="Estimate" value={format(subtotal - discount)} bold />
              </View>
            </View>
          </ScrollView>

          <View style={styles.footer}>
            <View style={{ flex: 1 }}>
              <Text style={styles.footerLabel}>Estimate</Text>
              <Text style={styles.footerTotal}>{format(subtotal - discount)}</Text>
            </View>
            <TouchableOpacity onPress={() => router.push({ pathname: '/checkout', params: { promo: promoResult?.code || '' } })} style={styles.checkoutBtn} testID="checkout-btn">
              <Text style={styles.checkoutText}>Checkout</Text>
              <Icon name="arrow-forward" size={16} color={Colors.white} />
            </TouchableOpacity>
          </View>
        </>
      )}
    </SafeAreaView>
  );
}

function Row({ label, value, muted, bold, positive }: { label: string; value: string; muted?: boolean; bold?: boolean; positive?: boolean }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={[styles.summaryLabel, muted && { color: Colors.slate400 }, bold && { fontWeight: '700', color: Colors.slate900, fontSize: 15 }]}>{label}</Text>
      <Text style={[styles.summaryValue, muted && { color: Colors.slate400, fontWeight: '600', fontSize: 12 }, bold && { fontSize: 18, fontWeight: '700' }, positive && { color: Colors.success }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.slate50 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  headerTitle: { fontSize: 17, fontWeight: '700', color: Colors.slate900 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: Colors.slate800, marginTop: 14 },
  emptySubtitle: { fontSize: 13, color: Colors.slate500, marginTop: 6, textAlign: 'center' },
  shopBtn: { marginTop: 18, paddingHorizontal: 22, paddingVertical: 12, borderRadius: 999, backgroundColor: Colors.cyan500 },
  shopBtnText: { color: Colors.white, fontWeight: '700', fontSize: 14 },
  itemCard: { flexDirection: 'row', gap: 12, padding: 12, borderRadius: 14, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.borderLight },
  itemImg: { width: 64, height: 64, borderRadius: 10 },
  itemName: { fontSize: 13, fontWeight: '700', color: Colors.slate900 },
  itemSize: { fontSize: 11, color: Colors.slate500, marginTop: 2 },
  itemBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  itemPrice: { fontSize: 14, fontWeight: '700', color: Colors.slate900 },
  qtyControls: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 4, backgroundColor: Colors.slate50, borderRadius: 999 },
  qtyMini: { width: 24, height: 24, borderRadius: 12, backgroundColor: Colors.white, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border },
  qtyMiniValue: { minWidth: 18, textAlign: 'center', fontSize: 12, fontWeight: '700', color: Colors.slate900 },
  removeBtn: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  promoSection: { backgroundColor: Colors.white, borderRadius: 14, padding: 14, gap: 10, borderWidth: 1, borderColor: Colors.borderLight, marginTop: 4 },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: Colors.slate500, textTransform: 'uppercase', letterSpacing: 1 },
  promoRow: { flexDirection: 'row', gap: 8 },
  promoInput: { flex: 1, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, fontSize: 13, color: Colors.slate900 },
  applyBtn: { paddingHorizontal: 16, justifyContent: 'center', borderRadius: 10, backgroundColor: Colors.slate900 },
  applyBtnText: { color: Colors.white, fontWeight: '700', fontSize: 13 },
  promoError: { fontSize: 11, color: Colors.accent },
  promoApplied: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 10, borderRadius: 10, backgroundColor: '#ecfdf5' },
  promoCode: { fontSize: 13, fontWeight: '700', color: Colors.success },
  promoDesc: { fontSize: 11, color: Colors.success },
  removePromo: { fontSize: 12, fontWeight: '700', color: Colors.accent },
  summarySection: { backgroundColor: Colors.white, borderRadius: 14, padding: 14, gap: 8, borderWidth: 1, borderColor: Colors.borderLight, marginTop: 4 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between' },
  summaryLabel: { fontSize: 13, color: Colors.slate600, fontWeight: '600' },
  summaryValue: { fontSize: 13, color: Colors.slate900, fontWeight: '700' },
  footer: { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, backgroundColor: Colors.white, borderTopWidth: 1, borderTopColor: Colors.borderLight },
  footerLabel: { fontSize: 10, color: Colors.slate500, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  footerTotal: { fontSize: 18, fontWeight: '700', color: Colors.slate900 },
  checkoutBtn: { flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 14, borderRadius: 999, backgroundColor: Colors.cyan500 },
  checkoutText: { color: Colors.white, fontWeight: '700', fontSize: 14 },
});
