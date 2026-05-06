import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, Image, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import api from '../../src/api/client';
import { Colors } from '../../src/constants/colors';
import BookingSheet from '../../src/components/BookingSheet';
import useAuthStore from '../../src/stores/authStore';
import { confirmDialog } from '../../src/utils/confirm';

export default function ListingDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const [listing, setListing] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [tripPickerOpen, setTripPickerOpen] = useState(false);
  const [trips, setTrips] = useState<any[]>([]);
  const [adding, setAdding] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

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

  const handleBookPress = async () => {
    if (!user) {
      const ok = await confirmDialog({
        title: 'Sign in required',
        message: 'Please sign in to book this experience.',
        confirmText: 'Sign in',
        cancelText: 'Cancel',
      });
      if (ok) router.push('/auth');
      return;
    }
    setSheetOpen(true);
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

  const photoUrl = listing.photos?.[0]?.url || listing.images?.[0] || listing.image_url;
  const imageUri = photoUrl || 'https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=800&q=60';
  const currency = listing.currency || 'USD';
  const price = listing.price ?? 0;

  return (
    <SafeAreaView style={styles.container} edges={['top']} testID="listing-detail-screen">
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} testID="listing-back-btn">
          <Ionicons name="arrow-back" size={22} color={Colors.slate900} />
        </TouchableOpacity>

        <Image source={{ uri: imageUri }} style={styles.heroImage} />

        <View style={styles.content}>
          <Text style={styles.title}>{listing.title || listing.name}</Text>

          <View style={styles.metaRow}>
            {(listing.location || listing.country) && (
              <View style={styles.metaItem}>
                <Ionicons name="location-outline" size={14} color={Colors.slate500} />
                <Text style={styles.metaText}>
                  {[listing.location, listing.country].filter(Boolean).join(', ')}
                </Text>
              </View>
            )}
            {(listing.listing_type || listing.type) && (
              <View style={styles.typeBadge}>
                <Text style={styles.typeText}>{listing.listing_type || listing.type}</Text>
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
              <Text style={styles.ratingText}>{Number(listing.rating).toFixed(1)}</Text>
              {listing.review_count != null && (
                <Text style={styles.reviewCount}>({listing.review_count} reviews)</Text>
              )}
            </View>
          )}

          <View style={styles.priceRow}>
            <Text style={styles.priceLabel}>From</Text>
            <Text style={styles.price}>{currency} {Number(price).toFixed(0)}</Text>
            <Text style={styles.priceSub}>/ diver</Text>
          </View>

          {listing.description && (
            <View style={styles.descSection}>
              <Text style={styles.sectionTitle}>About</Text>
              <Text style={styles.description}>{listing.description}</Text>
            </View>
          )}

          {Array.isArray(listing.highlights) && listing.highlights.length > 0 && (
            <View style={styles.descSection}>
              <Text style={styles.sectionTitle}>What's included</Text>
              <View style={{ gap: 8 }}>
                {listing.highlights.map((h: string, i: number) => (
                  <View key={i} style={styles.bulletRow}>
                    <Ionicons name="checkmark-circle" size={18} color={Colors.cyan500} />
                    <Text style={styles.bulletText}>{h}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {listing.operator_name && (
            <View style={styles.operatorSection}>
              <Text style={styles.sectionTitle}>Operator</Text>
              <View style={styles.operatorRow}>
                <View style={styles.opAvatar}>
                  <Ionicons name="business" size={20} color={Colors.cyan500} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.operatorName}>{listing.operator_name}</Text>
                  {listing.operator_verified && (
                    <View style={styles.verifiedRow}>
                      <Ionicons name="shield-checkmark" size={12} color={Colors.cyan500} />
                      <Text style={styles.verifiedText}>Verified operator</Text>
                    </View>
                  )}
                </View>
              </View>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Sticky Book Now CTA */}
      <View style={styles.ctaBar}>
        <TouchableOpacity
          style={styles.tripIconBtn}
          onPress={async () => {
            if (!user) { router.push('/auth'); return; }
            try {
              const r = await api.get('/trips');
              setTrips(r.data?.trips || []);
            } catch {/* silent */}
            setTripPickerOpen(true);
          }}
          testID="add-to-trip-btn"
        >
          <Ionicons name="add-circle-outline" size={22} color={Colors.cyan500} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.ctaPriceLabel}>From</Text>
          <Text style={styles.ctaPrice}>{currency} {Number(price).toFixed(0)}</Text>
        </View>
        <TouchableOpacity
          style={styles.bookBtn}
          onPress={handleBookPress}
          testID="book-now-btn"
        >
          <Text style={styles.bookBtnText}>Book now</Text>
          <Ionicons name="arrow-forward" size={18} color={Colors.slate900} />
        </TouchableOpacity>
      </View>

      {toast ? (
        <View style={styles.toast} testID="trip-toast">
          <Ionicons name="checkmark-circle" size={16} color={Colors.white} />
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      ) : null}

      <Modal visible={tripPickerOpen} animationType="slide" transparent onRequestClose={() => setTripPickerOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.tripModalSheet} testID="trip-picker-modal">
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add to trip</Text>
              <TouchableOpacity onPress={() => setTripPickerOpen(false)} testID="close-trip-picker">
                <Ionicons name="close" size={22} color={Colors.slate700} />
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ gap: 8, paddingBottom: 8 }}>
              {trips.length === 0 ? (
                <Text style={styles.emptyTrips}>No trips yet. Create one first.</Text>
              ) : trips.map((t) => (
                <TouchableOpacity key={t.id}
                  onPress={async () => {
                    setAdding(t.id);
                    try {
                      await api.post(`/trips/${t.id}/listings`, { listing_id: id });
                      setTripPickerOpen(false);
                      setToast(`Added to ${t.name}`);
                      setTimeout(() => setToast(null), 2200);
                    } catch (e: any) {
                      setToast(e?.response?.data?.detail || 'Could not add');
                      setTimeout(() => setToast(null), 2500);
                    } finally { setAdding(null); }
                  }}
                  disabled={adding === t.id}
                  style={[styles.tripPickRow, adding === t.id && { opacity: 0.5 }]}
                  testID={`pick-trip-${t.id}`}
                >
                  <Ionicons name="airplane" size={16} color={Colors.cyan500} />
                  <Text style={styles.tripPickName}>{t.name}</Text>
                  <Text style={styles.tripPickDest} numberOfLines={1}>{t.destination || ''}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity onPress={() => { setTripPickerOpen(false); router.push('/trips'); }}
                style={styles.newTripCta} testID="new-trip-from-listing">
                <Ionicons name="add" size={16} color={Colors.cyan500} />
                <Text style={styles.newTripText}>Create new trip</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <BookingSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        listing={listing}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.white },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorText: { fontSize: 16, color: Colors.slate500, marginBottom: 8 },
  backLink: { fontSize: 14, color: Colors.cyan400, fontWeight: '600' },
  backBtn: { position: 'absolute', top: 12, left: 16, zIndex: 10, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.92)', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3 },
  heroImage: { width: '100%', height: 280, backgroundColor: Colors.slate100 },
  content: { padding: 20 },
  title: { fontSize: 24, fontWeight: '700', color: Colors.slate900, marginBottom: 10 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12, alignItems: 'center' },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 13, color: Colors.slate500 },
  typeBadge: { backgroundColor: Colors.cyan50, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10 },
  typeText: { fontSize: 12, fontWeight: '600', color: Colors.cyan500, textTransform: 'capitalize' },
  diffBadge: { backgroundColor: Colors.slate100, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10 },
  diffText: { fontSize: 12, fontWeight: '600', color: Colors.slate600, textTransform: 'capitalize' },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 12 },
  ratingText: { fontSize: 15, fontWeight: '700', color: Colors.slate900 },
  reviewCount: { fontSize: 13, color: Colors.slate500 },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginBottom: 20, paddingTop: 12, borderTopWidth: 1, borderTopColor: Colors.borderLight },
  priceLabel: { fontSize: 13, color: Colors.slate500 },
  price: { fontSize: 26, fontWeight: '700', color: Colors.slate900 },
  priceSub: { fontSize: 13, color: Colors.slate500 },
  descSection: { marginBottom: 24 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: Colors.slate900, marginBottom: 8 },
  description: { fontSize: 14, color: Colors.slate600, lineHeight: 22 },
  bulletRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  bulletText: { flex: 1, fontSize: 14, color: Colors.slate700, lineHeight: 20 },
  operatorSection: { paddingTop: 16, borderTopWidth: 1, borderTopColor: Colors.borderLight },
  operatorRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  opAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.cyan50, alignItems: 'center', justifyContent: 'center' },
  operatorName: { fontSize: 15, fontWeight: '700', color: Colors.slate900 },
  verifiedRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  verifiedText: { fontSize: 11, color: Colors.cyan500, fontWeight: '600' },

  ctaBar: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 24, backgroundColor: Colors.white, borderTopWidth: 1, borderTopColor: Colors.borderLight, flexDirection: 'row', alignItems: 'center', gap: 12 },
  ctaPriceLabel: { fontSize: 11, color: Colors.slate500, textTransform: 'uppercase', fontWeight: '600' },
  ctaPrice: { fontSize: 18, fontWeight: '700', color: Colors.slate900 },
  bookBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: Colors.cyan400, paddingHorizontal: 24, paddingVertical: 14, borderRadius: 999, minWidth: 160 },
  bookBtnText: { fontSize: 15, fontWeight: '700', color: Colors.slate900 },
  tripIconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.cyan50, borderWidth: 1, borderColor: Colors.cyan100 },
  toast: { position: 'absolute', bottom: 100, left: 16, right: 16, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999, backgroundColor: Colors.slate900 },
  toastText: { color: Colors.white, fontSize: 13, fontWeight: '600' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.5)', justifyContent: 'flex-end' },
  tripModalSheet: { backgroundColor: Colors.white, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, gap: 10, maxHeight: '70%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  modalTitle: { fontSize: 16, fontWeight: '700', color: Colors.slate900 },
  emptyTrips: { fontSize: 13, color: Colors.slate500, textAlign: 'center', paddingVertical: 16 },
  tripPickRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, backgroundColor: Colors.slate50 },
  tripPickName: { fontSize: 13, fontWeight: '700', color: Colors.slate900, flex: 1 },
  tripPickDest: { fontSize: 11, color: Colors.slate500 },
  newTripCta: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: Colors.cyan500, borderStyle: 'dashed', justifyContent: 'center', marginTop: 4 },
  newTripText: { fontSize: 13, fontWeight: '700', color: Colors.cyan500 },
});
