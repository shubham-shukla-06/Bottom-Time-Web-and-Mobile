import { Settings, Wallet } from 'lucide-react';
import { StatCard, StatusBadge, EmptyState } from './OperatorPrimitives';
import { COUNTRIES } from '../../data/countries';
import { isIndia } from '../../utils/country';

const PAYOUT_CURRENCIES = ['INR','USD','GBP','EUR','THB','IDR','AUD','JPY','SGD','ZAR','BRL','MXN','PHP','MYR','NZD','EGP','SEK','NOK','TRY','CAD'];

export default function PayoutsTab({ payouts, payoutSettings, setPayoutSettings, payoutConfigured, savingPayout, onSave }) {
  const payoutIsIndia = isIndia(payoutSettings.payout_country);
  return (
    <div className="space-y-6" data-testid="payouts-tab">
      <div className="bg-white rounded-2xl border border-slate-100 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Settings size={18} className="text-cyan-600" />
          <h3 className="font-bold text-base">Payout Settings</h3>
          {payoutConfigured && <span className="text-xs bg-green-50 text-green-600 px-2 py-0.5 rounded-full font-semibold">Configured</span>}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">Country *</label>
            <select className="input-field text-sm" value={payoutSettings.payout_country || ''} onChange={e => setPayoutSettings(p => ({...p, payout_country: e.target.value}))} data-testid="payout-country">
              <option value="">Select country</option>
              {COUNTRIES.map(c => <option key={c.iso} value={c.name}>{c.flag} {c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">Payout Currency *</label>
            <select className="input-field text-sm" value={payoutSettings.payout_currency || ''} onChange={e => setPayoutSettings(p => ({...p, payout_currency: e.target.value}))} data-testid="payout-currency">
              <option value="">Select currency</option>
              {PAYOUT_CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">Account Holder Name *</label>
            <input className="input-field text-sm" placeholder="Full name on bank account" value={payoutSettings.bank_account_name || ''} onChange={e => setPayoutSettings(p => ({...p, bank_account_name: e.target.value}))} data-testid="payout-account-name" />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">Bank Name</label>
            <input className="input-field text-sm" placeholder="Bank name" value={payoutSettings.bank_name || ''} onChange={e => setPayoutSettings(p => ({...p, bank_name: e.target.value}))} data-testid="payout-bank-name" />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">Account Number</label>
            <input className="input-field text-sm" placeholder="Account number" value={payoutSettings.account_number || ''} onChange={e => setPayoutSettings(p => ({...p, account_number: e.target.value}))} data-testid="payout-account-number" />
          </div>
          {payoutIsIndia ? (
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1 block">IFSC Code</label>
              <input className="input-field text-sm" placeholder="IFSC code" value={payoutSettings.ifsc_code || ''} onChange={e => setPayoutSettings(p => ({...p, ifsc_code: e.target.value}))} data-testid="payout-ifsc" />
            </div>
          ) : (
            <>
              <div>
                <label className="text-xs font-semibold text-slate-500 mb-1 block">SWIFT/BIC Code</label>
                <input className="input-field text-sm" placeholder="SWIFT code" value={payoutSettings.swift_code || ''} onChange={e => setPayoutSettings(p => ({...p, swift_code: e.target.value}))} data-testid="payout-swift" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 mb-1 block">IBAN</label>
                <input className="input-field text-sm" placeholder="IBAN (if applicable)" value={payoutSettings.iban || ''} onChange={e => setPayoutSettings(p => ({...p, iban: e.target.value}))} data-testid="payout-iban" />
              </div>
            </>
          )}
        </div>
        <button onClick={onSave} disabled={savingPayout} className="btn-primary mt-4 text-sm" data-testid="save-payout-settings-btn">
          {savingPayout ? 'Saving...' : 'Save Payout Settings'}
        </button>
        <p className="text-xs text-slate-400 mt-2">
          {payoutIsIndia ? 'Payouts via Razorpay Route (INR)' : 'International payouts via Wise'}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-slate-100 p-4 text-center">
          <p className="text-xs text-slate-500 mb-1">Pending</p>
          <p className="text-xl font-bold text-amber-500" data-testid="payout-pending">{payouts.summary?.total_pending?.toFixed(2) || '0.00'}</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 p-4 text-center">
          <p className="text-xs text-slate-500 mb-1">Processing</p>
          <p className="text-xl font-bold text-blue-500" data-testid="payout-processing">{payouts.summary?.total_processing?.toFixed(2) || '0.00'}</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 p-4 text-center">
          <p className="text-xs text-slate-500 mb-1">Completed</p>
          <p className="text-xl font-bold text-green-500" data-testid="payout-completed">{payouts.summary?.total_completed?.toFixed(2) || '0.00'}</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 p-6">
        <h3 className="font-bold text-base mb-4">Payout History</h3>
        {payouts.payouts?.length > 0 ? (
          <div className="space-y-3">
            {payouts.payouts.map(p => (
              <div key={p.id} className="flex items-center justify-between p-3 rounded-xl bg-slate-50" data-testid="payout-row">
                <div>
                  <p className="font-semibold text-sm">{p.listing_name}</p>
                  <p className="text-xs text-slate-500">{new Date(p.created_at).toLocaleDateString()} · {p.payout_method === 'wise' ? 'Wise' : 'Razorpay'}</p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-sm">{p.payout_currency} {p.operator_amount?.toFixed(2)}</p>
                  <StatusBadge status={p.status} />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState icon={<Wallet size={40} />} title="No payouts yet" desc="Payouts will appear here after bookings are paid" />
        )}
      </div>
    </div>
  );
}
