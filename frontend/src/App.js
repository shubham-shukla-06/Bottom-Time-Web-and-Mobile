import React, { useEffect, useState, Suspense, useRef } from 'react';
import '@/App.css';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import axios from 'axios';
import { Toaster } from 'sonner';
import { QueryClientProvider } from '@tanstack/react-query';
import queryClient from './lib/queryClient';
import { ArrowUp } from 'lucide-react';

import useAuthStore, { installAuthInterceptor } from './stores/authStore';
import useCartStore from './stores/cartStore';
import useUIStore from './stores/uiStore';

import ComingSoon from './pages/ComingSoon';
import AuthModal from './components/AuthModal';
import RouteScrollRestorer from './components/RouteScrollRestorer';
import { useUTMCapture, linkUTMToUser } from './hooks/useUTMCapture';
import { usePushNotifications } from './hooks/usePushNotifications';
import { getRoutes } from './config/routes';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;
axios.defaults.baseURL = API;
// Phase B (web passkeys) — install once on module load so the 401 refresh
// interceptor catches axios calls fired before App mounts.
installAuthInterceptor();

function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-400" />
    </div>
  );
}

function ScrollToTop() {
  const [show, setShow] = useState(false);
  const btnRef = useRef(null);
  const location = useLocation();
  const isLanding = location.pathname === '/' || location.pathname === '/home';

  useEffect(() => {
    let rafId = 0;
    const update = () => {
      rafId = 0;
      const btn = btnRef.current;
      // Always recompute visibility (cheap).
      const visible = window.scrollY > 100;
      setShow(prev => (prev === visible ? prev : visible));
      if (!btn) return;

      // Sticky-above-footer: write the computed bottom offset directly to the
      // element style inside the scroll handler so the button and the footer
      // move in the SAME frame. No React render, no 1-frame overlap.
      const footer = document.querySelector('[data-testid="app-footer"]');
      if (!footer) {
        btn.style.bottom = '24px';
        return;
      }
      const footerTop = footer.getBoundingClientRect().top;
      const overlap = window.innerHeight - footerTop;
      btn.style.bottom = overlap > 0 ? `${overlap + 24}px` : '24px';
    };

    const onScroll = () => {
      if (rafId) return;                      // coalesce to one update per frame
      rafId = window.requestAnimationFrame(update);
    };

    // Run once on mount and re-run when route changes so the button is placed
    // correctly on the first paint before any scroll event fires.
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [location.pathname]);

  if (!show || isLanding) return null;
  return (
    <button
      ref={btnRef}
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      style={{ bottom: '24px' }}
      className="fixed right-6 z-50 w-10 h-10 rounded-full bg-cyan-400 text-white shadow-lg shadow-cyan-400/30 flex items-center justify-center hover:bg-cyan-500 hover:-translate-y-0.5 transition-colors duration-200"
      data-testid="scroll-to-top-btn"
      aria-label="Scroll to top"
    >
      <ArrowUp size={18} strokeWidth={2.5} />
    </button>
  );
}

function useAppBoot() {
  const { user, loading, fetchCurrentUser } = useAuthStore();
  const refreshCart = useCartStore(s => s.refreshCart);
  const fetchExchangeRates = useUIStore(s => s.fetchExchangeRates);
  const refreshWishlist = useUIStore(s => s.refreshWishlist);

  useEffect(() => {
    fetchExchangeRates();

    const isOAuthCallback = window.location.pathname === '/auth/callback';
    if (isOAuthCallback) {
      useAuthStore.getState().setLoading(false);
      return;
    }
    fetchCurrentUser().then((userData) => {
      if (userData) {
        refreshCart();
        refreshWishlist();
        linkUTMToUser(userData?.id);
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return { user, loading };
}

function useSyncPushNotifs(user) {
  const pushNotifs = usePushNotifications(user);
  const prevPermRef = React.useRef();

  useEffect(() => {
    if (pushNotifs && pushNotifs.permission !== prevPermRef.current) {
      prevPermRef.current = pushNotifs.permission;
      useUIStore.getState().setPushNotifs(pushNotifs);
    }
  }, [pushNotifs?.permission, pushNotifs?.supported]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, []);
}

function AppInner() {
  const { user, loading } = useAppBoot();
  const { showAuthModal, authMode, closeAuth } = useUIStore();
  const { showGate } = useSiteGate(user);

  useUTMCapture(user?.id);
  useSyncPushNotifs(user);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-400 mx-auto mb-4" />
          <p className="text-slate-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (showGate) {
    return <ComingSoon />;
  }

  const routes = getRoutes(user);

  return (
    <div className="App max-w-full">
      <Toaster position="top-center" richColors closeButton expand visibleToasts={5} />
      <BrowserRouter>
        <RouteScrollRestorer />
        <ScrollToTop />
        {showAuthModal && !user && <AuthModal onClose={closeAuth} initialMode={authMode} />}
        <Suspense fallback={<PageLoader />}>
          <Routes>
            {routes.map(r => <Route key={r.path} path={r.path} element={r.element} />)}
          </Routes>
        </Suspense>
      </BrowserRouter>
    </div>
  );
}

const SITE_ACCESS_KEY = 'bottomtime2026';
const GATE_CACHE_KEY = 'bt_gate_enabled_cache';
const SUPER_ADMINS = ['shubham@bottom-time.com'];

function useSiteGate(user) {
  // Honor the access key as before — instantly grants access on this device.
  const params = new URLSearchParams(window.location.search);
  const accessParam = params.get('access');
  if (accessParam === SITE_ACCESS_KEY) {
    localStorage.setItem('bt_site_access', 'granted');
    window.history.replaceState({}, '', window.location.pathname);
  }

  // Admin-only iframe preview of the gating page: render ComingSoon unconditionally,
  // regardless of access cookie or remote gate flag.
  const isGatePreview = params.get('gate_preview') === '1';

  // Prefer server-inlined bootstrap (zero flash, no network). Fall back to localStorage
  // cache, then default to ENABLED for first-ever visitors.
  const initialGateEnabled = (() => {
    if (typeof window !== 'undefined' && window.__BT_CMS_GATE__) {
      return window.__BT_CMS_GATE__.gate_enabled !== false;
    }
    try {
      const cached = localStorage.getItem(GATE_CACHE_KEY);
      return cached === null ? true : cached === '1';
    } catch { return true; }
  })();
  const [gateEnabled, setGateEnabled] = useState(initialGateEnabled);

  useEffect(() => {
    let cancelled = false;
    axios.get('/gate-content/public')
      .then(r => {
        const enabled = r.data?.gate_enabled !== false;
        if (cancelled) return;
        try { localStorage.setItem(GATE_CACHE_KEY, enabled ? '1' : '0'); } catch { /* ignore */ }
        setGateEnabled(enabled);
      })
      .catch(() => { /* keep cached value */ });
    return () => { cancelled = true; };
  }, []);

  // Env override — when REACT_APP_DISABLE_WAITLIST_GATE === "true" the gate is bypassed
  // entirely (no query param or localStorage required). Set to anything else / unset to
  // restore normal gating behaviour. Placed AFTER hooks to honor rules-of-hooks.
  if (process.env.REACT_APP_DISABLE_WAITLIST_GATE === 'true') {
    return { showGate: false, isPreview: false };
  }

  if (isGatePreview) return { showGate: true, isPreview: true };
  if (!gateEnabled) return { showGate: false, isPreview: false };

  // Super-admin bypass — authenticated super-admins always see the full site.
  if (user && SUPER_ADMINS.includes(user.email)) {
    return { showGate: false, isPreview: false };
  }

  const granted = localStorage.getItem('bt_site_access') === 'granted';
  return { showGate: !granted, isPreview: false };
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppInner />
    </QueryClientProvider>
  );
}

export default App;
