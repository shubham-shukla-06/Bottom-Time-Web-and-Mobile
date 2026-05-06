/**
 * ListingCard — Discover/Trip cards.
 * Prices use the global `useCurrency` hook so the card shows the user's
 * selected currency (live FX-converted from listing's source currency).
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';
import useCurrency from '../hooks/useCurrency';

interface Listing {
  id: string;
  title?: string;
  name?: string;
  type?: string;
  listing_type?: string;
  country?: string;
  location?: string;
  price?: number;
  currency?: string;
  rating?: number;
  review_count?: number;
  images?: string[];
  image_url?: string;
  photos?: { url: string }[];
  difficulty?: string;
  operator_name?: string;
}

interface Props {
  listing: Listing;
  onPress: () => void;
}

export default function ListingCard({ listing, onPress }: Props) {
  const { format } = useCurrency();
  const imageUri =
    listing.photos?.[0]?.url ||
    listing.images?.[0] ||
    listing.image_url ||
    'https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=400&q=60';
  const title = listing.title || listing.name || 'Untitled';
  const sourceCcy = listing.currency || 'USD';

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      activeOpacity={0.85}
      testID={`listing-card-${listing.id}`}
    >
      <Image source={{ uri: imageUri }} style={styles.image} />
      <View style={styles.content}>
        <Text style={styles.title} numberOfLines={2}>{title}</Text>
        <View style={styles.meta}>
          {(listing.location || listing.country) && (
            <View style={styles.locRow}>
              <Ionicons name="location-outline" size={11} color={Colors.slate500} />
              <Text style={styles.location} numberOfLines={1}>
                {[listing.location, listing.country].filter(Boolean).join(', ')}
              </Text>
            </View>
          )}
          {(listing.listing_type || listing.type) && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{listing.listing_type || listing.type}</Text>
            </View>
          )}
        </View>
        <View style={styles.footer}>
          <Text style={styles.price}>
            {listing.price != null ? format(listing.price, sourceCcy) : '—'}
          </Text>
          {listing.rating != null && (
            <View style={styles.ratingRow}>
              <Ionicons name="star" size={11} color="#f59e0b" />
              <Text style={styles.rating}>{Number(listing.rating).toFixed(1)}</Text>
              {listing.review_count != null && (
                <Text style={styles.reviewCount}>({listing.review_count})</Text>
              )}
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: Colors.white, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: Colors.borderLight },
  image: { width: '100%', height: 180, backgroundColor: Colors.slate100 },
  content: { padding: 14 },
  title: { fontSize: 15, fontWeight: '700', color: Colors.slate900, marginBottom: 6 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' },
  locRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  location: { fontSize: 12, color: Colors.slate500, maxWidth: 200 },
  badge: { backgroundColor: Colors.cyan50, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 12 },
  badgeText: { fontSize: 10, color: Colors.cyan500, fontWeight: '600', textTransform: 'capitalize' },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8, borderTopWidth: 1, borderTopColor: Colors.borderLight },
  price: { fontSize: 16, fontWeight: '700', color: Colors.slate900 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  rating: { fontSize: 13, color: Colors.slate800, fontWeight: '700' },
  reviewCount: { fontSize: 11, color: Colors.slate400 },
});
