import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { StatCard } from './OperatorPrimitives';

const TICK_11 = Object.freeze({ fontSize: 11 });

export default function AnalyticsTab({ analytics, statusData, statusLegend, bookingTrend, popularListings }) {
  if (!analytics) return null;

  return (
    <div className="space-y-6" data-testid="analytics-tab">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <StatCard label="Total Revenue" value={`$${analytics.total_revenue.toLocaleString()}`} color="cyan" />
        <StatCard label="Total Bookings" value={analytics.total_bookings} color="cyan" />
        <StatCard label="Confirm Rate" value={`${analytics.confirm_rate}%`} color="cyan" />
        <StatCard label="Avg Rating" value={analytics.avg_rating || '-'} />
        <StatCard label="Reviews" value={analytics.total_reviews} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl border border-slate-100 p-6">
          <h3 className="font-bold text-base mb-4">Booking Status</h3>
          {analytics.total_bookings > 0 ? (
            <div className="flex items-center gap-6">
              <ResponsiveContainer width="50%" height={180}>
                <PieChart>
                  <Pie data={statusData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} innerRadius={35}>
                    {statusData.map((entry, i) => <Cell key={`k${i}`} fill={entry.color} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 space-y-2">
                {statusLegend.map(s => (
                  <div key={s.label} className="flex items-center gap-2 text-sm">
                    <div className="w-3 h-3 rounded-full" style={{ background: s.color }} />
                    <span>{s.label}</span>
                    <span className="text-slate-400 ml-auto">{s.value}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="h-[180px] flex items-center justify-center text-slate-400 text-sm">No bookings yet</div>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 p-6">
          <h3 className="font-bold text-base mb-4">Booking Trend</h3>
          {bookingTrend.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={bookingTrend}>
                <XAxis dataKey="month" tick={TICK_11} />
                <YAxis tick={TICK_11} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="bookings" fill="#0e7490" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[180px] flex items-center justify-center text-slate-400 text-sm">No booking data yet</div>
          )}
        </div>
      </div>

      {popularListings.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 p-6" data-testid="popular-listings">
          <h3 className="font-bold text-base mb-4">Top Performing Listings</h3>
          <div className="space-y-3">
            {popularListings.map((pl, i) => (
              <div key={`k${i}`} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                <div className="flex items-center gap-3">
                  <span className="w-7 h-7 rounded-full bg-cyan-100 text-cyan-400 text-xs font-bold flex items-center justify-center">{i + 1}</span>
                  <span className="font-medium text-sm">{pl.name}</span>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <span className="text-slate-500">{pl.count} booking{pl.count !== 1 ? 's' : ''}</span>
                  <span className="font-bold text-cyan-500">${pl.revenue.toLocaleString()}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
