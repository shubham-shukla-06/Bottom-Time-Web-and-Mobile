import { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { UserCheck, UserX, Clock, Building2, Globe, CheckCircle, XCircle, Shield, ChevronDown } from 'lucide-react';
import { SectionHeader, Tile, EmptyState, Loader } from './primitives';
import { useBulkSelect } from '../../hooks/useBulkSelect';
import { BulkSelectCheckbox } from '../../components/admin/BulkSelectCheckbox';
import { BulkActionBar } from '../../components/admin/BulkActionBar';
import { BulkConfirmDialog } from '../../components/admin/BulkConfirmDialog';

export default function OperatorApplicationsSection() {
  const [apps, setApps] = useState([]);
  const [summary, setSummary] = useState({});
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('');
  const [expandedApp, setExpandedApp] = useState(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [verifyBadge, setVerifyBadge] = useState(false);
  const [bulkAction, setBulkAction] = useState(null); // 'approve' | 'reject' | null

  // Only pending apps are eligible for bulk approve/reject
  const pendingApps = apps.filter(a => a.status === 'pending');
  const sel = useBulkSelect(pendingApps, (a) => a.id);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchApps(); }, [filterStatus]);

  const fetchApps = async () => {
    setLoading(true);
    try {
      const params = {};
      if (filterStatus) params.status = filterStatus;
      const res = await axios.get('/operator-listings/admin/applications', { params });
      setApps(res.data.applications);
      setSummary(res.data.summary);
      sel.clear();
    } catch (e) { toast.error('Failed to load applications'); }
    finally { setLoading(false); }
  };

  const reviewApp = async (appId, action) => {
    try {
      await axios.put(`/operator-listings/admin/applications/${appId}/review`, {
        action,
        notes: reviewNotes,
        verified: verifyBadge,
      });
      toast.success(`Application ${action}d`);
      setReviewNotes('');
      setVerifyBadge(false);
      fetchApps();
    } catch (e) { toast.error('Failed to review application'); }
  };

  const handleBulkReview = async () => {
    if (!bulkAction) return;
    try {
      const res = await axios.post('/admin/bulk/applications/action', {
        ids: sel.selected,
        action: bulkAction,
      });
      toast.success(`${res.data.processed} application(s) ${bulkAction}d`);
      if (res.data.failed > 0) toast.error(`${res.data.failed} failed`);
      fetchApps();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Bulk action failed');
      throw e;
    }
  };

  if (loading) return <Loader />;

  return (
    <div className="space-y-5" data-testid="operator-applications-section">
      <SectionHeader title="Operator Applications" sectionKey="operator-apps" sub="Review and approve dive operator registrations" />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Tile label="Total" value={summary.total} icon={Building2} color="slate" />
        <Tile label="Pending" value={summary.pending} icon={Clock} color="cyan" />
        <Tile label="Approved" value={summary.approved} icon={UserCheck} color="cyan" />
        <Tile label="Rejected" value={summary.rejected} icon={UserX} color="red" />
      </div>

      <div className="flex gap-2">
        {['', 'pending', 'approved', 'rejected'].map(s => (
          <button key={s} onClick={() => setFilterStatus(s)}
            className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-colors ${filterStatus === s ? 'bg-cyan-500 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}
            data-testid={`filter-${s || 'all'}`}>
            {s || 'All'}
          </button>
        ))}
      </div>

      {/* Bulk bar — only visible when rows from pending are selected */}
      <BulkActionBar
        count={sel.count}
        total={pendingApps.length}
        onClear={sel.clear}
        actions={[
          {
            key: 'approve',
            label: 'Approve',
            tone: 'success',
            icon: <CheckCircle size={13} />,
            onClick: () => setBulkAction('approve'),
            testid: 'apps-bulk-approve-btn',
          },
          {
            key: 'reject',
            label: 'Reject',
            tone: 'danger',
            icon: <XCircle size={13} />,
            onClick: () => setBulkAction('reject'),
            testid: 'apps-bulk-reject-btn',
          },
        ]}
      />

      {apps.length === 0 ? <EmptyState text="No applications found" /> : (
        <div className="space-y-3">
          {/* Select-all bar for pending apps */}
          {pendingApps.length > 0 && (
            <div className="flex items-center gap-3 px-4 py-2 bg-slate-50 border border-slate-100 rounded-lg">
              <BulkSelectCheckbox
                checked={sel.allSelected}
                indeterminate={sel.someSelected}
                onChange={sel.toggleAll}
                testid="apps-select-all"
                ariaLabel="Select all pending applications"
              />
              <span className="text-xs text-slate-600 font-medium">Select all pending ({pendingApps.length})</span>
            </div>
          )}

          {apps.map(app => {
            const isPending = app.status === 'pending';
            return (
              <div key={app.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden" data-testid={`app-card-${app.id}`}>
                <div className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-4 flex-1 min-w-0" onClick={() => setExpandedApp(expandedApp === app.id ? null : app.id)} role="button" tabIndex={0}>
                    {isPending && (
                      <div onClick={(e) => e.stopPropagation()}>
                        <BulkSelectCheckbox
                          checked={sel.isSelected(app.id)}
                          onChange={() => sel.toggle(app.id)}
                          testid={`app-select-${app.id}`}
                          ariaLabel={`Select ${app.business_name}`}
                        />
                      </div>
                    )}
                    <div className="w-10 h-10 rounded-full bg-cyan-50 flex items-center justify-center">
                      <Building2 size={18} className="text-cyan-500" />
                    </div>
                    <div className="flex-1 min-w-0 cursor-pointer">
                      <p className="text-sm font-bold text-slate-900">{app.business_name}</p>
                      <p className="text-[10px] text-slate-500">{app.user_name} &middot; {app.business_type?.replace(/_/g, ' ')}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 cursor-pointer" onClick={() => setExpandedApp(expandedApp === app.id ? null : app.id)}>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      app.status === 'approved' ? 'bg-green-100 text-green-700' :
                      app.status === 'rejected' ? 'bg-red-100 text-red-700' :
                      'bg-amber-100 text-amber-700'
                    }`}>{app.status}</span>
                    {app.verified && <Shield size={14} className="text-cyan-500" />}
                    <ChevronDown size={14} className={`text-slate-400 transition-transform ${expandedApp === app.id ? 'rotate-180' : ''}`} />
                  </div>
                </div>

                {expandedApp === app.id && (
                  <div className="border-t border-slate-100 p-4 space-y-4">
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-xs">
                      <div><span className="text-slate-400 block text-[10px]">Location</span><span className="font-medium">{app.location?.city}{app.location?.city && app.location?.country ? ', ' : ''}{app.location?.country}</span></div>
                      <div><span className="text-slate-400 block text-[10px]">Years in Business</span><span className="font-medium">{app.years_in_business} years</span></div>
                      <div><span className="text-slate-400 block text-[10px]">Employees</span><span className="font-medium">{app.num_employees}</span></div>
                      <div><span className="text-slate-400 block text-[10px]">Contact</span><span className="font-medium">{app.contact_email}</span></div>
                      <div><span className="text-slate-400 block text-[10px]">Phone</span><span className="font-medium">{app.contact_phone || 'N/A'}</span></div>
                      <div><span className="text-slate-400 block text-[10px]">Website</span>{app.website ? <a href={app.website} target="_blank" rel="noreferrer" className="font-medium text-cyan-600 hover:underline">{app.website}</a> : <span className="font-medium">N/A</span>}</div>
                      <div className="col-span-2"><span className="text-slate-400 block text-[10px]">Certifications</span><span className="font-medium">{app.certifications?.join(', ') || 'None listed'}</span></div>
                    </div>

                    {/* Country-specific verification section */}
                    <VerificationBlock app={app} />

                    {app.description && (
                      <div>
                        <span className="text-slate-400 block text-[10px] mb-1">Description</span>
                        <p className="text-xs text-slate-600">{app.description}</p>
                      </div>
                    )}

                    {app.status === 'pending' && (
                      <div className="border-t border-slate-100 pt-4 space-y-3">
                        <textarea placeholder="Admin notes (optional)" value={reviewNotes} onChange={e => setReviewNotes(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 text-xs rounded-lg p-3 outline-none focus:ring-1 focus:ring-cyan-400 resize-none h-20" data-testid="review-notes" />
                        <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
                          <input type="checkbox" checked={verifyBadge} onChange={e => setVerifyBadge(e.target.checked)} className="rounded border-slate-300" data-testid="verify-badge-check" />
                          <Shield size={12} className="text-cyan-500" /> Grant Verified Badge
                        </label>
                        <div className="flex gap-2">
                          <button onClick={() => reviewApp(app.id, 'approve')}
                            className="px-4 py-2 bg-green-500 text-white text-xs font-semibold rounded-lg hover:bg-green-600" data-testid={`approve-${app.id}`}>
                            <CheckCircle size={12} className="inline mr-1" /> Approve
                          </button>
                          <button onClick={() => reviewApp(app.id, 'reject')}
                            className="px-4 py-2 bg-red-500 text-white text-xs font-semibold rounded-lg hover:bg-red-600" data-testid={`reject-${app.id}`}>
                            <XCircle size={12} className="inline mr-1" /> Reject
                          </button>
                        </div>
                      </div>
                    )}

                    {app.admin_notes && (
                      <div className="bg-slate-50 rounded-lg p-3">
                        <span className="text-slate-400 block text-[10px] mb-1">Admin Notes</span>
                        <p className="text-xs text-slate-600">{app.admin_notes}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <BulkConfirmDialog
        open={bulkAction !== null}
        onClose={() => setBulkAction(null)}
        onConfirm={handleBulkReview}
        title={bulkAction === 'approve' ? 'Approve applications' : 'Reject applications'}
        description={
          <>You're about to <strong>{bulkAction}</strong>{' '}
          <strong>{sel.count}</strong> operator application{sel.count === 1 ? '' : 's'}.{' '}
          {bulkAction === 'approve'
            ? 'Approved operators will be emailed immediately and their accounts activated.'
            : 'Rejected operators will be emailed and can reapply.'}
          </>
        }
        confirmLabel={bulkAction === 'approve' ? `Approve ${sel.count}` : `Reject ${sel.count}`}
        tone={bulkAction === 'approve' ? 'primary' : 'danger'}
      />
    </div>
  );
}


const PORTAL_LINKS = {
  'india': null, // Auto-verified via GSTIN
  'united kingdom': { url: 'https://find-and-update.company-information.service.gov.uk/', label: 'Companies House' },
  'australia': { url: 'https://abr.business.gov.au/', label: 'ABN Lookup' },
  'singapore': { url: 'https://www.uen.gov.sg/', label: 'UEN Search' },
  'new zealand': { url: 'https://www.nzbn.govt.nz/', label: 'NZBN Register' },
  'denmark': { url: 'https://datacvr.virk.dk/', label: 'CVR Register' },
  'philippines': { url: 'https://portal.sec.gov.ph/', label: 'SEC Portal' },
  'japan': { url: 'https://www.houjin-bangou.nta.go.jp/en/', label: 'NTA Corporate Number' },
  'china': { url: 'https://www.gsxt.gov.cn/', label: 'NECIPS/GSXT' },
  'united arab emirates': { url: 'https://eservices.dubaided.gov.ae/', label: 'DED eServices' },
  'thailand': { url: 'https://datawarehouse.dbd.go.th/', label: 'DBD DataWarehouse' },
  'indonesia': { url: 'https://oss.go.id/', label: 'OSS Portal' },
  'egypt': { url: 'https://www.gafi.gov.eg/', label: 'GAFI Portal' },
};
const EU_COUNTRIES = new Set(['austria','belgium','bulgaria','croatia','cyprus','czech republic','estonia','finland','france','germany','greece','hungary','ireland','italy','latvia','lithuania','luxembourg','malta','netherlands','poland','portugal','romania','slovakia','slovenia','spain','sweden']);

function VerificationBlock({ app }) {
  const country = (app.location?.country || '').toLowerCase();
  const isIndia = country === 'india';
  const isEU = EU_COUNTRIES.has(country);
  const portal = PORTAL_LINKS[country];

  return (
    <div className="bg-slate-50 rounded-xl p-3 space-y-2" data-testid={`verify-block-${app.id}`}>
      <p className="text-[10px] font-bold text-cyan-600 uppercase tracking-wider">Business Verification</p>
      {isIndia ? (
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-400 w-24">GSTIN</span>
            <span className="font-mono font-medium">{app.gstin || 'Not provided'}</span>
            {app.gstin_verified && <span className="text-[9px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-bold">Govt Verified</span>}
          </div>
          {app.gstin_govt_legal_name && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-400 w-24">Legal Name</span>
              <span className="font-medium">{app.gstin_govt_legal_name}</span>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-400 w-24">Registration #</span>
            <span className="font-mono font-medium">{app.registration_number || 'Not provided'}</span>
          </div>
          {(portal || isEU) && (
            <a href={portal?.url || 'https://ec.europa.eu/taxation_customs/vies/'} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-1 text-[10px] text-cyan-600 hover:underline font-semibold mt-1">
              <Globe size={10} /> Verify on {portal?.label || 'EU VIES'}
            </a>
          )}
          {!portal && !isEU && (
            <p className="text-[10px] text-amber-600 font-medium">Manual document review required</p>
          )}
        </div>
      )}
    </div>
  );
}
