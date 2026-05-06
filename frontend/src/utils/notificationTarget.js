/**
 * notificationTarget — resolve a notification into a precise navigation target.
 *
 * Each notification carries a `type` (e.g. 'booking_new', 'new_message') plus a
 * `data` object holding the IDs of related resources (booking_id, thread_id,
 * listing_id, …). This module turns that into:
 *
 *   { path: '/operator?tab=bookings&highlight=abc' }                → navigate
 *   { error: 'This conversation no longer exists.' }                → toast
 *
 * Where it makes sense, we GET the resource first and surface a friendly toast
 * if it 404s — so the user is never dropped onto an empty/broken page after
 * clicking a stale notification (the resource may have been deleted by the
 * other party). Endpoints that don't expose a public read are skipped — we
 * navigate optimistically and let the destination page render its own empty
 * state.
 */
import axios from 'axios';

async function exists(url) {
  try {
    await axios.get(url);
    return { ok: true };
  } catch (e) {
    if (e?.response?.status === 404) return { ok: false, missing: true };
    // Network / auth / server errors — don't block the user, navigate optimistically.
    return { ok: true };
  }
}

export async function resolveNotificationTarget(n) {
  const data = n?.data || {};

  switch (n?.type) {
    case 'new_message': {
      const threadId = data.thread_id;
      if (!threadId) return { path: '/community?tab=messages' };
      const r = await exists(`/messages/${threadId}`);
      if (r.missing) return { error: 'This conversation no longer exists.' };
      return { path: `/community?tab=messages&thread=${encodeURIComponent(threadId)}` };
    }

    case 'connection_request':
    case 'connection_accepted': {
      const userId = data.from_user_id || data.user_id;
      if (userId) return { path: `/user/${encodeURIComponent(userId)}` };
      return { path: '/community?tab=buddies' };
    }

    case 'booking_new': {
      const bookingId = data.booking_id;
      const qs = bookingId ? `&highlight=${encodeURIComponent(bookingId)}` : '';
      return { path: `/operator?tab=bookings${qs}` };
    }

    case 'booking_update': {
      const bookingId = data.booking_id;
      const qs = bookingId ? `?highlight=${encodeURIComponent(bookingId)}` : '';
      return { path: `/bookings${qs}` };
    }

    case 'payment_received': {
      const bookingId = data.booking_id;
      const qs = bookingId ? `&highlight=${encodeURIComponent(bookingId)}` : '';
      return { path: `/operator?tab=bookings${qs}` };
    }

    case 'listing_approved':
    case 'listing_rejected': {
      const listingId = data.listing_id;
      if (!listingId) return { path: '/operator?tab=listings' };
      const r = await exists(`/listings/${listingId}`);
      if (r.missing) return { error: 'This listing is no longer available.' };
      return { path: `/listing/${encodeURIComponent(listingId)}` };
    }

    case 'operator_application': {
      const appId = data.application_id;
      const qs = appId ? `&highlight=${encodeURIComponent(appId)}` : '';
      return { path: `/admin?section=operator-apps${qs}` };
    }

    case 'operator_approved':
      return { path: '/operator' };

    case 'operator_declined':
      return { path: '/profile' };

    case 'trip_shared': {
      const tripId = data.trip_id;
      if (!tripId) return { path: '/trips' };
      const r = await exists(`/trips/${tripId}`);
      if (r.missing) return { error: 'This trip has been removed.' };
      return { path: `/trips/${encodeURIComponent(tripId)}` };
    }

    case 'dive_like': {
      // Surface-log reactions carry log_id; activity-feed reactions carry item_id.
      if (data.log_id) return { path: `/surface-log?highlight=${encodeURIComponent(data.log_id)}` };
      if (data.item_id) return { path: `/feed?highlight=${encodeURIComponent(data.item_id)}` };
      return { path: '/feed' };
    }

    case 'order_update': {
      const orderId = data.order_id;
      const qs = orderId ? `?highlight=${encodeURIComponent(orderId)}` : '';
      return { path: `/orders${qs}` };
    }

    case 'warning':
    case 'suspended':
      return { path: '/profile' };

    default:
      return { path: '/notifications' };
  }
}
