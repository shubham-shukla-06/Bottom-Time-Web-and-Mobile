/**
 * DiveLogDetailSkeleton — loading state for `/dive-log/[id]`.
 *
 * Mirrors the detail screen: site title + meta line, stats grid (4 KPI
 * tiles), map placeholder, photos strip, profile/notes block.
 */
import React from 'react';
import { StyleSheet, View, Dimensions } from 'react-native';
import { Skeleton } from '../Skeleton';
import { Colors } from '../../constants/colors';

const W = Dimensions.get('window').width - 32;
const STAT_W = (W - 12) / 2;

export function DiveLogDetailSkeleton() {
  return (
    <View style={styles.host} testID="dive-log-detail-skeleton">
      {/* Header — site name + meta */}
      <Skeleton width="78%" height={22} />
      <View style={{ height: 8 }} />
      <Skeleton width="50%" height={13} />

      {/* Stats grid 2x2 */}
      <View style={{ height: 18 }} />
      <View style={styles.statsRow}>
        <View style={[styles.statCard, { width: STAT_W }]}>
          <Skeleton width={48} height={11} />
          <View style={{ height: 8 }} />
          <Skeleton width="70%" height={22} />
        </View>
        <View style={[styles.statCard, { width: STAT_W }]}>
          <Skeleton width={48} height={11} />
          <View style={{ height: 8 }} />
          <Skeleton width="70%" height={22} />
        </View>
      </View>
      <View style={styles.statsRow}>
        <View style={[styles.statCard, { width: STAT_W }]}>
          <Skeleton width={48} height={11} />
          <View style={{ height: 8 }} />
          <Skeleton width="70%" height={22} />
        </View>
        <View style={[styles.statCard, { width: STAT_W }]}>
          <Skeleton width={48} height={11} />
          <View style={{ height: 8 }} />
          <Skeleton width="70%" height={22} />
        </View>
      </View>

      {/* Map placeholder */}
      <View style={{ height: 20 }} />
      <Skeleton width="35%" height={14} />
      <View style={{ height: 10 }} />
      <Skeleton width={W} height={180} borderRadius={14} />

      {/* Photos strip */}
      <View style={{ height: 20 }} />
      <Skeleton width="30%" height={14} />
      <View style={{ height: 10 }} />
      <View style={styles.photoRow}>
        <Skeleton width={110} height={110} borderRadius={12} />
        <Skeleton width={110} height={110} borderRadius={12} />
        <Skeleton width={110} height={110} borderRadius={12} />
      </View>

      {/* Notes block */}
      <View style={{ height: 22 }} />
      <Skeleton width="25%" height={14} />
      <View style={{ height: 10 }} />
      <Skeleton width="100%" height={12} />
      <View style={{ height: 6 }} />
      <Skeleton width="92%" height={12} />
      <View style={{ height: 6 }} />
      <Skeleton width="68%" height={12} />
    </View>
  );
}

const styles = StyleSheet.create({
  host: { padding: 16 },
  statsRow: { flexDirection: 'row', gap: 12, marginTop: 12 },
  statCard: {
    backgroundColor: Colors.white, borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: Colors.borderLight,
  },
  photoRow: { flexDirection: 'row', gap: 10 },
});

export default DiveLogDetailSkeleton;
