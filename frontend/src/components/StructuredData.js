import { useEffect, useMemo } from 'react';

/**
 * Renders a JSON-LD <script> in the document head for SEO rich snippets.
 * Supports Product, TouristTrip, ItemList, BreadcrumbList, and any schema.org type.
 *
 * Usage:
 *   <StructuredData id="listing-d3d3" data={{ "@context": "https://schema.org", "@type": "Product", ... }} />
 */
export default function StructuredData({ id, data }) {
  const json = useMemo(() => {
    if (!data) return '';
    try {
      return JSON.stringify(data);
    } catch (e) {
      return '';
    }
  }, [data]);

  useEffect(() => {
    if (!json) return undefined;
    const elementId = `ld-${id || 'sd'}`;
    let el = document.getElementById(elementId);
    if (!el) {
      el = document.createElement('script');
      el.type = 'application/ld+json';
      el.id = elementId;
      document.head.appendChild(el);
    }
    el.textContent = json;
    return () => {
      const cur = document.getElementById(elementId);
      if (cur && cur.parentNode) cur.parentNode.removeChild(cur);
    };
  }, [id, json]);

  return null;
}


/** Build a Product + TouristTrip combo for a single listing. */
export function buildListingSchema(listing, origin) {
  if (!listing) return null;
  const url = `${origin}/listing/${listing.id}`;
  const photoUrls = (listing.photos || [])
    .map(p => (typeof p === 'string' ? p : p?.url))
    .filter(Boolean);
  const images = photoUrls.length > 0 ? photoUrls : (listing.image_url ? [listing.image_url] : []);

  const product = {
    "@context": "https://schema.org",
    "@type": "Product",
    "name": listing.name || listing.title,
    "description": (listing.description || '').slice(0, 500),
    "url": url,
    "image": images,
    "brand": listing.operator_name ? { "@type": "Organization", "name": listing.operator_name } : undefined,
    "category": listing.type,
    "offers": listing.price ? {
      "@type": "Offer",
      "price": listing.price,
      "priceCurrency": listing.currency || "USD",
      "availability": "https://schema.org/InStock",
      "url": url,
    } : undefined,
    "aggregateRating": (listing.rating && listing.review_count) ? {
      "@type": "AggregateRating",
      "ratingValue": listing.rating,
      "reviewCount": listing.review_count,
      "bestRating": 5,
      "worstRating": 1,
    } : undefined,
  };

  const trip = {
    "@context": "https://schema.org",
    "@type": "TouristTrip",
    "name": listing.name || listing.title,
    "description": (listing.description || '').slice(0, 500),
    "url": url,
    "image": images,
    "touristType": listing.difficulty,
    "itinerary": (listing.dive_sites || []).filter(s => s?.name).map(s => ({
      "@type": "Place",
      "name": s.name,
      "description": s.description || undefined,
    })),
    "provider": listing.operator_name ? {
      "@type": "Organization",
      "name": listing.operator_name,
    } : undefined,
    "offers": listing.price ? {
      "@type": "Offer",
      "price": listing.price,
      "priceCurrency": listing.currency || "USD",
    } : undefined,
  };

  // Strip undefined keys
  const clean = (obj) => {
    if (Array.isArray(obj)) return obj.map(clean).filter(x => x !== undefined && x !== null);
    if (obj && typeof obj === 'object') {
      const out = {};
      Object.entries(obj).forEach(([k, v]) => {
        const cv = clean(v);
        if (cv !== undefined && cv !== null && cv !== '' && !(Array.isArray(cv) && cv.length === 0)) {
          out[k] = cv;
        }
      });
      return out;
    }
    return obj;
  };

  return { product: clean(product), trip: clean(trip) };
}


/** Build a BreadcrumbList for a listing detail page. */
export function buildBreadcrumbSchema(items, origin) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": items.map((it, i) => ({
      "@type": "ListItem",
      "position": i + 1,
      "name": it.name,
      "item": it.path ? `${origin}${it.path}` : undefined,
    })),
  };
}


/** Build an ItemList of listings (for Discover/search results). */
export function buildListingsItemListSchema(listings, origin) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "itemListElement": (listings || []).slice(0, 20).map((l, i) => ({
      "@type": "ListItem",
      "position": i + 1,
      "url": `${origin}/listing/${l.id}`,
      "name": l.name || l.title,
    })),
  };
}


/** Update document <title> and meta[name=description] tags. */
export function usePageMeta({ title, description, image, imageWidth, imageHeight, url } = {}) {
  useEffect(() => {
    if (title) document.title = title;
    const setMeta = (selector, attr, value) => {
      if (value === undefined || value === null || value === '') return;
      let tag = document.querySelector(selector);
      if (!tag) {
        tag = document.createElement('meta');
        const [, key] = selector.match(/\[([^=]+)=/) || [];
        if (key) {
          const valKey = selector.match(/="([^"]+)"/)?.[1];
          if (valKey) tag.setAttribute(key, valKey);
        }
        document.head.appendChild(tag);
      }
      tag.setAttribute(attr, String(value));
    };
    setMeta('meta[name="description"]', 'content', description);
    setMeta('meta[property="og:title"]', 'content', title);
    setMeta('meta[property="og:description"]', 'content', description);
    setMeta('meta[property="og:image"]', 'content', image);
    setMeta('meta[property="og:image:width"]', 'content', imageWidth);
    setMeta('meta[property="og:image:height"]', 'content', imageHeight);
    setMeta('meta[property="og:image:type"]', 'content', image ? 'image/png' : undefined);
    setMeta('meta[property="og:url"]', 'content', url);
    setMeta('meta[property="og:type"]', 'content', 'product');
    setMeta('meta[name="twitter:card"]', 'content', 'summary_large_image');
    setMeta('meta[name="twitter:title"]', 'content', title);
    setMeta('meta[name="twitter:description"]', 'content', description);
    setMeta('meta[name="twitter:image"]', 'content', image);
  }, [title, description, image, imageWidth, imageHeight, url]);
}
