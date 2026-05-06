import { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Download, FileSpreadsheet, IndianRupee, Globe, ArrowUpRight, ArrowDownRight, Edit3, Check, RefreshCw, Wifi, WifiOff } from 'lucide-react';

export default function ComplianceSection() {
  const [summary, setSummary] = useState(null);
  const [taxRates, setTaxRates] = useState([]);
  const [liveApiConnected, setLiveApiConnected] = useState(false);
  const [tcsRate, setTcsRate] = useState(1.0);
  const [period, setPeriod] = useState('current_month');
  const [loading, setLoading] = useState(true);
  const [editingRate, setEditingRate] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [exporting, setExporting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchData(); }, [period]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [summaryRes, ratesRes] = await Promise.all([
        axios.get(`/compliance/summary?period=${period}`),
        axios.get('/admin/tax-rates')
      ]);
      setSummary(summaryRes.data);
      setTaxRates(ratesRes.data.tax_rates);
      setTcsRate(ratesRes.data.tcs_rate);
      setLiveApiConnected(ratesRes.data.live_api_connected);
    } catch (e) { toast.error('Failed to load compliance data'); }
    finally { setLoading(false); }
  };

  const handleUpdateRate = async (category) => {
    try {
      await axios.put(`/admin/tax-rates/${category}`, { gst_rate: parseFloat(editValue) });
      toast.success('Tax rate updated');
      setEditingRate(null);
      fetchData();
    } catch (e) { toast.error('Failed to update'); }
  };

  const handleExportExcel = async () => {
    setExporting(true);
    try {
      const res = await axios.get(`/compliance/export-excel?period=${period}`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `BottomTime_Compliance_${period}.xlsx`;
      a.click();
      window.URL.revokeObjectURL(url);
      toast.success('Excel downloaded');
    } catch (e) { toast.error('Export failed'); }
    finally { setExporting(false); }
  };

  const handleRefreshRates = async () => {
    setRefreshing(true);
    try {
      const res = await axios.post('/admin/tax-rates/refresh');
      toast.success(`Refreshed ${res.data.refreshed} rates from FastGST`);
      fetchData();
    } catch (e) { toast.error(e.response?.data?.detail || 'Refresh failed'); }
    finally { setRefreshing(false); }
  };

  const periodLabels = { current_month: 'This Month', last_month: 'Last Month', current_fy: 'Current FY', all: 'All Time' };

  if (loading) return <div className="text-center py-20"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-cyan-400 mx-auto"></div></div>;

  return (
    <div className="space-y-6" data-testid="compliance-section">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-2">
          {Object.entries(periodLabels).map(([key, label]) => (
            <button key={key} onClick={() => setPeriod(key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${period === key ? 'bg-cyan-400 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}
              data-testid={`period-${key}`}>{label}</button>
          ))}
        </div>
        <button onClick={handleExportExcel} disabled={exporting}
          className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-xl text-xs font-semibold hover:bg-green-700 transition-colors"
          data-testid="export-excel-btn">
          <FileSpreadsheet size={14} /> {exporting ? 'Exporting...' : 'Export to Excel'}
        </button>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <SummaryCard label="Total Collected" value={`INR ${summary.transactions.total_collected.toLocaleString()}`} icon={<IndianRupee size={16} />} color="cyan" />
          <SummaryCard label="GST Liability" value={`INR ${summary.gst.net_gst_liability.toLocaleString()}`} icon={<ArrowUpRight size={16} />} color="amber" sub={`Collected: ${summary.gst.gst_collected_from_divers.toLocaleString()} | ITC: ${summary.gst.gst_on_commission.toLocaleString()}`} />
          <SummaryCard label="TCS Collected" value={`INR ${summary.tcs.total_tcs_collected.toLocaleString()}`} icon={<ArrowDownRight size={16} />} color="purple" />
          <SummaryCard label="Commission Earned" value={`INR ${summary.revenue.total_commission_earned.toLocaleString()}`} icon={<IndianRupee size={16} />} color="green" />
        </div>
      )}

      {/* Transaction Breakdown */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white rounded-2xl border border-slate-100 p-5">
            <h4 className="text-xs font-semibold text-slate-500 mb-3">Transactions</h4>
            <div className="space-y-2">
              <div className="flex justify-between text-sm"><span className="text-slate-600">Total</span><span className="font-bold">{summary.transactions.total_count}</span></div>
              <div className="flex justify-between text-sm"><span className="text-slate-600">Domestic</span><span className="font-semibold text-amber-600">{summary.transactions.domestic_count}</span></div>
              <div className="flex justify-between text-sm"><span className="text-slate-600">Export (Zero-rated)</span><span className="font-semibold text-green-600">{summary.transactions.export_count}</span></div>
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-slate-100 p-5">
            <h4 className="text-xs font-semibold text-slate-500 mb-3">Goods and Services Tax Breakdown</h4>
            <div className="space-y-2">
              <div className="flex justify-between text-sm"><span className="text-slate-600">Goods and Services Tax from Divers</span><span className="font-semibold">INR {summary.gst.gst_collected_from_divers.toLocaleString()}</span></div>
              <div className="flex justify-between text-sm"><span className="text-slate-600">Goods and Services Tax on Commission (ITC)</span><span className="font-semibold text-green-600">-INR {summary.gst.gst_on_commission.toLocaleString()}</span></div>
              <div className="flex justify-between text-sm border-t border-slate-100 pt-2"><span className="font-bold">Net Goods and Services Tax Payable</span><span className="font-bold text-amber-600">INR {summary.gst.net_gst_liability.toLocaleString()}</span></div>
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-slate-100 p-5">
            <h4 className="text-xs font-semibold text-slate-500 mb-3">Revenue Split</h4>
            <div className="space-y-2">
              <div className="flex justify-between text-sm"><span className="text-slate-600">Total Collected</span><span className="font-semibold">INR {summary.transactions.total_collected.toLocaleString()}</span></div>
              <div className="flex justify-between text-sm"><span className="text-slate-600">Operator Payouts</span><span className="font-semibold">INR {summary.revenue.total_operator_payouts.toLocaleString()}</span></div>
              <div className="flex justify-between text-sm"><span className="text-slate-600">Export Revenue</span><span className="font-semibold text-green-600">INR {summary.export_value.toLocaleString()}</span></div>
            </div>
          </div>
        </div>
      )}

      {/* Tax Rates Configuration */}
      <div className="bg-white rounded-2xl border border-slate-100 p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <h4 className="font-bold text-base">Goods and Services Tax Rates (SAC/HSN)</h4>
            {liveApiConnected ? (
              <span className="flex items-center gap-1 text-[10px] bg-green-50 text-green-700 px-2 py-0.5 rounded-full font-semibold" data-testid="api-status-live"><Wifi size={10} /> FastGST Live</span>
            ) : (
              <span className="flex items-center gap-1 text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-semibold" data-testid="api-status-offline"><WifiOff size={10} /> Offline</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded-full font-semibold">TCS: {tcsRate}%</span>
            {liveApiConnected && (
              <button onClick={handleRefreshRates} disabled={refreshing} className="flex items-center gap-1 text-xs text-cyan-600 hover:bg-cyan-50 px-2 py-1 rounded-lg transition-colors" data-testid="refresh-rates-btn">
                <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} /> {refreshing ? 'Refreshing...' : 'Refresh'}
              </button>
            )}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 border-b border-slate-100">
                <th className="pb-2 pr-4">Category</th>
                <th className="pb-2 pr-4">SAC/HSN</th>
                <th className="pb-2 pr-4">Description</th>
                <th className="pb-2 pr-4">Tax Rate</th>
                <th className="pb-2">Source</th>
                <th className="pb-2"></th>
              </tr>
            </thead>
            <tbody>
              {taxRates.map(rate => (
                <tr key={rate.category} className="border-b border-slate-50 hover:bg-slate-50" data-testid={`tax-rate-${rate.category}`}>
                  <td className="py-2.5 pr-4 font-semibold capitalize">{rate.category.replace(/_/g, ' ')}</td>
                  <td className="py-2.5 pr-4 text-slate-500 font-mono text-xs">{rate.sac_hsn}</td>
                  <td className="py-2.5 pr-4 text-slate-500">{rate.description}</td>
                  <td className="py-2.5 pr-4">
                    {editingRate === rate.category ? (
                      <div className="flex items-center gap-1">
                        <input type="number" className="w-16 px-2 py-1 border border-slate-200 rounded text-xs" value={editValue}
                          onChange={e => setEditValue(e.target.value)} autoFocus data-testid={`edit-rate-input-${rate.category}`} />
                        <span className="text-xs">%</span>
                        <button onClick={() => handleUpdateRate(rate.category)} className="p-1 text-green-600 hover:bg-green-50 rounded" data-testid={`save-rate-${rate.category}`}><Check size={14} /></button>
                      </div>
                    ) : (
                      <span className="font-bold text-cyan-700">{rate.gst_rate}%</span>
                    )}
                  </td>
                  <td className="py-2.5 pr-4"><span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${rate.source === 'fastgst_live' ? 'bg-green-50 text-green-700' : rate.source === 'custom' ? 'bg-cyan-50 text-cyan-700' : 'bg-slate-100 text-slate-500'}`}>{rate.source === 'fastgst_live' ? 'Live API' : rate.source}</span></td>
                  <td className="py-2.5">
                    {editingRate !== rate.category && (
                      <button onClick={() => { setEditingRate(rate.category); setEditValue(rate.gst_rate.toString()); }}
                        className="p-1 text-slate-400 hover:text-cyan-600 hover:bg-cyan-50 rounded" data-testid={`edit-rate-${rate.category}`}><Edit3 size={13} /></button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ label, value, icon, color, sub }) {
  const colors = { cyan: 'bg-cyan-50 text-cyan-700', amber: 'bg-amber-50 text-amber-700', purple: 'bg-purple-50 text-purple-700', green: 'bg-green-50 text-green-700' };
  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-4" data-testid={`summary-${label.toLowerCase().replace(/\s/g, '-')}`}>
      <div className="flex items-center gap-2 mb-2">
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${colors[color]}`}>{icon}</div>
        <span className="text-xs font-semibold text-slate-500">{label}</span>
      </div>
      <p className="text-lg font-bold">{value}</p>
      {sub && <p className="text-[10px] text-slate-400 mt-1">{sub}</p>}
    </div>
  );
}
