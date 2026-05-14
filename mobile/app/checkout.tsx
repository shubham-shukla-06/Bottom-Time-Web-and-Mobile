import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { HapticTouchable as TouchableOpacity } from '../src/components/HapticTouchable';
import { Text } from '../src/components/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Icon from '../src/components/Icon';
import api from '../src/api/client';
import { Colors } from '../src/constants/colors';
import useCurrency from '../src/hooks/useCurrency';
import { triggerHaptic } from '../src/utils/haptics';
import { CheckoutSkeleton } from '../src/components/skeletons/CheckoutSkeleton';

const REQUIRED_FIELDS = ['name', 'phone', 'address_line1', 'city', 'state', 'pincode', 'country'] as const;
const PAN_THRESHOLD_INR = 200000; // mirror web tax engine threshold
const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

export default function CheckoutScreen() {
  const router = useRouter();
  const { format } = useCurrency();
  const { promo } = useLocalSearchParams<{ promo?: string }>();
  const [items, setItems] = useState<any[]>([]);
  const [addresses, setAddresses] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tax, setTax] = useState<any>(null);
  const [shippingRate, setShippingRate] = useState<any>(null);
  const [shippingLoading, setShippingLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAddrForm, setShowAddrForm] = useState(false);
  const [pan, setPan] = useState('');
  const [panSaving, setPanSaving] = useState(false);
  const [panSaved, setPanSaved] = useState(false);
  const [taxAck, setTaxAck] = useState(false);
  const [newAddr, setNewAddr] = useState<any>({
    name: '', phone: '', country_code: '+91', address_line1: '', address_line2: '',
    city: '', state: '', pincode: '', country: 'India', label: 'Home',
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [cartRes, addrRes] = await Promise.all([
        api.get('/cart').catch(() => ({ data: { items: [] } })),
        api.get('/user/addresses').catch(() => ({ data: { addresses: [], default_id: null } })),
      ]);
      setItems(cartRes.data?.items || []);
      const addrs = addrRes.data?.addresses || [];
      setAddresses(addrs);
      const defId = addrRes.data?.default_id || (addrs[0] && addrs[0].id);
      setSelectedId(defId || null);
      if (addrs.length === 0) setShowAddrForm(true);
    } catch {/* silent */} finally { setLoading(false); }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // recalc tax + shipping when address changes
  useEffect(() => {
    const addr = addresses.find((a) => a.id === selectedId);
    if (!addr) { setTax(null); setShippingRate(null); return; }
    (async () => {
      setShippingLoading(true);
      try {
        const taxRes = await api.post('/tax/calculate-cart', {
          shipping_country: addr.country, shipping_state: addr.state,
        }).catch(() => ({ data: null }));
        setTax(taxRes.data);
        const shippingPayload = items.map((i) => ({ product_id: i.product_id, quantity: i.quantity }));
        const ratesRes = await api.post('/shipping/rates', {
          delivery_pincode: addr.pincode, delivery_country: addr.country || 'India', cart_items: shippingPayload,
        }).catch(() => ({ data: null }));
        const cheapest = ratesRes.data?.cheapest;
        setShippingRate(cheapest ? { ...cheapest } : { rate: 0, carrier: 'standard', etd: '5-7 days' });
      } catch {/* silent */} finally { setShippingLoading(false); }
    })();
  }, [selectedId, addresses, items]);

  const saveAddress = async () => {
    setError(null);
    for (const f of REQUIRED_FIELDS) {
      if (!newAddr[f]) { setError(`Please fill in ${f.replace('_', ' ')}`); return; }
    }
    try {
      const data = { ...newAddr, is_default: addresses.length === 0 };
      const res = await api.post('/user/addresses', data);
      setShowAddrForm(false);
      await loadData();
      setSelectedId(res.data?.id);
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Failed to save address');
    }
  };

  const placeOrder = async () => {
    if (!selectedId) { setError('Please select a shipping address.'); return; }
    const addrSel = addresses.find((a) => a.id === selectedId);
    const isIndia = (addrSel?.country || '').toLowerCase() === 'india';
    const subtotalUSD = items.reduce((s, i) => s + ((i.product?.price || 0) * i.quantity), 0);
    const subtotalINR = subtotalUSD * 83;
    const needsPAN = isIndia && subtotalINR >= PAN_THRESHOLD_INR;
    if (needsPAN && !panSaved) {
      setError('PAN is required for orders ≥ ₹2,00,000 shipped to India. Please verify your PAN.');
      return;
    }
    if (tax && (tax?.totals?.gst || 0) > 0 && !taxAck) {
      setError('Please acknowledge the tax breakdown to continue.');
      return;
    }
    setError(null);
    setPlacing(true);
    try {
      // 1. Create payment order (mocked)
      const subtotal = items.reduce((s, i) => s + ((i.product?.price || 0) * i.quantity), 0);
      const gstUSD = tax?.totals?.gst || 0;
      const shippingUSD = shippingRate?.rate ? shippingRate.rate / 83 : 0; // INR→USD rough
      const grandUSD = subtotal + gstUSD + shippingUSD;
      const payRes = await api.post('/payments/create-order', {
        amount: Math.round(grandUSD * 100),
        currency: 'USD',
        cart_checkout: true,
        base_amount: subtotal,
        gst_amount: gstUSD,
        shipping_amount: shippingUSD,
        shipping_carrier: shippingRate?.carrier,
        is_export: !tax?.is_domestic,
      });

      // 2. Verify (mock or real)
      let paymentId: string;
      if (payRes.data?.mock) {
        const verifyRes = await api.post('/payments/mock-verify', { order_id: payRes.data.order_id });
        if (!verifyRes.data?.verified) throw new Error('Payment verification failed');
        paymentId = verifyRes.data.payment_id;
      } else {
        // Real Razorpay not supported on mobile in this milestone
        throw new Error('Live Razorpay checkout is not supported on mobile yet. Use the web app.');
      }

      // 3. Create order
      const addr = addresses.find((a) => a.id === selectedId);
      const orderRes = await api.post('/orders/create', {
        payment_id: paymentId, shipping: addr, currency: 'USD', gst_amount: gstUSD,
      });

      // 4. Apply promo if present
      if (promo) {
        try {
          await api.post('/promo-codes/apply', {
            code: promo, order_id: orderRes.data.id, discount: 0,
          });
        } catch {/* silent */}
      }

      router.replace({ pathname: '/order-confirmation', params: { id: orderRes.data.id } });
      try { void triggerHaptic('success'); } catch {/* noop */}
    } catch (e: any) {
      try { void triggerHaptic('error'); } catch {/* noop */}
      setError(e?.response?.data?.detail || e?.message || 'Failed to place order');
    } finally { setPlacing(false); }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <CheckoutSkeleton />
      </SafeAreaView>
    );
  }

  if (items.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <Icon name="cart-outline" size={40} color={Colors.slate300} />
          <Text style={styles.emptyText}>Your cart is empty</Text>
          <TouchableOpacity onPress={() => router.replace('/shop')} style={styles.shopBtn}>
            <Text style={styles.shopBtnText}>Browse Shop</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const subtotal = items.reduce((s, i) => s + ((i.product?.price || 0) * i.quantity), 0);
  const gstUSD = tax?.totals?.gst || 0;
  const shippingINR = shippingRate?.rate || 0;
  const shippingUSD = shippingINR ? shippingINR / 83 : 0;
  const grand = subtotal + gstUSD + shippingUSD;

  return (
    <SafeAreaView style={styles.container} testID="checkout-screen">
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} testID="checkout-back-btn">
          <Icon name="arrow-back" size={22} color={Colors.slate900} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Checkout</Text>
        <View style={{ width: 22 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 140, gap: 14 }}>
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Shipping address</Text>
              {addresses.length > 0 && !showAddrForm && (
                <TouchableOpacity onPress={() => setShowAddrForm(true)} testID="add-address-btn">
                  <Text style={styles.linkBtn}>+ Add new</Text>
                </TouchableOpacity>
              )}
            </View>

            {!showAddrForm && addresses.map((a) => {
              const sel = a.id === selectedId;
              return (
                <TouchableOpacity key={a.id} onPress={() => setSelectedId(a.id)}
                  style={[styles.addrCard, sel && styles.addrCardActive]}
                  testID={`addr-${a.id}`}>
                  <View style={[styles.radio, sel && styles.radioActive]}>
                    {sel && <View style={styles.radioInner} />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.addrName}>{a.name} <Text style={styles.addrLabel}>· {a.label}</Text></Text>
                    <Text style={styles.addrLine}>{a.address_line1}{a.address_line2 ? `, ${a.address_line2}` : ''}</Text>
                    <Text style={styles.addrLine}>{a.city}, {a.state} {a.pincode}</Text>
                    <Text style={styles.addrLine}>{a.country} · {a.country_code} {a.phone}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}

            {showAddrForm && (
              <View style={{ gap: 8 }}>
                <Field label="Full name *" value={newAddr.name} onChange={(v) => setNewAddr({ ...newAddr, name: v })} testID="addr-name" />
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Field label="Code *" value={newAddr.country_code} onChange={(v) => setNewAddr({ ...newAddr, country_code: v })} containerStyle={{ width: 80 }} testID="addr-code" />
                  <Field label="Phone *" value={newAddr.phone} onChange={(v) => setNewAddr({ ...newAddr, phone: v })} keyboardType="number-pad" containerStyle={{ flex: 1 }} testID="addr-phone" />
                </View>
                <Field label="Address line 1 *" value={newAddr.address_line1} onChange={(v) => setNewAddr({ ...newAddr, address_line1: v })} testID="addr-line1" />
                <Field label="Address line 2" value={newAddr.address_line2} onChange={(v) => setNewAddr({ ...newAddr, address_line2: v })} testID="addr-line2" />
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Field label="City *" value={newAddr.city} onChange={(v) => setNewAddr({ ...newAddr, city: v })} containerStyle={{ flex: 1 }} testID="addr-city" />
                  <Field label="State *" value={newAddr.state} onChange={(v) => setNewAddr({ ...newAddr, state: v })} containerStyle={{ flex: 1 }} testID="addr-state" />
                </View>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Field label="Pincode *" value={newAddr.pincode} onChange={(v) => setNewAddr({ ...newAddr, pincode: v })} keyboardType="number-pad" containerStyle={{ flex: 1 }} testID="addr-pincode" />
                  <Field label="Country *" value={newAddr.country} onChange={(v) => setNewAddr({ ...newAddr, country: v })} containerStyle={{ flex: 1 }} testID="addr-country" />
                </View>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {addresses.length > 0 && (
                    <TouchableOpacity onPress={() => setShowAddrForm(false)} style={[styles.formBtn, { backgroundColor: Colors.slate100 }]} testID="addr-cancel">
                      <Text style={[styles.formBtnText, { color: Colors.slate700 }]}>Cancel</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity onPress={saveAddress} style={[styles.formBtn, { backgroundColor: Colors.cyan500 }]} testID="addr-save">
                    <Text style={styles.formBtnText}>Save address</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>

          {selectedId && shippingRate && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Shipping</Text>
              <View style={styles.shipRow}>
                <Icon name="cube-outline" size={16} color={Colors.cyan500} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.shipName}>{shippingRate.carrier_name || shippingRate.carrier || 'Standard'}</Text>
                  <Text style={styles.shipDesc}>ETD {shippingRate.etd || '5-7 days'}</Text>
                </View>
                <Text style={styles.shipPrice}>{shippingRate.rate ? `₹${shippingRate.rate.toFixed(0)}` : 'Free'}</Text>
              </View>
            </View>
          )}

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Order summary</Text>
            {items.map((i) => (
              <View key={`${i.product_id}-${i.size || ''}`} style={styles.summaryItem}>
                <Text style={styles.summaryItemName} numberOfLines={1}>{(i.product?.name || 'Product')} × {i.quantity}</Text>
                <Text style={styles.summaryItemPrice}>{format((i.product?.price || 0) * i.quantity)}</Text>
              </View>
            ))}
            <View style={{ borderTopWidth: 1, borderTopColor: Colors.borderLight, marginTop: 6, paddingTop: 8, gap: 4 }}>
              <SumRow label="Sub-total" value={format(subtotal)} />
              <SumRow label="GST" value={tax ? format(gstUSD) : '—'} />
              {tax?.totals?.tcs ? (
                <SumRow label="TCS" value={format(tax.totals.tcs)} />
              ) : null}
              <SumRow label="Shipping" value={shippingLoading ? '…' : (shippingINR ? `₹${shippingINR.toFixed(0)} · ${format(shippingUSD)}` : 'Free')} />
              <SumRow label="Grand total" value={format(grand)} bold />
            </View>
          </View>

          {/* PAN compliance — required for India shipping when subtotal >= threshold */}
          {(() => {
            const addrSel = addresses.find((a) => a.id === selectedId);
            const isIndia = (addrSel?.country || '').toLowerCase() === 'india';
            const subtotalINR = subtotal * 83;
            if (!isIndia || subtotalINR < PAN_THRESHOLD_INR) return null;
            return (
              <View style={styles.section} testID="checkout-pan-section">
                <Text style={styles.sectionTitle}>PAN required</Text>
                <Text style={[styles.fieldLabel, { color: Colors.slate600, marginBottom: 8 }]}>
                  Orders ≥ ₹2,00,000 shipped to India require PAN under Indian tax rules.
                </Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TextInput
                    value={pan}
                    onChangeText={(v: string) => { setPan(v.toUpperCase()); setPanSaved(false); }}
                    placeholder="ABCDE1234F"
                    placeholderTextColor={Colors.slate400}
                    autoCapitalize="characters"
                    maxLength={10}
                    style={[styles.input, { flex: 1 }]}
                    testID="checkout-pan-input"
                  />
                  <TouchableOpacity
                    disabled={panSaving || !PAN_REGEX.test(pan)}
                    onPress={async () => {
                      setPanSaving(true);
                      try {
                        await api.post('/tax/store-pan', { pan });
                        setPanSaved(true);
                      } catch (e: any) {
                        setError(e?.response?.data?.detail || 'Could not verify PAN');
                      } finally { setPanSaving(false); }
                    }}
                    style={[styles.formBtn, { flex: 0, paddingHorizontal: 18, backgroundColor: panSaved ? Colors.success : Colors.cyan500, opacity: PAN_REGEX.test(pan) ? 1 : 0.5 }]}
                    testID="checkout-pan-verify-btn">
                    <Text style={styles.formBtnText}>{panSaved ? '✓ Saved' : (panSaving ? '…' : 'Verify')}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })()}

          {/* Tax acknowledgment — mirror web's checkbox text */}
          {tax && gstUSD > 0 ? (
            <TouchableOpacity onPress={() => setTaxAck((v) => !v)} style={styles.ackRow} testID="checkout-tax-ack">
              <View style={[styles.ackBox, taxAck && styles.ackBoxActive]}>
                {taxAck ? <Icon name="checkmark" size={12} color={Colors.white} /> : null}
              </View>
              <Text style={styles.ackText}>
                I confirm that I have reviewed the tax breakdown above (GST, shipping) and agree this order is subject to applicable Indian indirect taxes.
              </Text>
            </TouchableOpacity>
          ) : null}

          <View style={styles.paymentNote}>
            <Icon name="information-circle-outline" size={14} color={Colors.slate500} />
            <Text style={styles.paymentNoteText}>Payment is mocked in test mode. Tap "Place order" to complete.</Text>
          </View>

          {error && (
            <View style={styles.errorBanner}>
              <Icon name="alert-circle" size={14} color={Colors.accent} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}
        </ScrollView>

        <View style={styles.footer}>
          <View style={{ flex: 1 }}>
            <Text style={styles.footerLabel}>Total</Text>
            <Text style={styles.footerTotal}>${grand.toFixed(2)}</Text>
          </View>
          <TouchableOpacity onPress={placeOrder} disabled={placing || !selectedId}
            style={[styles.placeBtn, (placing || !selectedId) && { opacity: 0.5 }]}
            testID="place-order-btn">
            {placing ? <ActivityIndicator size="small" color={Colors.white} /> : (
              <>
                <Icon name="checkmark-circle" size={16} color={Colors.white} />
                <Text style={styles.placeText}>Place order</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({ label, value, onChange, keyboardType, containerStyle, testID }: any) {
  return (
    <View style={[{ gap: 4 }, containerStyle]}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput value={value} onChangeText={onChange} keyboardType={keyboardType} style={styles.input} testID={testID} />
    </View>
  );
}

function SumRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={[styles.summaryLabel, bold && { fontWeight: '700', color: Colors.slate900, fontSize: 14 }]}>{label}</Text>
      <Text style={[styles.summaryValue, bold && { fontSize: 16, fontWeight: '700' }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.slate50 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  emptyText: { fontSize: 15, color: Colors.slate500, marginTop: 12 },
  shopBtn: { marginTop: 16, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 999, backgroundColor: Colors.cyan500 },
  shopBtnText: { color: Colors.white, fontWeight: '700' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  headerTitle: { fontSize: 17, fontWeight: '700', color: Colors.slate900 },
  section: { backgroundColor: Colors.white, borderRadius: 14, padding: 14, gap: 10, borderWidth: 1, borderColor: Colors.borderLight },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: Colors.slate900 },
  linkBtn: { fontSize: 12, fontWeight: '700', color: Colors.cyan500 },
  addrCard: { flexDirection: 'row', gap: 10, padding: 12, borderRadius: 12, backgroundColor: Colors.slate50, borderWidth: 1, borderColor: Colors.borderLight },
  addrCardActive: { borderColor: Colors.cyan400, backgroundColor: Colors.cyan50 },
  radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  radioActive: { borderColor: Colors.cyan500 },
  radioInner: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.cyan500 },
  addrName: { fontSize: 13, fontWeight: '700', color: Colors.slate900 },
  addrLabel: { fontWeight: '500', color: Colors.slate500 },
  addrLine: { fontSize: 11, color: Colors.slate600, marginTop: 1 },
  fieldLabel: { fontSize: 11, fontWeight: '700', color: Colors.slate500 },
  input: { borderWidth: 1, borderColor: Colors.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, fontSize: 13, color: Colors.slate900 },
  formBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  formBtnText: { color: Colors.white, fontWeight: '700', fontSize: 13 },
  shipRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 10, backgroundColor: Colors.slate50 },
  shipName: { fontSize: 13, fontWeight: '700', color: Colors.slate900 },
  shipDesc: { fontSize: 11, color: Colors.slate500 },
  shipPrice: { fontSize: 13, fontWeight: '700', color: Colors.slate900 },
  summaryItem: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  summaryItemName: { flex: 1, fontSize: 12, color: Colors.slate700 },
  summaryItemPrice: { fontSize: 12, fontWeight: '600', color: Colors.slate900 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between' },
  summaryLabel: { fontSize: 12, color: Colors.slate600 },
  summaryValue: { fontSize: 12, color: Colors.slate900, fontWeight: '600' },
  paymentNote: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 10, borderRadius: 10, backgroundColor: '#fffbeb', borderWidth: 1, borderColor: '#fde68a' },
  paymentNoteText: { flex: 1, fontSize: 11, color: '#b45309' },
  ackRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 12, borderRadius: 10, backgroundColor: '#fffbeb', borderWidth: 1, borderColor: '#fde68a' },
  ackBox: { width: 18, height: 18, borderRadius: 4, borderWidth: 1.5, borderColor: Colors.slate400, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  ackBoxActive: { backgroundColor: Colors.cyan500, borderColor: Colors.cyan500 },
  ackText: { flex: 1, fontSize: 11, color: '#92400e', lineHeight: 15 },
  errorBanner: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 10, borderRadius: 10, backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fecaca' },
  errorText: { flex: 1, fontSize: 12, color: Colors.accent },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, backgroundColor: Colors.white, borderTopWidth: 1, borderTopColor: Colors.borderLight },
  footerLabel: { fontSize: 10, color: Colors.slate500, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  footerTotal: { fontSize: 18, fontWeight: '700', color: Colors.slate900 },
  placeBtn: { flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 14, borderRadius: 999, backgroundColor: Colors.cyan500 },
  placeText: { color: Colors.white, fontWeight: '700', fontSize: 14 },
});
