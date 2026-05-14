/**
 * ProductDetailSkeleton — loading state for /product/[id].
 * Hero image carousel + title + price + meta + variant chips + description.
 */
import React from 'react';
import { StyleSheet, View, Dimensions } from 'react-native';
import { Skeleton } from '../Skeleton';
import { Colors } from '../../constants/colors';

const W = Dimensions.get('window').width;

export function ProductDetailSkeleton() {
  return (
    <View style={styles.host} testID="product-detail-skeleton">
      <Skeleton width={W} height={W} borderRadius={0} />
      <View style={styles.body}>
        <Skeleton width="85%" height={22} />
        <View style={{ height: 10 }} />
        <Skeleton width="40%" height={18} />
        <View style={{ height: 18 }} />
        <Skeleton width="30%" height={13} />
        <View style={{ height: 10 }} />
        <View style={styles.chipsRow}>
          <Skeleton width={60} height={32} borderRadius={999} />
          <Skeleton width={60} height={32} borderRadius={999} />
          <Skeleton width={60} height={32} borderRadius={999} />
        </View>
        <View style={{ height: 22 }} />
        <Skeleton width="35%" height={14} />
        <View style={{ height: 12 }} />
        <Skeleton width="100%" height={12} />
        <View style={{ height: 6 }} />
        <Skeleton width="92%" height={12} />
        <View style={{ height: 6 }} />
        <Skeleton width="74%" height={12} />
        <View style={{ height: 24 }} />
        <Skeleton width="100%" height={52} borderRadius={26} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: { backgroundColor: Colors.white },
  body: { padding: 20 },
  chipsRow: { flexDirection: 'row', gap: 10 },
});

export default ProductDetailSkeleton;
