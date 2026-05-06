import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native';
import { Colors } from '../constants/colors';

interface Listing {
  id: string;
  title: string;
  type?: string;
  country?: string;
  price?: number;
  currency?: string;
  rating?: number;
  review_count?: number;
  images?: string[];
  difficulty?: string;
  operator_name?: string;
}

interface Props {
  listing: Listing;
  onPress: () => void;
}

export default function ListingCard({ listing, onPress }: Props) {
  const imageUri = listing.images?.[0] || 'https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=400&q=60';

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      activeOpacity={0.8}
      testID={`listing-card-${listing.id}`}
    >
      <Image source={{ uri: imageUri }} style={styles.image} />
      <View style={styles.content}>
        <Text style={styles.title} numberOfLines={2}>{listing.title}</Text>
        <View style={styles.meta}>
          {listing.country && (
            <Text style={styles.location}>{listing.country}</Text>
          )}
          {listing.type && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{listing.type}</Text>
            </View>
          )}
        </View>
        <View style={styles.footer}>
          <Text style={styles.price}>
            {listing.currency === 'USD' ? '$' : listing.currency}{listing.price ?? 'N/A'}
          </Text>
          {listing.rating != null && (
            <Text style={styles.rating}>★ {listing.rating.toFixed(1)}</Text>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.borderLight,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  image: {
    width: '100%',
    height: 180,
    backgroundColor: Colors.slate100,
  },
  content: {
    padding: 14,
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.slate900,
    marginBottom: 6,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  location: {
    fontSize: 12,
    color: Colors.slate500,
  },
  badge: {
    backgroundColor: Colors.cyan50,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
  },
  badgeText: {
    fontSize: 11,
    color: Colors.cyan500,
    fontWeight: '600',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
  },
  price: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.slate900,
  },
  rating: {
    fontSize: 13,
    color: Colors.cyan500,
    fontWeight: '600',
  },
});
