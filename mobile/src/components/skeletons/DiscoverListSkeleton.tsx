/**
 * DiscoverListSkeleton — loading state for the Discover screen.
 *
 * Mirrors the actual ListingCard `default` variant geometry (240px image
 * + body content) so the swap from skeleton to real cards is seamless.
 * Renders 3 cards by default — about one screenful on most phones.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Skeleton } from '../Skeleton';
import { Colors } from '../../constants/colors';

interface Props {
  count?: number;
}

export function DiscoverListSkeleton({ count = 3 }: Props) {
  return (
    <View style={styles.host} testID="discover-list-skeleton">
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={styles.card}>
          {/* Hero image */}
          <Skeleton width="100%" height={240} borderRadius={20} />
          {/* Body content — matches ListingCard's `content` block. */}
          <View style={styles.body}>
            {/* Title (2 lines) */}
            <Skeleton width="85%" height={16} borderRadius={4} />
            <View style={{ height: 6 }} />
            <Skeleton width="60%" height={16} borderRadius={4} />
            <View style={{ height: 12 }} />
            {/* Location row */}
            <Skeleton width="50%" height={12} borderRadius={4} />
            <View style={{ height: 14 }} />
            {/* Price row */}
            <View style={styles.priceRow}>
              <Skeleton width={90} height={20} borderRadius={4} />
              <Skeleton width={60} height={14} borderRadius={4} />
            </View>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 24,
  },
  card: {
    backgroundColor: Colors.white,
    borderRadius: 20,
    overflow: 'hidden',
  },
  body: {
    paddingHorizontal: 4,
    paddingTop: 12,
    paddingBottom: 4,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});

export default DiscoverListSkeleton;
