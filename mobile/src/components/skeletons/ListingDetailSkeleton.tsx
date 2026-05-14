/**
 * ListingDetailSkeleton — loading state for the listing detail screen.
 *
 * Mirrors the hero + title + gallery strip + description + action bar
 * geometry of `/app/mobile/app/listing/[id].tsx` so the swap from
 * skeleton to real content is seamless.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Skeleton } from '../Skeleton';
import { Colors } from '../../constants/colors';

export function ListingDetailSkeleton() {
  return (
    <View style={styles.host} testID="listing-detail-skeleton">
      {/* Hero image */}
      <Skeleton width="100%" height={320} borderRadius={0} />

      {/* Body content */}
      <View style={styles.body}>
        {/* Title (2 lines) */}
        <Skeleton width="80%" height={28} borderRadius={4} />
        <View style={{ height: 8 }} />
        <Skeleton width="55%" height={28} borderRadius={4} />
        <View style={{ height: 16 }} />

        {/* Location + rating row */}
        <View style={styles.row}>
          <Skeleton width={120} height={14} borderRadius={4} />
          <Skeleton width={60} height={14} borderRadius={4} />
        </View>
        <View style={{ height: 28 }} />

        {/* Gallery strip — horizontal scrolling thumbnails */}
        <View style={styles.gallery}>
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} width={88} height={88} borderRadius={12} />
          ))}
        </View>
        <View style={{ height: 28 }} />

        {/* Section heading */}
        <Skeleton width="40%" height={20} borderRadius={4} />
        <View style={{ height: 14 }} />

        {/* Description — 3 paragraphs of 3 lines each */}
        {[0, 1, 2].map((p) => (
          <View key={p} style={{ marginBottom: 16 }}>
            <Skeleton width="100%" height={14} borderRadius={4} />
            <View style={{ height: 8 }} />
            <Skeleton width="100%" height={14} borderRadius={4} />
            <View style={{ height: 8 }} />
            <Skeleton width="75%" height={14} borderRadius={4} />
          </View>
        ))}

        <View style={{ height: 12 }} />

        {/* Section heading */}
        <Skeleton width="35%" height={20} borderRadius={4} />
        <View style={{ height: 14 }} />
        {/* Amenity rows */}
        {[0, 1, 2].map((p) => (
          <View key={p} style={[styles.row, { marginBottom: 10 }]}>
            <Skeleton width={24} height={24} borderRadius={12} />
            <Skeleton width="60%" height={16} borderRadius={4} />
          </View>
        ))}
      </View>

      {/* Floating bottom action bar (price + button) */}
      <View style={styles.actionBar}>
        <View>
          <Skeleton width={80} height={20} borderRadius={4} />
          <View style={{ height: 6 }} />
          <Skeleton width={60} height={12} borderRadius={4} />
        </View>
        <Skeleton width={140} height={48} borderRadius={24} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    flex: 1,
    backgroundColor: Colors.white,
  },
  body: {
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  gallery: {
    flexDirection: 'row',
    gap: 8,
  },
  actionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.slate100,
    marginTop: 16,
  },
});

export default ListingDetailSkeleton;
