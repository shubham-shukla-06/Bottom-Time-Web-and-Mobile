import {
  Zap, TrendingUp, Target, Layers, Star, Compass, Anchor, ShoppingBag,
  Users, MessageCircle, Globe, DollarSign, Shield, Database, Settings,
  Navigation, User as UserIcon, FileCheck, Truck, Building2, Gauge, Mail, ScanSearch,
  Image as ImageIcon, Lock
} from 'lucide-react';

export const SECTIONS = [
  // Insights — what is the platform doing right now
  { key: 'pulse', label: 'Platform Pulse', icon: Zap, group: 'Insights' },
  { key: 'drilldown', label: 'Drill-Down Explorer', icon: Navigation, group: 'Insights' },
  { key: 'performance', label: 'Performance', icon: Gauge, group: 'Insights' },

  // Growth — acquiring and converting users
  { key: 'marketing', label: 'Marketing', icon: TrendingUp, group: 'Growth' },
  { key: 'funnels', label: 'Funnels', icon: Target, group: 'Growth' },
  { key: 'campaigns', label: 'Campaigns', icon: Layers, group: 'Growth' },
  { key: 'referrals', label: 'Promo & Referrals', icon: Target, group: 'Growth' },
  { key: 'share-tracking', label: 'Share Tracking', icon: TrendingUp, group: 'Growth' },
  { key: 'operators', label: 'Operator Attribution', icon: Star, group: 'Growth' },
  { key: 'journeys', label: 'User Journeys', icon: UserIcon, group: 'Growth' },

  // Marketplace — diving experiences
  { key: 'discover', label: 'Discover & Bookings', icon: Compass, group: 'Marketplace' },
  { key: 'pathway', label: 'Dive Pathway', icon: Anchor, group: 'Marketplace' },
  { key: 'operator-apps', label: 'Operator Applications', icon: Building2, group: 'Marketplace' },

  // Commerce — physical goods
  { key: 'shop', label: 'Shop & Commerce', icon: ShoppingBag, group: 'Commerce' },
  { key: 'inventory', label: 'Inventory', icon: Layers, group: 'Commerce' },
  { key: 'fulfillment', label: 'Fulfillment', icon: Truck, group: 'Commerce' },

  // Community — social product
  { key: 'community', label: 'Community', icon: Users, group: 'Community' },
  { key: 'chat', label: 'Chat', icon: MessageCircle, group: 'Community' },
  { key: 'events', label: 'Events & Meetups', icon: Globe, group: 'Community' },

  // Finance
  { key: 'revenue', label: 'Revenue & Economics', icon: DollarSign, group: 'Finance' },
  { key: 'cashflow', label: 'Cash Flow', icon: TrendingUp, group: 'Finance' },
  { key: 'compliance', label: 'Tax & Compliance', icon: FileCheck, group: 'Finance' },

  // Trust & Security
  { key: 'trust', label: 'Trust & Safety', icon: Shield, group: 'Trust & Security' },
  { key: 'security', label: 'Security Scanner', icon: ScanSearch, group: 'Trust & Security' },

  // Content — public site CMS, all in one place
  { key: 'landing-content', label: 'Landing Page', icon: ImageIcon, group: 'Content' },
  { key: 'gating-content', label: 'Gating Page', icon: Lock, group: 'Content' },
  { key: 'waitlist', label: 'Waitlist', icon: Mail, group: 'Content' },

  // System — platform operations & access
  { key: 'manage', label: 'Manage', icon: Settings, group: 'System' },
  { key: 'platform', label: 'Platform Health', icon: Database, group: 'System' },
];

export const PIE_COLORS = ['#0e7490', '#0891b2', '#06b6d4', '#22d3ee', '#67e8f9', '#155e75', '#164e63', '#a5f3fc'];

export const TT_STYLE = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12 };

export const TICK_SM = Object.freeze({ fontSize: 10, fill: '#94a3b8' });
export const TICK_SM_DARK = Object.freeze({ fontSize: 10, fill: '#64748b' });
export const TICK_XS = Object.freeze({ fontSize: 9, fill: '#94a3b8' });
export const TICK_SM_11 = Object.freeze({ fontSize: 11, fill: '#64748b' });

export const SECTION_DESC = {
  pulse: 'Real-time overview of platform health, active users, and today\'s booking performance.',
  drilldown: 'Drill down from global to country-level metrics. Explore listings, bookings, and revenue by region.',
  marketing: 'Track marketing channel effectiveness, UTM performance, and user acquisition costs.',
  funnels: 'Analyze conversion rates across the user journey from signup to booking.',
  campaigns: 'Manage marketing campaigns, generate UTM links, and track specific initiatives.',
  referrals: 'Create and manage promo codes, referral links for operators and influencers.',
  operators: 'Track which dive operators are driving growth and their individual performance metrics.',
  journeys: 'Map individual user journeys from first touch to revenue. Analyze aggregated user paths.',
  discover: 'Monitor the marketplace funnel, search trends, and booking conversion quality.',
  pathway: 'Track diver certification progress, logbook adoption, and retention through learning.',
  shop: 'Overview of merchandise sales, inventory levels, and cart abandonment rates.',
  inventory: 'Manage products, stock levels, images, pricing, and categories.',
  community: 'Analyze social connections, network effects, and user engagement within the platform.',
  chat: 'Monitor messaging volume, response times, and the impact of communication on bookings.',
  events: 'Track event creation, RSVPs, and attendance rates across the community.',
  revenue: 'Detailed breakdown of revenue streams, unit economics, take rates, and commissions.',
  cashflow: 'Monitor payment processing, success rates, payouts, and financial risk.',
  compliance: 'Goods and Services Tax / Tax Collected at Source compliance dashboard. Configure rates, view summaries, and export reports for your CA.',
  trust: 'Review user reports, safety incidents, and ensure platform compliance.',
  platform: 'Technical system status, database health metrics, and error rate monitoring.',
  performance: 'Real-time API response times, cache hit rates, compression stats, and endpoint latency tracking.',
  manage: 'Administrative tools for user management and admin access. Site copy and imagery live under Content → Landing Page / Gating Page.',
  waitlist: 'View and manage launch waitlist signups from the Coming Soon page. Export emails for marketing.',
  security: 'Automated security scanner. Detects hardcoded secrets, dependency vulnerabilities, injection patterns, auth gaps, and configuration issues.',
  'landing-content': 'Edit the public landing page — hero, copy, section imagery — with a live preview and draft/publish workflow.',
  'gating-content': 'Edit the Coming Soon page shown to public visitors before launch, and toggle gating ON/OFF.',
};

export const METRIC_TIPS = {
  'Active Divers': 'Count of users with role "diver" and status "active".',
  'Active Shops': 'Dive shops with at least one active listing on the marketplace.',
  'Active Instructors': 'Instructors with a verified profile and active status.',
  'Bookings Today': 'Bookings created since midnight (UTC).',
  'Bookings MTD': 'Total bookings from the 1st of this month to now.',
  'GBV (All Time)': 'Gross Booking Value: sum of all booking prices, all time.',
  'Net Revenue': 'GBV x 15% take rate. Revenue retained after operator payouts.',
  'Shop Revenue': 'Sum of (product price x units sold) across all shop items.',
  'Refund Rate': '(Cancelled bookings / Total bookings) x 100.',
  'Searches': 'Total search queries tracked via analytics events.',
  'Listing Views': 'Page views + listing clicks from analytics events.',
  'Search > View': '(Listing views / Searches) x 100.',
  'View > Book': '(Total bookings / Listing views) x 100.',
  'Avg Rating': 'Mean star rating across all reviews.',
  'Review Coverage': '(Reviewed listings / Active listings) x 100.',
  'Cancel Rate': '(Cancelled bookings / Total bookings) x 100.',
  'Total Dive Logs': 'Count of all dive log entries across all users.',
  'Loggers': 'Unique users with at least one dive log entry.',
  'Log Adoption': '(Loggers / Total divers) x 100.',
  'Avg Dives/Logger': 'Total logs / Number of loggers.',
  'Avg Depth': 'Mean max_depth across all dive logs, in meters.',
  'Max Depth': 'Deepest recorded dive across all logs.',
  'Avg Duration': 'Mean duration across all dive logs, in minutes.',
  'Gross Revenue': 'Total sales value from the shop (price x sold_count).',
  'Units Sold': 'Sum of sold_count across all products.',
  'AOV': 'Average Order Value: Revenue / Estimated orders.',
  'Active Products': 'Products currently available for purchase.',
  'Out of Stock': 'Products flagged as not in stock.',
  'Active Carts': 'Carts with at least one item.',
  'Cart Value': 'Sum of (price x quantity) across all active cart items.',
  'Total Connections': 'Accepted buddy/friend connections.',
  'Pending Requests': 'Connection requests awaiting acceptance.',
  'Avg Connections': 'Mean connections per user (from accepted connections).',
  'Total Wishlists': 'Total wishlisted items across all users.',
  'Total Threads': 'All conversation threads (DM + group).',
  'DMs': 'Direct message threads between two users.',
  'Groups': 'Group chat threads.',
  'Total Messages': 'Count of all individual messages sent.',
  'Avg Msgs/Thread': 'Total messages / Total threads.',
  'Unread': 'Messages currently marked as unread.',
  'Chat > Booking': 'Users who chatted AND made a booking.',
  'Total Events': 'All events ever created.',
  'Live Events': 'Events with status "active".',
  'Total RSVPs': 'Sum of attendees across all events.',
  'Capacity Util.': '(Total RSVPs / Total max capacity) x 100.',
  'Total Revenue': 'Booking commission + Shop revenue.',
  'Booking GBV': 'Gross value of all bookings.',
  'Commission': 'GBV x take rate (15%).',
  'Take Rate': 'Platform commission percentage on bookings.',
  'Rev / Diver': 'Total revenue / Number of divers.',
  'GBV / Shop': 'Total GBV / Number of operators+instructors.',
  'Captured': 'Payments successfully captured.',
  'Failed': 'Transactions that failed processing.',
  'Pending': 'Transactions authorized but not yet captured.',
  'Refunds': 'Total value of cancelled booking refunds.',
  'Total Reports': 'User/content reports submitted.',
  'Actioned': 'Reports reviewed and resolved.',
  'Suspended Users': 'Users currently suspended.',
  'Collections': 'Active MongoDB collections.',
  'Total Documents': 'Total records across all collections.',
  'Notif Read Rate': '(Read notifications / Total notifications) x 100.',
  'Tracked Users': 'Users with at least one UTM landing event.',
  'UTM Events': 'Total UTM landing events captured.',
  'Untracked': 'Users without any UTM attribution data.',
  'Listings': 'Number of active listings in the selected region.',
  'Bookings': 'Total bookings in the selected region.',
  'Revenue': 'Total revenue in the selected region.',
  'Operators': 'Number of active operators in the selected region.',
};
