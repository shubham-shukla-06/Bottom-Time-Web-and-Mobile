import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, Image
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import api from '../../src/api/client';
import { Colors } from '../../src/constants/colors';

export default function ProductDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [product, setProduct] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchProduct();
  }, [id]);

  const fetchProduct = async () => {
    try {
      const res = await api.get(`/products/${id}`);
      setProduct(res.data);
    } catch (e) {
      console.log('Failed to fetch product:', e);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.cyan400} />
        </View>
      </SafeAreaView>
    );
  }

  if (!product) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Product not found</Text>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.backLink}>Go back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const imageUri = product.image_url || product.images?.[0] || 'https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=400&q=60';

  return (
    <SafeAreaView style={styles.container} testID="product-detail-screen">
      <ScrollView showsVerticalScrollIndicator={false}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} testID="product-back-btn">
          <Ionicons name="arrow-back" size={22} color={Colors.slate900} />
        </TouchableOpacity>

        <Image source={{ uri: imageUri }} style={styles.heroImage} />

        <View style={styles.content}>
          <Text style={styles.title}>{product.name}</Text>

          {product.category && (
            <View style={styles.categoryBadge}>
              <Text style={styles.categoryText}>{product.category}</Text>
            </View>
          )}

          {product.rating != null && (
            <View style={styles.ratingRow}>
              <Ionicons name="star" size={16} color="#f59e0b" />
              <Text style={styles.ratingText}>{product.rating.toFixed(1)}</Text>
              {product.review_count != null && (
                <Text style={styles.reviewCount}>({product.review_count} reviews)</Text>
              )}
            </View>
          )}

          <View style={styles.priceRow}>
            <Text style={styles.price}>${product.price?.toFixed(2)}</Text>
            {product.original_price && product.original_price > product.price && (
              <Text style={styles.originalPrice}>${product.original_price.toFixed(2)}</Text>
            )}
          </View>

          {product.description && (
            <View style={styles.descSection}>
              <Text style={styles.sectionTitle}>Description</Text>
              <Text style={styles.description}>{product.description}</Text>
            </View>
          )}

          <TouchableOpacity style={styles.addToCartBtn} testID="add-to-cart-btn">
            <Ionicons name="cart-outline" size={20} color={Colors.white} />
            <Text style={styles.addToCartText}>Add to Cart</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.white },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorText: { fontSize: 16, color: Colors.slate500, marginBottom: 8 },
  backLink: { fontSize: 14, color: Colors.cyan400, fontWeight: '600' },
  backBtn: { position: 'absolute', top: 12, left: 16, zIndex: 10, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.9)', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3 },
  heroImage: { width: '100%', height: 300, backgroundColor: Colors.slate100 },
  content: { padding: 20 },
  title: { fontSize: 22, fontWeight: '700', color: Colors.slate900, marginBottom: 10 },
  categoryBadge: { alignSelf: 'flex-start', backgroundColor: Colors.slate100, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 10, marginBottom: 10 },
  categoryText: { fontSize: 12, fontWeight: '600', color: Colors.slate600, textTransform: 'capitalize' },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 12 },
  ratingText: { fontSize: 15, fontWeight: '700', color: Colors.slate900 },
  reviewCount: { fontSize: 13, color: Colors.slate500 },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 20, paddingVertical: 12, borderTopWidth: 1, borderBottomWidth: 1, borderColor: Colors.borderLight },
  price: { fontSize: 24, fontWeight: '700', color: Colors.slate900 },
  originalPrice: { fontSize: 16, color: Colors.slate400, textDecorationLine: 'line-through' },
  descSection: { marginBottom: 20 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: Colors.slate900, marginBottom: 8 },
  description: { fontSize: 14, color: Colors.slate600, lineHeight: 22 },
  addToCartBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.cyan400, borderRadius: 14, paddingVertical: 16, marginTop: 8 },
  addToCartText: { color: Colors.white, fontSize: 16, fontWeight: '700' },
});
