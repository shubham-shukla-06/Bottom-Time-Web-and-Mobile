/**
 * CheckoutSkeleton — loading state for the initial cart-summary fetch on
 * `/checkout`. Mirrors the live screen: address block + items list + totals.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Skeleton } from '../Skeleton';
import { Colors } from '../../constants/colors';

export function CheckoutSkeleton() {
  return (
    <View style={styles.host} testID="checkout-skeleton">
      {/* Delivery-address card */}
      <Skeleton width="40%" height={13} />
      <View style={{ height: 10 }} />
      <View style={styles.card}>
        <Skeleton width="55%" height={14} />
        <View style={{ height: 8 }} />
        <Skeleton width="92%" height={11} />
        <View style={{ height: 6 }} />
        <Skeleton width="78%" height={11} />
      </View>

      {/* Items list */}
      <View style={{ height: 22 }} />
      <Skeleton width="32%" height={13} />
      <View style={{ height: 10 }} />
      {[0, 1].map((i) => (
        <View key={i} style={[styles.card, { flexDirection: 'row' }]}>
          <Skeleton width={64} height={64} borderRadius={10} />
          <View style={{ flex: 1, marginLeft: 12, gap: 6 }}>
            <Skeleton width="76%" height={13} />
            <Skeleton width="50%" height={11} />
            <Skeleton width="36%" height={13} />
          </View>
        </View>
      ))}

      {/* Totals card */}
      <View style={{ height: 22 }} />
      <View style={styles.card}>
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={styles.totalsRow}>
            <Skeleton width="40%" height={12} />
            <Skeleton width="22%" height={12} />
          </View>
        ))}
      </View>

      {/* Place-order CTA placeholder */}
      <View style={{ height: 18 }} />
      <Skeleton width="100%" height={52} borderRadius={999} />
    </View>
  );
}

const styles = StyleSheet.create({
  host: { padding: 16 },
  card: {
    backgroundColor: Colors.white, borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: Colors.borderLight, marginBottom: 10,
  },
  totalsRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
});

export default CheckoutSkeleton;
