/**
 * OrdersListSkeleton — orders list loading state.
 * Each row: status pill + thumbnail + title + amount.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Skeleton } from '../Skeleton';
import { Colors } from '../../constants/colors';

export function OrdersListSkeleton({ count = 4 }: { count?: number }) {
  return (
    <View style={styles.host} testID="orders-list-skeleton">
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={styles.card}>
          <View style={styles.headerRow}>
            <Skeleton width={90} height={20} borderRadius={999} />
            <Skeleton width={70} height={12} />
          </View>
          <View style={{ height: 12 }} />
          <View style={styles.itemsRow}>
            <Skeleton width={56} height={56} borderRadius={10} />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Skeleton width="80%" height={14} />
              <View style={{ height: 6 }} />
              <Skeleton width="50%" height={12} />
            </View>
            <Skeleton width={60} height={18} />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  host: { padding: 16, gap: 12 },
  card: { backgroundColor: Colors.white, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: Colors.borderLight },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  itemsRow: { flexDirection: 'row', alignItems: 'center' },
});

export default OrdersListSkeleton;
