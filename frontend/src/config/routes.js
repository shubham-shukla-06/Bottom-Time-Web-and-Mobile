import { lazy } from 'react';
import { Navigate } from 'react-router-dom';
import LandingPage from '../pages/LandingPage';
import Discover from '../pages/Discover';

const Onboarding = lazy(() => import('../pages/Onboarding'));
const Shop = lazy(() => import('../pages/Shop'));
const ProductDetail = lazy(() => import('../pages/ProductDetail'));
const Orders = lazy(() => import('../pages/Orders'));
const Community = lazy(() => import('../pages/Community'));
const Events = lazy(() => import('../pages/Events'));
const Messages = lazy(() => import('../pages/Messages'));
const CheckoutSuccess = lazy(() => import('../pages/CheckoutSuccess'));
const Cart = lazy(() => import('../pages/Cart'));
const DiveDashboard = lazy(() => import('../pages/DiveDashboard'));
const DiveLogs = lazy(() => import('../pages/DiveLogs'));
const DiveLogDetail = lazy(() => import('../pages/DiveLogDetail'));
const DivePlanner = lazy(() => import('../pages/DivePlanner'));
const NewDiverProfile = lazy(() => import('../pages/NewDiverProfile'));
const NewDiveLog = lazy(() => import('../pages/NewDiveLog'));
const AuthCallback = lazy(() => import('../pages/AuthCallback'));
const OperatorDashboard = lazy(() => import('../pages/OperatorDashboard'));
const AdminPanel = lazy(() => import('../pages/AdminPanel'));
const BeginnerPathways = lazy(() => import('../pages/BeginnerPathways'));
const ListingDetail = lazy(() => import('../pages/ListingDetail'));
const Profile = lazy(() => import('../pages/Profile'));
const Notifications = lazy(() => import('../pages/Notifications'));
const Wishlist = lazy(() => import('../pages/Wishlist'));
const MyBookings = lazy(() => import('../pages/MyBookings'));
const UserProfile = lazy(() => import('../pages/UserProfile'));
const Destinations = lazy(() => import('../pages/Destinations'));
const PrivacyPolicy = lazy(() => import('../pages/PrivacyPolicy'));
const TermsOfService = lazy(() => import('../pages/TermsOfService'));
const Contact = lazy(() => import('../pages/Contact'));
const TripPlanner = lazy(() => import('../pages/TripPlanner'));
const TripDetail = lazy(() => import('../pages/TripDetail'));
const MarineLife = lazy(() => import('../pages/MarineLife'));
const SurfaceLog = lazy(() => import('../pages/SurfaceLog'));
const Feed = lazy(() => import('../pages/Feed'));

export function getRoutes(user) {
  const authed = (Component) => user ? <Component /> : <Navigate to="/" />;
  const isOperator = user?.role === 'operator' || user?.role === 'instructor';

  return [
    { path: '/', element: getHomeRedirect(user) },
    { path: '/home', element: <LandingPage /> },
    { path: '/onboarding', element: user && !user.onboarding_complete ? <Onboarding /> : <Navigate to="/" /> },
    { path: '/discover', element: <Discover /> },
    { path: '/destinations', element: <Destinations /> },
    { path: '/shop', element: <Shop /> },
    { path: '/product/:id', element: <ProductDetail /> },
    { path: '/community', element: <Community /> },
    { path: '/events', element: <Events /> },
    { path: '/listing/:id', element: <ListingDetail /> },
    { path: '/cart', element: authed(Cart) },
    { path: '/orders', element: authed(Orders) },
    { path: '/checkout/success', element: authed(CheckoutSuccess) },
    { path: '/messages', element: user ? <Navigate to="/community" /> : <Navigate to="/" /> },
    { path: '/pathways', element: <BeginnerPathways /> },
    { path: '/dashboard', element: authed(DiveDashboard) },
    { path: '/dive-logs', element: authed(DiveLogs) },
    { path: '/dive-log/:logId', element: authed(DiveLogDetail) },
    { path: '/dive-planner', element: authed(DivePlanner) },
    { path: '/profile', element: authed(Profile) },
    { path: '/new-profile', element: <NewDiverProfile /> },
    { path: '/new-dive-log', element: <NewDiveLog /> },
    { path: '/auth/callback', element: <AuthCallback /> },
    { path: '/bookings', element: authed(MyBookings) },
    { path: '/user/:userId', element: <UserProfile /> },
    { path: '/operator', element: isOperator ? <OperatorDashboard /> : <Navigate to="/" /> },
    { path: '/admin', element: user?.role === 'admin' ? <AdminPanel /> : <Navigate to="/" /> },
    { path: '/notifications', element: authed(Notifications) },
    { path: '/wishlist', element: authed(Wishlist) },
    { path: '/privacy', element: <PrivacyPolicy /> },
    { path: '/terms', element: <TermsOfService /> },
    { path: '/contact', element: <Contact /> },
    { path: '/trips', element: authed(TripPlanner) },
    { path: '/trips/:tripId', element: authed(TripDetail) },
    { path: '/marine-life', element: authed(MarineLife) },
    { path: '/feed', element: authed(Feed) },
    { path: '/surface-log', element: authed(SurfaceLog) },
  ];
}

function getHomeRedirect(user) {
  if (!user) return <LandingPage />;
  if (!user.onboarding_complete) return <Navigate to="/onboarding" />;
  if (user.role === 'operator' || user.role === 'instructor') return <Navigate to="/operator" />;
  return <Navigate to="/discover" />;
}
