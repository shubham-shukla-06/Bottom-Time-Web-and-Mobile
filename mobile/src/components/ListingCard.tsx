/**
 * ListingCard — Discover/Trip cards.
 * Mirrors web `frontend/src/components/ListingCard.js`:
 *   • Type pill overlay top-left (color-coded by listing_type).
 *   • Difficulty pill overlay top-right (white pill, slate text).
 *   • Soft gradient overlay at the bottom of the image for legibility.
 * Mobile-specific extras:
 *   • Photo carousel (horizontal pager + dots) when `photos.length > 1`.
 *   • `overflow: 'hidden'` on the image wrapper so a tall/wide source
 *     can't bleed past the card's rounded edges.
 * Prices use `useCurrency().format` so the card converts to the user's
 * selected display currency (see hooks/useCurrency.ts).
 */
import React, { useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, FlatList, Dimensions, NativeSyntheticEvent, NativeScrollEvent } from 'react-native';
import { Image } from 'expo-image';
import Icon from './Icon';
import { Colors } from '../constants/colors';
import useCurrency from '../hooks/useCurrency';

const SCREEN_W = Dimensions.get('window').width;

const TYPE_STYLES: Record<string, { bg: string; fg: string; label: string }> = {
  // Match web TYPE_STYLES verbatim.
  dives:        { bg: '#eff6ff', fg: '#1d4ed8', label: 'Fun Dive' },
  day_dive:     { bg: '#eff6ff', fg: '#1d4ed8', label: 'Day Dive' },
  courses:      { bg: '#fffbeb', fg: '#b45309', label: 'Course' },
  course:       { bg: '#fffbeb', fg: '#b45309', label: 'Course' },
  liveaboards:  { bg: '#f5f3ff', fg: '#6d28d9', label: 'Liveaboard' },
  liveaboard:   { bg: '#f5f3ff', fg: '#6d28d9', label: 'Liveaboard' },
  day_trips:    { bg: '#ecfdf5', fg: '#047857', label: 'Land-based Trip' },
  trip:         { bg: '#ecfdf5', fg: '#047857', label: 'Trip' },
  snorkeling:   { bg: '#f0f9ff', fg: '#0369a1', label: 'Snorkeling' },
};

interface Photo { url: string }
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
  photos?: Photo[];
  difficulty?: string;
  operator_name?: string;
}

interface Props {
  listing: Listing;
  onPress: () => void;
  /**
   * `compact` reduces image height + tightens the bottom meta block so
   * the card fits in a 220×260 horizontal-rail tile (used by the
   * "You might also like" carousel on listing-detail). `default` keeps
   * the full Discover-grid sizing.
   */
  variant?: 'default' | 'compact';
}

function gatherPhotos(listing: Listing): string[] {
  const out: string[] = [];
  if (Array.isArray(listing.photos)) {
    for (const p of listing.photos) if (p?.url) out.push(p.url);
  }
  if (Array.isArray(listing.images)) {
    for (const u of listing.images) if (u) out.push(u);
  }
  if (listing.image_url) out.push(listing.image_url);
  // De-duplicate while preserving order.
  const seen = new Set<string>();
  return out.filter((u) => (seen.has(u) ? false : (seen.add(u), true)));
}

export default function ListingCard({ listing, onPress, variant = 'default' }: Props) {
  const { format } = useCurrency();
  const photos = gatherPhotos(listing);
  const single = photos.length <= 1;
  const [activeIdx, setActiveIdx] = useState(0);
  const flatRef = useRef<FlatList<string> | null>(null);

  // Compact variant trims the image to 150 px tall so the title + price
  // meta line both fit comfortably within a 260 px card height.
  const compact = variant === 'compact';
  const imgH = compact ? 150 : 240;

  const sourceCcy = listing.currency || 'USD';
  const title = listing.title || listing.name || 'Untitled';
  const typeKey = (listing.listing_type || listing.type || '').toLowerCase();
  const typeStyle = TYPE_STYLES[typeKey];
  const typeLabel = typeStyle?.label || (listing.listing_type || listing.type || '');

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    // Width may be smaller than screen when the card is in a horizontal scroll
    // (e.g. Related). Compute from viewport width of the FlatList item.
    const w = e.nativeEvent.layoutMeasurement.width || SCREEN_W;
    setActiveIdx(Math.round(e.nativeEvent.contentOffset.x / w));
  };

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      activeOpacity={0.9}
      testID={`listing-card-${listing.id}`}
    >
      {/* Inner clip — keeps the rounded-corner mask on its own View so
          the parent can render the soft drop-shadow OUTSIDE the clip
          (shadows + overflow:hidden are mutually exclusive on RN). */}
      <View style={styles.cardClip}>
      {/* Image area — `overflow:'hidden'` here is critical: stops tall
          source images from bleeding past the card's rounded top edge.
          Inline height override lets the `compact` variant shrink to 150
          px without forking the entire StyleSheet. */}
      <View style={[styles.imageWrap, { height: imgH }]}>        {single ? (
          <Image
            source={{ uri: photos[0] || 'https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=400&q=60' }}
            style={[styles.image, { height: imgH }]}
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={200}
          />
        ) : (
          <>
            <FlatList
              ref={flatRef}
              data={photos}
              keyExtractor={(u, i) => `${i}-${u.slice(0, 24)}`}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onScroll={onScroll}
              scrollEventThrottle={32}
              renderItem={({ item }) => (
                <View style={{ width: SCREEN_W }}>
                  <Image
                    source={{ uri: item }}
                    style={[styles.image, { height: imgH }]}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                    transition={200}
                  />
                </View>
              )}
              // The FlatList inherits this card's image area width via
              // styles.image at runtime — using SCREEN_W as the per-item
              // width works for full-bleed Discover cards. For nested
              // horizontal carousels (Related, max width 240) the parent
              // clips at its own width.
              testID={`listing-card-carousel-${listing.id}`}
            />
            <View style={styles.dotRow} pointerEvents="none">
              {photos.map((_, i) => (
                <View key={i} style={[styles.dot, activeIdx === i && styles.dotActive]} />
              ))}
            </View>
          </>
        )}

        {/* Bottom gradient for legibility — pure RN, no gradient lib needed:
            a translucent dark band at the bottom of the image. */}
        <View style={styles.legibilityShade} pointerEvents="none" />

        {/* Type pill — top-left */}
        {typeLabel ? (
          <View
            style={[
              styles.typePill,
              typeStyle ? { backgroundColor: typeStyle.bg } : { backgroundColor: Colors.slate100 },
            ]}
            testID={`listing-card-type-${listing.id}`}
          >
            <Text style={[styles.typePillText, typeStyle ? { color: typeStyle.fg } : null]}>
              {typeLabel}
            </Text>
          </View>
        ) : null}

        {/* Difficulty pill — top-right */}
        {listing.difficulty ? (
          <View style={styles.diffPill} testID={`listing-card-diff-${listing.id}`}>
            <Text style={styles.diffPillText}>
              {listing.difficulty.charAt(0).toUpperCase() + listing.difficulty.slice(1)}
            </Text>
          </View>
        ) : null}
      </View>

      <View style={[styles.content, compact && styles.contentCompact]}>
        <Text style={[styles.title, compact && styles.titleCompact]} numberOfLines={2}>{title}</Text>
        <View style={[styles.meta, compact && styles.metaCompact]}>
          {(listing.location || listing.country) ? (
            <View style={styles.locRow}>
              <Icon name="location-outline" size={11} color={Colors.slate500} />
              <Text style={styles.location} numberOfLines={1}>
                {[listing.location, listing.country].filter(Boolean).join(', ')}
              </Text>
            </View>
          ) : null}
        </View>
        <View style={[styles.footer, compact && styles.footerCompact]}>
          <Text style={[styles.price, compact && styles.priceCompact]}>
            {listing.price != null ? format(listing.price, sourceCcy) : '—'}
          </Text>
          {listing.rating != null ? (
            <View style={styles.ratingRow}>
              <Icon name="star" size={11} color="#f59e0b" />
              <Text style={styles.rating}>{Number(listing.rating).toFixed(1)}</Text>
              {listing.review_count != null ? (
                <Text style={styles.reviewCount}>({listing.review_count})</Text>
              ) : null}
            </View>
          ) : null}
        </View>
      </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  // Card outer — owns the drop-shadow. `overflow: 'visible'` is
  // critical so the shadow can render OUTSIDE the rounded edge. The
  // visible chrome (border + clipping) lives on `cardClip` below.
  // Radius 24 matches the bottom-tab pill's "soft rounded" language.
  card: {
    backgroundColor: 'transparent',
    borderRadius: 24,
    overflow: 'visible',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  cardClip: {
    backgroundColor: Colors.white,
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  imageWrap: {
    width: '100%',
    height: 240,
    overflow: 'hidden',           // ← stops upper-bleed of tall source images
    backgroundColor: Colors.slate100,
    position: 'relative',
  },
  image: { width: '100%', height: 240, backgroundColor: Colors.slate100 },
  legibilityShade: {
    position: 'absolute', left: 0, right: 0, bottom: 0, height: 60,
    backgroundColor: 'rgba(0,0,0,0.18)',
  },

  // Type pill (top-left) — mirrors web's `top-3 left-3 px-3 py-1 rounded-full`.
  typePill: {
    position: 'absolute', top: 10, left: 10,
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 999,
    shadowColor: '#000', shadowOpacity: 0.12, shadowOffset: { width: 0, height: 1 }, shadowRadius: 3,
    elevation: 2,
  },
  typePillText: { fontSize: 11, fontWeight: '700' },

  // Difficulty pill (top-right) — white frosted, slate text.
  diffPill: {
    position: 'absolute', top: 10, right: 10,
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.92)',
    shadowColor: '#000', shadowOpacity: 0.12, shadowOffset: { width: 0, height: 1 }, shadowRadius: 3,
    elevation: 2,
  },
  diffPillText: { fontSize: 11, fontWeight: '700', color: Colors.slate700 },

  dotRow: {
    position: 'absolute', bottom: 10, left: 0, right: 0,
    flexDirection: 'row', justifyContent: 'center', gap: 5,
  },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.55)' },
  dotActive: { width: 16, backgroundColor: Colors.white },

  content: { padding: 14 },
  // Compact-variant overrides: padding 10, no footer divider, smaller
  // title — keeps the 220×240 related-rail card from clipping. Target:
  // 150 (image) + 10 + ~36 (title 2-line) + 4 (meta gap) + ~16 (meta) +
  // 6 + 18 (price) + 10 = ~240 px max.
  contentCompact: { paddingHorizontal: 10, paddingTop: 10, paddingBottom: 10 },
  title: { fontSize: 15, fontWeight: '700', color: Colors.slate900, marginBottom: 6 },
  titleCompact: { fontSize: 13, lineHeight: 17, marginBottom: 4 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' },
  metaCompact: { marginBottom: 4 },
  locRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  location: { fontSize: 12, color: Colors.slate500, maxWidth: 200 },
  footer: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingTop: 8, borderTopWidth: 1, borderTopColor: Colors.borderLight,
  },
  // Compact-variant footer: no top border, less padding — buys back the
  // vertical space we need to stay under 240 px.
  footerCompact: { paddingTop: 4, borderTopWidth: 0 },
  price: { fontSize: 16, fontWeight: '700', color: Colors.slate900 },
  priceCompact: { fontSize: 14 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  rating: { fontSize: 13, color: Colors.slate800, fontWeight: '700' },
  reviewCount: { fontSize: 11, color: Colors.slate400 },
});
