import { useState, useRef, useCallback } from 'react';
import { toPng } from 'html-to-image';
import { toast } from 'sonner';

/**
 * Three theme variants for listing share cards — mirrors useDiveShare:
 *  - Glass: transparent (overlay onto user's own story photo)
 *  - Dark:  navy gradient stand-alone (best for Stories at night)
 *  - Light: cream/cyan stand-alone (best for daytime feeds)
 *
 * Photo-aware: when the listing has a hero image, the Glass + Dark themes
 * use it as a backdrop. Light theme drops the photo for a clean editorial look.
 */
export const LISTING_SHARE_THEMES = [
  {
    id: 'glass',
    label: 'Glass',
    transparent: true,
    showPhoto: true,
    bgFill: 'rgba(0,0,0,0.45)',
    text: '#ffffff',
    sub: 'rgba(255,255,255,0.78)',
    accent: '#22d3ee',
    border: 'rgba(255,255,255,0.18)',
    plate: 'rgba(15,23,42,0.32)',
  },
  {
    id: 'dark',
    label: 'Dark',
    transparent: false,
    showPhoto: true,
    bgFill: 'linear-gradient(160deg, #0f172a 0%, #1e293b 55%, #0c4a6e 100%)',
    text: '#ffffff',
    sub: 'rgba(255,255,255,0.7)',
    accent: '#22d3ee',
    border: 'rgba(51,65,85,0.5)',
    plate: 'rgba(15,23,42,0.55)',
  },
  {
    id: 'light',
    label: 'Light',
    transparent: false,
    showPhoto: false,
    bgFill: 'linear-gradient(155deg, #ffffff 0%, #f1f5f9 50%, #e0f2fe 100%)',
    text: '#0f172a',
    sub: '#64748b',
    accent: '#0891b2',
    border: 'rgba(226,232,240,0.85)',
    plate: 'rgba(255,255,255,0.0)',
  },
];

const TAGLINE = 'THE OCEAN IS CALLING.';

function parseListing(listing) {
  const photo = (listing?.photos?.[0]?.url) || listing?.image_url || null;
  const apiBase = process.env.REACT_APP_BACKEND_URL || '';
  const photoUrl = photo?.startsWith('/') ? `${apiBase}${photo}` : photo;
  const loc = (listing?.location || '').trim();
  const country = (listing?.country || '').trim();
  let location = '';
  if (country && country.toLowerCase().includes(loc.toLowerCase()) && loc) location = loc;
  else if (country && loc.toLowerCase().includes(country.toLowerCase())) location = loc;
  else if (loc && country) location = `${loc}, ${country}`;
  else location = loc || country;
  return {
    title: listing?.title || listing?.name || 'Untitled Listing',
    location,
    photoUrl,
    tagline: TAGLINE,
  };
}

export function useListingShare(listing) {
  const [theme, setTheme] = useState(LISTING_SHARE_THEMES[1]); // default Dark
  const [exporting, setExporting] = useState(false);
  const overlayRef = useRef(null);
  const parsed = parseListing(listing);

  const exportToImage = useCallback(async () => {
    if (!overlayRef.current) return null;
    const bg = theme.transparent ? 'rgba(0,0,0,0)' : undefined;
    return toPng(overlayRef.current, {
      backgroundColor: bg,
      pixelRatio: 3,           // 3× for crisp Retina exports
      cacheBust: true,
    });
  }, [theme.transparent]);

  const downloadPNG = useCallback(async () => {
    setExporting(true);
    try {
      const dataUrl = await exportToImage();
      if (!dataUrl) return;
      const blob = await (await fetch(dataUrl)).blob();
      const slug = parsed.title.replace(/\s+/g, '_').toLowerCase().replace(/[^a-z0-9_-]/g, '');
      const file = new File([blob], `bottomtime_${slug}_${theme.id}.png`, { type: 'image/png' });
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: parsed.title });
      } else {
        const a = document.createElement('a');
        a.href = dataUrl; a.download = file.name;
        document.body.appendChild(a); a.click(); a.remove();
      }
      toast.success('Image saved!');
    } catch {
      // user cancelled or share unsupported → fall back already attempted
    } finally { setExporting(false); }
  }, [exportToImage, parsed.title, theme.id]);

  return { theme, setTheme, exporting, overlayRef, parsed, THEMES: LISTING_SHARE_THEMES, downloadPNG };
}
