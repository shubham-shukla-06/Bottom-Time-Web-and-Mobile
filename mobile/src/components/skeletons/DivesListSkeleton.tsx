/**
 * DivesListSkeleton — loading state for /(tabs)/dives.
 *
 * Matches the Dives FlatList: each row is a card with date pill on top,
 * site title, 2-stat strip, optional description line.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Skeleton } from '../Skeleton';
import { Colors } from '../../constants/colors';

export function DivesListSkeleton({ count = 4 }: { count?: number }) {
  return (
    <View style={styles.host} testID="dives-list-skeleton">
      {/* Header strip: stats summary card */}
      <View style={styles.statsCard}>
        <View style={styles.statsRow}>
          <View style={styles.statCell}>
            <Skeleton width={32} height={22} />
            <View style={{ height: 6 }} />
            <Skeleton width={50} height={12} />
          </View>
          <View style={styles.statCell}>
            <Skeleton width={42} height={22} />
            <View style={{ height: 6 }} />
            <Skeleton width={60} height={12} />
          </View>
          <View style={styles.statCell}>
            <Skeleton width={36} height={22} />
            <View style={{ height: 6 }} />
            <Skeleton width={45} height={12} />
          </View>
        </View>
      </View>
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={styles.card}>
          <Skeleton width={72} height={20} borderRadius={999} />
          <View style={{ height: 12 }} />
          <Skeleton width="75%" height={18} />
          <View style={{ height: 8 }} />
          <Skeleton width="50%" height={12} />
          <View style={{ height: 14 }} />
          <View style={styles.statsRow}>
            <Skeleton width={80} height={14} />
            <Skeleton width={80} height={14} />
            <Skeleton width={50} height={14} />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  host: { paddingHorizontal: 16, paddingTop: 8, gap: 12 },
  statsCard: {
    backgroundColor: Colors.white, borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: Colors.borderLight, marginBottom: 4,
  },
  card: {
    backgroundColor: Colors.white, borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: Colors.borderLight,
  },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  statCell: { alignItems: 'flex-start', flex: 1 },
});

export default DivesListSkeleton;
