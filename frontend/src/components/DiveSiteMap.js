import { useState, useEffect, useMemo, memo } from 'react';
import { Marker, InfoWindow } from '@vis.gl/react-google-maps';
import SafeMapWrapper from './SafeMapWrapper';
import axios from 'axios';

const KNOWN_COORDS = {
  'bali': { lat: -8.34, lng: 115.09 }, 'indonesia': { lat: -2.5, lng: 118.0 }, 'maldives': { lat: 3.2, lng: 73.22 },
  'egypt': { lat: 27.18, lng: 33.83 }, 'red sea': { lat: 27.18, lng: 33.83 }, 'thailand': { lat: 9.0, lng: 98.0 },
  'mexico': { lat: 20.4, lng: -87.3 }, 'australia': { lat: -16.9, lng: 145.7 }, 'philippines': { lat: 10.3, lng: 123.9 },
  'malaysia': { lat: 4.5, lng: 118.6 }, 'malta': { lat: 35.9, lng: 14.4 }, 'belize': { lat: 17.5, lng: -87.8 },
  'palau': { lat: 7.35, lng: 134.47 }, 'micronesia': { lat: 7.35, lng: 134.47 },
};

const getCoords = (site) => {
  if (site.gps_lat && site.gps_lng) return { lat: site.gps_lat, lng: site.gps_lng };
  const loc = (site.location || '').toLowerCase();
  for (const [key, coords] of Object.entries(KNOWN_COORDS)) {
    if (loc.includes(key)) return coords;
  }
  return null;
};

function SiteMarker({ site, onClick, selected, onClose }) {
  return (
    <>
      <Marker position={site.coords} onClick={() => onClick(site)} />
      {selected && (
        <InfoWindow position={site.coords} onCloseClick={onClose}>
          <div className="min-w-[200px] max-w-[260px] p-1" data-testid="map-info-card">
            <p className="font-bold text-slate-900 text-sm leading-tight">{site.site_name}</p>
            <p className="text-slate-400 text-[11px] mt-0.5">{site.location}</p>
            <div className="flex gap-2 mt-2 flex-wrap">
              <span className="flex items-center gap-1 text-[11px] bg-cyan-50 text-cyan-700 px-2 py-0.5 rounded-full font-semibold">
                {site.dive_count} dive{site.dive_count !== 1 ? 's' : ''}
              </span>
              {site.max_depth > 0 && (
                <span className="text-[11px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-semibold">{site.max_depth}m</span>
              )}
              {site.avg_temp > 0 && (
                <span className="text-[11px] bg-amber-50 text-amber-600 px-2 py-0.5 rounded-full font-semibold">{site.avg_temp}°C</span>
              )}
            </div>
            {site.avg_rating > 0 && (
              <div className="flex items-center gap-1 mt-2">
                {[1,2,3,4,5].map(s => (
                  <svg key={s} width="12" height="12" viewBox="0 0 24 24" fill={s <= Math.round(site.avg_rating) ? '#fbbf24' : '#e2e8f0'} stroke="none">
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                  </svg>
                ))}
                <span className="text-[11px] text-slate-500 ml-0.5 font-semibold">{site.avg_rating}</span>
              </div>
            )}
            {(site.dive_types || []).length > 0 && (
              <div className="flex gap-1 mt-2 flex-wrap">
                {site.dive_types.map(t => (
                  <span key={t} className="text-[9px] px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded font-semibold capitalize">{t}</span>
                ))}
              </div>
            )}
            {site.last_dive && (
              <p className="text-[10px] text-slate-400 mt-2 pt-1.5 border-t border-slate-100">
                Last dived {site.last_dive.slice(0, 10)}
                {site.total_time > 0 && <span className="ml-2">{site.total_time} min total</span>}
              </p>
            )}
          </div>
        </InfoWindow>
      )}
    </>
  );
}

const DiveSiteMap = memo(function DiveSiteMap({ height = 360 }) {
  const [sites, setSites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedSite, setSelectedSite] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await axios.get('/dive-sites/map');
        setSites(res.data.sites || []);
      } catch (e) { /* silent */ }
      finally { setLoading(false); }
    })();
  }, []);

  const mappedSites = useMemo(() => (
    sites.map(s => ({ ...s, coords: getCoords(s) })).filter(s => s.coords)
  ), [sites]);

  const center = useMemo(() => (
    mappedSites.length > 0
      ? { lat: mappedSites.reduce((s, site) => s + site.coords.lat, 0) / mappedSites.length, lng: mappedSites.reduce((s, site) => s + site.coords.lng, 0) / mappedSites.length }
      : { lat: 0, lng: 30 }
  ), [mappedSites]);

  if (loading) {
    return <div className="flex items-center justify-center" style={{ height }}><div className="skeleton-shimmer rounded-xl bg-slate-200/70 w-full h-full" /></div>;
  }

  if (mappedSites.length === 0) {
    return (
      <div className="text-center py-8 text-slate-400 text-xs">
        <p>No dive sites with location data yet.</p>
        <p className="mt-1">Add GPS coordinates to your dives or upload photos with EXIF data.</p>
      </div>
    );
  }

  return (
    <SafeMapWrapper
      center={center}
      zoom={3}
      height={height}
      label="Dive Sites Map"
      className="rounded-xl border border-slate-200"
    >
      {mappedSites.map((site, i) => (
        <SiteMarker
          key={`site-${i}`}
          site={site}
          selected={selectedSite === site}
          onClick={setSelectedSite}
          onClose={() => setSelectedSite(null)}
        />
      ))}
    </SafeMapWrapper>
  );
});

export default DiveSiteMap;
