import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Anchor, Home, Waves, Users, ShoppingBag, MapPin, GraduationCap, Calendar, ShoppingCart, LogOut } from 'lucide-react';
import axios from 'axios';
import useAuthStore from '../stores/authStore';

export default function Dashboard() {
  const user = useAuthStore(s => s.user);
  const logout = useAuthStore(s => s.logout);
  const navigate = useNavigate();
  const [stats, setStats] = useState({ diveLogs: 0, posts: 0 });
  const [recentDives, setRecentDives] = useState([]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      const divesRes = await axios.get('/dive-logs');
      const postsRes = await axios.get('/posts');
      setRecentDives(divesRes.data.slice(0, 3));
      setStats({ diveLogs: divesRes.data.length, posts: postsRes.data.filter(p => p.user_id === user.id).length });
    } catch (e) { /* silent */ }
  };

  return (
    <div className="min-h-screen">
      <Navbar />
      
      <div className="max-w-[1600px] mx-auto px-6 lg:px-10 py-12" data-testid="dashboard-container">
        {/* Header */}
        <div className="glass-card rounded-3xl p-8 mb-8 fade-in">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-6">
              <img 
                src={user?.avatar_url} 
                alt={user?.name}
                className="w-24 h-24 rounded-full border-4 border-cyan-400/30"
                data-testid="user-avatar"
              loading="lazy" />
              <div>
                <h1 className="text-4xl font-bold mb-2" data-testid="user-name">{user?.name}</h1>
                <p className="text-slate-400" data-testid="user-bio">{user?.bio || 'Ocean explorer'}</p>
                <div className="flex gap-6 mt-4">
                  <div>
                    <span className="text-2xl font-bold text-cyan-400">{user?.total_dives || 0}</span>
                    <p className="text-sm text-slate-500">Total Dives</p>
                  </div>
                  <div>
                    <span className="text-2xl font-bold text-cyan-400">{user?.followers_count || 0}</span>
                    <p className="text-sm text-slate-500">Followers</p>
                  </div>
                  <div>
                    <span className="text-2xl font-bold text-cyan-400">{user?.following_count || 0}</span>
                    <p className="text-sm text-slate-500">Following</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <QuickAction icon={<Waves />} title="Log Dive" to="/dive-log" />
          <QuickAction icon={<Users />} title="Community" to="/community" />
          <QuickAction icon={<ShoppingBag />} title="Shop" to="/shop" />
          <QuickAction icon={<MapPin />} title="Trips" to="/trips" />
        </div>

        {/* Recent Dives */}
        <div className="glass-card rounded-3xl p-8" data-testid="recent-dives-section">
          <h2 className="text-2xl font-bold mb-6">Recent Dive Logs</h2>
          {recentDives.length > 0 ? (
            <div className="space-y-4">
              {recentDives.map(dive => (
                <div key={dive.id} className="bg-slate-900/50 rounded-2xl p-6 border border-white/5" data-testid="dive-log-item">
                  <h3 className="text-xl font-bold mb-2">{dive.title}</h3>
                  <div className="flex gap-6 text-sm text-slate-400">
                    <span>{dive.location}</span>
                    <span>{dive.depth}m depth</span>
                    <span>{dive.duration} mins</span>
                    <span>{new Date(dive.date).toLocaleDateString()}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-slate-400" data-testid="no-dives-message">No dive logs yet. Start logging your adventures!</p>
          )}
          <Link to="/dive-log">
            <button className="btn-secondary mt-6" data-testid="view-all-dives-btn">View All Dives</button>
          </Link>
        </div>
      </div>
    </div>
  );
}

function QuickAction({ icon, title, to }) {
  return (
    <Link to={to}>
      <div className="glass-card rounded-2xl p-6 cursor-pointer transition-all duration-300 hover:scale-105" data-testid="quick-action-card">
        <div className="text-cyan-400 mb-3">{icon}</div>
        <h3 className="font-bold">{title}</h3>
      </div>
    </Link>
  );
}

function Navbar() {
  const logout = useAuthStore(s => s.logout);
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <nav className="navbar" data-testid="main-navbar">
      <div className="max-w-[1600px] mx-auto px-6 lg:px-10 py-4">
        <div className="flex justify-between items-center">
          <Link to="/dashboard" className="flex items-center gap-2">
            <Anchor className="text-cyan-400" size={32} />
            <span className="text-2xl font-bold">Depth</span>
          </Link>
          
          <div className="flex items-center gap-2">
            <Link to="/dashboard" className="navbar-link" data-testid="nav-dashboard">
              <Home size={20} className="inline mr-2" />Dashboard
            </Link>
            <Link to="/dive-log" className="navbar-link" data-testid="nav-dive-log">
              <Waves size={20} className="inline mr-2" />Dive Log
            </Link>
            <Link to="/community" className="navbar-link" data-testid="nav-community">
              <Users size={20} className="inline mr-2" />Community
            </Link>
            <Link to="/shop" className="navbar-link" data-testid="nav-shop">
              <ShoppingBag size={20} className="inline mr-2" />Shop
            </Link>
            <Link to="/trips" className="navbar-link" data-testid="nav-trips">
              <MapPin size={20} className="inline mr-2" />Trips
            </Link>
            <Link to="/courses" className="navbar-link" data-testid="nav-courses">
              <GraduationCap size={20} className="inline mr-2" />Courses
            </Link>
            <Link to="/events" className="navbar-link" data-testid="nav-events">
              <Calendar size={20} className="inline mr-2" />Events
            </Link>
            <Link to="/cart" className="navbar-link" data-testid="nav-cart">
              <ShoppingCart size={20} />
            </Link>
            <button onClick={handleLogout} className="navbar-link" data-testid="logout-btn">
              <LogOut size={20} className="inline mr-2" />Logout
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}

export { Navbar };