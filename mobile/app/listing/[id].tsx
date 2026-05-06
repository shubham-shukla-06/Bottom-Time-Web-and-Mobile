/**
 * Listing Detail — pixel-mirrors web `frontend/src/pages/ListingDetail.js`.
 *
 * Sections:
 *  1. Photo gallery (FlatList horizontal pagingEnabled with dot pager)
 *  2. Title + meta (location, type, difficulty)
 *  3. Rating + review count
 *  4. Price card (From X / diver, in user's currency)
 *  5. About (full description)
 *  6. What's included (highlights/inclusions)
 *  7. Itinerary (if available)
 *  8. Dive sites covered (if available)
 *  9. Prerequisites
 * 10. Equipment included / rentals
 * 11. Group size / Languages / Cancellation policy (info grid)
 * 12. Operator card (avatar, name, verified badge, rating, response)
 * 13. Reviews list (GET /api/reviews/{listing_id})
 * 14. Buddy finder ("Other divers booked this listing") — /api/buddy-finder/listing-buddies/{id}
 * 15. Related listings carousel
 *
 * Sticky CTA bar: trip + price + "Book now" — opens BookingSheet.
 * Share button calls share-tracking endpoint (best-effort).
 */
import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, Image, Modal, Dimensions, FlatList, Share, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import api from '../../src/api/client';
import { Colors } from '../../src/constants/colors';
import BookingSheet from '../../src/components/BookingSheet';
import ListingCard from '../../src/components/ListingCard';
import useAuthStore from '../../src/stores/authStore';
import { confirmDialog } from '../../src/utils/confirm';
import useCurrency from '../../src/hooks/useCurrency';

const { width: SCREEN_W } = Dimensions.get('window');
const HERO_H = 280;

export default function ListingDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const { format } = useCurrency();

  const [listing, setListing] = useState<any>(null);
  const [reviews, setReviews] = useState<any[]>([]);
  const [buddies, setBuddies] = useState<any[]>([]);
  const [related, setRelated] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [tripPickerOpen, setTripPickerOpen] = useState(false);
  const [trips, setTrips] = useState<any[]>([]);
  const [adding, setAdding] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [galleryIndex, setGalleryIndex] = useState(0);

  useEffect(() => { fetchAll(); }, [id]); // eslint-disable-line

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [lRes, rRes, bRes] = await Promise.all([
        api.get(`/listings/${id}`),
        api.get(`/reviews/${id}`).catch(() => ({ data: [] })),
        api.get(`/buddy-finder/listing-buddies/${id}`).catch(() => ({ data: { buddies: [] } })),
      ]);
      const data = lRes.data;
      setListing(data);
      setReviews(Array.isArray(rRes.data) ? rRes.data : (rRes.data?.reviews || []));
      setBuddies(bRes.data?.buddies || []);
      // Related: same type, exclude self, top 6
      if (data?.country) {
        try {
          const rel = await api.get(`/listings?country=${encodeURIComponent(data.country)}&limit=6`);
          setRelated((rel.data?.listings || []).filter((l: any) => l.id !== id));
        } catch {/* silent */}
      }
    } catch (e) {
      console.log('Failed to fetch listing:', e);
    } finally {
      setLoading(false);
    }
  }, [id]);

  const handleBookPress = async () => {
    if (!user) {
      const ok = await confirmDialog({
        title: 'Sign in required',
        message: 'Please sign in to book this experience.',
        confirmText: 'Sign in', cancelText: 'Cancel',
      });
      if (ok) router.push('/welcome');
      return;
    }
    setSheetOpen(true);
  };

  const handleShare = async () => {
    const title = listing?.title || listing?.name || 'Bottom Time';
    const url = `https://project-scanner-44.preview.emergentagent.com/listing/${id}`;
    try {
      await Share.share({ message: `${title} — ${url}`, url, title });
      api.post('/share/track', { entity_type: 'listing', entity_id: id, channel: 'native' }).catch(() => {/* silent */});
    } catch {/* silent */}
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

  // Build photos array (multi-image support)
  const photos: string[] = (() => {
    if (Array.isArray(listing.photos) && listing.photos.length) return listing.photos.map((p: any) => p.url || p).filter(Boolean);
    if (Array.isArray(listing.images) && listing.images.length) return listing.images.filter(Boolean);
    if (listing.image_url) return [listing.image_url];
    return ['https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=800&q=60'];
  })();

  const sourceCcy = listing.currency || 'USD';
  const price = listing.price ?? 0;
  const inclusions: string[] = listing.inclusions || listing.highlights || [];
  const itinerary: any[] = Array.isArray(listing.itinerary) ? listing.itinerary : [];
  const diveSites: string[] = listing.dive_sites || listing.sites || [];
  const equipment: string[] = listing.equipment_included || listing.equipment || [];
  const prerequisites: string[] = listing.prerequisites || listing.requirements || [];
  const languages: string[] = listing.languages || [];
  const cancellation: string = listing.cancellation_policy || listing.cancellation || '';
  const groupSize = listing.max_per_booking || listing.group_size || null;

  return (
    <SafeAreaView style={styles.container} edges={['top']} testID="listing-detail-screen">
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 140 }}>
        {/* Top floating buttons */}
        <View style={styles.topActions} pointerEvents="box-none">
          <TouchableOpacity style={styles.topBtn} onPress={() => router.back()} testID="listing-back-btn">
            <Ionicons name="arrow-back" size={20} color={Colors.slate900} />
          </TouchableOpacity>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity style={styles.topBtn} onPress={handleShare} testID="listing-share-btn">
              <Ionicons name="share-outline" size={20} color={Colors.slate900} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Photo gallery */}
        <View style={{ height: HERO_H }}>
          <FlatList
            data={photos}
            keyExtractor={(p, i) => `${i}-${p.slice(0, 30)}`}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(e) => setGalleryIndex(Math.round(e.nativeEvent.contentOffset.x / SCREEN_W))}
            renderItem={({ item }) => (
              <Image source={{ uri: item }} style={styles.heroImage} />
            )}
            testID="listing-gallery"
          />
          {photos.length > 1 ? (
            <View style={styles.dotRow}>
              {photos.map((_, i) => (
                <View key={i} style={[styles.dot, galleryIndex === i && styles.dotActive]} />
              ))}
            </View>
          ) : null}
          {photos.length > 1 ? (
            <View style={styles.galleryCounter} testID="gallery-counter">
              <Text style={styles.galleryCounterText}>{galleryIndex + 1} / {photos.length}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.content}>
          <Text style={styles.title}>{listing.title || listing.name}</Text>

          <View style={styles.metaRow}>
            {(listing.location || listing.country) ? (
              <View style={styles.metaItem}>
                <Ionicons name="location-outline" size={14} color={Colors.slate500} />
                <Text style={styles.metaText}>{[listing.location, listing.country].filter(Boolean).join(', ')}</Text>
              </View>
            ) : null}
            {(listing.listing_type || listing.type) ? (
              <View style={styles.typeBadge}>
                <Text style={styles.typeText}>{listing.listing_type || listing.type}</Text>
              </View>
            ) : null}
            {listing.difficulty ? (
              <View style={styles.diffBadge}>
                <Text style={styles.diffText}>{listing.difficulty}</Text>
              </View>
            ) : null}
          </View>

          {listing.rating != null ? (
            <View style={styles.ratingRow}>
              <Ionicons name="star" size={16} color="#f59e0b" />
              <Text style={styles.ratingText}>{Number(listing.rating).toFixed(1)}</Text>
              {listing.review_count != null ? (
                <Text style={styles.reviewCount}>({listing.review_count} reviews)</Text>
              ) : null}
            </View>
          ) : null}

          <View style={styles.priceRow}>
            <Text style={styles.priceLabel}>From</Text>
            <Text style={styles.price}>{format(price, sourceCcy)}</Text>
            <Text style={styles.priceSub}>/ diver</Text>
          </View>

          {listing.description ? (
            <Section title="About">
              <Text style={styles.description}>{listing.description}</Text>
            </Section>
          ) : null}

          {inclusions.length > 0 ? (
            <Section title="What's included">
              <View style={{ gap: 8 }}>
                {inclusions.map((h, i) => (
                  <View key={i} style={styles.bulletRow}>
                    <Ionicons name="checkmark-circle" size={18} color={Colors.cyan500} />
                    <Text style={styles.bulletText}>{h}</Text>
                  </View>
                ))}
              </View>
            </Section>
          ) : null}

          {itinerary.length > 0 ? (
            <Section title="Itinerary">
              <View style={{ gap: 10 }}>
                {itinerary.map((step, i) => (
                  <View key={i} style={styles.itineraryRow}>
                    <View style={styles.itineraryDot}><Text style={styles.itineraryDotText}>{i + 1}</Text></View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.itineraryTitle}>{step.title || step.name || `Step ${i + 1}`}</Text>
                      {step.description ? <Text style={styles.itineraryDesc}>{step.description}</Text> : null}
                    </View>
                  </View>
                ))}
              </View>
            </Section>
          ) : null}

          {diveSites.length > 0 ? (
            <Section title="Dive sites covered">
              <View style={styles.tagRow}>
                {diveSites.map((s: any, i) => (
                  <View key={i} style={styles.tag}>
                    <Ionicons name="water-outline" size={11} color={Colors.cyan500} />
                    <Text style={styles.tagText}>{typeof s === 'string' ? s : s?.name || ''}</Text>
                  </View>
                ))}
              </View>
            </Section>
          ) : null}

          {prerequisites.length > 0 ? (
            <Section title="Prerequisites">
              <View style={{ gap: 6 }}>
                {prerequisites.map((p, i) => (
                  <View key={i} style={styles.bulletRow}>
                    <Ionicons name="alert-circle-outline" size={16} color={Colors.slate500} />
                    <Text style={styles.bulletText}>{p}</Text>
                  </View>
                ))}
              </View>
            </Section>
          ) : null}

          {equipment.length > 0 ? (
            <Section title="Equipment">
              <View style={styles.tagRow}>
                {equipment.map((e: any, i) => (
                  <View key={i} style={[styles.tag, { backgroundColor: Colors.slate100 }]}>
                    <Ionicons name="cube-outline" size={11} color={Colors.slate600} />
                    <Text style={[styles.tagText, { color: Colors.slate700 }]}>{typeof e === 'string' ? e : e?.name || ''}</Text>
                  </View>
                ))}
              </View>
            </Section>
          ) : null}

          {/* Info grid: group, languages, cancellation */}
          {(groupSize || languages.length > 0 || cancellation) ? (
            <Section title="Good to know">
              <View style={styles.infoGrid}>
                {groupSize ? (
                  <InfoCell icon="people-outline" label="Group size" value={`Up to ${groupSize}`} />
                ) : null}
                {languages.length > 0 ? (
                  <InfoCell icon="language-outline" label="Languages" value={languages.join(', ')} />
                ) : null}
                {cancellation ? (
                  <InfoCell icon="shield-checkmark-outline" label="Cancellation" value={cancellation} />
                ) : null}
              </View>
            </Section>
          ) : null}

          {/* Operator card */}
          {listing.operator_name ? (
            <View style={styles.operatorCard}>
              <View style={styles.operatorRow}>
                <View style={styles.opAvatar}>
                  <Ionicons name="business" size={20} color={Colors.cyan500} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.operatorName}>{listing.operator_name}</Text>
                  {listing.operator_verified ? (
                    <View style={styles.verifiedRow}>
                      <Ionicons name="shield-checkmark" size={12} color={Colors.cyan500} />
                      <Text style={styles.verifiedText}>Verified operator</Text>
                    </View>
                  ) : null}
                  {listing.operator_response_time ? (
                    <Text style={styles.opResponse}>Responds in {listing.operator_response_time}</Text>
                  ) : null}
                </View>
                {listing.operator_rating ? (
                  <View style={styles.opRatingPill}>
                    <Ionicons name="star" size={11} color="#f59e0b" />
                    <Text style={styles.opRatingText}>{Number(listing.operator_rating).toFixed(1)}</Text>
                  </View>
                ) : null}
              </View>
            </View>
          ) : null}

          {/* Reviews list */}
          {reviews.length > 0 ? (
            <Section title={`Reviews (${reviews.length})`}>
              <View style={{ gap: 12 }}>
                {reviews.slice(0, 5).map((r: any) => (
                  <View key={r.id || r._id} style={styles.reviewCard} testID={`review-${r.id || r._id}`}>
                    <View style={styles.reviewHeader}>
                      <View style={styles.reviewerAvatar}>
                        <Text style={styles.reviewerInitial}>{(r.user_name || r.author_name || 'A')[0]}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.reviewerName}>{r.user_name || r.author_name || 'Diver'}</Text>
                        <View style={styles.reviewStars}>
                          {Array.from({ length: 5 }).map((_, i) => (
                            <Ionicons key={i} name={i < (r.rating || 0) ? 'star' : 'star-outline'} size={11} color="#f59e0b" />
                          ))}
                          {r.created_at ? <Text style={styles.reviewDate}> · {new Date(r.created_at).toLocaleDateString()}</Text> : null}
                        </View>
                      </View>
                    </View>
                    {r.comment ? <Text style={styles.reviewComment}>{r.comment}</Text> : null}
                    {(r.helpful_count || 0) > 0 ? (
                      <Text style={styles.reviewHelpful}>{r.helpful_count} found this helpful</Text>
                    ) : null}
                  </View>
                ))}
              </View>
            </Section>
          ) : null}

          {/* Map link */}
          {listing.gps_lat && listing.gps_lng ? (
            <Section title="Location">
              <TouchableOpacity
                onPress={() => Linking.openURL(`https://maps.google.com/?q=${listing.gps_lat},${listing.gps_lng}`)}
                style={styles.mapBtn}
                testID="open-map-btn">
                <Ionicons name="map-outline" size={18} color={Colors.cyan500} />
                <Text style={styles.mapText}>Open in Maps</Text>
              </TouchableOpacity>
            </Section>
          ) : null}

          {/* Buddy finder */}
          {buddies.length > 0 ? (
            <Section title="Other divers booked this">
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
                {buddies.slice(0, 8).map((b: any) => (
                  <TouchableOpacity key={b.id} style={styles.buddyCard}
                    onPress={() => router.push({ pathname: '/user/[id]', params: { id: b.id } })}
                    testID={`buddy-${b.id}`}>
                    <View style={styles.buddyAvatar}>
                      {b.profile_photo ? (
                        <Image source={{ uri: b.profile_photo }} style={{ width: '100%', height: '100%' }} />
                      ) : (
                        <Text style={styles.buddyInitial}>{(b.name || 'D')[0]}</Text>
                      )}
                    </View>
                    <Text style={styles.buddyName} numberOfLines={1}>{b.name || 'Diver'}</Text>
                    {b.certification_level ? <Text style={styles.buddyCert} numberOfLines={1}>{b.certification_level}</Text> : null}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </Section>
          ) : null}

          {/* Related listings */}
          {related.length > 0 ? (
            <Section title="You might also like">
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingRight: 16 }}>
                {related.slice(0, 6).map((rl) => (
                  <View key={rl.id} style={{ width: 240 }}>
                    <ListingCard listing={rl} onPress={() => router.push({ pathname: '/listing/[id]', params: { id: rl.id } })} />
                  </View>
                ))}
              </ScrollView>
            </Section>
          ) : null}
        </View>
      </ScrollView>

      {/* Sticky CTA */}
      <View style={styles.ctaBar}>
        <TouchableOpacity style={styles.tripIconBtn}
          onPress={async () => {
            if (!user) { router.push('/welcome'); return; }
            try { const r = await api.get('/trips'); setTrips(r.data?.trips || []); } catch {/* silent */}
            setTripPickerOpen(true);
          }}
          testID="add-to-trip-btn">
          <Ionicons name="add-circle-outline" size={22} color={Colors.cyan500} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.ctaPriceLabel}>From</Text>
          <Text style={styles.ctaPrice}>{format(price, sourceCcy)}</Text>
        </View>
        <TouchableOpacity style={styles.bookBtn} onPress={handleBookPress} testID="book-now-btn">
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

      {/* Trip picker modal */}
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
                  testID={`pick-trip-${t.id}`}>
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

      <BookingSheet visible={sheetOpen} onClose={() => setSheetOpen(false)} listing={listing} />
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function InfoCell({ icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <View style={styles.infoCell}>
      <Ionicons name={icon} size={18} color={Colors.cyan500} />
      <View style={{ flex: 1 }}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue}>{value}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.white },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorText: { fontSize: 16, color: Colors.slate500, marginBottom: 8 },
  backLink: { fontSize: 14, color: Colors.cyan400, fontWeight: '600' },
  topActions: { position: 'absolute', top: 12, left: 16, right: 16, zIndex: 10, flexDirection: 'row', justifyContent: 'space-between' },
  topBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.92)', alignItems: 'center', justifyContent: 'center' },
  heroImage: { width: SCREEN_W, height: HERO_H, backgroundColor: Colors.slate100 },
  dotRow: { position: 'absolute', bottom: 14, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 5 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.5)' },
  dotActive: { width: 18, backgroundColor: Colors.white },
  galleryCounter: { position: 'absolute', top: 16, right: 70, backgroundColor: 'rgba(15,23,42,0.6)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  galleryCounterText: { fontSize: 11, fontWeight: '700', color: Colors.white },
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
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginBottom: 24, paddingTop: 12, borderTopWidth: 1, borderTopColor: Colors.borderLight },
  priceLabel: { fontSize: 13, color: Colors.slate500 },
  price: { fontSize: 26, fontWeight: '700', color: Colors.slate900 },
  priceSub: { fontSize: 13, color: Colors.slate500 },

  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: Colors.slate900, marginBottom: 10 },
  description: { fontSize: 14, color: Colors.slate700, lineHeight: 22 },
  bulletRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  bulletText: { flex: 1, fontSize: 14, color: Colors.slate700, lineHeight: 20 },

  itineraryRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  itineraryDot: { width: 26, height: 26, borderRadius: 13, backgroundColor: Colors.cyan50, alignItems: 'center', justifyContent: 'center' },
  itineraryDotText: { fontSize: 12, fontWeight: '700', color: Colors.cyan500 },
  itineraryTitle: { fontSize: 14, fontWeight: '700', color: Colors.slate900 },
  itineraryDesc: { fontSize: 13, color: Colors.slate600, lineHeight: 19, marginTop: 2 },

  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: Colors.cyan50 },
  tagText: { fontSize: 11, fontWeight: '600', color: Colors.cyan500 },

  infoGrid: { gap: 10 },
  infoCell: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, backgroundColor: Colors.slate50 },
  infoLabel: { fontSize: 11, color: Colors.slate500, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  infoValue: { fontSize: 13, color: Colors.slate900, fontWeight: '600', marginTop: 2 },

  operatorCard: { padding: 14, borderRadius: 14, backgroundColor: Colors.slate50, borderWidth: 1, borderColor: Colors.borderLight, marginBottom: 24 },
  operatorRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  opAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.cyan50, alignItems: 'center', justifyContent: 'center' },
  operatorName: { fontSize: 15, fontWeight: '700', color: Colors.slate900 },
  verifiedRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  verifiedText: { fontSize: 11, color: Colors.cyan500, fontWeight: '600' },
  opResponse: { fontSize: 11, color: Colors.slate500, marginTop: 2 },
  opRatingPill: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.borderLight },
  opRatingText: { fontSize: 12, fontWeight: '700', color: Colors.slate900 },

  reviewCard: { padding: 12, borderRadius: 12, backgroundColor: Colors.slate50, gap: 8 },
  reviewHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  reviewerAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.cyan100, alignItems: 'center', justifyContent: 'center' },
  reviewerInitial: { fontSize: 13, fontWeight: '700', color: Colors.cyan500 },
  reviewerName: { fontSize: 13, fontWeight: '700', color: Colors.slate900 },
  reviewStars: { flexDirection: 'row', alignItems: 'center', gap: 1, marginTop: 2 },
  reviewDate: { fontSize: 10, color: Colors.slate400, marginLeft: 4 },
  reviewComment: { fontSize: 13, color: Colors.slate700, lineHeight: 19 },
  reviewHelpful: { fontSize: 11, color: Colors.slate500, fontStyle: 'italic' },

  mapBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 14, borderRadius: 12, backgroundColor: Colors.cyan50 },
  mapText: { fontSize: 13, fontWeight: '700', color: Colors.cyan500 },

  buddyCard: { width: 110, alignItems: 'center' },
  buddyAvatar: { width: 60, height: 60, borderRadius: 30, backgroundColor: Colors.cyan100, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  buddyInitial: { fontSize: 20, fontWeight: '700', color: Colors.cyan500 },
  buddyName: { fontSize: 12, fontWeight: '700', color: Colors.slate900, marginTop: 6 },
  buddyCert: { fontSize: 10, color: Colors.slate500, marginTop: 1 },

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
