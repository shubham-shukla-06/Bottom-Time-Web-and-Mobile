import { useState, Suspense, lazy, useCallback, useMemo } from 'react';
import useAuthStore from '../stores/authStore';
import useUIStore from '../stores/uiStore';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { Waves, Anchor, Plus, Activity } from 'lucide-react';
import { DiveEducationPanel } from '../components/DiveEducation';
import useDiveTabs from '../hooks/useDiveTabs';
import useDiveLogs from '../hooks/useDiveLogs';
import { TabContentSkeleton } from '../components/Skeletons';

const OverviewTab = lazy(() => import('../components/dive/OverviewTab'));
const DiveLogTab = lazy(() => import('../components/dive/DiveLogTab'));
const PlannerTab = lazy(() => import('../components/dive/PlannerTab'));
const DiveShareModal = lazy(() => import('../components/DiveShareModal'));
const LogDiveModal = lazy(() => import('../components/modals/LogDiveModal'));

const TABS = [
  { key: 'overview', label: 'Overview', icon: Activity },
  { key: 'log', label: 'Dive Log', icon: Anchor },
  { key: 'planner', label: 'Planner', icon: Waves },
];

export default function DiveDashboard() {
  const user = useAuthStore(s => s.user);
  const openAuth = useUIStore(s => s.openAuth);
  const { tab, changeTab } = useDiveTabs('overview');
  const { logs, stats, loading, refreshLogs } = useDiveLogs(user);
  const [showEducation, setShowEducation] = useState(false);
  const [shareDive, setShareDive] = useState(null);
  const [showLogForm, setShowLogForm] = useState(false);
  const [editingDive, setEditingDive] = useState(null);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const openLogForm = useCallback(() => { setEditingDive(null); setShowLogForm(true); }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const closeLogForm = useCallback(() => { setShowLogForm(false); setEditingDive(null); }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const closeShare = useCallback(() => setShareDive(null), []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const handleEditDive = useCallback((dive) => { setEditingDive(dive); setShowLogForm(true); }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const handleLogged = useCallback(() => {
    setShowLogForm(false);
    setEditingDive(null);
    refreshLogs();
    changeTab('log');
  }, [refreshLogs, changeTab]);

  const tabFallback = useMemo(() => (
    <TabContentSkeleton />
  ), []);

  if (!user) {
    return (
      <div className="min-h-screen bg-white flex flex-col">
        <Navbar />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <Anchor className="text-slate-300 mx-auto mb-4" size={48} />
            <h1 className="text-2xl font-bold mb-2">My Dives</h1>
            <p className="text-slate-500 mb-4 max-w-md">Track every dive, plan your next adventure, and explore your diving data.</p>
            <button onClick={() => openAuth()} className="btn-primary px-6 py-3 text-sm" data-testid="dive-in-btn">Dive in</button>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Navbar />
      <div className="flex-1 max-w-[1600px] mx-auto w-full px-4 sm:px-6 md:px-12 py-6 sm:py-8" data-testid="dive-dashboard">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-5 gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">My Dives</h1>
            <p className="text-slate-500 text-sm mt-0.5">Track, plan, and explore your diving life</p>
          </div>
          <div className="flex gap-2.5 self-start sm:self-auto">
            <button onClick={openLogForm} className="h-10 px-5 sm:px-6 bg-cyan-400 hover:bg-cyan-500 text-white rounded-xl text-sm font-bold flex items-center gap-2 transition-colors shadow-sm" data-testid="log-dive-btn">
              <Plus size={15} /> Log a Dive
            </button>
          </div>
        </div>

        <div className="flex gap-1.5 mb-6 bg-white rounded-xl p-1.5 shadow-sm border border-slate-100 w-full sm:w-fit" data-testid="dive-tabs">
          {TABS.map(t => (
            <button key={t.key} onClick={() => changeTab(t.key)}
              className={`h-9 flex-1 sm:flex-none px-4 sm:px-5 rounded-lg text-sm font-semibold transition-all flex items-center justify-center gap-2 whitespace-nowrap ${tab === t.key ? 'bg-cyan-400 text-white shadow-sm' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'}`}
              data-testid={`tab-${t.key}`}>
              <t.icon size={15} /> {t.label}
            </button>
          ))}
        </div>

        {loading && tab !== 'planner' ? (
          tabFallback
        ) : (
          <Suspense fallback={tabFallback}>
            {tab === 'overview' && <OverviewTab stats={stats} logs={logs} onChangeTab={changeTab} />}
            {tab === 'log' && <DiveLogTab logs={logs} stats={stats} refreshLogs={refreshLogs} onShare={setShareDive} onEdit={handleEditDive} />}
            {tab === 'planner' && <PlannerTab />}
          </Suspense>
        )}
      </div>
      {showEducation && <DiveEducationPanel onClose={() => setShowEducation(false)} />}
      {shareDive && <Suspense fallback={null}><DiveShareModal dive={shareDive} onClose={closeShare} /></Suspense>}
      {showLogForm && (
        <Suspense fallback={null}>
          <LogDiveModal onClose={closeLogForm} onLogged={handleLogged} dive={editingDive} />
        </Suspense>
      )}
      <Footer />
    </div>
  );
}
