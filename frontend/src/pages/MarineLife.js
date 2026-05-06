import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import useAuthStore from '../stores/authStore';
import useUIStore from '../stores/uiStore';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { Search, Fish, MapPin, Eye, ChevronRight, X, Globe, Loader2, ExternalLink, Clock, CheckCircle2, AlertCircle, Send, ChevronDown, Compass, TrendingUp, Award, Waves } from 'lucide-react';
import axios from 'axios';
import { toast } from 'sonner';
import useTabParam from '../hooks/useTabParam';
import { MarineLifeDiscoverSkeleton, MarineLifeNearbySkeleton, MarineLifeConservationSkeleton } from '../components/Skeletons';

const API = process.env.REACT_APP_BACKEND_URL;

const IUCN_COLORS = {
  'least concern': '#15803d',
  'near threatened': '#ca8a04',
  'vulnerable': '#d97706',
  'endangered': '#ea580c',
  'critically endangered': '#dc2626',
};

const ICONIC_LABELS = {
  Actinopterygii: 'Fish',
  Mollusca: 'Molluscs',
  Cnidaria: 'Corals & Jellies',
  Mammalia: 'Mammals',
  Reptilia: 'Reptiles',
  Echinodermata: 'Echinoderms',
  Crustacea: 'Crustaceans',
  Elasmobranchii: 'Sharks & Rays',
};

export default function MarineLife() {
  const user = useAuthStore(s => s.user);
  const openAuth = useUIStore(s => s.openAuth);
  const [tab, setTab] = useTabParam('tab', 'discover', ['discover', 'nearby', 'sightings', 'conservation']);

  if (!user) {
    return (
      <div className="min-h-screen bg-white flex flex-col">
        <Navbar />
        <div className="flex-1 flex items-center justify-center px-6">
          <div className="text-center max-w-sm">
            <Waves className="text-cyan-300 mx-auto mb-4" size={48} strokeWidth={1.5} />
            <h2 className="text-xl font-bold text-slate-800 mb-2">Marine Life Encyclopedia</h2>
            <p className="text-sm text-slate-500 mb-6">Explore thousands of marine species from iNaturalist's global database. Sign in to start.</p>
            <button onClick={() => openAuth('login')} className="h-11 px-8 bg-cyan-500 hover:bg-cyan-600 text-white rounded-full text-sm font-semibold transition-colors" data-testid="marine-life-login-btn">Sign In</button>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Navbar />
      <main className="flex-1 max-w-[1600px] mx-auto w-full px-4 py-6">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight" data-testid="marine-life-title">Marine Life</h1>
          <p className="text-sm text-slate-500 mt-1">Powered by iNaturalist — {'>'}400,000 marine species observations worldwide</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-white rounded-xl p-1 border border-slate-100 overflow-x-auto" data-testid="marine-life-tabs">
          {[
            { id: 'discover', label: 'Discover', icon: Compass },
            { id: 'nearby', label: 'Nearby', icon: MapPin },
            { id: 'sightings', label: 'My Sightings', icon: Eye },
            { id: 'conservation', label: 'Conservation', icon: Award },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${tab === t.id ? 'bg-cyan-500 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'}`}
              data-testid={`tab-${t.id}`}
            >
              <t.icon size={14} />
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'discover' && <DiscoverTab />}
        {tab === 'nearby' && <NearbyTab />}
        {tab === 'sightings' && <SightingsTab />}
        {tab === 'conservation' && <ConservationTab />}
      </main>
      <Footer />
    </div>
  );
}


/* ═══════════════════════════════════════════════════════
   DISCOVER TAB
   ═══════════════════════════════════════════════════════ */

function DiscoverTab() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [trending, setTrending] = useState([]);
  const [loading, setLoading] = useState(false);
  const [trendingLoading, setTrendingLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const searchTimeout = useRef(null);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    setTrendingLoading(true);
    axios.get(`${API}/api/marine-life/trending?per_page=20`)
      .then(r => setTrending(r.data.species || []))
      .catch(() => {})
      .finally(() => setTrendingLoading(false));
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const doSearch = useCallback((q) => {
    if (q.length < 2) { setResults([]); return; }
    setLoading(true);
    axios.get(`${API}/api/marine-life/search`, { params: { q, per_page: 24 } })
      .then(r => setResults(r.data.results || []))
      .catch(() => toast.error('Search failed'))
      .finally(() => setLoading(false));
  }, []);

  const onSearchChange = (e) => {
    const val = e.target.value;
    setQuery(val);
    clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => doSearch(val), 400);
  };

  const displaySpecies = query.length >= 2 ? results : trending;
  const isSearching = query.length >= 2;

  return (
    <>
      {/* Search */}
      <div className="relative mb-6" data-testid="species-search">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
        <input
          value={query}
          onChange={onSearchChange}
          placeholder="Search any marine species... (e.g. Manta Ray, Octopus)"
          className="w-full h-12 pl-11 pr-4 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100 transition-all"
          data-testid="species-search-input"
        />
        {loading && <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 animate-spin text-cyan-400" size={18} />}
      </div>

      {/* Section label */}
      <div className="flex items-center gap-2 mb-4">
        {isSearching ? (
          <p className="text-xs font-semibold text-slate-500">{results.length} results for "{query}"</p>
        ) : (
          <>
            <TrendingUp size={14} className="text-cyan-500" />
            <p className="text-xs font-semibold text-slate-500">Trending Marine Species (last 30 days)</p>
          </>
        )}
      </div>

      {/* Species Grid */}
      {(trendingLoading && !isSearching && displaySpecies.length === 0) ? (
        <MarineLifeDiscoverSkeleton />
      ) : displaySpecies.length === 0 ? (
        <div className="text-center py-16">
          <Fish className="mx-auto text-slate-300 mb-3" size={36} />
          <p className="text-sm text-slate-500">{isSearching ? 'No species found. Try a different name.' : 'Loading trending species...'}</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3" data-testid="species-grid">
          {displaySpecies.map(sp => (
            <SpeciesCard key={sp.taxon_id} species={sp} onClick={() => setSelected(sp.taxon_id)} />
          ))}
        </div>
      )}

      {selected && <SpeciesDetailModal taxonId={selected} onClose={() => setSelected(null)} />}
    </>
  );
}


/* ═══════════════════════════════════════════════════════
   SPECIES CARD
   ═══════════════════════════════════════════════════════ */

function SpeciesCard({ species, onClick }) {
  const status = species.conservation_status?.toLowerCase();
  const statusColor = IUCN_COLORS[status];

  return (
    <button
      onClick={onClick}
      className="bg-white rounded-xl border border-slate-100 overflow-hidden text-left hover:shadow-md hover:border-cyan-200 transition-all group"
      data-testid="species-card"
    >
      <div className="aspect-[4/3] bg-slate-100 relative overflow-hidden">
        {species.photo_url ? (
          <img src={species.photo_url} alt={species.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Fish className="text-slate-300" size={32} />
          </div>
        )}
        {statusColor && (
          <span className="absolute top-2 left-2 px-2 py-0.5 rounded-full text-[9px] font-bold text-white" style={{ backgroundColor: statusColor }}>
            {species.conservation_status}
          </span>
        )}
      </div>
      <div className="p-3">
        <p className="text-sm font-bold text-slate-800 leading-tight line-clamp-1" data-testid="species-name">{species.name}</p>
        <p className="text-[10px] italic text-slate-400 mt-0.5 line-clamp-1">{species.scientific_name}</p>
        <div className="flex items-center gap-2 mt-2">
          <span className="text-[10px] text-slate-400 font-medium">{ICONIC_LABELS[species.iconic_taxon] || species.iconic_taxon}</span>
          {species.observations_count > 0 && (
            <span className="text-[10px] text-cyan-500 font-semibold ml-auto">{formatCount(species.observations_count)} obs</span>
          )}
        </div>
      </div>
    </button>
  );
}


/* ═══════════════════════════════════════════════════════
   SPECIES DETAIL MODAL
   ═══════════════════════════════════════════════════════ */

function SpeciesDetailModal({ taxonId, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [photoIdx, setPhotoIdx] = useState(0);
  const [showSightingForm, setShowSightingForm] = useState(false);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    setLoading(true);
    axios.get(`${API}/api/marine-life/species/${taxonId}`)
      .then(r => setData(r.data))
      .catch(() => toast.error('Failed to load species details'))
      .finally(() => setLoading(false));
  }, [taxonId]);

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center" onClick={onClose}>
        <Loader2 className="animate-spin text-white" size={32} />
      </div>
    );
  }

  if (!data) return null;

  const photos = data.photos || [];
  const currentPhoto = photos[photoIdx] || data.photo || {};
  const conservation = data.conservation;
  const statusColor = conservation?.status ? IUCN_COLORS[conservation.status.toLowerCase()] : null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center" onClick={onClose} data-testid="species-detail-modal">
      <div className="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        {/* Photo */}
        <div className="relative aspect-[16/10] bg-slate-100">
          {currentPhoto.url ? (
            <img src={currentPhoto.large_url || currentPhoto.url} alt={data.name} className="w-full h-full object-cover" />
          ) : data.photo?.url ? (
            <img src={data.photo.large_url || data.photo.url} alt={data.name} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center"><Fish className="text-slate-300" size={48} /></div>
          )}
          <button onClick={onClose} className="absolute top-3 right-3 w-8 h-8 bg-black/40 backdrop-blur-sm rounded-full flex items-center justify-center text-white hover:bg-black/60 transition" data-testid="close-species-modal">
            <X size={16} />
          </button>
          {statusColor && (
            <span className="absolute top-3 left-3 px-2.5 py-1 rounded-full text-[10px] font-bold text-white" style={{ backgroundColor: statusColor }}>
              {conservation.status}
            </span>
          )}
          {/* Photo navigation */}
          {photos.length > 1 && (
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
              {photos.slice(0, 6).map((_, i) => (
                <button key={`k${i}`} onClick={() => setPhotoIdx(i)} className={`w-2 h-2 rounded-full transition-all ${i === photoIdx ? 'bg-white scale-125' : 'bg-white/50'}`} />
              ))}
            </div>
          )}
        </div>

        {/* Content */}
        <div className="p-5">
          <h2 className="text-xl font-bold text-slate-900" data-testid="species-detail-name">{data.name}</h2>
          <p className="text-sm italic text-slate-400 mt-0.5">{data.scientific_name}</p>

          {/* Quick stats */}
          <div className="flex flex-wrap gap-2 mt-3">
            <span className="px-2.5 py-1 bg-cyan-50 text-cyan-600 rounded-full text-[10px] font-semibold">
              {formatCount(data.observations_count)} observations
            </span>
            <span className="px-2.5 py-1 bg-slate-50 text-slate-600 rounded-full text-[10px] font-semibold">
              {ICONIC_LABELS[data.iconic_taxon] || data.iconic_taxon}
            </span>
          </div>

          {/* Wikipedia summary */}
          {data.wikipedia_summary && (
            <div className="mt-4">
              <p className="text-sm text-slate-600 leading-relaxed">{data.wikipedia_summary?.replace(/<[^>]*>/g, '')}</p>
              {data.wikipedia_url && (
                <a href={data.wikipedia_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-cyan-500 hover:text-cyan-600 mt-2 font-medium">
                  Read more on Wikipedia <ExternalLink size={10} />
                </a>
              )}
            </div>
          )}

          {/* Taxonomy */}
          {data.taxonomy && Object.keys(data.taxonomy).length > 0 && (
            <div className="mt-4 bg-slate-50 rounded-xl p-3">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Taxonomy</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                {['kingdom', 'phylum', 'class', 'order', 'family', 'genus'].map(rank => {
                  const val = data.taxonomy[rank];
                  if (!val) return null;
                  return (
                    <div key={rank}>
                      <span className="text-[9px] text-slate-400 uppercase">{rank}</span>
                      <p className="text-xs font-semibold text-slate-700">{val.name}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Photo attribution */}
          {currentPhoto.attribution && (
            <p className="text-[9px] text-slate-400 mt-3">Photo: {currentPhoto.attribution}</p>
          )}

          {/* Actions */}
          <div className="flex gap-2 mt-4">
            <button
              onClick={() => setShowSightingForm(!showSightingForm)}
              className="flex-1 h-10 bg-cyan-500 hover:bg-cyan-600 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
              data-testid="report-sighting-btn"
            >
              <Send size={13} /> Report Sighting
            </button>
            <a
              href={`https://www.inaturalist.org/taxa/${taxonId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="h-10 px-4 border border-slate-200 rounded-xl text-xs font-semibold text-slate-600 flex items-center gap-1.5 hover:bg-slate-50 transition-colors"
              data-testid="view-on-inaturalist"
            >
              <ExternalLink size={12} /> iNaturalist
            </a>
          </div>

          {/* Sighting Form */}
          {showSightingForm && (
            <SightingForm
              taxonId={taxonId}
              speciesName={data.name}
              scientificName={data.scientific_name}
              photoUrl={data.photo?.url || ''}
              onClose={() => setShowSightingForm(false)}
            />
          )}
        </div>
      </div>
    </div>
  );
}


/* ═══════════════════════════════════════════════════════
   SIGHTING FORM (inline in detail modal)
   ═══════════════════════════════════════════════════════ */

function SightingForm({ taxonId, speciesName, scientificName, photoUrl, onClose }) {
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    try {
      await axios.post(`${API}/api/marine-life/sightings`, {
        taxon_id: taxonId,
        species_name: speciesName,
        scientific_name: scientificName,
        photo_url: photoUrl,
        location,
        notes,
      });
      toast.success('Sighting submitted! It will be reviewed before being published.');
      onClose();
    } catch {
      toast.error('Failed to submit sighting');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-4 bg-amber-50 border border-amber-200 rounded-xl p-4" data-testid="sighting-form">
      <div className="flex items-start gap-2 mb-3">
        <AlertCircle size={14} className="text-amber-500 mt-0.5 flex-shrink-0" />
        <p className="text-[11px] text-amber-700">Sightings are reviewed before being submitted to contribute to citizen science data.</p>
      </div>
      <input
        value={location}
        onChange={e => setLocation(e.target.value)}
        placeholder="Where did you see it? (e.g. Maldives, Raja Ampat)"
        className="w-full h-9 px-3 bg-white border border-amber-200 rounded-lg text-xs outline-none focus:border-cyan-400 mb-2"
        data-testid="sighting-location"
      />
      <textarea
        value={notes}
        onChange={e => setNotes(e.target.value)}
        placeholder="Any notes? (depth, behavior, time of day...)"
        rows={2}
        className="w-full px-3 py-2 bg-white border border-amber-200 rounded-lg text-xs outline-none focus:border-cyan-400 resize-none mb-3"
        data-testid="sighting-notes"
      />
      <div className="flex gap-2">
        <button onClick={submit} disabled={saving} className="flex-1 h-9 bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg text-xs font-semibold disabled:opacity-50 flex items-center justify-center gap-1" data-testid="submit-sighting-btn">
          {saving ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
          Submit
        </button>
        <button onClick={onClose} className="h-9 px-4 border border-slate-200 rounded-lg text-xs text-slate-500 hover:bg-slate-50" data-testid="cancel-sighting-btn">Cancel</button>
      </div>
    </div>
  );
}


/* ═══════════════════════════════════════════════════════
   NEARBY TAB
   ═══════════════════════════════════════════════════════ */

function NearbyTab() {
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [species, setSpecies] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [selected, setSelected] = useState(null);
  const [diveSites, setDiveSites] = useState([]);
  const [showSites, setShowSites] = useState(false);
  const [sitesLoading, setSitesLoading] = useState(false);

  const POPULAR_SPOTS = [
    { name: 'Great Barrier Reef', lat: -18.3, lng: 147.7 },
    { name: 'Maldives', lat: 3.2, lng: 73.2 },
    { name: 'Raja Ampat', lat: -0.5, lng: 130.5 },
    { name: 'Red Sea', lat: 22.0, lng: 38.0 },
    { name: 'Galapagos', lat: -0.95, lng: -90.9 },
    { name: 'Caribbean', lat: 17.5, lng: -69.9 },
    { name: 'Hawaii', lat: 20.8, lng: -156.3 },
    { name: 'Thailand', lat: 8.5, lng: 98.3 },
  ];

  const search = async (searchLat, searchLng) => {
    setLat(searchLat.toString());
    setLng(searchLng.toString());
    setLoading(true);
    setSearched(true);
    try {
      const r = await axios.get(`${API}/api/marine-life/nearby`, { params: { lat: searchLat, lng: searchLng, radius: 50, per_page: 30 } });
      setSpecies(r.data.species || []);
    } catch {
      toast.error('Failed to load nearby species');
    } finally {
      setLoading(false);
    }
  };

  const searchDiveSites = async () => {
    if (!lat || !lng) return;
    setSitesLoading(true);
    setShowSites(true);
    try {
      const r = await axios.get(`${API}/api/marine-life/dive-sites`, { params: { lat, lng, radius: 0.5 } });
      setDiveSites(r.data.sites || []);
    } catch {
      toast.error('Failed to load dive sites');
    } finally {
      setSitesLoading(false);
    }
  };

  const useMyLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => search(pos.coords.latitude.toFixed(2), pos.coords.longitude.toFixed(2)),
        () => toast.error('Could not get your location')
      );
    }
  };

  return (
    <>
      {/* Location Input */}
      <div className="bg-white rounded-xl border border-slate-100 p-4 mb-4" data-testid="nearby-search">
        <p className="text-xs font-semibold text-slate-600 mb-3">Find marine species near a location</p>
        <div className="flex gap-2 mb-3">
          <input value={lat} onChange={e => setLat(e.target.value)} placeholder="Latitude" className="flex-1 h-10 px-3 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:border-cyan-400" data-testid="nearby-lat" />
          <input value={lng} onChange={e => setLng(e.target.value)} placeholder="Longitude" className="flex-1 h-10 px-3 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:border-cyan-400" data-testid="nearby-lng" />
          <button onClick={() => { if (lat && lng) search(parseFloat(lat), parseFloat(lng)); }} disabled={!lat || !lng || loading} className="h-10 px-5 bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg text-xs font-semibold disabled:opacity-50 transition-colors" data-testid="nearby-search-btn">
            {loading ? <Loader2 size={14} className="animate-spin" /> : 'Search'}
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={useMyLocation} className="text-xs text-cyan-500 hover:text-cyan-600 font-medium flex items-center gap-1" data-testid="use-my-location">
            <Compass size={12} /> Use my location
          </button>
          {lat && lng && (
            <>
              <span className="text-slate-300">|</span>
              <button onClick={searchDiveSites} className="text-xs text-slate-500 hover:text-slate-700 font-medium flex items-center gap-1" data-testid="find-dive-sites">
                <MapPin size={12} /> Find dive sites nearby
              </button>
            </>
          )}
        </div>
      </div>

      {/* Popular Spots */}
      {!searched && (
        <div className="mb-6">
          <p className="text-xs font-semibold text-slate-500 mb-3">Popular dive regions</p>
          <div className="flex flex-wrap gap-2" data-testid="popular-spots">
            {POPULAR_SPOTS.map(spot => (
              <button
                key={spot.name}
                onClick={() => search(spot.lat, spot.lng)}
                className="px-3 py-2 bg-white border border-slate-100 rounded-lg text-xs font-medium text-slate-600 hover:border-cyan-300 hover:text-cyan-600 transition-colors"
                data-testid={`spot-${spot.name.toLowerCase().replace(/\s+/g, '-')}`}
              >
                <MapPin size={10} className="inline mr-1 text-cyan-400" />{spot.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Dive Sites */}
      {showSites && (
        <div className="bg-white rounded-xl border border-slate-100 p-4 mb-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-slate-600">Dive Sites Nearby</p>
            <button onClick={() => setShowSites(false)} className="text-slate-400 hover:text-slate-600"><X size={14} /></button>
          </div>
          {sitesLoading ? (
            <Loader2 size={16} className="animate-spin text-cyan-400 mx-auto" />
          ) : diveSites.length === 0 ? (
            <p className="text-xs text-slate-400">No dive sites found in this area.</p>
          ) : (
            <div className="space-y-1.5 max-h-40 overflow-y-auto">
              {diveSites.map(site => (
                <button key={site.osm_id} onClick={() => search(site.lat, site.lng)} className="w-full text-left px-3 py-2 bg-slate-50 rounded-lg hover:bg-cyan-50 transition-colors flex items-center gap-2">
                  <MapPin size={12} className="text-cyan-400 flex-shrink-0" />
                  <span className="text-xs font-medium text-slate-700 truncate">{site.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Nearby Results */}
      {loading && species.length === 0 ? (
        <MarineLifeNearbySkeleton />
      ) : searched && species.length === 0 ? (
        <div className="text-center py-16">
          <Globe className="mx-auto text-slate-300 mb-3" size={36} />
          <p className="text-sm text-slate-500">No marine species observations found in this area.</p>
          <p className="text-xs text-slate-400 mt-1">Try a larger area or a popular dive destination.</p>
        </div>
      ) : species.length > 0 && (
        <>
          <p className="text-xs font-semibold text-slate-500 mb-3">{species.length} species observed near this location</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3" data-testid="nearby-species-grid">
            {species.map(sp => (
              <SpeciesCard key={sp.taxon_id} species={sp} onClick={() => setSelected(sp.taxon_id)} />
            ))}
          </div>
        </>
      )}

      {selected && <SpeciesDetailModal taxonId={selected} onClose={() => setSelected(null)} />}
    </>
  );
}


/* ═══════════════════════════════════════════════════════
   MY SIGHTINGS TAB
   ═══════════════════════════════════════════════════════ */

function SightingsTab() {
  const [sightings, setSightings] = useState([]);
  const [loading, setLoading] = useState(true);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    axios.get(`${API}/api/marine-life/my-sightings`)
      .then(r => setSightings(r.data.sightings || []))
      .catch(() => toast.error('Failed to load sightings'))
      .finally(() => setLoading(false));
  }, []);

  const STATUS_STYLES = {
    pending: { bg: 'bg-amber-50', text: 'text-amber-600', icon: Clock, label: 'Pending Review' },
    verified: { bg: 'bg-emerald-50', text: 'text-emerald-600', icon: CheckCircle2, label: 'Verified' },
    rejected: { bg: 'bg-red-50', text: 'text-red-600', icon: AlertCircle, label: 'Rejected' },
  };

  if (loading && sightings.length === 0) return <MarineLifeDiscoverSkeleton />;

  return (
    <div data-testid="sightings-tab">
      <div className="bg-white rounded-xl border border-slate-100 p-4 mb-4">
        <p className="text-xs text-slate-500 leading-relaxed">
          Your reported sightings are reviewed before being contributed to the citizen science database.
          Verified sightings help researchers track marine populations worldwide.
        </p>
      </div>

      {sightings.length === 0 ? (
        <div className="text-center py-16">
          <Eye className="mx-auto text-slate-300 mb-3" size={36} />
          <p className="text-sm text-slate-500 font-medium">No sightings yet</p>
          <p className="text-xs text-slate-400 mt-1">Report a sighting from any species detail page.</p>
        </div>
      ) : (
        <div className="space-y-3" data-testid="sightings-list">
          {sightings.map(s => {
            const style = STATUS_STYLES[s.status] || STATUS_STYLES.pending;
            const StatusIcon = style.icon;
            return (
              <div key={s.id} className="bg-white rounded-xl border border-slate-100 p-4 flex gap-3" data-testid="sighting-item">
                <div className="w-14 h-14 rounded-lg bg-slate-100 overflow-hidden flex-shrink-0">
                  {s.photo_url ? (
                    <img src={s.photo_url} alt={s.species_name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center"><Fish className="text-slate-300" size={18} /></div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-slate-800 truncate">{s.species_name}</p>
                  <p className="text-[10px] italic text-slate-400">{s.scientific_name}</p>
                  {s.location && <p className="text-[10px] text-slate-500 mt-1 flex items-center gap-1"><MapPin size={9} />{s.location}</p>}
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-semibold ${style.bg} ${style.text}`}>
                      <StatusIcon size={10} />{style.label}
                    </span>
                    <span className="text-[9px] text-slate-400">{new Date(s.created_at).toLocaleDateString()}</span>
                  </div>
                  {s.rejection_reason && <p className="text-[10px] text-red-500 mt-1">{s.rejection_reason}</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}


/* ═══════════════════════════════════════════════════════
   CONSERVATION TAB
   ═══════════════════════════════════════════════════════ */

function ConservationTab() {
  const [impact, setImpact] = useState(null);
  const [loading, setLoading] = useState(true);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    axios.get(`${API}/api/marine-life/conservation/impact`)
      .then(r => setImpact(r.data))
      .catch(() => toast.error('Failed to load conservation data'))
      .finally(() => setLoading(false));
  }, []);

  if (loading && !impact) return <MarineLifeConservationSkeleton />;

  return (
    <div className="space-y-4" data-testid="conservation-tab">
      <div className="bg-white rounded-xl border border-slate-100 p-5">
        <h3 className="text-sm font-bold text-slate-800 mb-4">Your Conservation Impact</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatBox label="Total Observations" value={impact?.total_observations || 0} color="text-cyan-500" />
          <StatBox label="Species Seen" value={impact?.unique_species || 0} color="text-emerald-500" />
          <StatBox label="Verified" value={impact?.verified_sightings || 0} color="text-violet-500" />
          <StatBox label="Pending Review" value={impact?.pending_sightings || 0} color="text-amber-500" />
        </div>
      </div>

      {impact?.total_observations > 0 ? (
        <>
          <div className="bg-white rounded-xl border border-slate-100 p-5">
            <h4 className="text-sm font-bold text-slate-800 mb-3">Species You've Observed</h4>
            <div className="flex flex-wrap gap-1.5">
              {(impact.species_list || []).map(name => (
                <span key={name} className="px-2.5 py-1 bg-cyan-50 text-cyan-600 rounded-full text-[10px] font-semibold">{name}</span>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-100 p-5">
            <h4 className="text-sm font-bold text-slate-800 mb-3">How Your Data Helps</h4>
            <div className="space-y-3">
              <HelpPoint title="Population Monitoring" desc="Repeated sightings at the same location help researchers track population trends and detect early warning signs." />
              <HelpPoint title="Range Mapping" desc="Recording a species at a location helps map where it actually lives — critical for marine protected area planning." />
              <HelpPoint title="Citizen Science" desc="Once verified, your observations join iNaturalist's global database used by thousands of researchers worldwide." />
            </div>
          </div>
        </>
      ) : (
        <div className="bg-white rounded-xl border border-slate-100 p-6 text-center">
          <Award className="mx-auto text-slate-300 mb-3" size={32} />
          <p className="text-sm font-medium text-slate-600 mb-1">Start contributing to marine science</p>
          <p className="text-xs text-slate-400">Search for species in the Discover tab and report your sightings. Every observation counts.</p>
        </div>
      )}
    </div>
  );
}


/* ═══════════════════════════════════════════════════════
   SHARED COMPONENTS
   ═══════════════════════════════════════════════════════ */

function StatBox({ label, value, color }) {
  return (
    <div className="bg-slate-50 rounded-xl p-3 text-center">
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      <p className="text-[10px] text-slate-400 font-semibold mt-0.5">{label}</p>
    </div>
  );
}

function HelpPoint({ title, desc }) {
  return (
    <div className="flex gap-3">
      <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 mt-2 flex-shrink-0" />
      <div>
        <p className="text-xs font-bold text-slate-700">{title}</p>
        <p className="text-xs text-slate-500 leading-relaxed">{desc}</p>
      </div>
    </div>
  );
}

function formatCount(n) {
  if (!n) return '0';
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return n.toString();
}
