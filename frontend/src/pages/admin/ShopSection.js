import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { DollarSign, Package, Target, Layers, AlertTriangle, ShoppingBag, TrendingUp } from 'lucide-react';
import { SectionHeader, Tile, Card, RankList, Loader } from './primitives';
import { useAutoRefresh } from './useAutoRefresh';

export default function ShopSection() {
  const [d, setD] = useState(null);
  const [loading, setLoading] = useState(true);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const fetchData = useCallback((silent = false) => {
    if (!silent) setLoading(true);
    axios.get('/cmd/shop').then(r => setD(r.data)).catch(() => { if (!silent) toast.error('Failed'); }).finally(() => setLoading(false));
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchData(); }, [fetchData]);
  useAutoRefresh(() => fetchData(true), 30000);

  if (loading) return <Loader />;

  return (
    <div className="space-y-5" data-testid="shop-section">
      <SectionHeader title="Commerce: Shop" sectionKey="shop" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Tile label="Gross Revenue" value={`$${d.total_revenue.toLocaleString()}`} icon={DollarSign} color="emerald" />
        <Tile label="Units Sold" value={d.total_units} icon={Package} color="blue" />
        <Tile label="AOV" value={`$${d.aov}`} icon={Target} color="amber" />
        <Tile label="Active Products" value={d.active_products} icon={Layers} color="cyan" />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Tile label="Out of Stock" value={d.out_of_stock} icon={AlertTriangle} color={d.out_of_stock > 0 ? 'red' : 'emerald'} />
        <Tile label="Active Carts" value={d.active_carts} icon={ShoppingBag} color="violet" />
        <Tile label="Cart Value" value={`$${d.cart_value}`} icon={DollarSign} color="amber" />
      </div>
      <div className="grid lg:grid-cols-2 gap-4">
        <Card title="Top Sellers" icon={TrendingUp}>
          <RankList items={d.top_sellers?.map(p => ({ name: p.name, value: `${p.sold} units`, sub: `$${p.revenue}` })) || []} />
        </Card>
        <Card title="Categories" icon={Layers}>
          <div className="space-y-2">
            {d.categories?.map(c => (
              <div key={c.category} className="flex items-center justify-between py-1.5">
                <span className="text-xs text-slate-700 font-medium capitalize">{c.category}</span>
                <div className="flex items-center gap-4">
                  <span className="text-[10px] text-slate-500">{c.products} products</span>
                  <span className="text-[10px] text-slate-500">{c.units} units</span>
                  <span className="text-xs text-emerald-700 font-semibold">${c.revenue.toLocaleString()}</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
