import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { ScanSearch, ShieldCheck, ShieldAlert, AlertTriangle, Info, ChevronDown, ChevronRight, RefreshCw, Clock, FileCode, Lock, Database as DbIcon, Zap, Globe, Upload, Package } from 'lucide-react';
import { SECTION_DESC } from './constants';

const SEV_CONFIG = {
  critical: { color: 'bg-red-500', text: 'text-red-700', bg: 'bg-red-50', border: 'border-red-200', icon: ShieldAlert },
  high: { color: 'bg-orange-500', text: 'text-orange-700', bg: 'bg-orange-50', border: 'border-orange-200', icon: AlertTriangle },
  medium: { color: 'bg-amber-500', text: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200', icon: AlertTriangle },
  low: { color: 'bg-blue-500', text: 'text-blue-700', bg: 'bg-blue-50', border: 'border-blue-200', icon: Info },
  info: { color: 'bg-slate-400', text: 'text-slate-600', bg: 'bg-slate-50', border: 'border-slate-200', icon: Info },
};

const CHECK_ICONS = {
  secrets: Lock, dangerous_patterns: FileCode, auth_coverage: ShieldCheck,
  env_config: Globe, mongodb: DbIcon, rate_limiting: Zap,
  dependencies: Package, frontend: Globe, file_uploads: Upload,
};

const CHECK_LABELS = {
  secrets: 'Secret Detection', dangerous_patterns: 'Code Patterns',
  auth_coverage: 'Auth Coverage', env_config: 'Environment Config',
  mongodb: 'MongoDB Security', rate_limiting: 'Rate Limiting',
  dependencies: 'Dependencies', frontend: 'Frontend Security',
  file_uploads: 'File Uploads',
};

function ScoreRing({ score }) {
  const r = 54, c = 2 * Math.PI * r;
  const color = score >= 90 ? '#22c55e' : score >= 70 ? '#eab308' : score >= 50 ? '#f97316' : '#ef4444';
  return (
    <div className="relative w-36 h-36 flex-shrink-0">
      <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
        <circle cx="60" cy="60" r={r} fill="none" stroke="#e2e8f0" strokeWidth="8" />
        <circle cx="60" cy="60" r={r} fill="none" stroke={color} strokeWidth="8"
          strokeDasharray={c} strokeDashoffset={c - (score / 100) * c}
          strokeLinecap="round" className="transition-all duration-1000" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold text-slate-900" data-testid="security-score">{score}</span>
        <span className="text-[10px] text-slate-500 font-medium uppercase tracking-wider">Score</span>
      </div>
    </div>
  );
}

function SeverityBadge({ severity }) {
  const cfg = SEV_CONFIG[severity] || SEV_CONFIG.info;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${cfg.bg} ${cfg.text} ${cfg.border} border`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.color}`} />
      {severity}
    </span>
  );
}

function FindingRow({ finding }) {
  const [open, setOpen] = useState(false);
  const cfg = SEV_CONFIG[finding.severity] || SEV_CONFIG.info;
  const Icon = cfg.icon;

  return (
    <div className={`border rounded-lg ${cfg.border} ${cfg.bg} mb-2`} data-testid={`finding-${finding.type}`}>
      <button onClick={() => setOpen(!open)} className="w-full flex items-center gap-3 px-4 py-3 text-left">
        <Icon size={14} className={cfg.text} />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-slate-800 truncate">{finding.description}</p>
          <p className="text-[10px] text-slate-500 mt-0.5">{finding.file}{finding.line > 0 ? `:${finding.line}` : ''}</p>
        </div>
        <SeverityBadge severity={finding.severity} />
        {open ? <ChevronDown size={14} className="text-slate-400" /> : <ChevronRight size={14} className="text-slate-400" />}
      </button>
      {open && (
        <div className="px-4 pb-3 border-t border-slate-100">
          {finding.snippet && (
            <pre className="text-[11px] text-slate-600 bg-white rounded-md p-2 mt-2 overflow-x-auto border border-slate-200 font-mono">{finding.snippet}</pre>
          )}
          <p className="text-[11px] text-cyan-700 mt-2 font-medium">{finding.recommendation}</p>
        </div>
      )}
    </div>
  );
}

function CheckCard({ name, result }) {
  const Icon = CHECK_ICONS[name] || ShieldCheck;
  const label = CHECK_LABELS[name] || name;
  const clean = result.status === 'clean';

  return (
    <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${clean ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`} data-testid={`check-${name}`}>
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${clean ? 'bg-emerald-100' : 'bg-amber-100'}`}>
        <Icon size={16} className={clean ? 'text-emerald-600' : 'text-amber-600'} />
      </div>
      <div className="flex-1">
        <p className="text-xs font-semibold text-slate-800">{label}</p>
        <p className={`text-[10px] font-bold ${clean ? 'text-emerald-600' : 'text-amber-600'}`}>
          {clean ? 'Passed' : `${result.count} finding${result.count !== 1 ? 's' : ''}`}
        </p>
      </div>
      <div className={`w-2.5 h-2.5 rounded-full ${clean ? 'bg-emerald-500' : 'bg-amber-500'}`} />
    </div>
  );
}

export default function SecuritySection() {
  const [scan, setScan] = useState(null);
  const [findings, setFindings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [filterSev, setFilterSev] = useState('all');
  const [filterType, setFilterType] = useState('all');

  const fetchLatest = useCallback(async () => {
    try {
      const { data } = await axios.get('/admin/security/latest');
      setScan(data.scan);
      setFindings(data.findings || []);
    } catch (e) {
      console.debug('No security scan available:', e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchLatest(); }, [fetchLatest]);

  const runScan = async () => {
    setScanning(true);
    try {
      const { data } = await axios.post('/admin/security/scan');
      setScan({
        scan_id: data.scan_id,
        started_at: data.started_at,
        finished_at: data.finished_at,
        duration_ms: data.duration_ms,
        total_findings: data.total_findings,
        severity_counts: data.severity_counts,
        checks_passed: data.checks_passed,
        checks_total: data.checks_total,
        score: data.score,
        scan_results: data.scan_results,
      });
      setFindings(data.findings || []);
      toast.success(`Scan complete: ${data.total_findings} finding${data.total_findings !== 1 ? 's' : ''}`);
    } catch (err) {
      toast.error('Scan failed: ' + (err.response?.data?.detail || err.message));
    } finally {
      setScanning(false);
    }
  };

  const filtered = findings.filter(f => {
    if (filterSev !== 'all' && f.severity !== filterSev) return false;
    if (filterType !== 'all' && f.type !== filterType) return false;
    return true;
  });

  const sortedFindings = [...filtered].sort((a, b) => {
    const order = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
    return (order[a.severity] ?? 5) - (order[b.severity] ?? 5);
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-400" />
      </div>
    );
  }

  return (
    <div data-testid="security-section">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-bold text-slate-900 tracking-tight">Security Scanner</h2>
          <p className="text-xs text-slate-500 mt-0.5">{SECTION_DESC.security}</p>
        </div>
        <button
          onClick={runScan}
          disabled={scanning}
          className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg text-xs font-semibold hover:bg-slate-800 disabled:opacity-50 transition-colors"
          data-testid="run-scan-btn"
        >
          <RefreshCw size={14} className={scanning ? 'animate-spin' : ''} />
          {scanning ? 'Scanning...' : 'Run Scan'}
        </button>
      </div>

      {!scan ? (
        <div className="text-center py-20 bg-white rounded-2xl border border-slate-200">
          <ScanSearch size={48} className="text-slate-300 mx-auto mb-4" strokeWidth={1.5} />
          <h3 className="text-base font-semibold text-slate-700 mb-1">No scans yet</h3>
          <p className="text-xs text-slate-500 mb-6">Run your first security scan to detect vulnerabilities</p>
          <button onClick={runScan} disabled={scanning}
            className="px-6 py-2.5 bg-cyan-500 text-white rounded-full text-xs font-bold hover:bg-cyan-600 disabled:opacity-50"
            data-testid="first-scan-btn">
            {scanning ? 'Scanning...' : 'Start First Scan'}
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {/* Score + Summary */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 flex items-center gap-8">
            <ScoreRing score={scan.score} />
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-3">
                <h3 className="text-base font-bold text-slate-900">
                  {scan.score >= 90 ? 'Excellent' : scan.score >= 70 ? 'Good' : scan.score >= 50 ? 'Needs Work' : 'Critical Issues'}
                </h3>
                <span className="text-[10px] text-slate-400 flex items-center gap-1">
                  <Clock size={10} />
                  {new Date(scan.started_at).toLocaleString()} ({scan.duration_ms}ms)
                </span>
              </div>
              <div className="flex gap-3 mb-4">
                {['critical', 'high', 'medium', 'low', 'info'].map(sev => (
                  <div key={sev} className="text-center">
                    <p className={`text-lg font-bold ${(scan.severity_counts?.[sev] || 0) > 0 ? SEV_CONFIG[sev].text : 'text-slate-300'}`}>
                      {scan.severity_counts?.[sev] || 0}
                    </p>
                    <p className="text-[9px] text-slate-500 uppercase font-bold">{sev}</p>
                  </div>
                ))}
              </div>
              <p className="text-xs text-slate-600">
                {scan.checks_passed}/{scan.checks_total} checks passed — {scan.total_findings} total finding{scan.total_findings !== 1 ? 's' : ''}
              </p>
            </div>
          </div>

          {/* Check Cards */}
          {scan.scan_results && (
            <div className="grid grid-cols-3 gap-3">
              {Object.entries(scan.scan_results).map(([name, result]) => (
                <CheckCard key={name} name={name} result={result} />
              ))}
            </div>
          )}

          {/* Findings */}
          {findings.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-slate-900">Findings ({sortedFindings.length})</h3>
                <div className="flex gap-2">
                  <select value={filterSev} onChange={e => setFilterSev(e.target.value)}
                    className="text-[11px] border border-slate-200 rounded-lg px-2 py-1 text-slate-600 bg-white"
                    data-testid="filter-severity">
                    <option value="all">All Severities</option>
                    <option value="critical">Critical</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                    <option value="info">Info</option>
                  </select>
                  <select value={filterType} onChange={e => setFilterType(e.target.value)}
                    className="text-[11px] border border-slate-200 rounded-lg px-2 py-1 text-slate-600 bg-white"
                    data-testid="filter-type">
                    <option value="all">All Types</option>
                    <option value="secret">Secrets</option>
                    <option value="dangerous_pattern">Code Patterns</option>
                    <option value="auth_missing">Auth Coverage</option>
                    <option value="config">Config</option>
                    <option value="mongodb">MongoDB</option>
                    <option value="rate_limit">Rate Limiting</option>
                    <option value="dependency">Dependencies</option>
                    <option value="xss">XSS</option>
                    <option value="storage">Storage</option>
                    <option value="upload">Uploads</option>
                  </select>
                </div>
              </div>
              <div className="max-h-[500px] overflow-y-auto pr-1">
                {sortedFindings.map((f, i) => <FindingRow key={`${f.category}-${f.file}-${i}`} finding={f} />)}
              </div>
            </div>
          )}

          {findings.length === 0 && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-8 text-center">
              <ShieldCheck size={40} className="text-emerald-500 mx-auto mb-3" strokeWidth={1.5} />
              <h3 className="text-sm font-bold text-emerald-800">All Clear</h3>
              <p className="text-xs text-emerald-600 mt-1">No security findings detected in the codebase</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
