import { useState, useEffect, useRef } from 'react';
import { MapPin, Search, Loader2, X } from 'lucide-react';

const GOOGLE_KEY = process.env.REACT_APP_GOOGLE_MAPS_KEY;
const PLACES_URL = 'https://places.googleapis.com/v1/places';

function parseAddressComponents(place) {
  const components = {};
  for (const comp of (place.addressComponents || [])) {
    for (const t of comp.types) {
      components[t] = { long: comp.longText || '', short: comp.shortText || '' };
    }
  }

  const premise = components.premise?.long || '';
  const streetNumber = components.street_number?.long || '';
  const route = components.route?.long || '';
  const sublocality = components.sublocality_level_1?.long || components.sublocality?.long || '';
  const neighborhood = components.neighborhood?.long || '';
  const sublocality2 = components.sublocality_level_2?.long || '';

  const parts1 = [premise, [streetNumber, route].filter(Boolean).join(' ')].filter(Boolean);
  const address_line1 = parts1.length ? parts1.join(', ') : sublocality || neighborhood;
  const parts2 = [sublocality, sublocality2, neighborhood].filter(p => p && !address_line1.includes(p));

  return {
    formatted_address: place.formattedAddress || '',
    address_line1,
    address_line2: parts2.join(', '),
    city: components.locality?.long || components.administrative_area_level_2?.long || '',
    state: components.administrative_area_level_1?.long || '',
    pincode: components.postal_code?.long || components.postal_code_prefix?.long || '',
    country: components.country?.long || '',
    country_code: components.country?.short || '',
    latitude: place.location?.latitude,
    longitude: place.location?.longitude,
  };
}

function parseSuggestions(data) {
  return (data.suggestions || []).map(s => {
    const p = s.placePrediction;
    return {
      place_id: p?.placeId || '',
      description: p?.text?.text || '',
      main_text: p?.structuredFormat?.mainText?.text || '',
      secondary_text: p?.structuredFormat?.secondaryText?.text || '',
    };
  });
}

/**
 * Google Places Autocomplete — calls Places API (New) REST endpoints
 * directly from the browser (API key has referrer restrictions).
 */
export default function AddressAutocomplete({ onSelect, placeholder = "Search your address...", country = "" }) {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const containerRef = useRef(null);
  const debounceRef = useRef(null);
  const justSelectedRef = useRef(false);

  // Autocomplete search — direct browser call to Places API (New)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (justSelectedRef.current) { justSelectedRef.current = false; return; }
    if (query.length < 3) { setSuggestions([]); setShowDropdown(false); return; }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const body = { input: query };
        if (country) body.includedRegionCodes = [country.toUpperCase()];
        const res = await fetch(`${PLACES_URL}:autocomplete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': GOOGLE_KEY },
          body: JSON.stringify(body),
        });
        const items = parseSuggestions(await res.json());
        setSuggestions(items);
        if (items.length > 0) setShowDropdown(true);
      } catch {
        setSuggestions([]);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [query, country]);

  // Close on outside click
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const handler = (e) => { if (containerRef.current && !containerRef.current.contains(e.target)) setShowDropdown(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSelect = async (suggestion) => {
    justSelectedRef.current = true;
    setQuery(suggestion.main_text || suggestion.description);
    setShowDropdown(false);
    setSuggestions([]);

    if (!suggestion.place_id) {
      onSelect({ address_line1: suggestion.main_text, formatted_address: suggestion.description, city: '', state: '', pincode: '', country: '' });
      return;
    }

    setLoading(true);
    try {
      const fields = 'formattedAddress,addressComponents,location';
      const res = await fetch(`${PLACES_URL}/${suggestion.place_id}?languageCode=en`, {
        headers: { 'X-Goog-Api-Key': GOOGLE_KEY, 'X-Goog-FieldMask': fields },
      });
      onSelect(parseAddressComponents(await res.json()));
    } catch (e) {
      onSelect({ address_line1: suggestion.main_text, formatted_address: suggestion.description, city: '', state: '', pincode: '', country: '' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
          {loading ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
        </div>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => suggestions.length > 0 && setShowDropdown(true)}
          placeholder={placeholder}
          className="w-full pl-9 pr-9 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-cyan-400/30 focus:border-cyan-400 transition-all"
          data-testid="address-autocomplete-input"
        />
        {query && (
          <button onClick={() => { justSelectedRef.current = true; setQuery(''); setSuggestions([]); setShowDropdown(false); }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            data-testid="address-autocomplete-clear">
            <X size={15} />
          </button>
        )}
      </div>

      {showDropdown && suggestions.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-60 overflow-y-auto" data-testid="address-suggestions-dropdown">
          {suggestions.map((s, idx) => (
            <button key={s.place_id || idx} onClick={() => handleSelect(s)}
              className="w-full px-3 py-2.5 text-left hover:bg-slate-50 transition-colors flex items-start gap-2.5 border-b border-slate-100 last:border-0"
              data-testid={`address-suggestion-${idx}`}>
              <MapPin size={13} className="text-cyan-500 mt-0.5 shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-800 truncate">{s.main_text}</p>
                {s.secondary_text && <p className="text-xs text-slate-500 truncate">{s.secondary_text}</p>}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
