import { Skeleton } from './ui/skeleton';

/* ═══════════════════════════════════════
   Reusable skeleton components for every
   loading state across the Bottom Time app
   ═══════════════════════════════════════ */

// ─── Discover / Wishlist listing card ───
export function ListingCardSkeleton() {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white overflow-hidden" data-testid="listing-card-skeleton">
      <Skeleton className="h-48 sm:h-56 w-full rounded-none" />
      <div className="p-4">
        <Skeleton className="h-4 w-3/4 mb-2" />
        <Skeleton className="h-3 w-1/2 mb-3" />
        <div className="flex justify-between items-center pt-2 border-t border-slate-50">
          <Skeleton className="h-5 w-20" />
          <Skeleton className="h-4 w-12" />
        </div>
      </div>
    </div>
  );
}

export function ListingGridSkeleton({ count = 6, cols = 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3' }) {
  return (
    <div className={`grid ${cols} gap-6`} data-testid="listing-grid-skeleton">
      {Array.from({ length: count }).map((_, i) => <ListingCardSkeleton key={`k${i}`} />)}
    </div>
  );
}

// ─── Shop product card ───
export function ProductCardSkeleton() {
  return (
    <div className="rounded-xl border border-slate-100 bg-white overflow-hidden" data-testid="product-card-skeleton">
      <Skeleton className="h-44 sm:h-52 w-full rounded-none" />
      <div className="p-3.5">
        <Skeleton className="h-4 w-3/4 mb-2" />
        <Skeleton className="h-3 w-full mb-3" />
        <div className="flex justify-between items-center pt-2 border-t border-slate-50">
          <Skeleton className="h-5 w-16" />
          <Skeleton className="h-7 w-16 rounded-full" />
        </div>
      </div>
    </div>
  );
}

export function ProductGridSkeleton({ count = 8 }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4" data-testid="product-grid-skeleton">
      {Array.from({ length: count }).map((_, i) => <ProductCardSkeleton key={`k${i}`} />)}
    </div>
  );
}

// ─── Listing detail page ───
export function ListingDetailSkeleton() {
  return (
    <div className="max-w-7xl mx-auto w-full px-6 md:px-12 py-8" data-testid="listing-detail-skeleton">
      <Skeleton className="h-4 w-36 mb-6" />
      <Skeleton className="h-72 md:h-96 w-full rounded-2xl mb-8" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-4">
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-40 w-full rounded-xl" />
        </div>
        <div className="space-y-4">
          <Skeleton className="h-48 w-full rounded-2xl" />
          <Skeleton className="h-12 w-full rounded-xl" />
        </div>
      </div>
    </div>
  );
}

// ─── Event card ───
export function EventCardSkeleton() {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white overflow-hidden" data-testid="event-card-skeleton">
      <Skeleton className="h-44 w-full rounded-none" />
      <div className="p-5">
        <Skeleton className="h-5 w-3/4 mb-2" />
        <Skeleton className="h-3 w-1/2 mb-3" />
        <div className="flex gap-4 mb-3">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-3 w-20" />
        </div>
        <Skeleton className="h-9 w-24 rounded-xl" />
      </div>
    </div>
  );
}

export function EventGridSkeleton({ count = 4 }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6" data-testid="event-grid-skeleton">
      {Array.from({ length: count }).map((_, i) => <EventCardSkeleton key={`k${i}`} />)}
    </div>
  );
}

// ─── Dive log card ───
export function DiveLogCardSkeleton() {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-4 flex items-start gap-4" data-testid="dive-log-skeleton">
      <Skeleton className="w-12 h-12 rounded-xl flex-shrink-0" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-3 w-3/4" />
        <div className="flex gap-4">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-3 w-16" />
        </div>
      </div>
      <Skeleton className="h-6 w-16 rounded-full flex-shrink-0" />
    </div>
  );
}

export function DiveLogListSkeleton({ count = 5 }) {
  return (
    <div className="space-y-3" data-testid="dive-log-list-skeleton">
      {Array.from({ length: count }).map((_, i) => <DiveLogCardSkeleton key={`k${i}`} />)}
    </div>
  );
}

// ─── Booking card ───
export function BookingCardSkeleton() {
  return (
    <div className="border border-slate-200 rounded-2xl p-5" data-testid="booking-card-skeleton">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-5 w-20 rounded-full" />
          </div>
          <div className="flex gap-5">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-16" />
          </div>
          <Skeleton className="h-3 w-24" />
        </div>
        <Skeleton className="h-9 w-24 rounded-lg flex-shrink-0" />
      </div>
    </div>
  );
}

export function BookingListSkeleton({ count = 4 }) {
  return (
    <div className="space-y-4" data-testid="booking-list-skeleton">
      {Array.from({ length: count }).map((_, i) => <BookingCardSkeleton key={`k${i}`} />)}
    </div>
  );
}

// ─── Order card ───
export function OrderCardSkeleton() {
  return (
    <div className="border border-slate-100 rounded-2xl p-4 sm:p-5" data-testid="order-card-skeleton">
      <div className="flex items-center gap-4">
        <Skeleton className="w-10 h-10 rounded-xl flex-shrink-0" />
        <div className="flex-1 space-y-1.5">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3 w-24" />
        </div>
        <Skeleton className="h-5 w-20 rounded-full" />
      </div>
    </div>
  );
}

export function OrderListSkeleton({ count = 4 }) {
  return (
    <div className="space-y-4" data-testid="order-list-skeleton">
      {Array.from({ length: count }).map((_, i) => <OrderCardSkeleton key={`k${i}`} />)}
    </div>
  );
}

// ─── Notification item ───
export function NotificationItemSkeleton() {
  return (
    <div className="flex items-start gap-3 p-4" data-testid="notification-skeleton">
      <Skeleton className="w-10 h-10 rounded-xl flex-shrink-0" />
      <div className="flex-1 space-y-1.5">
        <Skeleton className="h-4 w-3/5" />
        <Skeleton className="h-3 w-4/5" />
        <Skeleton className="h-3 w-16" />
      </div>
    </div>
  );
}

export function NotificationListSkeleton({ count = 6 }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden divide-y divide-slate-50" data-testid="notification-list-skeleton">
      {Array.from({ length: count }).map((_, i) => <NotificationItemSkeleton key={`k${i}`} />)}
    </div>
  );
}

// ─── Trip card ───
export function TripCardSkeleton() {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-5" data-testid="trip-card-skeleton">
      <div className="flex items-start justify-between mb-3">
        <div className="space-y-2 flex-1">
          <Skeleton className="h-5 w-48" />
          <div className="flex gap-4">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-3 w-20" />
          </div>
        </div>
        <Skeleton className="h-6 w-20 rounded-full" />
      </div>
      <div className="flex gap-2 mt-3">
        <Skeleton className="w-8 h-8 rounded-full" />
        <Skeleton className="w-8 h-8 rounded-full" />
        <Skeleton className="w-8 h-8 rounded-full" />
      </div>
    </div>
  );
}

export function TripListSkeleton({ count = 3 }) {
  return (
    <div className="space-y-4" data-testid="trip-list-skeleton">
      {Array.from({ length: count }).map((_, i) => <TripCardSkeleton key={`k${i}`} />)}
    </div>
  );
}

// ─── Trip detail page ───
export function TripDetailSkeleton() {
  return (
    <div className="max-w-5xl mx-auto w-full px-4 sm:px-6 py-6 space-y-5" data-testid="trip-detail-skeleton">
      <Skeleton className="h-4 w-20" />
      <Skeleton className="h-8 w-2/3" />
      <div className="flex gap-4">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-4 w-24" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Skeleton className="h-48 rounded-2xl" />
        <Skeleton className="h-48 rounded-2xl" />
      </div>
      <Skeleton className="h-40 rounded-2xl" />
    </div>
  );
}

// ─── Cart item ───
export function CartItemSkeleton() {
  return (
    <div className="flex gap-4 items-start py-4 border-b border-slate-100" data-testid="cart-item-skeleton">
      <Skeleton className="w-20 h-20 rounded-xl flex-shrink-0" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-3 w-24" />
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-24 rounded-lg" />
          <Skeleton className="h-4 w-16" />
        </div>
      </div>
    </div>
  );
}

export function CartSkeleton({ count = 3 }) {
  return (
    <div data-testid="cart-skeleton">
      {Array.from({ length: count }).map((_, i) => <CartItemSkeleton key={`k${i}`} />)}
      <div className="mt-6 space-y-3">
        <Skeleton className="h-5 w-32 ml-auto" />
        <Skeleton className="h-12 w-full rounded-xl" />
      </div>
    </div>
  );
}

// ─── Feed item ───
export function FeedItemSkeleton() {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-4" data-testid="feed-item-skeleton">
      <div className="flex items-center gap-3 mb-3">
        <Skeleton className="w-10 h-10 rounded-full flex-shrink-0" />
        <div className="space-y-1.5 flex-1">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-20" />
        </div>
      </div>
      <Skeleton className="h-4 w-full mb-2" />
      <Skeleton className="h-4 w-4/5 mb-3" />
      <Skeleton className="h-32 w-full rounded-xl mb-3" />
      <div className="flex gap-3">
        <Skeleton className="h-7 w-16 rounded-full" />
        <Skeleton className="h-7 w-16 rounded-full" />
      </div>
    </div>
  );
}

export function FeedListSkeleton({ count = 4 }) {
  return (
    <div className="space-y-4" data-testid="feed-list-skeleton">
      {Array.from({ length: count }).map((_, i) => <FeedItemSkeleton key={`k${i}`} />)}
    </div>
  );
}

// ─── Buddy / Browse card ───
export function BuddyCardSkeleton() {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-4" data-testid="buddy-card-skeleton">
      <div className="flex items-center gap-3 mb-3">
        <Skeleton className="w-12 h-12 rounded-full flex-shrink-0" />
        <div className="flex-1 space-y-1.5">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-3 w-20" />
        </div>
        <Skeleton className="h-8 w-20 rounded-xl flex-shrink-0" />
      </div>
      <div className="flex gap-2">
        <Skeleton className="h-5 w-14 rounded-full" />
        <Skeleton className="h-5 w-14 rounded-full" />
        <Skeleton className="h-5 w-14 rounded-full" />
      </div>
    </div>
  );
}

export function BuddyGridSkeleton({ count = 4 }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" data-testid="buddy-grid-skeleton">
      {Array.from({ length: count }).map((_, i) => <BuddyCardSkeleton key={`k${i}`} />)}
    </div>
  );
}

// ─── Message thread item ───
export function MessageThreadSkeleton() {
  return (
    <div className="p-3 border-b border-slate-50" data-testid="message-thread-skeleton">
      <div className="flex items-center gap-2.5">
        <Skeleton className="w-8 h-8 rounded-full flex-shrink-0" />
        <div className="flex-1 space-y-1.5">
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="h-3 w-40" />
        </div>
        <Skeleton className="h-3 w-8" />
      </div>
    </div>
  );
}

export function MessageThreadListSkeleton({ count = 5 }) {
  return (
    <div data-testid="message-thread-list-skeleton">
      {Array.from({ length: count }).map((_, i) => <MessageThreadSkeleton key={`k${i}`} />)}
    </div>
  );
}

// ─── User profile page ───
export function UserProfileSkeleton() {
  return (
    <div className="max-w-4xl mx-auto w-full px-4 sm:px-6 py-6 space-y-5" data-testid="user-profile-skeleton">
      <Skeleton className="h-4 w-16" />
      <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
        <Skeleton className="h-28 sm:h-36 w-full rounded-none" />
        <div className="px-5 sm:px-8 pb-6 -mt-12">
          <div className="flex items-end gap-4">
            <Skeleton className="w-24 h-24 rounded-full border-4 border-white" />
            <div className="space-y-2 flex-1 pb-1">
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-3 w-56" />
            </div>
          </div>
          <div className="flex gap-6 mt-5 pt-4 border-t border-slate-100">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={`k${i}`} className="space-y-1">
                <Skeleton className="h-5 w-10" />
                <Skeleton className="h-3 w-14" />
              </div>
            ))}
          </div>
        </div>
      </div>
      <Skeleton className="h-64 w-full rounded-2xl" />
    </div>
  );
}

// ─── Connect profile tab ───
export function ProfileTabSkeleton() {
  return (
    <div className="space-y-5" data-testid="profile-tab-skeleton">
      <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
        <Skeleton className="h-24 w-full rounded-none" />
        <div className="px-5 pb-5 -mt-10">
          <div className="flex items-end gap-3">
            <Skeleton className="w-20 h-20 rounded-full border-4 border-white" />
            <div className="space-y-1.5 flex-1 pb-1">
              <Skeleton className="h-5 w-36" />
              <Skeleton className="h-3 w-28" />
            </div>
          </div>
          <div className="flex gap-5 mt-4 pt-3 border-t border-slate-100">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={`k${i}`} className="space-y-1">
                <Skeleton className="h-4 w-8" />
                <Skeleton className="h-3 w-12" />
              </div>
            ))}
          </div>
        </div>
      </div>
      <Skeleton className="h-10 w-full rounded-xl" />
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={`k${i}`} className="h-32 rounded-xl" />)}
      </div>
    </div>
  );
}

// ─── Operator dashboard ───
export function OperatorDashboardSkeleton() {
  return (
    <div className="space-y-6" data-testid="operator-dashboard-skeleton">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={`k${i}`} className="bg-white rounded-xl border border-slate-100 p-4 space-y-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-6 w-12" />
          </div>
        ))}
      </div>
      <Skeleton className="h-48 w-full rounded-2xl" />
      <Skeleton className="h-32 w-full rounded-2xl" />
    </div>
  );
}

// ─── Admin panel section ───
export function AdminSectionSkeleton() {
  return (
    <div className="space-y-4" data-testid="admin-section-skeleton">
      <div className="space-y-1">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-3 w-64" />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={`k${i}`} className="bg-white border border-slate-200 rounded-xl p-3.5 space-y-2">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-5 w-10" />
          </div>
        ))}
      </div>
      <Skeleton className="h-48 w-full rounded-xl" />
    </div>
  );
}

// ─── Tab content fallback (DiveDashboard, Community Suspense) ───
export function TabContentSkeleton() {
  return (
    <div className="space-y-4 py-4" data-testid="tab-content-skeleton">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={`k${i}`} className="bg-white rounded-xl border border-slate-100 p-4 space-y-2">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-6 w-12" />
          </div>
        ))}
      </div>
      <Skeleton className="h-48 w-full rounded-2xl" />
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={`k${i}`} className="bg-white rounded-xl border border-slate-100 p-4 flex items-center gap-3">
            <Skeleton className="w-10 h-10 rounded-lg flex-shrink-0" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-60" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Surface log card ───
export function SurfaceLogCardSkeleton() {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-5" data-testid="surface-log-skeleton">
      <div className="flex items-center gap-3 mb-3">
        <Skeleton className="w-10 h-10 rounded-full flex-shrink-0" />
        <div className="space-y-1.5 flex-1">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-20" />
        </div>
      </div>
      <Skeleton className="h-4 w-full mb-2" />
      <Skeleton className="h-4 w-3/4 mb-3" />
      <div className="flex gap-4">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-3 w-20" />
      </div>
    </div>
  );
}

export function SurfaceLogListSkeleton({ count = 4 }) {
  return (
    <div className="space-y-5" data-testid="surface-log-list-skeleton">
      {Array.from({ length: count }).map((_, i) => <SurfaceLogCardSkeleton key={`k${i}`} />)}
    </div>
  );
}

// ─── Marine Life discover tab ───
export function MarineLifeDiscoverSkeleton() {
  return (
    <div className="space-y-4" data-testid="marine-discover-skeleton">
      <Skeleton className="h-5 w-40 mb-2" />
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={`k${i}`} className="bg-white rounded-xl border border-slate-100 overflow-hidden">
            <Skeleton className="h-32 w-full rounded-none" />
            <div className="p-3 space-y-1.5">
              <Skeleton className="h-3.5 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Marine Life nearby tab ───
export function MarineLifeNearbySkeleton() {
  return (
    <div className="space-y-4" data-testid="marine-nearby-skeleton">
      <Skeleton className="h-10 w-full rounded-xl" />
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={`k${i}`} className="bg-white rounded-xl border border-slate-100 overflow-hidden">
            <Skeleton className="h-28 w-full rounded-none" />
            <div className="p-2.5 space-y-1">
              <Skeleton className="h-3.5 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Marine Life conservation tab ───
export function MarineLifeConservationSkeleton() {
  return (
    <div className="space-y-5" data-testid="marine-conservation-skeleton">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={`k${i}`} className="bg-white rounded-xl border border-slate-100 p-4 space-y-2 text-center">
            <Skeleton className="h-8 w-12 mx-auto" />
            <Skeleton className="h-3 w-20 mx-auto" />
          </div>
        ))}
      </div>
      <Skeleton className="h-32 w-full rounded-xl" />
    </div>
  );
}

// ─── Dive stats row (for DiveLogs page) ───
export function DiveStatsSkeleton() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6" data-testid="dive-stats-skeleton">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={`k${i}`} className="bg-white rounded-xl border border-slate-100 p-3 space-y-2">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-5 w-12" />
        </div>
      ))}
    </div>
  );
}

// ─── Messages chat area ───
export function ChatAreaSkeleton() {
  return (
    <div className="flex flex-col h-full p-4 space-y-3" data-testid="chat-area-skeleton">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={`k${i}`} className={`flex ${i % 2 === 0 ? 'justify-start' : 'justify-end'}`}>
          <Skeleton className={`h-10 rounded-2xl ${i % 2 === 0 ? 'w-48' : 'w-36'}`} />
        </div>
      ))}
    </div>
  );
}
