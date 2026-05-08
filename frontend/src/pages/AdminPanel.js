import { useState, useEffect, lazy, Suspense, useMemo } from 'react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { Shield, Layers } from 'lucide-react';
import axios from 'axios';
import { SECTIONS } from './admin/constants';
import { AdminSectionSkeleton } from '../components/Skeletons';
import AlertsBanner from './admin/AlertsBanner';
import ShareAnalyticsTab from '../components/ShareAnalyticsTab';
import useTabParam from '../hooks/useTabParam';

const PulseSection = lazy(() => import('./admin/PulseSection'));
const DrillDownSection = lazy(() => import('./admin/DrillDownSection'));
const MarketingSection = lazy(() => import('./admin/MarketingSection'));
const FunnelsSection = lazy(() => import('./admin/FunnelsSection'));
const CampaignsSection = lazy(() => import('./admin/CampaignsSection'));
const ReferralsSection = lazy(() => import('./admin/ReferralsSection'));
const OperatorSection = lazy(() => import('./admin/OperatorSection'));
const UserJourneySection = lazy(() => import('./admin/UserJourneySection'));
const DiscoverSection = lazy(() => import('./admin/DiscoverSection'));
const PathwaySection = lazy(() => import('./admin/PathwaySection'));
const ShopSection = lazy(() => import('./admin/ShopSection'));
const InventorySection = lazy(() => import('./admin/InventorySection'));
const CommunitySection = lazy(() => import('./admin/CommunitySection'));
const ChatSection = lazy(() => import('./admin/ChatSection'));
const EventsSection = lazy(() => import('./admin/EventsSection'));
const RevenueSection = lazy(() => import('./admin/RevenueSection'));
const CashflowSection = lazy(() => import('./admin/CashflowSection'));
const ComplianceSection = lazy(() => import('./admin/ComplianceSection'));
const TrustSection = lazy(() => import('./admin/TrustSection'));
const PlatformSection = lazy(() => import('./admin/PlatformSection'));
const PerformanceSection = lazy(() => import('./admin/PerformanceSection'));
const ManageSection = lazy(() => import('./admin/ManageSection'));
const FulfillmentSection = lazy(() => import('./admin/FulfillmentSection'));
const OperatorApplicationsSection = lazy(() => import('./admin/OperatorApplicationsSection'));
const WaitlistSection = lazy(() => import('./admin/WaitlistSection'));
const SecuritySection = lazy(() => import('./admin/SecuritySection'));
const SiteContentEditor = lazy(() => import('./admin/SiteContentEditor'));
const GatingPageEditor = lazy(() => import('./admin/GatingPageEditor'));
const WelcomeCarouselSection = lazy(() => import('./admin/WelcomeCarouselSection'));

export default function AdminPanel() {
  const validSectionKeys = useMemo(() => SECTIONS.map(s => s.key), []);
  const [section, setSection] = useTabParam('section', 'pulse', validSectionKeys);
  const [sideOpen, setSideOpen] = useState(true);
  const [alerts, setAlerts] = useState([]);
  const [drillCountry, setDrillCountry] = useState(null);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    axios.get('/cmd/alerts').then(r => setAlerts(r.data.alerts || [])).catch(() => {});
  }, []);

  const groups = {};
  SECTIONS.forEach(s => { if (!groups[s.group]) groups[s.group] = []; groups[s.group].push(s); });

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      <Navbar />
      <div className="flex flex-1 max-w-[1600px] w-full mx-auto" data-testid="admin-panel">
        <aside className={`${sideOpen ? 'w-52' : 'w-0 overflow-hidden'} flex-shrink-0 bg-white border-r border-slate-200 transition-all duration-200`}>
          <div className="sticky top-0 py-4 px-3 space-y-1">
            <div className="flex items-center gap-2 px-2 mb-4">
              <div className="w-7 h-7 rounded-lg bg-cyan-100 flex items-center justify-center"><Shield size={14} className="text-cyan-400" /></div>
              <span className="text-sm font-bold text-slate-900 tracking-tight">Command</span>
            </div>
            {Object.entries(groups).map(([group, items]) => (
              <div key={group} className="mt-3">
                <p className="text-[10px] font-extrabold text-cyan-400 uppercase tracking-widest px-2 mb-1.5 pt-2 border-t border-slate-100 first:border-0 first:pt-0">{group}</p>
                {items.map(s => (
                  <button key={s.key} onClick={() => setSection(s.key)}
                    className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all mb-0.5 ${section === s.key ? 'bg-cyan-50 text-cyan-400 font-semibold' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}
                    data-testid={`cmd-nav-${s.key}`}>
                    <s.icon size={13} className={section === s.key ? 'text-cyan-400' : 'text-slate-400'} />
                    {s.label}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </aside>

        <main className="flex-1 min-w-0 p-5">
          <button onClick={() => setSideOpen(!sideOpen)} className="mb-3 p-1.5 rounded-lg hover:bg-slate-200 text-slate-400 lg:hidden" data-testid="toggle-sidebar">
            <Layers size={16} />
          </button>

          {alerts.length > 0 && (() => {
            // Platform Pulse shows everything; every other section sees only the
            // alerts that target it (each alert carries a `section` from the backend).
            const visible = section === 'pulse' ? alerts : alerts.filter(a => a.section === section);
            return visible.length > 0 ? <AlertsBanner alerts={visible} onNavigate={setSection} /> : null;
          })()}

          <Suspense fallback={<AdminSectionSkeleton />}>
            {section === 'pulse' && <PulseSection />}
            {section === 'drilldown' && <DrillDownSection country={drillCountry} setCountry={setDrillCountry} />}
            {section === 'marketing' && <MarketingSection />}
            {section === 'share-tracking' && <ShareAnalyticsTab scope="admin" />}
            {section === 'funnels' && <FunnelsSection />}
            {section === 'campaigns' && <CampaignsSection />}
            {section === 'referrals' && <ReferralsSection />}
            {section === 'operators' && <OperatorSection />}
            {section === 'journeys' && <UserJourneySection />}
            {section === 'discover' && <DiscoverSection />}
            {section === 'pathway' && <PathwaySection />}
            {section === 'shop' && <ShopSection />}
            {section === 'inventory' && <InventorySection />}
            {section === 'fulfillment' && <FulfillmentSection />}
            {section === 'operator-apps' && <OperatorApplicationsSection />}
            {section === 'community' && <CommunitySection />}
            {section === 'chat' && <ChatSection />}
            {section === 'events' && <EventsSection />}
            {section === 'revenue' && <RevenueSection />}
            {section === 'cashflow' && <CashflowSection />}
            {section === 'compliance' && <ComplianceSection />}
            {section === 'trust' && <TrustSection />}
            {section === 'platform' && <PlatformSection />}
            {section === 'performance' && <PerformanceSection />}
            {section === 'manage' && <ManageSection />}
            {section === 'waitlist' && <WaitlistSection />}
            {section === 'security' && <SecuritySection />}
            {section === 'landing-content' && <SiteContentEditor />}
            {section === 'welcome-carousel' && <WelcomeCarouselSection />}
            {section === 'gating-content' && <GatingPageEditor />}
          </Suspense>
        </main>
      </div>
      <Footer />
    </div>
  );
}
