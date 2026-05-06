import { useState, useCallback, Suspense, lazy, useMemo } from 'react';
import useAuthStore from '../stores/authStore';
import useUIStore from '../stores/uiStore';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { Activity, MessageCircle, Users, User, Waves } from 'lucide-react';
import { TabContentSkeleton } from '../components/Skeletons';
import useTabParam from '../hooks/useTabParam';
const FeedTab = lazy(() => import('../components/connect/FeedTab'));
const MessagesTab = lazy(() => import('../components/connect/MessagesTab'));
const BuddiesTab = lazy(() => import('../components/connect/BuddiesTab'));
const ProfileTab = lazy(() => import('../components/connect/ProfileTab'));

const TABS = [
  { key: 'feed', label: 'Feed', icon: Activity },
  { key: 'messages', label: 'Messages', icon: MessageCircle },
  { key: 'buddies', label: 'Find Buddies', icon: Users },
  { key: 'profile', label: 'My Profile', icon: User },
];

export default function Community() {
  const user = useAuthStore(s => s.user);
  const openAuth = useUIStore(s => s.openAuth);
  const validKeys = useMemo(() => TABS.map(t => t.key), []);
  const [tab, setTab] = useTabParam('tab', 'feed', validKeys);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const handleTabChange = useCallback((nextTab) => setTab(nextTab), [setTab]);
  const tabFallback = useMemo(() => (
    <TabContentSkeleton />
  ), []);

  if (!user) return (
    <div className="min-h-screen bg-slate-50 flex flex-col"><Navbar />
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="text-center">
          <div className="w-16 h-16 rounded-full bg-cyan-100 flex items-center justify-center mx-auto mb-4"><Waves size={28} className="text-cyan-500" /></div>
          <h2 className="text-xl font-bold mb-2">Connect</h2>
          <p className="text-slate-500 text-sm mb-4 max-w-sm">Your dive community — feed, messages, buddies, and your profile all in one place.</p>
          <button onClick={openAuth} className="h-10 px-6 bg-cyan-400 hover:bg-cyan-500 text-white rounded-full text-sm font-bold transition-colors" data-testid="connect-signin">Dive in</button>
        </div>
      </div>
      <Footer />
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Navbar />
      <div className="flex-1 max-w-6xl mx-auto w-full px-4 sm:px-6 py-5" data-testid="connect-page">
        {/* Tab Bar */}
        <div className="flex gap-1 mb-5 bg-white rounded-xl p-1 shadow-sm border border-slate-100 sticky top-[73px] z-30" data-testid="connect-tabs">
          {TABS.map(t => (
            <button key={t.key} onClick={() => handleTabChange(t.key)}
              className={`h-10 flex-1 rounded-lg text-xs sm:text-sm font-semibold transition-all flex items-center justify-center gap-1.5 whitespace-nowrap ${tab === t.key ? 'bg-cyan-400 text-white shadow-sm' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'}`}
              data-testid={`connect-tab-${t.key}`}>
              <t.icon size={15} />
              <span className="hidden sm:inline">{t.label}</span>
              <span className="sm:hidden">{t.label.split(' ')[0]}</span>
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <Suspense fallback={tabFallback}>
          {tab === 'feed' && <FeedTab />}
          {tab === 'messages' && <MessagesTab />}
          {tab === 'buddies' && <BuddiesTab />}
          {tab === 'profile' && <ProfileTab />}
        </Suspense>
      </div>
      <Footer />
    </div>
  );
}
