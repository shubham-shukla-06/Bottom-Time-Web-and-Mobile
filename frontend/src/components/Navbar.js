import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useState, useRef, useEffect } from 'react';
import useAuthStore from '../stores/authStore';
import useCartStore from '../stores/cartStore';
import useUIStore from '../stores/uiStore';
import { Compass, LayoutDashboard, BookOpen, User, Settings, LogOut, ShoppingBag, ShoppingCart, Users, Calendar, MessageCircle, Menu, X, ChevronDown, Heart, Globe, Waves, BellRing, Map, Fish } from 'lucide-react';
import NotificationBell from './NotificationBell';

export default function Navbar() {
  const user = useAuthStore(s => s.user);
  const logout = useAuthStore(s => s.logout);
  const openAuth = useUIStore(s => s.openAuth);
  const pushNotifs = useUIStore(s => s.pushNotifs);
  const cartCount = useCartStore(s => s.cartCount);
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [showPushPrompt, setShowPushPrompt] = useState(false);
  const settingsRef = useRef(null);

  // Show push notification prompt once for logged-in users
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (user && pushNotifs?.supported && pushNotifs?.permission === 'default' && !sessionStorage.getItem('push_prompt_dismissed')) {
      const timer = setTimeout(() => setShowPushPrompt(true), 3000);
      return () => clearTimeout(timer);
    }
  }, [user, pushNotifs]);

  const isActive = (path) => location.pathname === path;
  const isDiver = user?.role === 'diver';
  const isOperator = user?.role === 'operator';
  const isInstructor = user?.role === 'instructor';
  const isAdmin = user?.role === 'admin';
  const isBusiness = isOperator || isInstructor;

  const closeMobile = () => setMobileOpen(false);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const handler = (e) => { if (settingsRef.current && !settingsRef.current.contains(e.target)) setSettingsOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const NavLink = ({ to, icon: Icon, label, testId }) => (
    <Link to={to} className={`nav-link flex items-center gap-1.5 ${isActive(to) ? 'active' : ''}`} data-testid={testId} onClick={closeMobile}>
      <Icon size={16} />{label}
    </Link>
  );

  return (
    <>
    <nav className="navbar" data-testid="main-navbar">
      <div className="max-w-[1600px] mx-auto px-6 lg:px-10 py-4">
        <div className="flex justify-between items-center">
          <Link to="/home" className="flex items-center gap-2" data-testid="logo" onClick={closeMobile}>
            <Waves className="text-cyan-400 w-8 h-8" />
            <span className="text-xl font-heading font-bold tracking-tight text-slate-900">
              Bottom Time<sup className="text-[0.5em] font-semibold text-slate-500 ml-0.5 -top-1.5">TM</sup>
            </span>
          </Link>

          {/* Desktop */}
          <div className="hidden md:flex items-center gap-1">
            {(!user || isDiver || isAdmin) && <NavLink to="/discover" icon={Compass} label="Discover" testId="nav-discover" />}
            {(!user || isDiver || isAdmin) && <NavLink to="/pathways" icon={BookOpen} label="Learn" testId="nav-learn" />}
            <NavLink to="/shop" icon={ShoppingBag} label="Shop" testId="nav-shop" />
            {(!user || isDiver || isAdmin) && <NavLink to="/community" icon={Users} label="Connect" testId="nav-community" />}
            <NavLink to="/events" icon={Calendar} label="Meet" testId="nav-meet" />
            {user && isBusiness && <NavLink to="/operator" icon={LayoutDashboard} label="Dashboard" testId="nav-operator" />}
            {user && isAdmin && <NavLink to="/admin" icon={Settings} label="Admin" testId="nav-admin" />}

            {user && <NotificationBell />}
            {user && (
              <Link to="/cart" className="relative p-2 rounded-lg hover:bg-slate-100 transition-colors" data-testid="nav-cart-icon">
                <ShoppingCart size={18} className={cartCount > 0 ? 'text-cyan-500' : 'text-slate-500'} />
                {cartCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] bg-cyan-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1 leading-none" data-testid="cart-badge">{cartCount > 99 ? '99+' : cartCount}</span>
                )}
              </Link>
            )}

            {user ? (
              <div className="relative" ref={settingsRef}>
                <button
                  onClick={() => setSettingsOpen(!settingsOpen)}
                  className={`nav-link flex items-center gap-1.5 ${settingsOpen || isActive('/profile') ? 'active' : ''}`}
                  data-testid="settings-menu-btn"
                >
                  <Settings size={16} />
                  <ChevronDown size={14} className={`transition-transform ${settingsOpen ? 'rotate-180' : ''}`} />
                </button>
                {settingsOpen && (
                  <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-xl border border-slate-100 shadow-[0_20px_50px_rgb(0,0,0,0.12)] py-2 z-50 fade-in" data-testid="settings-dropdown">
                    <DropdownLink to="/profile" icon={User} label="Settings" testId="dd-profile" onClick={() => setSettingsOpen(false)} />
                    {isDiver && (
                      <>
                        <div className="border-t border-slate-100 my-1" />
                        <p className="text-[10px] font-bold text-slate-300 uppercase tracking-widest px-4 pt-2 pb-1" data-testid="dd-mydives-heading">My Dives</p>
                        <DropdownLink to="/dashboard" icon={LayoutDashboard} label="My Dives" testId="dd-dashboard" onClick={() => setSettingsOpen(false)} />
                        <div className="border-t border-slate-100 my-1" />
                      </>
                    )}
                    {isDiver && <DropdownLink to="/marine-life" icon={Fish} label="Marine Life" testId="dd-marine-life" onClick={() => setSettingsOpen(false)} />}
                    {isDiver && <DropdownLink to="/bookings" icon={Calendar} label="My Bookings" testId="dd-bookings" onClick={() => setSettingsOpen(false)} />}
                    {isDiver && <DropdownLink to="/trips" icon={Map} label="Trip Planner" testId="dd-trips" onClick={() => setSettingsOpen(false)} />}
                    <DropdownLink to="/orders" icon={ShoppingBag} label="My Orders" testId="dd-orders" onClick={() => setSettingsOpen(false)} />
                    <DropdownLink to="/wishlist" icon={Heart} label="Wishlist" testId="dd-wishlist" onClick={() => setSettingsOpen(false)} />
                    <div className="border-t border-slate-100 my-1" />
                    <button onClick={() => { setSettingsOpen(false); logout(); navigate('/'); }} className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 transition-colors" data-testid="dd-logout">
                      <LogOut size={15} /> Logout
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <button onClick={() => openAuth()} className="btn-primary px-6 py-2 text-sm" data-testid="signin-btn">Dive in</button>
            )}
          </div>

          {/* Mobile: bell + cart + hamburger */}
          <div className="md:hidden flex items-center gap-1">
            {user && <NotificationBell />}
            {user && (
              <Link to="/cart" className="relative p-2 rounded-lg hover:bg-slate-100" data-testid="m-cart-icon">
                <ShoppingCart size={20} className={cartCount > 0 ? 'text-cyan-500' : 'text-slate-500'} />
                {cartCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] bg-cyan-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1 leading-none">{cartCount > 99 ? '99+' : cartCount}</span>
                )}
              </Link>
            )}
            <button className="p-2 rounded-lg hover:bg-slate-100 transition-colors" onClick={() => setMobileOpen(!mobileOpen)} data-testid="mobile-menu-btn">
              {mobileOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {mobileOpen && (
          <div className="md:hidden mt-4 pb-4 border-t border-slate-100 pt-4 fade-in" data-testid="mobile-menu">
            <div className="flex flex-col gap-1">
              {(!user || isDiver || isAdmin) && <NavLink to="/discover" icon={Compass} label="Discover" testId="m-discover" />}
              {(!user || isDiver || isAdmin) && <NavLink to="/pathways" icon={BookOpen} label="Learn" testId="m-learn" />}
              <NavLink to="/shop" icon={ShoppingBag} label="Shop" testId="m-shop" />
              {(!user || isDiver || isAdmin) && <NavLink to="/community" icon={Users} label="Connect" testId="m-community" />}
              <NavLink to="/events" icon={Calendar} label="Meet" testId="m-meet" />
              {user && isBusiness && <NavLink to="/operator" icon={LayoutDashboard} label="Dashboard" testId="m-operator" />}
              {user && isAdmin && <NavLink to="/admin" icon={Settings} label="Admin" testId="m-admin" />}
              {user && (
                <>
                  <div className="border-t border-slate-100 my-2" />
                  <p className="text-[10px] font-bold text-slate-300 uppercase tracking-widest px-3 mb-1">My Stuff</p>
                  <NavLink to="/profile" icon={User} label="Settings" testId="m-profile" />
                  {isDiver && (
                    <>
                      <p className="text-[10px] font-bold text-slate-300 uppercase tracking-widest px-3 mt-2 mb-1" data-testid="m-mydives-heading">My Dives</p>
                      <NavLink to="/dashboard" icon={LayoutDashboard} label="My Dives" testId="m-dashboard" />
                    </>
                  )}
                  {isDiver && <NavLink to="/marine-life" icon={Fish} label="Marine Life" testId="m-marine-life" />}
                  {isDiver && <NavLink to="/bookings" icon={Calendar} label="My Bookings" testId="m-bookings" />}
                  {isDiver && <NavLink to="/trips" icon={Map} label="Trip Planner" testId="m-trips" />}
                  <NavLink to="/orders" icon={ShoppingBag} label="My Orders" testId="m-orders" />
                  <NavLink to="/wishlist" icon={Heart} label="Wishlist" testId="m-wishlist" />
                  <div className="border-t border-slate-100 my-2" />
                  <button onClick={() => { logout(); navigate('/'); closeMobile(); }} className="nav-link flex items-center gap-1.5 text-red-500" data-testid="m-logout">
                    <LogOut size={16} /> Logout
                  </button>
                </>
              )}
              {!user && <button onClick={() => { openAuth(); closeMobile(); }} className="btn-primary w-full mt-2 text-sm" data-testid="m-signin">Dive in</button>}
            </div>
          </div>
        )}
      </div>

      {/* Push notification prompt */}
      {showPushPrompt && (
        <div className="bg-slate-900 text-white px-6 lg:px-10 py-3 flex items-center justify-between gap-4 fade-in" data-testid="push-prompt">
          <div className="flex items-center gap-3 text-sm">
            <BellRing size={16} className="text-cyan-400 flex-shrink-0" />
            <span>Get notified about new messages, bookings, and dive buddy requests</span>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={async () => {
                await pushNotifs.requestPermission();
                setShowPushPrompt(false);
              }}
              className="px-4 py-1.5 bg-cyan-400 text-white text-xs font-semibold rounded-full hover:bg-cyan-300 transition-colors"
              data-testid="enable-push-btn"
            >
              Enable
            </button>
            <button
              onClick={() => { setShowPushPrompt(false); sessionStorage.setItem('push_prompt_dismissed', '1'); }}
              className="px-3 py-1.5 text-xs text-white/60 hover:text-white transition-colors"
              data-testid="dismiss-push-btn"
            >
              Later
            </button>
          </div>
        </div>
      )}
    </nav>
    <div className="h-[72px]" />
    </>
  );
}

function DropdownLink({ to, icon: Icon, label, testId, onClick }) {
  const location = useLocation();
  return (
    <Link to={to} className={`flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors ${location.pathname === to ? 'text-cyan-400 bg-cyan-50 font-medium' : 'text-slate-700 hover:bg-slate-50'}`} data-testid={testId} onClick={onClick}>
      <Icon size={15} /> {label}
    </Link>
  );
}
