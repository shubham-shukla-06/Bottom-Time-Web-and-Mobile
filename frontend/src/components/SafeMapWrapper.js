import { Component, useState, useEffect, useRef, useCallback } from 'react';
import { APIProvider, Map, useApiLoadingStatus } from '@vis.gl/react-google-maps';
import { MapPin } from 'lucide-react';

/**
 * Shared Google Maps wrapper that handles ALL failure modes:
 * 1. React Error Boundary — catches runtime crashes (IntersectionObserver.observe, etc.)
 * 2. gm_authFailure — catches API key / referrer errors before rendering
 * 3. useApiLoadingStatus — catches API loading failures
 * 4. Deferred mount — prevents race conditions with DOM elements
 */

// ─── Global auth‑failure flag ────────────────────────────────────────────────
let _gmAuthFailed = false;
const _authListeners = new Set();

if (typeof window !== 'undefined' && !window.__gmAuthPatched) {
  window.__gmAuthPatched = true;
  window.gm_authFailure = () => {
    _gmAuthFailed = true;
    _authListeners.forEach(fn => fn());
  };
}

function useGmAuthFailure() {
  const [failed, setFailed] = useState(_gmAuthFailed);
  useEffect(() => {
    if (_gmAuthFailed) { setFailed(true); return; }
    const handler = () => setFailed(true);
    _authListeners.add(handler);
    return () => _authListeners.delete(handler);
  }, []);
  return failed;
}

// ─── Error Boundary (class component — React requirement) ────────────────────
class MapErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}

// ─── Fallback UI ─────────────────────────────────────────────────────────────
export function MapFallback({ label, height }) {
  return (
    <div
      className="flex items-center justify-center bg-slate-100 rounded-xl text-slate-400 text-xs"
      style={{ height }}
      data-testid="map-fallback"
    >
      <div className="text-center px-4">
        <MapPin size={24} className="mx-auto mb-2 text-slate-300" />
        <p className="font-medium text-slate-500">{label || 'Map'}</p>
        <p className="mt-1 text-[10px] text-slate-400">Map preview unavailable</p>
      </div>
    </div>
  );
}

// ─── Inner map with API status + DOM error detection ─────────────────────────
function MapInner({ center, zoom, height, label, mapStyle, children }) {
  const status = useApiLoadingStatus();
  const authFailed = useGmAuthFailure();
  const wrapRef = useRef(null);
  const [domError, setDomError] = useState(false);

  // Detect Google Maps error overlay injected into the DOM
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const check = () => {
      if (el.querySelector('.gm-err-container, .gm-err-message')) {
        setDomError(true);
        return true;
      }
      return false;
    };
    if (check()) return;
    const obs = new MutationObserver(() => { if (check()) obs.disconnect(); });
    obs.observe(el, { childList: true, subtree: true });
    const t = setTimeout(check, 4000);
    return () => { obs.disconnect(); clearTimeout(t); };
  }, []);

  if (status === 'FAILED' || authFailed || domError) {
    return <MapFallback label={label} height={height} />;
  }

  return (
    <div ref={wrapRef} style={{ width: '100%', height: '100%' }}>
      <Map
        defaultCenter={center}
        defaultZoom={zoom || 8}
        gestureHandling="cooperative"
        style={mapStyle || { width: '100%', height: '100%' }}
      >
        {children}
      </Map>
    </div>
  );
}

// ─── Public wrapper: APIProvider + Error Boundary + deferred mount ────────────
export default function SafeMapWrapper({
  center,
  zoom,
  height = 300,
  label,
  mapStyle,
  children,
  className,
}) {
  const containerRef = useRef(null);
  const [ready, setReady] = useState(false);
  const apiKey = process.env.REACT_APP_GOOGLE_MAPS_KEY;

  // Defer rendering until container is in the DOM with real dimensions.
  // This prevents the IntersectionObserver.observe crash.
  const checkReady = useCallback(() => {
    const el = containerRef.current;
    if (el && el.offsetWidth > 0 && el.offsetHeight > 0) {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    checkReady();
    // In case the element is hidden/transitioning, recheck after a frame
    const raf = requestAnimationFrame(checkReady);
    return () => cancelAnimationFrame(raf);
  }, [checkReady]);

  const fallback = <MapFallback label={label} height={height} />;

  if (!apiKey) return fallback;

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ height, position: 'relative', overflow: 'hidden' }}
      data-testid="safe-map-container"
    >
      {ready ? (
        <MapErrorBoundary fallback={fallback}>
          <APIProvider apiKey={apiKey}>
            <MapInner
              center={center}
              zoom={zoom}
              height={height}
              label={label}
              mapStyle={mapStyle}
              >
              {children}
            </MapInner>
          </APIProvider>
        </MapErrorBoundary>
      ) : (
        fallback
      )}
    </div>
  );
}
