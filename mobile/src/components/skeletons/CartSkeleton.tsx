/**
 * CartSkeleton — cart screen loading state.
 * Cart-item rows + summary footer.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Skeleton } from '../Skeleton';
import { Colors } from '../../constants/colors';

export function CartSkeleton({ count = 3 }: { count?: number }) {
  return (
    <View style={styles.host} testID="cart-skeleton">
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={styles.row}>
          <Skeleton width={72} height={72} borderRadius={12} />
          <View style={styles.body}>
            <Skeleton width="80%" height={14} />
            <View style={{ height: 8 }} />
            <Skeleton width="50%" height={12} />
            <View style={{ height: 12 }} />
            <View style={styles.priceLine}>
              <Skeleton width={60} height={16} />
              <Skeleton width={70} height={28} borderRadius={14} />
            </View>
          </View>
        </View>
      ))}
      <View style={styles.summary}>
        <View style={styles.summaryRow}><Skeleton width={80} height={14} /><Skeleton width={60} height={14} /></View>
        <View style={{ height: 10 }} />
        <View style={styles.summaryRow}><Skeleton width={70} height={14} /><Skeleton width={50} height={14} /></View>
        <View style={{ height: 14 }} />
        <Skeleton width="100%" height={48} borderRadius={24} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: { padding: 16, gap: 12 },
  row: { flexDirection: 'row', gap: 12, backgroundColor: Colors.white, borderRadius: 14, padding: 12, borderWidth: 1, borderColor: Colors.borderLight },
  body: { flex: 1 },
  priceLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  summary: { backgroundColor: Colors.white, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: Colors.borderLight, marginTop: 8 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between' },
});

export default CartSkeleton;
