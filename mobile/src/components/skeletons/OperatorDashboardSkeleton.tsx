/**
 * OperatorDashboardSkeleton — loading state for /operator (operator home).
 * Top metrics row (3 cards) + recent-bookings list + upcoming-listings tiles.
 */
import React from 'react';
import { StyleSheet, View, Dimensions } from 'react-native';
import { Skeleton } from '../Skeleton';
import { Colors } from '../../constants/colors';

const TILE_W = (Dimensions.get('window').width - 16 * 2 - 12) / 2;

export function OperatorDashboardSkeleton() {
  return (
    <View style={styles.host} testID="operator-dashboard-skeleton">
      {/* Greeting / period selector */}
      <Skeleton width="60%" height={22} />
      <View style={{ height: 14 }} />
      {/* Metric cards */}
      <View style={styles.metricsRow}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={styles.metricCard}>
            <Skeleton width={28} height={11} />
            <View style={{ height: 10 }} />
            <Skeleton width="70%" height={20} />
            <View style={{ height: 8 }} />
            <Skeleton width="40%" height={11} />
          </View>
        ))}
      </View>
      <View style={{ height: 20 }} />
      <Skeleton width="40%" height={16} />
      <View style={{ height: 12 }} />
      {/* Recent bookings list */}
      {[0, 1, 2].map((i) => (
        <View key={i} style={styles.bookingRow}>
          <Skeleton width={44} height={44} borderRadius={22} />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Skeleton width="68%" height={13} />
            <View style={{ height: 6 }} />
            <Skeleton width="40%" height={11} />
          </View>
          <Skeleton width={60} height={20} borderRadius={999} />
        </View>
      ))}
      <View style={{ height: 20 }} />
      <Skeleton width="50%" height={16} />
      <View style={{ height: 12 }} />
      <View style={styles.tilesRow}>
        {[0, 1].map((i) => (
          <View key={i} style={{ width: TILE_W }}>
            <Skeleton width={TILE_W} height={120} borderRadius={14} />
            <View style={{ height: 10 }} />
            <Skeleton width="80%" height={13} />
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: { padding: 16 },
  metricsRow: { flexDirection: 'row', gap: 10 },
  metricCard: {
    flex: 1, backgroundColor: Colors.white, borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: Colors.borderLight,
  },
  bookingRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.borderLight,
  },
  tilesRow: { flexDirection: 'row', gap: 12 },
});

export default OperatorDashboardSkeleton;
