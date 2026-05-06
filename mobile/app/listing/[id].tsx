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

export default function ListingDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [listing, setListing] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchListing();
  }, [id]);

  const fetchListing = async () => {
    try {
      const res = await api.get(`/listings/${id}`);
      setListing(res.data);
    } catch (e) {
      console.log('Failed to fetch listing:', e);
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

  if (!listing) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Listing not found</Text>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.backLink}>Go back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const imageUri = listing.images?.[0] || 'https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=800&q=60';

  return (
    <SafeAreaView style={styles.container} testID="listing-detail-screen">
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Back Button */}
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} testID="listing-back-btn">
          <Ionicons name="arrow-back" size={22} color={Colors.slate900} />
        </TouchableOpacity>

        {/* Image */}
        <Image source={{ uri: imageUri }} style={styles.heroImage} />

        {/* Content */}
        <View style={styles.content}>
          <Text style={styles.title}>{listing.title}</Text>

          <View style={styles.metaRow}>
            {listing.country && (
              <View style={styles.metaItem}>
                <Ionicons name="location-outline" size={14} color={Colors.slate500} />
                <Text style={styles.metaText}>{listing.country}</Text>
              </View>
            )}
            {listing.type && (
              <View style={styles.typeBadge}>
                <Text style={styles.typeText}>{listing.type}</Text>
              </View>
            )}
            {listing.difficulty && (
              <View style={styles.diffBadge}>
                <Text style={styles.diffText}>{listing.difficulty}</Text>
              </View>
            )}
          </View>

          {listing.rating != null && (
            <View style={styles.ratingRow}>
              <Ionicons name="star" size={16} color="#f59e0b" />
              <Text style={styles.ratingText}>{listing.rating.toFixed(1)}</Text>
              {listing.review_count != null && (
                <Text style={styles.reviewCount}>({listing.review_count} reviews)</Text>
              )}
            </View>
          )}

          <View style={styles.priceRow}>
            <Text style={styles.priceLabel}>From</Text>
            <Text style={styles.price}>${listing.price || 'N/A'}</Text>
          </View>

          {listing.description && (
            <View style={styles.descSection}>
              <Text style={styles.sectionTitle}>About</Text>
              <Text style={styles.description}>{listing.description}</Text>
            </View>
          )}

          {listing.operator_name && (
            <View style={styles.operatorSection}>
              <Text style={styles.sectionTitle}>Operator</Text>
              <Text style={styles.operatorName}>{listing.operator_name}</Text>
            </View>
          )}
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
  heroImage: { width: '100%', height: 260, backgroundColor: Colors.slate100 },
  content: { padding: 20 },
  title: { fontSize: 22, fontWeight: '700', color: Colors.slate900, marginBottom: 10 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 13, color: Colors.slate500 },
  typeBadge: { backgroundColor: Colors.cyan50, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10 },
  typeText: { fontSize: 12, fontWeight: '600', color: Colors.cyan500 },
  diffBadge: { backgroundColor: Colors.slate100, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10 },
  diffText: { fontSize: 12, fontWeight: '600', color: Colors.slate600 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 12 },
  ratingText: { fontSize: 15, fontWeight: '700', color: Colors.slate900 },
  reviewCount: { fontSize: 13, color: Colors.slate500 },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginBottom: 20, paddingTop: 12, borderTopWidth: 1, borderTopColor: Colors.borderLight },
  priceLabel: { fontSize: 13, color: Colors.slate500 },
  price: { fontSize: 24, fontWeight: '700', color: Colors.slate900 },
  descSection: { marginBottom: 20 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: Colors.slate900, marginBottom: 8 },
  description: { fontSize: 14, color: Colors.slate600, lineHeight: 22 },
  operatorSection: { paddingTop: 16, borderTopWidth: 1, borderTopColor: Colors.borderLight },
  operatorName: { fontSize: 14, fontWeight: '600', color: Colors.slate700 },
});
