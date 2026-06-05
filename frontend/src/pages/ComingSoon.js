import { useState, useEffect } from 'react';
import { Waves, ArrowRight, Check } from 'lucide-react';
import axios from 'axios';

const GATE_CONTENT_CACHE_KEY = 'bt_gate_content_cache';
// The gating page hero image is now a fixed, bundled asset shipped with the
// frontend (`/gate-hero.jpg`, preloaded in index.html). It is intentionally
// NOT controlled by the CMS — admins only edit the page's text. This guarantees
// zero flash and zero possibility of a missing/broken image during a
// maintenance window.
const HERO_IMG = '/gate-hero.jpg';

function readCache() {
  // Server-inlined CMS data via /api/cms-bootstrap.js loaded before the React bundle.
  // Synchronous, zero network roundtrip, zero flash on first paint.
  if (typeof window !== 'undefined' && window.__BT_CMS_GATE__) return window.__BT_CMS_GATE__;
  try {
    const raw = localStorage.getItem(GATE_CONTENT_CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export default function ComingSoon() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState('idle');
  const [count, setCount] = useState(0);
  // Synchronously seed from cache so a return visitor never sees the old default
  // image flash — they immediately see the most-recently-published version, then
  // the live fetch swaps in any fresh changes once it lands.
  const [content, setContent] = useState(readCache);
  const [previewMode, setPreviewMode] = useState(false);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    axios.get('/waitlist/count').then(r => setCount(r.data?.count || 0)).catch(() => {});

    const isPreviewDraft = new URLSearchParams(window.location.search).get('preview_draft') === '1';
    if (isPreviewDraft) {
      setPreviewMode(true);
      const onMsg = (e) => {
        if (e?.data?.type === 'cms-preview-gating' && e.data.content) setContent(e.data.content);
      };
      window.addEventListener('message', onMsg);
      // Tell parent we're ready to receive draft preview data
      if (window.parent !== window) window.parent.postMessage({ type: 'cms-preview-ready' }, '*');
      return () => window.removeEventListener('message', onMsg);
    }

    axios.get('/gate-content/public').then(r => {
      setContent(r.data);
      try { localStorage.setItem(GATE_CONTENT_CACHE_KEY, JSON.stringify(r.data)); } catch { /* quota */ }
    }).catch(() => {});
    return undefined;
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim() || status === 'loading') return;
    setStatus('loading');
    try {
      await axios.post('/waitlist', { email: email.trim().toLowerCase() });
      setStatus('success');
      setCount(c => c + 1);
    } catch (err) {
      if (err.response?.status === 409) {
        setStatus('duplicate');
      } else {
        setStatus('error');
      }
    }
  };

  const heroImg = HERO_IMG;
  const badgeText = content?.badge_text || 'Under Development';
  const accentTitle = content?.accent_title || 'The ocean is calling.';
  const slateTitle = content?.slate_title || "We're getting ready.";
  const description = content?.description || (
    "Bottom Time is building the ultimate platform for divers — discover experiences, " +
    "log your dives, find gear, and connect with a global community. " +
    "Be the first to know when we launch."
  );
  const emailPlaceholder = content?.email_placeholder || 'Enter your email';
  const submitLabel = content?.submit_label || 'Notify me';
  const footerText = content?.footer_text || `© ${new Date().getFullYear()} Bottom Time. All rights reserved.`;

  return (
    <div className="relative min-h-[100dvh] flex flex-col" data-testid="coming-soon-page">
      {/* Background */}
      <div className="absolute inset-0 z-0">
        <img src={heroImg} alt="" className="w-full h-full object-cover" data-testid="coming-soon-hero-img" />
        <div className="absolute inset-0 bg-gradient-to-b from-slate-950/70 via-slate-950/60 to-slate-950/90" />
      </div>

      {/* Content */}
      <div className="relative z-10 flex flex-col min-h-[100dvh]">
        {/* Nav */}
        <nav className="px-6 md:px-12 py-6" data-testid="coming-soon-nav">
          <div className="max-w-7xl mx-auto flex items-center justify-center md:justify-start gap-2.5">
            <Waves className="text-cyan-400 w-8 h-8" />
            <span className="text-xl font-bold tracking-tight text-white">
              Bottom Time<sup className="text-[0.5em] font-semibold text-slate-400 ml-0.5 -top-1.5">TM</sup>
            </span>
          </div>
        </nav>

        {/* Hero */}
        <main className="flex-1 flex items-center px-6 md:px-12 py-8 sm:py-12 md:py-0">
          <div className="max-w-7xl mx-auto w-full">
            <div className="max-w-2xl text-center md:text-left">
              <div className="inline-flex items-center gap-2.5 bg-cyan-400/10 ring-1 ring-cyan-400/30 rounded-full px-4 py-1.5 mb-5 sm:mb-8" data-testid="coming-soon-badge">
                <span className="relative flex w-2.5 h-2.5">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75 animate-ping" />
                  <span className="relative inline-flex w-2.5 h-2.5 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.7)]" />
                </span>
                <span className="text-cyan-300 text-sm font-semibold tracking-wide">{badgeText}</span>
              </div>

              <h1 className="text-3xl sm:text-5xl lg:text-6xl font-bold tracking-tight sm:tracking-tighter leading-tight sm:leading-[1.05] mb-4 sm:mb-6" data-testid="coming-soon-title">
                <span className="text-white">{accentTitle}</span>
                <br />
                <span className="text-cyan-400">{slateTitle}</span>
              </h1>

              <p className="text-base sm:text-lg text-slate-300 leading-relaxed mb-8 sm:mb-10 max-w-lg mx-auto md:mx-0" data-testid="coming-soon-description">
                {description}
              </p>

              {/* Email Signup — disabled in preview mode so admins can't accidentally submit */}
              {status === 'success' || status === 'duplicate' ? (
                <div className="flex items-center gap-3 bg-cyan-400/10 border border-cyan-400/20 rounded-2xl px-6 py-4 text-left" data-testid="coming-soon-success">
                  <div className="w-10 h-10 rounded-full bg-cyan-400/20 flex items-center justify-center flex-shrink-0">
                    <Check className="w-5 h-5 text-cyan-400" />
                  </div>
                  <div>
                    <p className="text-white font-semibold">
                      {status === 'duplicate' ? "You're already on the list!" : "You're on the list!"}
                    </p>
                    <p className="text-slate-400 text-sm">We'll notify you as soon as Bottom Time launches.</p>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="flex flex-col md:flex-row gap-3" data-testid="coming-soon-form">
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder={emailPlaceholder}
                    disabled={previewMode}
                    className="flex-1 bg-white/10 border border-white/15 rounded-xl px-5 py-3.5 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-400/50 focus:border-cyan-400/50 backdrop-blur-sm text-base disabled:opacity-60 text-center md:text-left"
                    data-testid="coming-soon-email-input"
                  />
                  <button
                    type="submit"
                    disabled={status === 'loading' || previewMode}
                    className="bg-cyan-400 hover:bg-cyan-300 disabled:opacity-60 !text-white font-bold px-8 py-3.5 rounded-xl text-base transition-all duration-300 hover:shadow-lg hover:shadow-cyan-400/30 flex items-center justify-center gap-2 whitespace-nowrap [&_svg]:text-white"
                    data-testid="coming-soon-submit-btn"
                  >
                    {status === 'loading' ? (
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <>{submitLabel} <ArrowRight className="w-4 h-4 text-white" /></>
                    )}
                  </button>
                </form>
              )}

              {status === 'error' && (
                <p className="text-red-400 text-sm mt-3">Something went wrong. Please try again.</p>
              )}

              {count > 0 && (
                <p className="text-slate-500 text-sm mt-4" data-testid="coming-soon-count">
                  {count} diver{count !== 1 ? 's' : ''} already on the waitlist
                </p>
              )}
            </div>
          </div>
        </main>

        {/* Footer */}
        <footer className="px-4 sm:px-6 md:px-12 py-6">
          <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-3 md:gap-6 text-center md:text-left">
            <p className="text-slate-500 text-xs sm:text-sm" data-testid="coming-soon-footer">{footerText}</p>
            <div className="flex items-center gap-1.5 text-slate-600">
              <Waves className="w-4 h-4 text-cyan-400/40" />
              <span className="text-xs tracking-wide">bottom-time.com</span>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
