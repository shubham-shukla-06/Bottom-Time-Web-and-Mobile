import { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import axios from 'axios';

const STORAGE_KEY = 'bt_attribution';
const ATTRIBUTION_TTL_DAYS = 30;
const VISITOR_KEY = 'bt_visitor_id';


function ensureVisitorId() {
  let v = '';
  try { v = localStorage.getItem(VISITOR_KEY) || ''; } catch (e) { /* private mode */ }
  if (!v) {
    v = (crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`);
    try { localStorage.setItem(VISITOR_KEY, v); } catch (e) { /* ignore */ }
  }
  return v;
}


/**
 * On listing-detail mount: read utm_* (or `?ref=`) from URL,
 *   1. ping /track/share-click  (fire-and-forget)
 *   2. persist attribution in localStorage so booking inherits it.
 * Cleared after 30 days.
 */
export function useShareTracking(listingId) {
  const [searchParams] = useSearchParams();
  const fired = useRef(false);

  useEffect(() => {
    if (!listingId || fired.current) return;
    const utm_source = searchParams.get('utm_source') || searchParams.get('ref') || '';
    const utm_medium = searchParams.get('utm_medium') || (searchParams.get('ref') ? 'share' : '');
    const utm_campaign = searchParams.get('utm_campaign') || '';
    const utm_content = searchParams.get('utm_content') || '';
    if (!utm_source && !utm_medium && !utm_campaign) return;
    fired.current = true;
    const visitor_id = ensureVisitorId();

    // Persist attribution for later booking
    try {
      const record = {
        listing_id: listingId,
        utm_source, utm_medium, utm_campaign, utm_content,
        ts: Date.now(),
      };
      const key = `${STORAGE_KEY}:${listingId}`;
      localStorage.setItem(key, JSON.stringify(record));
    } catch (e) { /* ignore */ }

    // Fire tracking ping (best effort)
    axios.post('/track/share-click', {
      listing_id: listingId,
      utm_source, utm_medium, utm_campaign, utm_content,
      visitor_id,
      referrer: document.referrer || '',
    }).catch(() => { /* swallow */ });
  }, [listingId, searchParams]);
}


/** Read stored attribution for a listing (used at booking time). */
export function getStoredAttribution(listingId) {
  if (!listingId) return null;
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY}:${listingId}`);
    if (!raw) return null;
    const record = JSON.parse(raw);
    const ageDays = (Date.now() - (record.ts || 0)) / (1000 * 60 * 60 * 24);
    if (ageDays > ATTRIBUTION_TTL_DAYS) {
      localStorage.removeItem(`${STORAGE_KEY}:${listingId}`);
      return null;
    }
    return {
      utm_source: record.utm_source,
      utm_medium: record.utm_medium,
      utm_campaign: record.utm_campaign,
      utm_content: record.utm_content,
    };
  } catch (e) {
    return null;
  }
}
