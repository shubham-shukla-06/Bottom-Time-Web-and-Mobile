/**
 * Listing Detail — pixel-mirrors web `frontend/src/pages/ListingDetail.js`.
 *
 * Render order (matches web ListingDetail.js):
 *  1. Photo gallery (horizontal pager + caption overlay + thumbnail strip)
 *  2. Title + meta row (location, type, difficulty)
 *  3. Rating + review count
 *  4. Price card (from / diver, in user currency)
 *  5. About (description)
 *  6. Dive specs badges (num_dives, certification, nitrox)
 *  7. Highlights
 *  8. Dive Sites (rich card: name + difficulty pill + max_depth + description)
 *  9. Gear Rental (included banner / price / items list)
 * 10. Accommodation (liveaboard rooms list)
 * 11. What's Included
 * 12. What's Not Included
 * 13. Typical Conditions (water_temp, visibility, current, max_dive_depth)
 * 14. Details grid (duration, schedule, dates, group, medical waiver)
 * 15. Directions / How to Get There
 * 16. Operator card
 * 17. Reviews (stats + distribution + Write Review CTA + Helpful)
 * 18. Map (Open in Maps via location/country query)
 * 19. Policies (cancellation, refund, terms, legal — accordion)
 * 20. FAQs (accordion w/ web's default fallbacks)
 * 21. Buddies (other divers booked this)
 * 22. Related listings carousel
 *
 * Sticky CTA bar: trip + price + Book now (unchanged from prior shipping).
 * Wishlist heart added to top overlay; persists via /wishlist/{id}.
 */
import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, Image, Modal, Dimensions, FlatList, Share, Linking,
  TextInput, Animated, Platform, PanResponder,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
// `react-native-webview` was used for the previous map-iframe fallback;
// the map block now uses the web-parity `MapFallback` placeholder so the
// import has been retired. The package remains in `package.json` for
// future use (e.g. embedded payment redirects).
import { useLocalSearchParams, useRouter } from 'expo-router';
import Icon from '../../src/components/Icon';
import api from '../../src/api/client';
import { Colors } from '../../src/constants/colors';
import BookingSheet from '../../src/components/BookingSheet';
import ListingCard from '../../src/components/ListingCard';
import useAuthStore from '../../src/stores/authStore';
import { confirmDialog } from '../../src/utils/confirm';
import useCurrency from '../../src/hooks/useCurrency';
import { buildListingShareText } from '../../src/utils/shareText';

const { width: SCREEN_W } = Dimensions.get('window');
// Hero image takes a meaningfully larger share of the screen so the
// rounded-top sheet only covers the lower portion of the photo at rest.
const HERO_H = 440;
const THUMB_SIZE = 56;
const SHEET_OVERLAP = 24;
// Top-bar transition starts the moment the user begins scrolling
// (Airbnb-style) rather than only after the hero is fully out of view.
// `NAV_END` is the scroll position at which the bar reaches its final
// state (white background, small bar-style icons). `NAV_START` is a
// tiny threshold so a 4-px wobble doesn't fire the animation.
const NAV_START = 20;
const NAV_END = 220;
const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';
const GMAPS_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_KEY || '';

// ---- Types ---------------------------------------------------------------

type Photo = { url: string; caption?: string; order?: number };
type DiveSite = { name?: string; difficulty?: string; max_depth?: number; description?: string };
type GearItem = { name?: string; included?: boolean; price?: number };
type GearRental = { included?: boolean; items?: GearItem[]; price?: number };
type Accommodation = { included?: boolean; rooms?: Array<{ name?: string; description?: string; capacity?: number; price?: number }> };
type Directions = { nearest_airport?: string; text?: string; transfer_price?: number; transfers_available?: boolean };
type FAQ = { q: string; a: string };
type ReviewStats = { total: number; average: number; distribution: Record<string, number> };
type Review = {
  id?: string; _id?: string;
  user_name?: string; author_name?: string;
  rating?: number; comment?: string;
  helpful_count?: number; created_at?: string;
};

type Listing = {
  id: string;
  title?: string; name?: string;
  description?: string;
  location?: string; country?: string;
  listing_type?: string; type?: string;
  difficulty?: string;
  rating?: number; review_count?: number;
  price?: number; currency?: string;
  image_url?: string;
  photos?: Photo[];
  highlights?: string[];
  included?: string[];
  excluded?: string[];
  dive_sites?: DiveSite[];
  gear_rental?: GearRental;
  accommodation?: Accommodation;
  directions?: Directions;
  certification_required?: string;
  num_dives?: number;
  nitrox_available?: boolean;
  nitrox_price?: number;
  duration?: string;
  duration_days?: number;
  max_dive_depth?: string | number;
  max_per_booking?: number;
  max_slots?: number;
  arrival_date?: string | null;
  departure_date?: string | null;
  schedule_type?: string;
  medical_waiver_required?: boolean;
  refund_policy?: string;
  cancellation_policy?: string;
  terms_conditions?: string;
  legal_disclaimer?: string;
  tcs_compliance?: { applicable?: boolean; disclaimer?: string; rate?: number };
  faqs?: FAQ[];
  operator_id?: string;
  operator_name?: string;
  operator_verified?: boolean;
  water_temp?: string;
  visibility?: string;
  current?: string;
};

// ---- FAQ fallbacks (verbatim from web `FAQSection`) ----------------------

function defaultFaqs(listing: Listing | null): FAQ[] {
  const diff = listing?.difficulty || '';
  return [
    {
      q: 'What certification do I need?',
      a: `This experience requires at minimum an Open Water certification for ${
        diff === 'beginner' ? 'basic dives' : 'the planned dives'
      }. Beginners are welcome with a Try Dive option.`,
    },
    {
      q: 'What should I bring?',
      a: 'Bring your certification card, swimsuit, towel, sunscreen, and any personal dive gear. We provide all essential equipment.',
    },
    {
      q: 'Is there a minimum/maximum group size?',
      a: 'We typically run trips with 2-8 divers per guide to ensure safety and personal attention. Private trips available on request.',
    },
    {
      q: 'What happens if the weather is bad?',
      a: "Safety first! We'll reschedule if conditions are unsafe. Full refund or free reschedule available for weather cancellations.",
    },
  ];
}

// ---- Screen --------------------------------------------------------------

export default function ListingDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const user = useAuthStore((s) => s.user);
  const { format, symbol } = useCurrency();

  // Animated scroll value drives:
  //  • Hero "pinned-parallax" — translateY = scrollY so the hero
  //    stays in place while content scrolls over it; a separate
  //    white overlay fades 0→1 as scrollY climbs, so the hero
  //    visually fades to white instead of scrolling away.
  //  • Floating icon backdrops become MORE OPAQUE (0.6 → 1) as the
  //    hero collapses — they read as solid white pills against the
  //    white sheet that's covered the hero (inverse of the legacy
  //    fade-out behaviour).
  //  • Pull-to-dismiss when overscrolling at top (scrollY < 0):
  //      OUTER card borderRadius 0→24 over first 80 px, scale
  //      1→0.88, translateY 1:1 with finger over first 200 px.
  //      Release > 120 px → router.back(). No black dim — the
  //      navigator's `presentation: 'transparentModal'` keeps
  //      Discover mounted behind us, so scaling + translating the
  //      card naturally reveals Discover underneath.
  // All native-driven for 60fps.
  const scrollY = useRef(new Animated.Value(0)).current;
  // Mirror of scrollY's current numeric value, kept in a ref so the
  // pan-gesture's JS-thread callbacks can read it synchronously
  // without subscribing each tick. Updated by the listener below.
  const scrollYValueRef = useRef(0);
  const onAnimatedScroll = useMemo(
    () => Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true }),
    [scrollY],
  );

  // Pull-to-dismiss is now driven by a PanGestureHandler, NOT by
  // ScrollView overscroll bounce (bounces={false} on the ScrollView
  // below). `pullY` tracks the active downward drag distance; when
  // released past threshold we slide the card off-screen and call
  // router.back(), otherwise we spring back to 0.
  //
  // The hero + sheet + sticky bar + Book Now bar all live inside
  // the outer card `Animated.View`, so the card's transform moves
  // all of them as ONE rigid unit — no internal bounce or gap can
  // open between hero and sheet because the ScrollView itself does
  // not bounce.
  const pullY = useRef(new Animated.Value(0)).current;
  const cardTranslateY = pullY.interpolate({
    inputRange: [0, 300],
    outputRange: [0, 300],
    extrapolate: 'clamp',
  });
  const cardScale = pullY.interpolate({
    inputRange: [0, 180],
    outputRange: [1, 0.85],
    extrapolate: 'clamp',
  });
  const cardRadius = pullY.interpolate({
    inputRange: [0, 120],
    outputRange: [0, 24],
    extrapolate: 'clamp',
  });
  // White-overlay fade-to-white covers the hero photo as the sheet
  // rises. Stretched to the full HERO_H so the fade is gradual and
  // only reaches full white once the hero is fully scrolled past.
  const heroFadeWhite = scrollY.interpolate({
    inputRange: [0, HERO_H],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });
  // Floating icon backdrops become MORE opaque (start translucent
  // ≈ 0.6, end fully opaque white 1.0) as the hero fades to white.
  const floatBgOpacity = scrollY.interpolate({
    inputRange: [0, HERO_H * 0.6],
    outputRange: [0.6, 1],
    extrapolate: 'clamp',
  });
  // Sticky white nav bar fades in BEHIND the floating icons as the
  // hero collapses. Reaches full white slightly before the hero is
  // gone so the icons read as sitting on a solid bar at full scroll.
  const navOpacity = scrollY.interpolate({
    inputRange: [0, HERO_H - 80],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });
  // Hero pin: on scroll-UP (scrollY > 0), counter-translate by
  // scrollY so the hero stays anchored to the viewport top while
  // the sheet rises OVER it. With bounces={false} scrollY can no
  // longer go negative, so the left side of the piecewise just
  // covers the rest-state of 0. The right side is identity.
  const heroTranslateY = scrollY.interpolate({
    inputRange: [0, 9999],
    outputRange: [0, 9999],
    extrapolate: 'clamp',
  });

  // PanResponder — RN's built-in JS-side responder system.
  //   Why not react-native-gesture-handler?
  //   We tried `Gesture.Pan()` (bare), then composed it with the
  //   ScrollView via `Gesture.Simultaneous(pan, Gesture.Native())`
  //   using RNGH's own ScrollView. Both lost the gesture race to
  //   iOS UIScrollView 14/15 times — RNGH's worklet-side activation
  //   ran AFTER UIScrollView had already claimed the touch.
  //
  //   PanResponder is the standard RN pattern for swipe-to-dismiss
  //   sheets (powers the Airbnb/Apple Music style). The responder
  //   system arbitrates at the React Native level BEFORE the touch
  //   reaches the iOS UIScrollView pan, so when
  //   `onMoveShouldSetPanResponder` returns true, the gesture is
  //   transferred from the ScrollView descendant up to this card.
  //
  //   Activation gate (`onMoveShouldSetPanResponder`):
  //     • Must be at top of scroll      → scrollYValueRef ≤ 0
  //     • Must be moving downward 6 px+ → gestureState.dy > 6
  //     • Must be Y-dominant            → |dy| > |dx|  (lets
  //                                       horizontal carousel
  //                                       swipes win when those
  //                                       land)
  //
  //   Once claimed: panResponderTerminationRequest returns false so
  //   we never relinquish the gesture mid-drag.
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_evt, gestureState) =>
        scrollYValueRef.current <= 0 &&
        gestureState.dy > 6 &&
        Math.abs(gestureState.dy) > Math.abs(gestureState.dx),
      onMoveShouldSetPanResponderCapture: () => false,
      onPanResponderMove: (_evt, gestureState) => {
        if (gestureState.dy > 0) {
          pullY.setValue(gestureState.dy);
        }
      },
      onPanResponderRelease: (_evt, gestureState) => {
        // Release past threshold OR fast downward flick → dismiss.
        // Otherwise spring back. vy is in px/ms (PanResponder
        // convention) so 1.5 ≈ 1500 px/s.
        if (gestureState.dy > 180 || gestureState.vy > 1.5) {
          Animated.timing(pullY, {
            toValue: 600,
            duration: 220,
            useNativeDriver: true,
          }).start(() => router.back());
        } else {
          Animated.spring(pullY, {
            toValue: 0,
            bounciness: 6,
            useNativeDriver: true,
          }).start();
        }
      },
      onPanResponderTerminate: () => {
        Animated.spring(pullY, {
          toValue: 0,
          bounciness: 6,
          useNativeDriver: true,
        }).start();
      },
      // Reject any attempt by descendants to take the gesture back
      // once we've claimed it.
      onPanResponderTerminationRequest: () => false,
    }),
  ).current;

  // Status bar style — light over the dark hero, dark over the white
  // nav bar at full scroll. Threshold = (HERO_H - 80) * 0.5 = 180 px
  // (= 50% of the way through the nav bar's fade-in, so dark icons
  // appear ROUGHLY when the bar reaches half opacity — readable
  // against the still-fading background and still readable once the
  // bar is fully white). Wired via a native-driver-safe listener on
  // `scrollY`; we only `setState` when the bucket changes to avoid
  // re-render churn.
  const [barStyle, setBarStyle] = useState<'light' | 'dark'>('light');
  useEffect(() => {
    const threshold = (HERO_H - 80) * 0.5;
    const id = scrollY.addListener(({ value }) => {
      scrollYValueRef.current = value;
      const next: 'light' | 'dark' = value > threshold ? 'dark' : 'light';
      setBarStyle((prev) => (prev === next ? prev : next));
    });
    return () => scrollY.removeListener(id);
  }, [scrollY]);

  const [listing, setListing] = useState<Listing | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [reviewStats, setReviewStats] = useState<ReviewStats>({
    total: 0, average: 0, distribution: { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 },
  });
  const [buddies, setBuddies] = useState<any[]>([]);
  const [related, setRelated] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [tripPickerOpen, setTripPickerOpen] = useState(false);
  const [trips, setTrips] = useState<any[]>([]);
  const [adding, setAdding] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const galleryRef = React.useRef<FlatList<Photo> | null>(null);

  // Wishlist
  const [wishlisted, setWishlisted] = useState(false);

  // Reviews — write form
  const [reviewFormOpen, setReviewFormOpen] = useState(false);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [helpfulIds, setHelpfulIds] = useState<Set<string>>(new Set());

  // Accordions
  const [openPolicy, setOpenPolicy] = useState<string | null>(null);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  // ---- Data fetch -------------------------------------------------------

  const fetchReviews = useCallback(async () => {
    try {
      const r = await api.get(`/reviews/${id}`);
      const data = r.data;
      setReviews(Array.isArray(data) ? data : (data?.reviews || []));
      if (data?.stats) setReviewStats(data.stats);
    } catch { /* silent */ }
  }, [id]);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [lRes, bRes] = await Promise.all([
        api.get(`/listings/${id}`),
        api.get(`/buddy-finder/listing-buddies/${id}`).catch(() => ({ data: { buddies: [] } })),
      ]);
      const data: Listing = lRes.data;
      setListing(data);
      setBuddies(bRes.data?.buddies || bRes.data?.attendees || []);
      try {
        const rel = await api.get(`/listings/${id}/related?limit=6`);
        setRelated(rel.data?.related || []);
      } catch { /* silent */ }
      await fetchReviews();
    } catch (e) {
      console.log('Failed to fetch listing:', e);
    } finally {
      setLoading(false);
    }
  }, [id, fetchReviews]);

  const checkWishlist = useCallback(async () => {
    if (!user) { setWishlisted(false); return; }
    try {
      const r = await api.get('/wishlist/ids');
      const ids: string[] = r.data?.listing_ids || [];
      setWishlisted(ids.includes(String(id)));
    } catch { /* silent */ }
  }, [user, id]);

  useEffect(() => { fetchAll(); }, [fetchAll]);
  useEffect(() => { checkWishlist(); }, [checkWishlist]);

  // ---- Actions ----------------------------------------------------------

  const requireAuth = useCallback(async (label: string) => {
    if (user) return true;
    const ok = await confirmDialog({
      title: 'Sign in required',
      message: `Please sign in to ${label}.`,
      confirmText: 'Sign in', cancelText: 'Cancel',
    });
    if (ok) router.push('/welcome');
    return false;
  }, [user, router]);

  const handleBookPress = async () => {
    if (!(await requireAuth('book this experience'))) return;
    setSheetOpen(true);
  };

  const handleShare = async () => {
    const title = listing?.title || listing?.name || 'Bottom Time';
    const url = `https://project-scanner-44.preview.emergentagent.com/listing/${id}`;
    // Role-aware caption (mirrors web ShareModal default text — operator vs
    // diver vs instructor vs guest). The URL is passed separately so
    // WhatsApp / native share sheets render the link as a tappable card,
    // not just as plain text.
    const role = (user?.role as string | undefined) || 'guest';
    const message = listing
      ? `${buildListingShareText(listing as any, role)}\n${url}`
      : `${title}\n${url}`;
    // Try OG-image share via expo-sharing (image card preview). Fall back to
    // plain text Share if the OG image can't be fetched or sharing is
    // unavailable on this device (Expo Go web, simulator without Photos, etc.).
    try {
      const canShare = await Sharing.isAvailableAsync();
      if (canShare && BACKEND_URL) {
        const ogUrl = `${BACKEND_URL}/api/listings/${id}/og-image`;
        const localPath = `${FileSystem.cacheDirectory || ''}listing-${id}.png`;
        const dl = await FileSystem.downloadAsync(ogUrl, localPath);
        if (dl.status === 200) {
          await Sharing.shareAsync(dl.uri, {
            mimeType: 'image/png',
            dialogTitle: title,
            UTI: 'public.png',
          });
          api.post('/share/track', { entity_type: 'listing', entity_id: id, channel: 'image' }).catch(() => { /* silent */ });
          return;
        }
      }
    } catch { /* fall through to text share */ }
    try {
      // `message` already contains title + role-flavoured copy + URL so
      // pasting into apps like Instagram DMs surfaces all three even when
      // the receiving app ignores the separate `url` field.
      await Share.share({ message, url, title });
      api.post('/share/track', { entity_type: 'listing', entity_id: id, channel: 'native' }).catch(() => { /* silent */ });
    } catch { /* silent */ }
  };

  const toggleWishlist = async () => {
    if (!(await requireAuth('save to your wishlist'))) return;
    try {
      const r = await api.post(`/wishlist/${id}`);
      const next = !!r.data?.wishlisted;
      setWishlisted(next);
      setToast(next ? 'Saved to wishlist' : 'Removed from wishlist');
      setTimeout(() => setToast(null), 1800);
    } catch {
      setToast('Could not update wishlist');
      setTimeout(() => setToast(null), 1800);
    }
  };

  const submitReview = async () => {
    if (!(await requireAuth('write a review'))) return;
    if (!reviewComment.trim()) { setToast('Please write a comment'); setTimeout(() => setToast(null), 1800); return; }
    setReviewSubmitting(true);
    try {
      await api.post('/reviews', { listing_id: id, rating: reviewRating, comment: reviewComment.trim() });
      setReviewFormOpen(false);
      setReviewComment('');
      setReviewRating(5);
      setToast('Review submitted');
      setTimeout(() => setToast(null), 1800);
      await fetchReviews();
    } catch (e: any) {
      setToast(e?.response?.data?.detail || 'Failed to submit');
      setTimeout(() => setToast(null), 1800);
    } finally {
      setReviewSubmitting(false);
    }
  };

  const markHelpful = async (reviewId?: string) => {
    if (!reviewId) return;
    if (!(await requireAuth('mark a review as helpful'))) return;
    try {
      await api.post(`/reviews/${reviewId}/helpful`);
      setHelpfulIds((s) => new Set(s).add(reviewId));
      setReviews((prev) => prev.map((r) =>
        (r.id || r._id) === reviewId ? { ...r, helpful_count: (r.helpful_count || 0) + 1 } : r
      ));
    } catch { /* silent */ }
  };

  const openMaps = () => {
    const q = [listing?.location, listing?.country].filter(Boolean).join(', ');
    if (!q) return;
    Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`);
  };

  // ---- Derived ----------------------------------------------------------

  const photos: Photo[] = useMemo(() => {
    if (!listing) return [];
    if (Array.isArray(listing.photos) && listing.photos.length) {
      return listing.photos.filter((p) => p?.url);
    }
    if (listing.image_url) return [{ url: listing.image_url }];
    return [{ url: 'https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=800&q=60' }];
  }, [listing]);

  const sourceCcy = listing?.currency || 'USD';
  const price = listing?.price ?? 0;

  const conditions = useMemo(() => {
    if (!listing) return null;
    // Mirror web's hard-coded fallbacks (only when backend doesn't return them)
    return {
      water_temp: listing.water_temp || '26-30°C',
      visibility: listing.visibility || '15-30m',
      current: listing.current || 'Mild',
      max_depth: listing.max_dive_depth
        ? (typeof listing.max_dive_depth === 'number' ? `${listing.max_dive_depth}m` : listing.max_dive_depth)
        : '30m',
    };
  }, [listing]);

  const policies = useMemo(() => {
    if (!listing) return [];
    return [
      { key: 'cancellation', label: 'Cancellation Policy', value: listing.cancellation_policy },
      { key: 'refund', label: 'Refund Policy', value: listing.refund_policy },
      { key: 'terms', label: 'Terms & Conditions', value: listing.terms_conditions },
      { key: 'legal', label: 'Legal Disclaimer', value: listing.legal_disclaimer },
    ].filter((p) => (p.value || '').trim().length > 0);
  }, [listing]);

  const faqs = useMemo(() => (listing?.faqs?.length ? listing.faqs : defaultFaqs(listing)), [listing]);

  const detailsCells = useMemo(() => {
    if (!listing) return [];
    const cells: Array<{ icon: string; label: string; value: string }> = [];
    if (listing.duration) cells.push({ icon: 'time-outline', label: 'Duration', value: listing.duration });
    else if (listing.duration_days) cells.push({ icon: 'time-outline', label: 'Duration', value: `${listing.duration_days} day${listing.duration_days > 1 ? 's' : ''}` });
    if (listing.schedule_type) cells.push({ icon: 'calendar-outline', label: 'Schedule', value: listing.schedule_type.replace(/_/g, ' ') });
    if (listing.arrival_date) cells.push({ icon: 'airplane-outline', label: 'Arrival', value: formatDate(listing.arrival_date) });
    if (listing.departure_date) cells.push({ icon: 'airplane-outline', label: 'Departure', value: formatDate(listing.departure_date) });
    if (listing.max_per_booking) cells.push({ icon: 'people-outline', label: 'Group size', value: `Up to ${listing.max_per_booking}` });
    if (listing.max_slots && listing.max_slots !== listing.max_per_booking) {
      cells.push({ icon: 'people-circle-outline', label: 'Max slots', value: String(listing.max_slots) });
    }
    if (listing.medical_waiver_required) cells.push({ icon: 'medical-outline', label: 'Medical waiver', value: 'Required' });
    return cells;
  }, [listing]);

  // ---- Early returns ----------------------------------------------------

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.cyan400} />
        </View>
      </View>
    );
  }
  if (!listing) {
    return (
      <View style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Listing not found</Text>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.backLink}>Go back</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ---- Render -----------------------------------------------------------

  const activeCaption = photos[galleryIndex]?.caption;

  return (
    // The screen's OUTERMOST element must own white explicitly. On
    // iOS native (Expo Go), the React Navigation native-stack screen
    // wrapper paints `systemGroupedBackground` (#f2f2f7) behind us
    // when our outermost colour doesn't fill the entire window — the
    // shadows on the related-rail cards have soft alpha edges that
    // bleed past our white container, revealing the system grey
    // behind the cards. Forcing this root to #ffffff (combined with
    // `contentStyle.backgroundColor: '#ffffff'` on the Stack) means
    // even if a shadow's alpha tail extends past every child, the
    // pixel it bleeds onto is still white.
    //
    // Note: this used to be `#000` to play the role of a "void"
    // backdrop for the pull-to-dismiss gesture (so the screen looked
    // like it lifted off into black). The dim overlay below now
    // animates 0 → 0.35 alpha black on top, so it still reads as a
    // darkening void during the dismiss gesture even with this base
    // being white.
    <View style={{ flex: 1, backgroundColor: 'transparent' }} testID="listing-detail-screen">
      <StatusBar style={barStyle} translucent backgroundColor="transparent" />
      <Animated.View
        {...panResponder.panHandlers}
        style={[
          styles.container,
          {
            // Card surface is white — there is no longer a bounce
            // gap to fill, since `bounces={false}` on the ScrollView
            // means the contentContainer can never shift down at
            // scrollY=0. The whole card translates as a rigid unit
            // via the GestureDetector pan, so hero + sheet always
            // stay flush.
            backgroundColor: '#ffffff',
            // Card corner radius grows 0 → 24 during pull-to-dismiss.
            borderRadius: cardRadius,
            overflow: 'hidden',
            // Pull-to-dismiss: 1:1 translateY with finger + scale to
            // 0.85 over the first 180 px of pull (driven by `pullY`,
            // NOT by ScrollView overscroll).
            transform: [{ translateY: cardTranslateY }, { scale: cardScale }],
          },
        ]}
      >
      {/* HERO moved INSIDE the ScrollView (see first child of
          `Animated.ScrollView` below). Keeping the hero in the scroll
          tree means:
            • Hero + sheet scroll as ONE unit — no gap can ever open
              between them, even during pull-down bounce.
            • The OUTER card wrapper's scale/translate/borderRadius
              (driven by scrollY < 0 overscroll) animates the whole
              card — hero, sheet, and all — as a single unit.
            • Pull-down gestures starting on the hero work without
              any pointerEvents trickery — the hero IS scroll content. */}

      {/* STICKY WHITE NAV BAR — fades in BEHIND the floating icons as
          the hero collapses. zIndex sits BELOW the icons (10 < 20)
          but ABOVE the ScrollView (which has no zIndex), so it
          paints over the hero/sheet as they scroll past. Hairline
          bottom border for the classic iOS nav-bar separator. Non-
          interactive (pointerEvents='none') — purely visual. */}
      <Animated.View
        style={[
          styles.stickyBar,
          { paddingTop: insets.top, height: insets.top + 56, opacity: navOpacity },
        ]}
        pointerEvents="none"
      />

      {/* FLOATING ICONS — STATIC. Absolute on the card, never move
          with the scroll. Sit ON TOP of the sticky nav bar (higher
          zIndex). Their circular backdrops become MORE opaque as the
          hero fades to white (`floatBgOpacity` 0.6 → 1.0). */}
      <View
        style={[styles.topActions, { top: insets.top + 8 }]}
        pointerEvents="box-none"
      >
        <Animated.View style={[styles.topBtn, { backgroundColor: 'rgba(255,255,255,0.92)', opacity: floatBgOpacity }]}>
          <TouchableOpacity onPress={() => router.back()} testID="listing-back-btn" style={styles.topBtnInner}>
            <Icon name="arrow-back" size={20} color={Colors.slate900} />
          </TouchableOpacity>
        </Animated.View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Animated.View style={[styles.topBtn, wishlisted && styles.topBtnActive, { opacity: floatBgOpacity }]}>
            <TouchableOpacity onPress={toggleWishlist} testID="listing-wishlist-btn" style={styles.topBtnInner}>
              <Icon
                name={wishlisted ? 'heart' : 'heart-outline'}
                size={20}
                color={wishlisted ? '#ef4444' : Colors.slate900}
              />
            </TouchableOpacity>
          </Animated.View>
          <Animated.View style={[styles.topBtn, { opacity: floatBgOpacity }]}>
            <TouchableOpacity onPress={handleShare} testID="listing-share-btn" style={styles.topBtnInner}>
              <Icon name="share-outline" size={20} color={Colors.slate900} />
            </TouchableOpacity>
          </Animated.View>
        </View>
      </View>

      <Animated.ScrollView
        showsVerticalScrollIndicator={false}
        // Bounce disabled — pull-to-dismiss is driven by the outer
        // PanResponder on the card; the ScrollView itself must not
        // overscroll at scrollY=0 or hero and sheet would separate.
        bounces={false}
        overScrollMode="never"
        // Hero is the FIRST child of the contentContainer below, so
        // there is NO paddingTop — the hero IS the top of the scroll
        // content. The sheet's `marginTop: -SHEET_OVERLAP` pulls its
        // rounded top edge up to bite 24 px into the hero.
        // paddingBottom clears the 86 px sticky CTA bar + a margin.
        contentContainerStyle={{ paddingBottom: 140, backgroundColor: 'transparent' }}
        style={{ backgroundColor: 'transparent' }}
        // CRITICAL on iOS native: default `contentInsetAdjustmentBehavior`
        // is `'automatic'`, which makes UIScrollView add an implicit
        // bottom contentInset equal to `safeAreaInsets.bottom` (34 px
        // on iPhone X+). At max scroll that inset lifts the
        // contentContainer's paint region away from the screen's
        // bottom edge — the 34 px strip below contentContainer briefly
        // reveals the navigator/scene wrapper through the UIScrollView
        // and tints the CTA bar's home-indicator zone cream. Disable
        // the auto-adjust and rely on our explicit `paddingBottom: 140`
        // for the CTA-bar clearance.
        contentInsetAdjustmentBehavior="never"
        automaticallyAdjustContentInsets={false}
        onScroll={onAnimatedScroll}
        scrollEventThrottle={16}
      >
        {/* HERO — first child of the scroll content. Hero + sheet
            scroll together; during pull-down bounce they translate
            together with no gap. Horizontal page-swipe on the
            gallery FlatList works because FlatList owns its own pan;
            vertical drag is claimed by the parent ScrollView.
            Piecewise pin via `heroTranslateY` (see top of component):
            on scroll-UP (scrollY > 0) the hero counter-translates by
            scrollY, staying anchored to the viewport top while the
            sheet rises OVER it; on pull-DOWN (scrollY ≤ 0) the
            transform is identity, so hero + sheet bounce together
            as one unit during pull-to-dismiss. */}
        <Animated.View style={[styles.heroBlock, { transform: [{ translateY: heroTranslateY }] }]}>
          <FlatList
            ref={galleryRef}
            data={photos}
            keyExtractor={(p, i) => `${i}-${(p.url || '').slice(0, 30)}`}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(e) => setGalleryIndex(Math.round(e.nativeEvent.contentOffset.x / SCREEN_W))}
            renderItem={({ item }) => <Image source={{ uri: item.url }} style={styles.heroImage} />}
            testID="listing-gallery"
          />
          {/* White overlay that fades 0 → 1 as the user scrolls,
              "consuming" the hero photo from below as the sheet rises.
              Fade range extended to the full HERO_H so the transition
              is gradual. */}
          <Animated.View
            pointerEvents="none"
            style={{
              position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
              backgroundColor: '#ffffff',
              opacity: heroFadeWhite,
            }}
          />
        </Animated.View>

        {/* Rounded-top sheet — overlaps the hero by SHEET_OVERLAP via
            its negative marginTop so the corners bite into the photo */}
        <View style={styles.sheet} testID="listing-sheet">

        {/* Thumbnail strip */}
        {photos.length > 1 ? (
          <View style={styles.thumbStrip}>
            <FlatList
              horizontal
              data={photos.slice(0, 6)}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
              keyExtractor={(_, i) => `thumb-${i}`}
              renderItem={({ item, index }) => (
                <TouchableOpacity
                  onPress={() => {
                    setGalleryIndex(index);
                    galleryRef.current?.scrollToIndex({ index, animated: true });
                  }}
                  style={[styles.thumb, galleryIndex === index && styles.thumbActive]}
                  testID={`thumb-${index}`}
                >
                  <Image source={{ uri: item.url }} style={styles.thumbImage} />
                </TouchableOpacity>
              )}
            />
          </View>
        ) : null}

        <View style={styles.content}>
          {/* Title + meta */}
          <Text style={styles.title}>{listing.title || listing.name}</Text>
          <View style={styles.metaRow}>
            {(listing.location || listing.country) ? (
              <View style={styles.metaItem}>
                <Icon name="location-outline" size={14} color={Colors.slate500} />
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
              <Icon name="star" size={16} color="#f59e0b" />
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

          {/* About */}
          {listing.description ? (
            <Section title="About">
              <Text style={styles.description}>{listing.description}</Text>
            </Section>
          ) : null}

          {/* Dive specs badges */}
          <DiveSpecBadges listing={listing} currencySymbol={symbol} />

          {/* Highlights */}
          {Array.isArray(listing.highlights) && listing.highlights.length > 0 ? (
            <Section title="Highlights">
              <View style={{ gap: 8 }} testID="highlights-section">
                {listing.highlights.map((h, i) => (
                  <View key={i} style={styles.bulletRow}>
                    <Icon name="checkmark-circle" size={18} color={Colors.cyan500} />
                    <Text style={styles.bulletText}>{h}</Text>
                  </View>
                ))}
              </View>
            </Section>
          ) : null}

          {/* Dive sites — rich card */}
          {Array.isArray(listing.dive_sites) && listing.dive_sites.filter((s) => s?.name).length > 0 ? (
            <Section title={`Dive sites (${listing.dive_sites.filter((s) => s?.name).length})`}>
              <View style={{ gap: 10 }} testID="dive-sites-section">
                {listing.dive_sites.filter((s) => s?.name).map((s, i) => (
                  <View key={i} style={styles.diveSiteCard} testID={`dive-site-${i}`}>
                    <View style={styles.diveSiteHeader}>
                      <Text style={styles.diveSiteName}>{s.name}</Text>
                      {s.difficulty ? (
                        <View style={[styles.diffPill, diffPillStyle(s.difficulty)]}>
                          <Text style={styles.diffPillText}>{s.difficulty.replace(/_/g, ' ')}</Text>
                        </View>
                      ) : null}
                    </View>
                    {s.max_depth ? (
                      <Text style={styles.diveSiteDepth}>
                        Max depth: <Text style={{ fontWeight: '700' }}>{s.max_depth}m</Text>
                      </Text>
                    ) : null}
                    {s.description ? <Text style={styles.diveSiteDesc}>{s.description}</Text> : null}
                  </View>
                ))}
              </View>
            </Section>
          ) : null}

          {/* Gear rental */}
          <GearRentalBlock gearRental={listing.gear_rental} currencySymbol={symbol} sourceCcy={sourceCcy} />

          {/* Accommodation (liveaboard) */}
          <AccommodationBlock accommodation={listing.accommodation} currencySymbol={symbol} />

          {/* What's included */}
          {Array.isArray(listing.included) && listing.included.length > 0 ? (
            <Section title="What's included">
              <View style={{ gap: 8 }} testID="included-section">
                {listing.included.map((item, i) => (
                  <View key={i} style={styles.bulletRow}>
                    <Icon name="checkmark-circle" size={18} color="#10b981" />
                    <Text style={styles.bulletText}>{item}</Text>
                  </View>
                ))}
              </View>
            </Section>
          ) : null}

          {/* What's NOT included */}
          {Array.isArray(listing.excluded) && listing.excluded.length > 0 ? (
            <Section title="What's not included">
              <View style={{ gap: 8 }} testID="excluded-section">
                {listing.excluded.map((item, i) => (
                  <View key={i} style={styles.bulletRow}>
                    <Icon name="close-circle" size={18} color={Colors.slate400} />
                    <Text style={[styles.bulletText, { color: Colors.slate500 }]}>{item}</Text>
                  </View>
                ))}
              </View>
            </Section>
          ) : null}

          {/* Typical conditions */}
          {conditions ? (
            <Section title="Typical conditions">
              <View style={styles.condGrid} testID="conditions-section">
                <CondCell icon="thermometer-outline" label="Water Temp" value={conditions.water_temp} />
                <CondCell icon="eye-outline" label="Visibility" value={conditions.visibility} />
                <CondCell icon="water-outline" label="Current" value={conditions.current} />
                <CondCell icon="anchor" label="Max Depth" value={conditions.max_depth} />
              </View>
            </Section>
          ) : null}

          {/* Details grid */}
          {detailsCells.length > 0 ? (
            <Section title="Details">
              <View style={styles.infoGrid} testID="details-section">
                {detailsCells.map((c, i) => (
                  <InfoCell key={i} icon={c.icon} label={c.label} value={c.value} />
                ))}
              </View>
            </Section>
          ) : null}

          {/* Directions */}
          <DirectionsBlock directions={listing.directions} currencySymbol={symbol} />

          {/* Operator card */}
          {listing.operator_name ? (
            <View style={styles.operatorCard} testID="operator-card">
              <View style={styles.operatorRow}>
                <View style={styles.opAvatar}>
                  <Icon name="business" size={20} color={Colors.cyan500} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.operatorName}>{listing.operator_name}</Text>
                  {listing.operator_verified ? (
                    <View style={styles.verifiedRow}>
                      <Icon name="shield-checkmark" size={12} color={Colors.cyan500} />
                      <Text style={styles.verifiedText}>Verified operator</Text>
                    </View>
                  ) : null}
                </View>
              </View>
            </View>
          ) : null}

          {/* Reviews — stats + distribution + write + list */}
          <Section title={`Reviews (${reviewStats.total || reviews.length})`}>
            <View style={styles.reviewStatsRow} testID="review-stats">
              <Text style={styles.reviewAvg}>{(reviewStats.average || 0).toFixed(1)}</Text>
              <View style={{ flex: 1 }}>
                <View style={styles.reviewStarsRow}>
                  {[1, 2, 3, 4, 5].map((s) => (
                    <Icon
                      key={s}
                      name={s <= Math.round(reviewStats.average) ? 'star' : 'star-outline'}
                      size={14}
                      color="#f59e0b"
                    />
                  ))}
                </View>
                <Text style={styles.reviewTotalText}>{reviewStats.total} review{reviewStats.total === 1 ? '' : 's'}</Text>
              </View>
              <TouchableOpacity
                style={styles.writeReviewBtn}
                onPress={() => { setReviewFormOpen((v) => !v); }}
                testID="write-review-btn"
              >
                <Text style={styles.writeReviewText}>Write review</Text>
              </TouchableOpacity>
            </View>

            {/* Distribution bars */}
            {reviewStats.total > 0 ? (
              <View style={styles.distribution} testID="review-distribution">
                {[5, 4, 3, 2, 1].map((s) => {
                  const count = Number(reviewStats.distribution?.[String(s)] || 0);
                  const pct = reviewStats.total > 0 ? (count / reviewStats.total) * 100 : 0;
                  return (
                    <View key={s} style={styles.distRow}>
                      <Text style={styles.distLabel}>{s}</Text>
                      <View style={styles.distTrack}>
                        <View style={[styles.distFill, { width: `${pct}%` }]} />
                      </View>
                      <Text style={styles.distCount}>{count}</Text>
                    </View>
                  );
                })}
              </View>
            ) : null}

            {/* Write-review inline form */}
            {reviewFormOpen ? (
              <View style={styles.reviewForm} testID="review-form">
                <Text style={styles.reviewFormLabel}>Your rating</Text>
                <View style={styles.reviewFormStars}>
                  {[1, 2, 3, 4, 5].map((s) => (
                    <TouchableOpacity key={s} onPress={() => setReviewRating(s)} testID={`review-star-${s}`}>
                      <Icon
                        name={s <= reviewRating ? 'star' : 'star-outline'}
                        size={28}
                        color="#f59e0b"
                      />
                    </TouchableOpacity>
                  ))}
                </View>
                <TextInput
                  style={styles.reviewInput}
                  placeholder="Share your experience…"
                  placeholderTextColor={Colors.slate400}
                  multiline
                  value={reviewComment}
                  onChangeText={setReviewComment}
                  testID="review-comment-input"
                />
                <View style={{ flexDirection: 'row', gap: 8, justifyContent: 'flex-end' }}>
                  <TouchableOpacity onPress={() => { setReviewFormOpen(false); setReviewComment(''); }} style={styles.reviewCancelBtn}>
                    <Text style={styles.reviewCancelText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={submitReview}
                    disabled={reviewSubmitting}
                    style={[styles.reviewSubmitBtn, reviewSubmitting && { opacity: 0.5 }]}
                    testID="review-submit-btn"
                  >
                    <Text style={styles.reviewSubmitText}>{reviewSubmitting ? 'Submitting…' : 'Submit review'}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : null}

            {/* Review list */}
            {reviews.length > 0 ? (
              <View style={{ gap: 12, marginTop: 12 }}>
                {reviews.slice(0, 5).map((r) => {
                  const rid = r.id || r._id || '';
                  const helpfulCount = r.helpful_count || 0;
                  const alreadyHelpful = helpfulIds.has(rid);
                  return (
                    <View key={rid} style={styles.reviewCard} testID={`review-${rid}`}>
                      <View style={styles.reviewHeader}>
                        <View style={styles.reviewerAvatar}>
                          <Text style={styles.reviewerInitial}>{(r.user_name || r.author_name || 'A')[0]}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.reviewerName}>{r.user_name || r.author_name || 'Diver'}</Text>
                          <View style={styles.reviewStars}>
                            {Array.from({ length: 5 }).map((_, i) => (
                              <Icon key={i} name={i < (r.rating || 0) ? 'star' : 'star-outline'} size={11} color="#f59e0b" />
                            ))}
                            {r.created_at ? <Text style={styles.reviewDate}> · {new Date(r.created_at).toLocaleDateString()}</Text> : null}
                          </View>
                        </View>
                      </View>
                      {r.comment ? <Text style={styles.reviewComment}>{r.comment}</Text> : null}
                      <TouchableOpacity
                        onPress={() => markHelpful(rid)}
                        disabled={alreadyHelpful}
                        style={[styles.helpfulBtn, alreadyHelpful && { opacity: 0.5 }]}
                        testID={`review-helpful-${rid}`}
                      >
                        <Icon name="thumbs-up-outline" size={12} color={Colors.slate500} />
                        <Text style={styles.helpfulText}>
                          {alreadyHelpful ? 'Marked helpful' : 'Helpful'}{helpfulCount > 0 ? ` (${helpfulCount})` : ''}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </View>
            ) : reviewStats.total === 0 ? (
              <Text style={styles.emptyReviews}>No reviews yet. Be the first to share your experience.</Text>
            ) : null}
          </Section>

          {/* Location — embedded Google Static Map preview (tap → Open in Maps) */}
          {(listing.location || listing.country) ? (
            <Section title="Location">
              <View style={styles.locationRow}>
                <Icon name="map-outline" size={14} color={Colors.cyan500} />
                <Text style={styles.locationLabel}>
                  {[listing.location, listing.country].filter(Boolean).join(', ')}
                </Text>
              </View>
              {/* Map preview — two rendering paths.
                  (1) Google Static Maps PNG when `EXPO_PUBLIC_GOOGLE_MAPS_KEY`
                      is set (sharper than iframe, supports cyan marker).
                  (2) `MapFallback` placeholder — ports the same slate-100
                      panel + centred MapPin web shows when no key is
                      available. (Both web `REACT_APP_GOOGLE_MAPS_KEY` and
                      mobile `EXPO_PUBLIC_GOOGLE_MAPS_KEY` are currently
                      empty, so this is the active path today.) Tapping
                      the placeholder opens the listing in Google Maps. */}
              {GMAPS_KEY ? (
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={openMaps}
                  style={styles.mapPreviewWrap}
                  testID="listing-map-preview"
                >
                  <Image
                    source={{
                      uri: `https://maps.googleapis.com/maps/api/staticmap?center=${encodeURIComponent(
                        [listing.location, listing.country].filter(Boolean).join(', ')
                      )}&zoom=12&size=640x320&scale=2&maptype=roadmap&markers=color:0x06b6d4%7C${encodeURIComponent(
                        [listing.location, listing.country].filter(Boolean).join(', ')
                      )}&key=${GMAPS_KEY}`,
                    }}
                    style={styles.mapPreview}
                    resizeMode="cover"
                  />
                  <View style={styles.mapPreviewBadge}>
                    <Icon name="navigate-outline" size={13} color={Colors.cyan500} />
                    <Text style={styles.mapPreviewBadgeText}>Open in Maps</Text>
                  </View>
                </TouchableOpacity>
              ) : (
                // MapFallback — ported 1:1 from
                // `frontend/src/components/SafeMapWrapper.js` (slate-100 bg,
                // centred MapPin icon, "Map preview unavailable" label).
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={openMaps}
                  style={[styles.mapPreviewWrap, styles.mapFallback]}
                  testID="listing-map-fallback"
                >
                  <View style={styles.mapFallbackPinWrap}>
                    <Icon name="location-outline" size={28} color={Colors.slate500} />
                  </View>
                  <Text style={styles.mapFallbackLabel}>Map preview unavailable</Text>
                  <View style={styles.mapPreviewBadge}>
                    <Icon name="navigate-outline" size={13} color={Colors.cyan500} />
                    <Text style={styles.mapPreviewBadgeText}>Open in Maps</Text>
                  </View>
                </TouchableOpacity>
              )}
            </Section>
          ) : null}

          {/* Policies accordion */}
          {policies.length > 0 ? (
            <Section title="Policies">
              <View style={{ gap: 6 }} testID="policies-section">
                {policies.map((p) => (
                  <View key={p.key} style={styles.accordionCard}>
                    <TouchableOpacity
                      onPress={() => setOpenPolicy(openPolicy === p.key ? null : p.key)}
                      style={styles.accordionHeader}
                      testID={`policy-toggle-${p.key}`}
                    >
                      <Text style={styles.accordionLabel}>{p.label}</Text>
                      <Icon
                        name={openPolicy === p.key ? 'chevron-up' : 'chevron-down'}
                        size={16}
                        color={Colors.slate400}
                      />
                    </TouchableOpacity>
                    {openPolicy === p.key ? (
                      <Text style={styles.accordionBody} testID={`policy-body-${p.key}`}>{p.value}</Text>
                    ) : null}
                  </View>
                ))}
              </View>
            </Section>
          ) : (
            <Section title="Cancellation policy">
              <View style={{ gap: 6 }} testID="policies-fallback">
                <View style={styles.bulletRow}>
                  <Icon name="checkmark-circle" size={14} color="#10b981" />
                  <Text style={styles.policyFallbackText}>Free cancellation up to 48 hours before the trip</Text>
                </View>
                <View style={styles.bulletRow}>
                  <Icon name="checkmark-circle" size={14} color="#f59e0b" />
                  <Text style={styles.policyFallbackText}>50% refund for cancellations 24-48 hours before</Text>
                </View>
                <View style={styles.bulletRow}>
                  <Icon name="checkmark-circle" size={14} color="#ef4444" />
                  <Text style={styles.policyFallbackText}>No refund for cancellations less than 24 hours before</Text>
                </View>
              </View>
            </Section>
          )}

          {/* FAQs accordion */}
          {faqs.length > 0 ? (
            <Section title="Common questions">
              <View style={{ gap: 6 }} testID="faq-section">
                {faqs.map((f, i) => (
                  <View key={i} style={styles.accordionCard}>
                    <TouchableOpacity
                      onPress={() => setOpenFaq(openFaq === i ? null : i)}
                      style={styles.accordionHeader}
                      testID={`faq-toggle-${i}`}
                    >
                      <Text style={styles.accordionLabel}>{f.q}</Text>
                      <Icon
                        name={openFaq === i ? 'chevron-up' : 'chevron-down'}
                        size={16}
                        color={Colors.slate400}
                      />
                    </TouchableOpacity>
                    {openFaq === i ? <Text style={styles.accordionBody}>{f.a}</Text> : null}
                  </View>
                ))}
              </View>
            </Section>
          ) : null}

          {/* Buddies */}
          {buddies.length > 0 ? (
            <Section title="Other divers booked this">
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
                {buddies.slice(0, 8).map((b: any) => (
                  <TouchableOpacity
                    key={b.id}
                    style={styles.buddyCard}
                    onPress={() => router.push({ pathname: '/user/[id]', params: { id: b.id } })}
                    testID={`buddy-${b.id}`}
                  >
                    <View style={styles.buddyAvatar}>
                      {b.profile_photo ? (
                        <Image source={{ uri: b.profile_photo }} style={{ width: '100%', height: '100%' }} />
                      ) : (
                        <Text style={styles.buddyInitial}>{(b.name || 'D')[0]}</Text>
                      )}
                    </View>
                    <Text style={styles.buddyName} numberOfLines={1}>{b.name || 'Diver'}</Text>
                    {b.certification_level ? (
                      <Text style={styles.buddyCert} numberOfLines={1}>{b.certification_level}</Text>
                    ) : null}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </Section>
          ) : null}

          {/* Related — "You might also like" — hide if <2 (1-item rails look stale).
              Explicit white background on the section wrapper AND the
              horizontal ScrollView's contentContainer so no grey
              parent surface can leak through behind the cards or in
              the inter-card gaps. */}
          {related.length >= 2 ? (
            <View style={{ backgroundColor: '#ffffff' }}>
            <Section title="You might also like">
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 10, paddingRight: 16, backgroundColor: '#ffffff' }}
                style={{ backgroundColor: '#ffffff' }}
                testID="related-listings"
              >
                {related.slice(0, 6).map((rl) => (
                  <View key={rl.id} style={styles.relatedCardWrap}>
                    <ListingCard
                      listing={rl}
                      variant="compact"
                      onPress={() => router.push({ pathname: '/listing/[id]', params: { id: rl.id } })}
                    />
                  </View>
                ))}
              </ScrollView>
            </Section>
            </View>
          ) : null}
        </View>
        </View>
      </Animated.ScrollView>

      {/* Sticky top nav removed — spec change. Floating circular
          back/wishlist/share buttons (defined inside the ScrollView's
          hero region above) remain pinned at the screen top and
          their circular backdrops become MORE opaque as the hero
          fades to white (`floatBgOpacity` 0.6 → 1.0). No separate
          white bar layered behind. */}

      {/* Sticky CTA — Book Now is the single primary action.
          The legacy "+ add to trip" pill was removed per design — trips
          remain reachable via the dedicated Trips tab.
          paddingBottom is safe-area-aware: on iPhone X+ the home
          indicator inset is 34 px — the bar's own white surface
          extends through that zone (bottom: 0) and its content is
          pushed up by Math.max(insets.bottom, 16) so the price + Book
          Now button never sit under the home-indicator pill. */}
      <View style={[styles.ctaBar, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <View style={{ flex: 1 }}>
          <Text style={styles.ctaPriceLabel}>From</Text>
          <Text style={styles.ctaPrice}>{format(price, sourceCcy)}</Text>
        </View>
        <TouchableOpacity style={styles.bookBtn} onPress={handleBookPress} testID="book-now-btn">
          <Text style={styles.bookBtnText}>Book now</Text>
          <Icon name="arrow-forward" size={18} color={Colors.white} />
        </TouchableOpacity>
      </View>

      {toast ? (
        <View style={styles.toast} testID="trip-toast">
          <Icon name="checkmark-circle" size={16} color={Colors.white} />
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      ) : null}

      {/* Trip picker modal (unchanged) */}
      <Modal visible={tripPickerOpen} animationType="slide" transparent onRequestClose={() => setTripPickerOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.tripModalSheet} testID="trip-picker-modal">
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add to trip</Text>
              <TouchableOpacity onPress={() => setTripPickerOpen(false)} testID="close-trip-picker">
                <Icon name="close" size={22} color={Colors.slate700} />
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ gap: 8, paddingBottom: 8 }}>
              {trips.length === 0 ? (
                <Text style={styles.emptyTrips}>No trips yet. Create one first.</Text>
              ) : trips.map((t) => (
                <TouchableOpacity
                  key={t.id}
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
                  <Icon name="airplane" size={16} color={Colors.cyan500} />
                  <Text style={styles.tripPickName}>{t.name}</Text>
                  <Text style={styles.tripPickDest} numberOfLines={1}>{t.destination || ''}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                onPress={() => { setTripPickerOpen(false); router.push('/trips'); }}
                style={styles.newTripCta}
                testID="new-trip-from-listing"
              >
                <Icon name="add" size={16} color={Colors.cyan500} />
                <Text style={styles.newTripText}>Create new trip</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <BookingSheet visible={sheetOpen} onClose={() => setSheetOpen(false)} listing={listing} />
      </Animated.View>
      {/* No black dim overlay — `presentation: 'transparentModal'`
          keeps Discover mounted behind us, so scaling + translating
          the white card during pull-to-dismiss naturally reveals
          Discover underneath without needing an opacity-dimmed
          synthetic backdrop. */}
    </View>
  );
}

// ---- Sub-components ------------------------------------------------------

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function InfoCell({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View style={styles.infoCell}>
      <Icon name={icon as any} size={18} color={Colors.cyan500} />
      <View style={{ flex: 1 }}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue}>{value}</Text>
      </View>
    </View>
  );
}

function CondCell({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View style={styles.condCell}>
      <Icon name={icon as any} size={18} color={Colors.cyan500} />
      <Text style={styles.condLabel}>{label}</Text>
      <Text style={styles.condValue}>{value}</Text>
    </View>
  );
}

function DiveSpecBadges({ listing, currencySymbol }: { listing: Listing; currencySymbol: string }) {
  const chips: Array<{ icon: string; label: string; tint: 'cyan' | 'violet' | 'amber' }> = [];
  if (listing.num_dives && listing.num_dives > 0) {
    chips.push({ icon: 'layers-outline', label: `${listing.num_dives} dive${listing.num_dives > 1 ? 's' : ''}`, tint: 'cyan' });
  }
  if (listing.certification_required && listing.certification_required !== 'None Required') {
    chips.push({ icon: 'ribbon-outline', label: listing.certification_required, tint: 'amber' });
  }
  if (listing.nitrox_available) {
    const priceSuffix = listing.nitrox_price && listing.nitrox_price > 0 ? ` +${currencySymbol}${listing.nitrox_price}` : '';
    chips.push({ icon: 'flash-outline', label: `Nitrox available${priceSuffix}`, tint: 'violet' });
  }
  if (chips.length === 0) return null;

  return (
    <View style={styles.specsRow} testID="dive-specs-badges">
      {chips.map((c, i) => (
        <View key={i} style={[styles.specChip, specTint(c.tint)]}>
          <Icon name={c.icon as any} size={12} color={specIconColor(c.tint)} />
          <Text style={[styles.specChipText, { color: specIconColor(c.tint) }]}>{c.label}</Text>
        </View>
      ))}
    </View>
  );
}

function GearRentalBlock({ gearRental, currencySymbol }: { gearRental?: GearRental; currencySymbol: string; sourceCcy: string }) {
  if (!gearRental) return null;
  const items = (gearRental.items || []).filter((i) => i?.name);
  const hasIncluded = !!gearRental.included;
  const hasPriced = (gearRental.price || 0) > 0;
  if (!hasIncluded && !hasPriced && items.length === 0) return null;

  return (
    <Section title="Gear rental">
      <View testID="gear-rental-section">
        {hasIncluded ? (
          <View style={styles.gearBanner}>
            <Icon name="checkmark-circle" size={16} color="#10b981" />
            <Text style={styles.gearBannerText}>
              <Text style={{ fontWeight: '700' }}>Full gear set included</Text> — no extra charge
            </Text>
          </View>
        ) : null}
        {!hasIncluded && hasPriced ? (
          <View style={styles.gearBannerNeutral}>
            <Icon name="construct-outline" size={16} color={Colors.cyan500} />
            <Text style={styles.gearBannerText}>
              Full gear rental — <Text style={{ fontWeight: '700' }}>{currencySymbol}{gearRental.price}</Text>
            </Text>
          </View>
        ) : null}
        {items.length > 0 ? (
          <View style={styles.gearItems}>
            {items.map((it, i) => (
              <View key={i} style={styles.gearItemRow} testID={`gear-item-${i}`}>
                <Text style={styles.gearItemName}>{it.name}</Text>
                {it.included ? (
                  <Text style={styles.gearIncluded}>Included</Text>
                ) : (it.price || 0) > 0 ? (
                  <Text style={styles.gearPrice}>{currencySymbol}{it.price}</Text>
                ) : (
                  <Text style={styles.gearItemDash}>—</Text>
                )}
              </View>
            ))}
          </View>
        ) : null}
      </View>
    </Section>
  );
}

function AccommodationBlock({ accommodation, currencySymbol }: { accommodation?: Accommodation; currencySymbol: string }) {
  if (!accommodation) return null;
  const hasIncluded = !!accommodation.included;
  const rooms = (accommodation.rooms || []).filter((r) => r?.name);
  if (!hasIncluded && rooms.length === 0) return null;

  return (
    <Section title="Accommodation">
      <View testID="accommodation-section">
        {hasIncluded ? (
          <View style={styles.gearBanner}>
            <Icon name="bed-outline" size={16} color="#10b981" />
            <Text style={styles.gearBannerText}>
              <Text style={{ fontWeight: '700' }}>Accommodation included</Text>
            </Text>
          </View>
        ) : null}
        {rooms.length > 0 ? (
          <View style={{ gap: 8, marginTop: hasIncluded ? 10 : 0 }}>
            {rooms.map((r, i) => (
              <View key={i} style={styles.roomCard} testID={`room-${i}`}>
                <View style={styles.roomHeader}>
                  <Text style={styles.roomName}>{r.name}</Text>
                  {(r.price || 0) > 0 ? (
                    <Text style={styles.roomPrice}>{currencySymbol}{r.price}</Text>
                  ) : null}
                </View>
                {r.capacity ? (
                  <Text style={styles.roomMeta}>Sleeps {r.capacity}</Text>
                ) : null}
                {r.description ? (
                  <Text style={styles.roomDesc}>{r.description}</Text>
                ) : null}
              </View>
            ))}
          </View>
        ) : null}
      </View>
    </Section>
  );
}

function DirectionsBlock({ directions, currencySymbol }: { directions?: Directions; currencySymbol: string }) {
  if (!directions) return null;
  const hasAnything = directions.nearest_airport || directions.text || directions.transfers_available != null;
  if (!hasAnything) return null;

  return (
    <Section title="How to get there">
      <View style={{ gap: 12 }} testID="directions-section">
        {directions.nearest_airport ? (
          <View style={styles.dirRow}>
            <Icon name="airplane-outline" size={16} color={Colors.slate500} />
            <View style={{ flex: 1 }}>
              <Text style={styles.dirLabel}>Nearest Airport</Text>
              <Text style={styles.dirValue}>{directions.nearest_airport}</Text>
            </View>
          </View>
        ) : null}
        {directions.transfers_available != null ? (
          <View style={styles.dirRow} testID="transfers-row">
            <Icon name="car-outline" size={16} color={Colors.slate500} />
            <View style={{ flex: 1 }}>
              <Text style={styles.dirLabel}>Airport Transfers</Text>
              <Text style={styles.dirValue}>
                {directions.transfers_available ? (
                  (directions.transfer_price || 0) > 0
                    ? `Available — ${currencySymbol}${directions.transfer_price} per person`
                    : 'Available — complimentary'
                ) : 'Self-arranged'}
              </Text>
            </View>
          </View>
        ) : null}
        {directions.text ? (
          <Text style={styles.dirFreeText}>{directions.text}</Text>
        ) : null}
      </View>
    </Section>
  );
}

// ---- Style helpers -------------------------------------------------------

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return iso;
  }
}

function diffPillStyle(d: string) {
  const map: Record<string, { backgroundColor: string }> = {
    beginner:    { backgroundColor: '#dcfce7' },
    open_water:  { backgroundColor: '#cffafe' },
    advanced:    { backgroundColor: '#fef3c7' },
    rescue:      { backgroundColor: '#ffedd5' },
    divemaster:  { backgroundColor: '#ffe4e6' },
    technical:   { backgroundColor: '#f3e8ff' },
  };
  return map[d] || { backgroundColor: Colors.slate100 };
}

function specTint(t: 'cyan' | 'violet' | 'amber') {
  return t === 'cyan'   ? { backgroundColor: Colors.cyan50 }
       : t === 'violet' ? { backgroundColor: '#f5f3ff' }
       :                  { backgroundColor: '#fffbeb' };
}
function specIconColor(t: 'cyan' | 'violet' | 'amber') {
  return t === 'cyan' ? Colors.cyan500 : t === 'violet' ? '#7c3aed' : '#b45309';
}

// ---- Styles --------------------------------------------------------------

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff' },
  sheet: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    marginTop: -SHEET_OVERLAP,
    paddingTop: 16,
    minHeight: 600,
    // Sheet lift: render shadow ONLY ABOVE the rounded top edge (where
    // it overlaps the hero photo). Previously `shadowOffset { 0, -4 }
    // + radius 12` left a 12 px gaussian tail BELOW the sheet's bottom
    // edge — that's the ~20 px tall #f8f8f8 band the user reported as
    // a "soft drop shadow" just above the sticky CTA bar at max
    // scroll. Shifting the offset to -14 with radius 12 confines the
    // entire visible blur to y ≤ (sheet_bottom − 2 px) — the bottom
    // edge no longer casts any visible shadow.
    // `elevation: 0` because Android's elevation shadow is
    // omnidirectional and ignores `shadowOffset`, so any elevation
    // value > 0 re-introduces the bottom bleed on Android regardless
    // of the iOS-side offset trick.
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -14 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 0,
  },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.white },
  errorContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.white },
  errorText: { fontSize: 16, color: Colors.slate500, marginBottom: 8 },
  backLink: { fontSize: 14, color: Colors.cyan400, fontWeight: '600' },

  topActions: {
    position: 'absolute', top: 12, left: 16, right: 16, zIndex: 20,
    flexDirection: 'row', justifyContent: 'space-between',
  },
  // Hero block — FIRST child of the ScrollView's contentContainer.
  // In-flow (NOT absolute) so hero + sheet scroll as one unit and
  // bounce together during pull-down — no gap can open between them.
  // `overflow:hidden` clips the gallery FlatList to HERO_H; backing
  // colour matches the photo so any 1-frame race during horizontal
  // page-swipe shows slate, not white.
  heroBlock: {
    height: HERO_H,
    backgroundColor: Colors.slate900,
    overflow: 'hidden',
  },
  // Sticky white nav bar — absolute on the card, sits BEHIND the
  // floating icons (lower zIndex) and ABOVE the ScrollView content
  // (higher zIndex than the sheet). Hairline bottom border for the
  // classic iOS nav-bar separator. Fades in via `navOpacity` as the
  // hero collapses.
  stickyBar: {
    position: 'absolute', top: 0, left: 0, right: 0,
    backgroundColor: '#ffffff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e7eb',
    zIndex: 10,
  },
  topBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center', justifyContent: 'center',
  },
  topBtnInner: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
  },
  topBtnActive: { backgroundColor: '#fee2e2' },

  // Sticky top nav — fades in once the hero has scrolled past. White
  // translucent backdrop + hairline bottom border for that classy
  // iOS-style nav-bar transition.
  scrolledNav: {
    position: 'absolute', top: 0, left: 0, right: 0,
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(15,23,42,0.12)',
    paddingBottom: 8,
    zIndex: 20,
  },
  scrolledNavRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', paddingHorizontal: 16, paddingTop: 6,
  },
  scrolledNavBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Colors.white,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.05, shadowOffset: { width: 0, height: 1 }, shadowRadius: 2,
    elevation: 1,
  },
  scrolledNavBtnActive: { backgroundColor: '#fee2e2' },

  // Related-rail card wrapper — fixed dimensions so titles/locations
  // never push the row's height around. Trimmed to 240 so the compact
  // card's full border (incl. drop-shadow) is visible above the sticky
  // CTA bar without clipping.
  relatedCardWrap: { width: 220, height: 240 },

  heroImage: { width: SCREEN_W, height: HERO_H, backgroundColor: Colors.slate100 },
  dotRow: {
    position: 'absolute', bottom: 14, left: 0, right: 0,
    flexDirection: 'row', justifyContent: 'center', gap: 5,
  },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.5)' },
  dotActive: { width: 18, backgroundColor: Colors.white },
  galleryCounter: {
    position: 'absolute', right: 16,
    backgroundColor: 'rgba(15,23,42,0.6)',
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999,
    flexDirection: 'row', alignItems: 'center', gap: 5,
  },
  galleryCounterText: { fontSize: 11, fontWeight: '700', color: Colors.white },
  captionOverlay: {
    position: 'absolute', left: 16, right: 16,
    backgroundColor: 'rgba(15,23,42,0.55)',
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8,
  },
  captionText: { color: Colors.white, fontSize: 11, fontWeight: '500' },

  thumbStrip: { paddingVertical: 10, backgroundColor: Colors.white },
  thumb: {
    width: THUMB_SIZE, height: THUMB_SIZE, borderRadius: 8,
    overflow: 'hidden', borderWidth: 2, borderColor: 'transparent',
  },
  thumbActive: { borderColor: Colors.cyan400 },
  thumbImage: { width: '100%', height: '100%' },

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

  priceRow: {
    flexDirection: 'row', alignItems: 'baseline', gap: 6,
    marginBottom: 24, paddingTop: 12,
    borderTopWidth: 1, borderTopColor: Colors.borderLight,
  },
  priceLabel: { fontSize: 13, color: Colors.slate500 },
  price: { fontSize: 26, fontWeight: '700', color: Colors.slate900 },
  priceSub: { fontSize: 13, color: Colors.slate500 },

  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: Colors.slate900, marginBottom: 10 },
  description: { fontSize: 14, color: Colors.slate700, lineHeight: 22 },
  bulletRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  bulletText: { flex: 1, fontSize: 14, color: Colors.slate700, lineHeight: 20 },

  // Dive specs
  specsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 20 },
  specChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  specChipText: { fontSize: 11, fontWeight: '700' },

  // Dive site cards
  diveSiteCard: {
    backgroundColor: Colors.slate50, borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: Colors.borderLight,
  },
  diveSiteHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4 },
  diveSiteName: { fontSize: 14, fontWeight: '700', color: Colors.slate900, flex: 1 },
  diffPill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  diffPillText: { fontSize: 10, fontWeight: '700', color: Colors.slate700, textTransform: 'capitalize' },
  diveSiteDepth: { fontSize: 12, color: Colors.slate500, marginBottom: 4 },
  diveSiteDesc: { fontSize: 12, color: Colors.slate600, lineHeight: 18 },

  // Gear rental
  gearBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#ecfdf5', padding: 10, borderRadius: 10, marginBottom: 10,
  },
  gearBannerNeutral: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.slate50, padding: 10, borderRadius: 10, marginBottom: 10,
    borderWidth: 1, borderColor: Colors.borderLight,
  },
  gearBannerText: { flex: 1, fontSize: 13, color: Colors.slate700 },
  gearItems: { gap: 6 },
  gearItemRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingVertical: 8,
    backgroundColor: Colors.white, borderRadius: 8,
    borderWidth: 1, borderColor: Colors.borderLight,
  },
  gearItemName: { fontSize: 13, color: Colors.slate700 },
  gearIncluded: { fontSize: 11, fontWeight: '700', color: '#10b981' },
  gearPrice: { fontSize: 12, color: Colors.slate500 },
  gearItemDash: { fontSize: 13, color: Colors.slate400 },

  // Accommodation
  roomCard: {
    backgroundColor: Colors.slate50, borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: Colors.borderLight,
  },
  roomHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  roomName: { fontSize: 14, fontWeight: '700', color: Colors.slate900 },
  roomPrice: { fontSize: 13, fontWeight: '700', color: Colors.cyan500 },
  roomMeta: { fontSize: 11, color: Colors.slate500, marginTop: 4 },
  roomDesc: { fontSize: 12, color: Colors.slate600, marginTop: 6, lineHeight: 18 },

  // Conditions grid
  condGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  condCell: {
    width: (SCREEN_W - 40 - 8) / 2, padding: 12, borderRadius: 12,
    backgroundColor: Colors.slate50, alignItems: 'flex-start',
  },
  condLabel: { fontSize: 11, color: Colors.slate500, fontWeight: '600', marginTop: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  condValue: { fontSize: 14, fontWeight: '700', color: Colors.slate900, marginTop: 2 },

  // Details grid (reused for "Details" section)
  infoGrid: { gap: 10 },
  infoCell: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: 12, borderRadius: 12, backgroundColor: Colors.slate50,
  },
  infoLabel: { fontSize: 11, color: Colors.slate500, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  infoValue: { fontSize: 13, color: Colors.slate900, fontWeight: '600', marginTop: 2 },

  // Directions
  dirRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  dirLabel: { fontSize: 11, color: Colors.slate500, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  dirValue: { fontSize: 13, color: Colors.slate700, marginTop: 2 },
  dirFreeText: {
    fontSize: 13, color: Colors.slate700, lineHeight: 20,
    backgroundColor: Colors.slate50, padding: 12, borderRadius: 10,
    borderWidth: 1, borderColor: Colors.borderLight,
  },

  // Operator
  operatorCard: {
    padding: 14, borderRadius: 14, backgroundColor: Colors.slate50,
    borderWidth: 1, borderColor: Colors.borderLight, marginBottom: 24,
  },
  operatorRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  opAvatar: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: Colors.cyan50, alignItems: 'center', justifyContent: 'center',
  },
  operatorName: { fontSize: 15, fontWeight: '700', color: Colors.slate900 },
  verifiedRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  verifiedText: { fontSize: 11, color: Colors.cyan500, fontWeight: '600' },

  // Reviews
  reviewStatsRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 12 },
  reviewAvg: { fontSize: 36, fontWeight: '800', color: Colors.slate900 },
  reviewStarsRow: { flexDirection: 'row', gap: 1 },
  reviewTotalText: { fontSize: 11, color: Colors.slate500, marginTop: 2 },
  writeReviewBtn: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999,
    backgroundColor: Colors.slate100,
  },
  writeReviewText: { fontSize: 12, fontWeight: '700', color: Colors.slate700 },
  distribution: { gap: 4, marginBottom: 12 },
  distRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  distLabel: { width: 12, fontSize: 11, color: Colors.slate500 },
  distTrack: { flex: 1, height: 6, borderRadius: 999, backgroundColor: Colors.slate100, overflow: 'hidden' },
  distFill: { height: '100%', backgroundColor: '#f59e0b' },
  distCount: { width: 28, textAlign: 'right', fontSize: 11, color: Colors.slate500 },

  reviewForm: {
    backgroundColor: Colors.slate50, borderRadius: 12, padding: 14, gap: 10,
    borderWidth: 1, borderColor: Colors.borderLight, marginBottom: 10,
  },
  reviewFormLabel: { fontSize: 12, fontWeight: '700', color: Colors.slate700 },
  reviewFormStars: { flexDirection: 'row', gap: 6 },
  reviewInput: {
    minHeight: 80, borderRadius: 10, padding: 10,
    backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.borderLight,
    fontSize: 13, color: Colors.slate900,
  },
  reviewCancelBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999 },
  reviewCancelText: { fontSize: 13, fontWeight: '600', color: Colors.slate600 },
  reviewSubmitBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: Colors.cyan400 },
  reviewSubmitText: { fontSize: 13, fontWeight: '700', color: Colors.white },

  reviewCard: { padding: 12, borderRadius: 12, backgroundColor: Colors.slate50, gap: 8 },
  reviewHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  reviewerAvatar: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: Colors.cyan100, alignItems: 'center', justifyContent: 'center',
  },
  reviewerInitial: { fontSize: 13, fontWeight: '700', color: Colors.cyan500 },
  reviewerName: { fontSize: 13, fontWeight: '700', color: Colors.slate900 },
  reviewStars: { flexDirection: 'row', alignItems: 'center', gap: 1, marginTop: 2 },
  reviewDate: { fontSize: 10, color: Colors.slate400, marginLeft: 4 },
  reviewComment: { fontSize: 13, color: Colors.slate700, lineHeight: 19 },
  helpfulBtn: {
    alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: Colors.white,
    borderWidth: 1, borderColor: Colors.borderLight,
  },
  helpfulText: { fontSize: 11, color: Colors.slate500, fontWeight: '600' },
  emptyReviews: { fontSize: 12, color: Colors.slate500, fontStyle: 'italic', marginTop: 4 },

  // Map
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  locationLabel: { fontSize: 13, color: Colors.slate600 },
  mapBtn: {
    alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12, backgroundColor: Colors.cyan50,
  },
  mapText: { fontSize: 13, fontWeight: '700', color: Colors.cyan500 },
  mapPreviewWrap: {
    width: '100%', height: 210, borderRadius: 16, overflow: 'hidden',
    borderWidth: 1, borderColor: Colors.borderLight, backgroundColor: Colors.slate50,
  },
  mapPreview: { width: '100%', height: '100%' },
  mapPreviewBadge: {
    position: 'absolute', bottom: 12, right: 12,
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.96)',
    shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  mapPreviewBadgeText: { fontSize: 12, fontWeight: '700', color: Colors.cyan500 },
  // MapFallback (web parity) — slate-100 panel + centred MapPin glyph,
  // "Map preview unavailable" label, with the "Open in Maps" badge
  // remaining tappable.
  mapFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
  },
  mapFallbackPinWrap: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: Colors.white,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 12,
  },
  mapFallbackLabel: { fontSize: 13, fontWeight: '600', color: Colors.slate600 },

  // Accordion (policies + FAQ)
  accordionCard: {
    backgroundColor: Colors.white, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.borderLight, overflow: 'hidden',
  },
  accordionHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 12,
  },
  accordionLabel: { fontSize: 13, fontWeight: '700', color: Colors.slate700, flex: 1, paddingRight: 8 },
  accordionBody: {
    paddingHorizontal: 14, paddingBottom: 14, paddingTop: 4,
    fontSize: 13, color: Colors.slate600, lineHeight: 20,
    borderTopWidth: 1, borderTopColor: Colors.borderLight,
  },
  policyFallbackText: { flex: 1, fontSize: 13, color: Colors.slate600 },

  // Buddies
  buddyCard: { width: 110, alignItems: 'center' },
  buddyAvatar: {
    width: 60, height: 60, borderRadius: 30,
    backgroundColor: Colors.cyan100, alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  buddyInitial: { fontSize: 20, fontWeight: '700', color: Colors.cyan500 },
  buddyName: { fontSize: 12, fontWeight: '700', color: Colors.slate900, marginTop: 6 },
  buddyCert: { fontSize: 10, color: Colors.slate500, marginTop: 1 },

  // CTA + toast + modal (unchanged)
  ctaBar: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 24,
    // Hairline top border returns now that the actual cream culprit
    // (styles.sheet's bottom-edge shadow bleed) is gone. Using
    // `StyleSheet.hairlineWidth` (~0.5 px on iOS retina) + `#e5e7eb`
    // (slate-200) reads as a clean visual separator between the
    // scrollable content and the sticky bar, NOT as the off-white
    // band the previous `Colors.borderLight` (#f1f5f9) used to be
    // mistaken for. Literal '#ffffff' on the bar's own surface so
    // there's no constant-import indirection.
    backgroundColor: '#ffffff',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e5e7eb',
    flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  ctaPriceLabel: { fontSize: 11, color: Colors.slate500, textTransform: 'uppercase', fontWeight: '600' },
  ctaPrice: { fontSize: 18, fontWeight: '700', color: Colors.slate900 },
  bookBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: Colors.cyan400, paddingHorizontal: 24, paddingVertical: 14,
    borderRadius: 999, minWidth: 160,
  },
  bookBtnText: { fontSize: 15, fontWeight: '700', color: Colors.white },
  tripIconBtn: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.cyan50, borderWidth: 1, borderColor: Colors.cyan100,
  },
  toast: {
    position: 'absolute', bottom: 100, left: 16, right: 16,
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999,
    backgroundColor: Colors.slate900,
  },
  toastText: { color: Colors.white, fontSize: 13, fontWeight: '600' },

  modalBackdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.5)', justifyContent: 'flex-end' },
  tripModalSheet: {
    backgroundColor: Colors.white, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 16, gap: 10, maxHeight: '70%',
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  modalTitle: { fontSize: 16, fontWeight: '700', color: Colors.slate900 },
  emptyTrips: { fontSize: 13, color: Colors.slate500, textAlign: 'center', paddingVertical: 16 },
  tripPickRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, backgroundColor: Colors.slate50,
  },
  tripPickName: { fontSize: 13, fontWeight: '700', color: Colors.slate900, flex: 1 },
  tripPickDest: { fontSize: 11, color: Colors.slate500 },
  newTripCta: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10,
    borderWidth: 1, borderColor: Colors.cyan500, borderStyle: 'dashed',
    justifyContent: 'center', marginTop: 4,
  },
  newTripText: { fontSize: 13, fontWeight: '700', color: Colors.cyan500 },
});
