import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import useAuthStore from '../stores/authStore';
import useUIStore from '../stores/uiStore';
import Footer from '../components/Footer';
import CountUp from '../components/CountUp';
import DepthGauge from '../components/DepthGauge';
import OceanEffects, { WaveDivider } from '../components/OceanEffects';
import { useReveal, useRevealGroup } from '../hooks/useReveal';
import { Compass, Users, Shield, MapPin, Star, ArrowRight, BookOpen, ShoppingBag, Calendar, Anchor, Waves } from 'lucide-react';
import axios from 'axios';

const HERO_IMG = 'https://images.unsplash.com/photo-1561623002-b6648b879b15?w=1600&q=80';
const IMG_TURTLE = 'https://images.unsplash.com/photo-1600342709088-bb70d3371bcd?w=800&q=80';
const IMG_DIVER = 'https://images.unsplash.com/photo-1762005814284-45fdc51acd76?w=800&q=80';
const IMG_BOAT = 'https://images.unsplash.com/photo-1760643995643-5e6e3506a964?w=800&q=80';
const IMG_COMMUNITY = 'https://images.unsplash.com/photo-1759860954693-e8e7c39d5ea7?w=800&q=80';

export default function LandingPage() {
  const user = useAuthStore(s => s.user);
  const openAuth = useUIStore(s => s.openAuth);
  const navigate = useNavigate();
  const [stats, setStats] = useState({});
  // Synchronously seed CMS state from the server-inlined bootstrap so first paint
  // already shows the published content. Eliminates the "fallback text → live text"
  // flash that was visible on hard reloads.
  const [cms, setCms] = useState(() => (typeof window !== 'undefined' ? window.__BT_CMS_LANDING__ : null) || null);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    axios.get('/stats/public').then(r => setStats(r.data)).catch(() => {});
    const previewDraft = new URLSearchParams(window.location.search).get('preview_draft') === '1';
    if (!previewDraft) {
      axios.get('/site-content/public').then(r => setCms(r.data)).catch(() => {});
      return undefined;
    }
    // Admin iframe preview: parent window posts { type: 'cms-preview', content } on load + each edit.
    const onMsg = (e) => {
      if (e?.data?.type === 'cms-preview' && e.data.content) setCms(e.data.content);
    };
    window.addEventListener('message', onMsg);
    // Tell parent we're ready to receive preview data
    if (window.parent !== window) window.parent.postMessage({ type: 'cms-preview-ready' }, '*');
    return () => window.removeEventListener('message', onMsg);
  }, []);

  const heroMediaType = cms?.hero_media_type || '';
  const heroImg = cms?.hero_image || '';
  const heroVideo = cms?.hero_video || '';
  const heroTitle = cms?.hero_title || 'The ocean is calling.';
  const heroSub = cms?.hero_subtitle || 'Find your next dive, gear, merch and buddy.';
  const heroDesc = cms?.hero_description || '';
  const ctaPrimaryLabel = cms?.cta_primary_label || 'Dive in';
  const ctaPrimaryLink = cms?.cta_primary_link || '/discover';
  const ctaSecondaryLabel = cms?.cta_secondary_label || '';
  const ctaSecondaryLink = cms?.cta_secondary_link || '';
  const sectionImgs = cms?.section_images || {};
  const imgTurtle = sectionImgs.about || IMG_TURTLE;
  const imgDiver = sectionImgs.curious || IMG_DIVER;
  const imgBoat = sectionImgs.operator || IMG_BOAT;
  // `community` is the slot that powers the Community section image. Backward compat:
  // older drafts may still use the legacy `group` key — backend normalises that, but
  // we also fall through to it here so a stale cached payload still renders.
  const imgCommunity = sectionImgs.community || sectionImgs.group || IMG_COMMUNITY;

  const aboutText = useReveal();
  const aboutImg = useReveal();
  const aboutBadge = useReveal(0.3);
  const curiousImg = useReveal();
  const curiousText = useReveal();
  const curiousBadge = useReveal(0.3);
  const diverHeader = useReveal();
  const diverCards = useRevealGroup();
  const operatorText = useReveal();
  const operatorImg = useReveal();
  const operatorStats = useRevealGroup(0.2);
  const communityText = useReveal();
  const communityImg = useReveal();
  const ctaRef = useReveal(0.3);
  const freeTextRef = useReveal();

  if (user) {
    const isPreview = new URLSearchParams(window.location.search).get('preview_draft') === '1';
    if (!isPreview && window.location.pathname === '/') { navigate('/discover'); return null; }
  }

  return (
    <div className="min-h-screen bg-white" data-testid="landing-page">

      <OceanEffects />
      <DepthGauge />

      {/* Sticky glass navbar with logo */}
      <nav className="fixed top-0 left-0 right-0 z-50" style={{ background: 'rgba(255,255,255,0.8)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)', borderBottom: '1px solid #f1f5f9' }} data-testid="landing-navbar">
        <div className="max-w-[1600px] mx-auto px-6 lg:px-10">
          <div className="flex items-center gap-2 h-[72px] md:h-[84px]">
            <Waves className="text-cyan-400 w-8 h-8" />
            <span className="text-xl font-heading font-bold tracking-tight text-slate-900">
              Bottom Time<sup className="text-[0.5em] font-semibold text-slate-500 ml-0.5 -top-1.5">TM</sup>
            </span>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative h-[100dvh] min-h-[600px] flex items-center justify-center ocean-gradient-bg grain-overlay overflow-hidden" data-testid="hero-section">
        {/* Optional background media — ONLY rendered when an admin has explicitly enabled it via CMS. */}
        {heroMediaType === 'video' && heroVideo ? (
          <video key={heroVideo} src={heroVideo} autoPlay muted loop playsInline className="absolute inset-0 w-full h-full object-cover opacity-60" data-testid="hero-video" />
        ) : heroMediaType === 'image' && heroImg ? (
          <img src={heroImg} alt="" aria-hidden className="absolute inset-0 w-full h-full object-cover opacity-50" data-testid="hero-image" />
        ) : null}
        <div className="max-w-7xl mx-auto px-6 md:px-12 w-full flex justify-start md:justify-center -mt-[6vh] md:-mt-[2vh] relative z-10">
          <div className="flex flex-col items-start md:items-center text-left md:text-center max-w-[75%] md:max-w-none">
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tighter leading-[1.05] mb-8 md:mb-6 rise-from-depth rise-delay-1">
              <span className="text-cyan-400" data-testid="hero-title">{heroTitle}</span>
              <br />
              <span className="text-slate-900" data-testid="hero-subtitle">{heroSub}</span>
            </h1>
            {heroDesc && (
              <p className="text-sm md:text-base text-slate-600 max-w-2xl mb-6 rise-from-depth rise-delay-2" data-testid="hero-description">{heroDesc}</p>
            )}
            <div className="flex flex-wrap gap-3 rise-from-depth rise-delay-2 justify-start md:justify-center mt-2 md:mt-0">
              <button onClick={() => { navigate(ctaPrimaryLink); window.scrollTo(0, 0); }} className="bg-cyan-400 hover:bg-cyan-300 text-white font-bold px-8 py-3 md:px-10 md:py-4 rounded-full text-base md:text-lg transition-all duration-300 hover:shadow-lg hover:shadow-cyan-400/30" data-testid="get-started-btn">
                {ctaPrimaryLabel}
              </button>
              {ctaSecondaryLabel && (
                <button onClick={() => { navigate(ctaSecondaryLink || '/discover'); window.scrollTo(0, 0); }} className="bg-white/70 hover:bg-white text-slate-800 font-bold px-8 py-3 md:px-10 md:py-4 rounded-full text-base md:text-lg transition-all duration-300 border border-slate-200 backdrop-blur" data-testid="get-started-secondary-btn">
                  {ctaSecondaryLabel}
                </button>
              )}
            </div>
          </div>
        </div>
        <div className="absolute bottom-0 mb-4 md:mb-8 left-6 md:left-0 md:right-0 md:flex md:justify-center flex flex-row md:flex-col items-center gap-1.5 md:gap-2 text-slate-400 hero-scroll-hint dive-deeper-pulse cursor-pointer rise-from-depth rise-delay-3" onClick={() => document.getElementById('about-section')?.scrollIntoView({ behavior: 'smooth' })}>
          <span className="text-xs tracking-wide font-heading font-semibold">Dive deeper</span>
          <svg className="w-3.5 h-3.5 md:w-4 md:h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 2v10M3 9l5 5 5-5" /></svg>
        </div>
      </section>

      {/* What is Bottom Time */}
      <WaveDivider color="#ffffff" />
      <section id="about-section" className="py-20 md:py-28 bg-white overflow-hidden">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center">
            <div ref={aboutText} className="reveal-left">
              <p className="text-cyan-400 font-bold text-sm tracking-widest uppercase mb-4">What is Bottom Time?</p>
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight leading-tight mb-6">
                One platform for everyone who loves the ocean.
              </h2>
              <p className="text-sm text-slate-600 leading-relaxed mb-6">
                Whether you're taking your first breath underwater or you've logged a thousand dives,
                Bottom Time is where the global diving community comes together. We built it
                because we believe finding your next dive should be as easy as planning a trip
                — and just as exciting.
              </p>
              <div className="space-y-6">
                {[
                  { icon: Compass, text: 'Discover fun dives, courses, liveaboards, and land-based trips across the world' },
                  { icon: Users, text: 'Connect with divers who share your passion and experience level' },
                  { icon: Shield, text: 'Book with confidence through verified operators' },
                ].map(({ icon: Icon, text }, i) => (
                  <div key={`k${i}`} className="flex gap-3">
                    <div className="w-5 h-5 rounded bg-cyan-50 flex items-center justify-center flex-shrink-0 mt-[2px]">
                      <Icon size={12} className="text-cyan-400" />
                    </div>
                    <p className="text-sm text-slate-600 leading-snug">{text}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="relative mb-8">
              <div ref={aboutImg} className="rounded-2xl overflow-hidden shadow-[0_20px_60px_rgb(0,0,0,0.15)] reveal-scale img-parallax">
                <img src={imgTurtle} alt="Sea turtle underwater" className="w-full h-80 lg:h-96 object-cover" loading="lazy" />
              </div>
              <div ref={aboutBadge} className="absolute -bottom-4 left-3 md:-bottom-6 md:-left-6 bg-white rounded-xl shadow-lg p-3 md:p-4 flex items-center gap-2.5 reveal-badge float-gentle w-fit" style={{ transitionDelay: '0.4s' }}>
                <div className="w-9 h-9 rounded-full bg-cyan-100 flex items-center justify-center flex-shrink-0">
                  <MapPin size={16} className="text-cyan-400" />
                </div>
                <div>
                  <p className="text-sm font-bold count-glow"><CountUp value={stats.countries || 0} suffix="+" /> Countries</p>
                  <p className="text-xs text-slate-500">Experiences worldwide</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* For the Curious */}
      <WaveDivider color="#f8fafc" />
      <section className="py-20 md:py-28 bg-slate-50 overflow-hidden">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center">
            <div className="order-2 lg:order-1 relative mb-8">
              <div ref={curiousImg} className="rounded-2xl overflow-hidden shadow-[0_20px_60px_rgb(0,0,0,0.12)] reveal-scale img-parallax">
                <img src={imgDiver} alt="Diver near coral and clownfish" className="w-full h-80 lg:h-96 object-cover" loading="lazy" />
              </div>
              <div ref={curiousBadge} className="absolute -bottom-4 right-3 md:bottom-auto md:-top-6 md:-right-6 bg-white rounded-xl shadow-lg p-3 md:p-4 flex items-center gap-2.5 reveal-badge float-gentle w-fit" style={{ transitionDelay: '0.4s' }}>
                <div className="w-9 h-9 rounded-full bg-cyan-100 flex items-center justify-center flex-shrink-0">
                  <Star size={16} className="text-cyan-600" />
                </div>
                <div>
                  <p className="text-sm font-bold count-glow"><span className="rating-pulse">{stats.avg_rating || '–'}</span> avg rating</p>
                  <p className="text-xs text-slate-500">Across all operators</p>
                </div>
              </div>
            </div>
            <div className="order-1 lg:order-2 reveal-right" ref={curiousText}>
                <p className="text-cyan-400 font-bold text-sm tracking-widest uppercase mb-4">Never dived before?</p>
                <h2 className="text-2xl sm:text-3xl font-bold tracking-tight leading-tight mb-6">
                  Start with curiosity. We'll handle the rest.
                </h2>
                <p className="text-sm text-slate-600 leading-relaxed mb-6">
                  You don't need a certification to start. Browse beginner-friendly courses,
                  read real reviews from people who were in your fins, and book a "try dive"
                  that fits your schedule and comfort level. Every operator on Bottom Time
                  is verified, so you can focus on the thrill.
                </p>
                <button onClick={() => navigate('/pathways')} className="flex items-center gap-2 text-cyan-400 font-semibold bg-cyan-50 px-5 py-2.5 rounded-full hover:bg-cyan-100 transition-colors duration-300" data-testid="learn-more-btn">
                  Explore beginner pathways <ArrowRight size={18} />
                </button>
            </div>
          </div>
        </div>
      </section>

      {/* For Divers */}
      <WaveDivider color="#ffffff" />
      <section className="py-20 md:py-28 bg-white overflow-hidden">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <div ref={diverHeader} className="mb-16 reveal">
            <p className="text-cyan-400 font-bold text-sm tracking-widest uppercase mb-4">For certified divers</p>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight leading-tight mb-4">
              Your dive life, all in one place.
            </h2>
            <p className="text-sm text-slate-500 max-w-xl">
              Plan trips, find buddies, log dives, and discover hidden gems — without juggling five different apps.
            </p>
          </div>
          <div ref={diverCards} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 auto-rows-fr">
            {[
              { icon: Compass, title: 'Discover', desc: 'Search fun dives, liveaboards, land-based trips, and courses filtered by location, price, and difficulty.', link: '/discover' },
              { icon: BookOpen, title: 'Upskill', desc: 'Go from Open Water to Advanced, Rescue, Divemaster, or a specialty — find courses and pathways to level up.', link: '/pathways' },
              { icon: ShoppingBag, title: 'Shop', desc: 'Gear up with dive essentials, merch, and accessories from the Bottom Time store.', link: '/shop' },
              { icon: Users, title: 'Connect', desc: 'Find dive buddies by cert level, location, and interests. No awkward small talk required.', link: '/community' },
              { icon: Calendar, title: 'Meet', desc: 'Surface intervals are better together. Find local meetups, socials, and dive talks happening on land.', link: '/events' },
              { icon: Anchor, title: 'Log', desc: 'Track every dive — depth, duration, conditions, buddy, and your personal rating.', link: '/dive-logs' },
            ].map(({ icon: Icon, title, desc, link }, i) => (
              <div
                key={`k${i}`}
                data-reveal-child
                onClick={() => navigate(link)}
                className={`reveal group p-6 rounded-2xl border border-slate-100 hover:border-cyan-200 hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] transition-all duration-300 cursor-pointer stagger-${i + 1}`}
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-xl bg-cyan-50 group-hover:bg-cyan-100 flex items-center justify-center flex-shrink-0 transition-colors">
                    <Icon size={20} className="text-cyan-400" />
                  </div>
                  <h3 className="text-base font-bold">{title}</h3>
                </div>
                <p className="text-sm text-slate-500 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* For Instructors & Operators */}
      <WaveDivider color="#0f172a" />
      <section className="py-20 md:py-28 bg-slate-900 text-white overflow-hidden relative">
        <div className="absolute inset-0 opacity-[0.02]" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 256 256\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23n)\' opacity=\'1\'/%3E%3C/svg%3E")' }} />
        <div className="max-w-7xl mx-auto px-6 md:px-12 relative">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center">
            <div>
              <div ref={operatorText} className="reveal-left">
                <p className="text-cyan-400 font-bold text-sm tracking-widest uppercase mb-4">For instructors & operators</p>
                <h2 className="text-2xl sm:text-3xl font-bold tracking-tight leading-tight mb-6">
                  The divers are already here.
                  <br />Show them what you offer.
                </h2>
                <p className="text-sm text-white/60 leading-relaxed mb-8">
                  List your dives, courses, or liveaboard experiences. Manage bookings, respond to reviews,
                  and grow your reputation in a community that values quality over marketing.
                </p>
              </div>
              <div ref={operatorStats} className="grid grid-cols-3 gap-4 mb-6">
                {[
                  { num: stats.divers || 0, label: 'Divers on the platform' },
                  { num: stats.bookings || 0, label: 'Bookings made' },
                  { num: stats.reviews || 0, label: 'Reviews written' },
                ].map(({ num, label }, i) => (
                  <div key={`k${i}`} data-reveal-child className={`reveal bg-white/5 rounded-xl p-4 stagger-${i + 1}`}>
                    <p className="text-2xl font-bold text-cyan-400"><CountUp value={num} duration={2000} /></p>
                    <p className="text-xs text-white/50">{label}</p>
                  </div>
                ))}
              </div>
              <p className="text-sm text-white/40 mb-8 reveal" ref={freeTextRef}>Free to list. No setup fees.</p>
              <button onClick={() => openAuth('signup')} className="bg-cyan-400 hover:bg-cyan-300 text-white font-bold px-8 py-3.5 rounded-full transition-all duration-300 hover:shadow-lg hover:shadow-cyan-400/30" data-testid="list-business-btn">
                List your business
              </button>
            </div>
            <div className="relative reveal-zoom" ref={operatorImg}>
              <div className="rounded-2xl overflow-hidden shadow-2xl img-parallax">
                <img src={imgBoat} alt="Dive boat in turquoise water" className="w-full h-80 lg:h-96 object-cover" loading="lazy" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Community */}
      <WaveDivider color="#ffffff" flip />
      <section className="py-20 md:py-28 bg-white overflow-hidden">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center">
            <div ref={communityText} className="reveal-left">
              <p className="text-cyan-400 font-bold text-sm tracking-widest uppercase mb-4">More than a marketplace</p>
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight leading-tight mb-6">
                A community that goes deeper.
              </h2>
              <p className="text-sm text-slate-600 leading-relaxed mb-6">
                Bottom Time isn't about followers or likes. It's about finding someone who'll check your gear,
                share an air tank, and tell you where the mantas are. Real connections between real divers —
                from weekend warriors to full-time instructors.
              </p>
              <div className="flex flex-wrap gap-3 mb-6">
                {['Dive Buddies', 'Group Chats', 'Trip Planning', 'Meetups & Social Dives', 'Gear Talk'].map(tag => (
                  <span key={tag} className="px-3 py-1.5 rounded-full bg-slate-100 text-slate-700 text-xs font-medium hover:bg-cyan-50 hover:text-cyan-600 transition-colors cursor-default">{tag}</span>
                ))}
              </div>
              <button onClick={() => navigate('/community')} className="flex items-center gap-2 text-cyan-400 font-semibold bg-cyan-50 px-5 py-2.5 rounded-full hover:bg-cyan-100 transition-colors duration-300">
                Connect with divers <ArrowRight size={18} />
              </button>
            </div>
            <div ref={communityImg} className="rounded-2xl overflow-hidden shadow-[0_20px_60px_rgb(0,0,0,0.12)] reveal-zoom img-parallax">
              <img src={imgCommunity} alt="Group heading to dive site" className="w-full h-80 lg:h-96 object-cover" loading="lazy" />
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <WaveDivider color="#f8fafc" />
      <section className="py-20 md:py-28 bg-slate-50 overflow-hidden relative">
        <div ref={ctaRef} className="max-w-3xl mx-auto px-6 md:px-12 text-center reveal-scale">
          <button onClick={() => { navigate('/discover'); window.scrollTo(0, 0); }} className="bg-cyan-400 hover:bg-cyan-300 text-white font-bold px-8 py-3.5 rounded-full text-base transition-all duration-300 hover:shadow-lg hover:shadow-cyan-400/30" data-testid="final-cta-btn">
            Dive in
          </button>
        </div>
      </section>

      <Footer />
    </div>
  );
}
