import React from 'react';
import { View, TouchableOpacity, StyleSheet, Image } from 'react-native';
import { Text } from './Text';
import { Colors } from '../constants/colors';

interface Product {
  id: string;
  name: string;
  price: number;
  currency?: string;
  image_url?: string;
  images?: string[];
  category?: string;
  rating?: number;
  review_count?: number;
}

interface Props {
  product: Product;
  onPress: () => void;
}

export default function ProductCard({ product, onPress }: Props) {
  const imageUri = product.image_url || product.images?.[0] || 'https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=400&q=60';

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      activeOpacity={0.8}
      testID={`product-card-${product.id}`}
    >
      <Image source={{ uri: imageUri }} style={styles.image} />
      <View style={styles.content}>
        <Text style={styles.name} numberOfLines={2}>{product.name}</Text>
        {product.category && (
          <Text style={styles.category}>{product.category}</Text>
        )}
        <View style={styles.footer}>
          <Text style={styles.price}>${product.price?.toFixed(2)}</Text>
          {product.rating != null && (
            <Text style={styles.rating}>★ {product.rating.toFixed(1)}</Text>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.white,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.borderLight,
    flex: 1,
    margin: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  image: {
    width: '100%',
    height: 140,
    backgroundColor: Colors.slate100,
  },
  content: {
    padding: 12,
  },
  name: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.slate900,
    marginBottom: 4,
  },
  category: {
    fontSize: 11,
    color: Colors.slate400,
    marginBottom: 6,
    textTransform: 'capitalize',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
  },
  price: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.slate900,
  },
  rating: {
    fontSize: 12,
    color: Colors.cyan500,
    fontWeight: '600',
  },
});
