/**
 * ShopGridSkeleton — loading state for /(tabs)/shop.
 * 2-column product grid (6 tiles).
 */
import React from 'react';
import { StyleSheet, View, Dimensions } from 'react-native';
import { Skeleton } from '../Skeleton';
import { Colors } from '../../constants/colors';

const W = (Dimensions.get('window').width - 16 * 2 - 12) / 2;

export function ShopGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <View style={styles.host} testID="shop-grid-skeleton">
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={[styles.tile, { width: W }]}>
          <Skeleton width={W} height={W} borderRadius={14} />
          <View style={{ height: 10 }} />
          <Skeleton width="85%" height={14} />
          <View style={{ height: 6 }} />
          <Skeleton width="50%" height={12} />
          <View style={{ height: 10 }} />
          <Skeleton width="40%" height={16} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  host: { flexDirection: 'row', flexWrap: 'wrap', padding: 16, gap: 12 },
  tile: { backgroundColor: 'transparent' },
});

export default ShopGridSkeleton;
