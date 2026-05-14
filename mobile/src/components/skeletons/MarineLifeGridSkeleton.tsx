/**
 * MarineLifeGridSkeleton — loading state for /marine-life.
 * 2-column grid of species cards: large image + name + chip line.
 */
import React from 'react';
import { StyleSheet, View, Dimensions } from 'react-native';
import { Skeleton } from '../Skeleton';
import { Colors } from '../../constants/colors';

const W = (Dimensions.get('window').width - 16 * 2 - 12) / 2;

export function MarineLifeGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <View style={styles.host} testID="marine-life-grid-skeleton">
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={[styles.card, { width: W }]}>
          <Skeleton width={W} height={W} borderRadius={14} />
          <View style={{ height: 10 }} />
          <Skeleton width="80%" height={14} />
          <View style={{ height: 6 }} />
          <Skeleton width="55%" height={11} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  host: { flexDirection: 'row', flexWrap: 'wrap', padding: 16, gap: 12 },
  card: {},
});

export default MarineLifeGridSkeleton;
