/**
 * Role-aware share-text builder for listings, mirroring the web
 * `ShareModal` / `useListingShare` defaults. Mobile uses the native
 * `Share.share({ message, url, title })` and `expo-sharing`, both of
 * which accept a free-text caption — so we build one message per user
 * role (diver / operator / instructor / guest).
 *
 * Web reference:
 *   • `frontend/src/components/ShareModal.js` — WhatsApp/Telegram/Email
 *     all pipe `${shareText} ${url}` into the open-URL helpers.
 *   • `frontend/src/hooks/useListingShare.js` — tagline
 *     "THE OCEAN IS CALLING." used in image cards.
 *
 * The shape is intentionally short (≤ 1 line + tagline + URL) so it
 * unfurls cleanly on WhatsApp and is paste-safe to SMS.
 */
type Role = 'diver' | 'operator' | 'instructor' | 'guest' | string | null | undefined;

interface ListingLike {
  id?: string;
  title?: string;
  name?: string;
  description?: string;
  location?: string;
  country?: string;
  operator_name?: string;
  price?: number;
  currency?: string;
}

function shortDesc(listing: ListingLike): string {
  const raw = (listing.description || '').replace(/\s+/g, ' ').trim();
  if (!raw) return '';
  return raw.length > 120 ? `${raw.slice(0, 117).trimEnd()}…` : raw;
}

function whereLine(listing: ListingLike): string {
  const loc = (listing.location || '').trim();
  const c = (listing.country || '').trim();
  if (loc && c && !c.toLowerCase().includes(loc.toLowerCase())) return `${loc}, ${c}`;
  return loc || c;
}

/**
 * Build a role-flavoured share caption.
 * Always ends WITHOUT the URL — the URL is passed as a separate field
 * to `Share.share` so iOS/Android can attach it as a link object.
 */
export function buildListingShareText(listing: ListingLike, role: Role): string {
  const title = listing.title || listing.name || 'Dive experience';
  const where = whereLine(listing);
  const desc = shortDesc(listing);
  const op = (listing.operator_name || '').trim();

  switch (role) {
    case 'operator':
      // Operators are SHARING THEIR OWN LISTING — promotional.
      return [
        `Book with us — ${title}${where ? ' · ' + where : ''}.`,
        desc,
        'THE OCEAN IS CALLING.',
      ].filter(Boolean).join('\n');

    case 'instructor':
      // Instructors recommend listings to students — endorsement tone.
      return [
        `Recommended dive: ${title}${where ? ' (' + where + ')' : ''}.`,
        desc,
        op ? `Operated by ${op}.` : '',
        'THE OCEAN IS CALLING.',
      ].filter(Boolean).join('\n');

    case 'diver':
      // Divers share with friends — first-person enthusiasm.
      return [
        `Check this out — ${title}${where ? ' in ' + where : ''}.`,
        desc,
        'THE OCEAN IS CALLING.',
      ].filter(Boolean).join('\n');

    case 'guest':
    default:
      // Guest / unknown role — neutral.
      return [
        `${title}${where ? ' · ' + where : ''}.`,
        desc,
        'THE OCEAN IS CALLING.',
      ].filter(Boolean).join('\n');
  }
}
