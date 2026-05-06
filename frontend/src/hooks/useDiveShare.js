import { useState, useRef, useCallback, useEffect } from 'react';
import axios from 'axios';
import { toPng } from 'html-to-image';
import { toast } from 'sonner';

const THEMES = [
  { id: 'glass', label: 'Glass', transparent: true, bg: '', bgStyle: 'rgba(0,0,0,0.45)', text: 'text-white', sub: 'text-white', accent: 'text-cyan-400', border: 'border-white/15', pill: 'bg-white/20', profileStroke: '#22d3ee', borderColor: 'rgba(255,255,255,0.15)' },
  { id: 'dark', label: 'Dark', transparent: false, bg: '', bgStyle: 'linear-gradient(145deg, #0f172a 0%, #1e293b 50%, #0c4a6e 100%)', text: 'text-white', sub: 'text-white/60', accent: 'text-cyan-400', border: 'border-slate-700', pill: 'bg-white/10', profileStroke: '#22d3ee', borderColor: 'rgba(51,65,85,0.6)', statColor: '#22d3ee' },
  { id: 'light', label: 'Light', transparent: false, bg: '', bgStyle: 'linear-gradient(145deg, #ffffff 0%, #f1f5f9 50%, #e0f2fe 100%)', text: 'text-slate-900', sub: 'text-slate-500', accent: 'text-cyan-600', border: 'border-slate-200', pill: 'bg-slate-100', profileStroke: '#0e7490', borderColor: 'rgba(226,232,240,0.8)', statColor: '#0891b2' },
];

function parseDiveCard(cardData, dive) {
  const card = cardData?.card || dive;
  return {
    siteName: card?.site_name || dive.site_name || 'Unknown Site',
    location: card?.location || dive.location || '',
    date: (card?.date || dive.date || '')?.slice(0, 10),
    depth: card?.max_depth || dive.max_depth || 0,
    duration: card?.duration || dive.duration || 0,
    temp: card?.water_temp || dive.water_temp,
    gasStr: card?.gas_mix || dive.gas_mix,
    diveType: card?.dive_type || dive.dive_type,
    buddy: card?.buddy || dive.buddy,
    diverName: card?.diver_name || '',
    vis: card?.visibility || dive.visibility,
    rating: card?.rating || dive.rating || 0,
    avgDepth: card?.avg_depth || dive.avg_depth,
    current: card?.current || dive.current,
    suitType: card?.suit_type || dive.suit_type,
    weight: card?.weight || dive.weight,
    tags: card?.tags || dive.tags || [],
    species: card?.species || dive.species_sighted || [],
    profile: card?.profile || dive.profile || [],
  };
}

export function useDiveShare(dive) {
  const [cardData, setCardData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [exporting, setExporting] = useState(null);
  const [theme, setTheme] = useState(THEMES[0]);
  const overlayRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await axios.get(`/dive-log/${dive.id}/share-card`);
        if (!cancelled) setCardData(res.data);
      } catch { /* use dive data directly */ }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [dive.id]);

  const parsed = parseDiveCard(cardData, dive);

  const exportToImage = useCallback(async () => {
    if (!overlayRef.current) return null;
    const bgColor = theme.transparent ? 'rgba(0,0,0,0)' : undefined;
    return toPng(overlayRef.current, { backgroundColor: bgColor, pixelRatio: 2 });
  }, [theme.transparent]);

  const downloadPNG = useCallback(async () => {
    setExporting('png');
    try {
      const dataUrl = await exportToImage();
      if (!dataUrl) return;
      const blob = await (await fetch(dataUrl)).blob();
      const file = new File([blob], `dive_${parsed.siteName.replace(/\s+/g, '_')}_${parsed.date}.png`, { type: 'image/png' });

      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: `Dive at ${parsed.siteName}` });
      } else {
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = file.name;
        a.click();
      }
      toast.success('Image saved!');
    } catch { /* user may have cancelled share */ }
    finally { setExporting(null); }
  }, [exportToImage, parsed.siteName, parsed.date]);

  const shareNative = useCallback(async () => {
    try {
      const dataUrl = await exportToImage();
      if (!dataUrl) return;
      const blob = await (await fetch(dataUrl)).blob();
      const file = new File([blob], `dive_${parsed.siteName.replace(/\s+/g, '_')}.png`, { type: 'image/png' });
      const shareText = `${parsed.siteName} — ${parsed.depth}m deep, ${parsed.duration}min #BottomTime #ScubaDiving`;

      if (navigator.share) {
        try {
          if (navigator.canShare?.({ files: [file] })) {
            await navigator.share({ files: [file], title: `Dive at ${parsed.siteName}`, text: shareText });
            return;
          }
        } catch { /* file share not supported */ }
        try {
          await navigator.share({ title: `Dive at ${parsed.siteName}`, text: shareText, url: window.location.href });
          return;
        } catch { /* user cancelled */ }
      }

      await navigator.clipboard.writeText(shareText);
      setCopied(true);
      toast.success('Copied to clipboard!');
      setTimeout(() => setCopied(false), 2000);
    } catch { toast.error('Share failed'); }
  }, [exportToImage, parsed.siteName, parsed.depth, parsed.duration]);

  const copyText = useCallback(() => {
    const text = cardData?.share_text || `${parsed.siteName} — ${parsed.depth}m/${parsed.duration}min #BottomTime #ScubaDiving`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success('Copied!');
    setTimeout(() => setCopied(false), 2000);
  }, [cardData?.share_text, parsed.siteName, parsed.depth, parsed.duration]);

  return {
    loading, copied, exporting, theme, setTheme, overlayRef,
    parsed, cardData, THEMES,
    downloadPNG, shareNative, copyText,
  };
}

export { THEMES };
