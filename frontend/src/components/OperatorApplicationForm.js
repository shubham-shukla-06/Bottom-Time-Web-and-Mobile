import { useState, useEffect, useRef, useMemo } from 'react';
import { Building2, Globe, MapPin, FileText, Upload, ChevronDown, Search, Shield, Loader2, CheckCircle, ExternalLink } from 'lucide-react';
import axios from 'axios';
import { toast } from 'sonner';
import { COUNTRIES } from '../pages/cart/countries';

// ─── Country-specific business ID configuration ───────────────────────────
const COUNTRY_ID_CONFIG = {
  India: { label: 'GSTIN', placeholder: '22AAAAA0000A1Z5', hint: 'Your 15-character Goods and Services Tax Identification Number. Will be verified against government records.', maxLength: 15, autoVerify: true, fieldKey: 'gstin' },
  'United Kingdom': { label: 'Company Number', placeholder: '12345678', hint: 'Your Companies House registration number (8 characters).', maxLength: 8, autoVerify: false, fieldKey: 'registration_number' },
  Australia: { label: 'ABN', placeholder: '51 824 753 556', hint: 'Your 11-digit Australian Business Number.', maxLength: 14, autoVerify: false, fieldKey: 'registration_number' },
  Singapore: { label: 'UEN', placeholder: '201912345D', hint: 'Your Unique Entity Number from ACRA.', maxLength: 10, autoVerify: false, fieldKey: 'registration_number' },
  'New Zealand': { label: 'NZBN', placeholder: '9429041654789', hint: 'Your 13-digit New Zealand Business Number.', maxLength: 13, autoVerify: false, fieldKey: 'registration_number' },
  Denmark: { label: 'CVR Number', placeholder: '12345678', hint: 'Your 8-digit Central Business Register number.', maxLength: 8, autoVerify: false, fieldKey: 'registration_number' },
  Philippines: { label: 'SEC Registration Number', placeholder: 'CS201912345', hint: 'Your Securities and Exchange Commission registration number.', maxLength: 20, autoVerify: false, fieldKey: 'registration_number' },
  Japan: { label: 'Corporate Number', placeholder: '1234567890123', hint: 'Your 13-digit Houjin Bangou (法人番号). Verified format only.', maxLength: 13, autoVerify: false, fieldKey: 'registration_number' },
  China: { label: 'Unified Social Credit Code', placeholder: '91110000MA001GXX0X', hint: 'Your 18-character USCC (统一社会信用代码).', maxLength: 18, autoVerify: false, fieldKey: 'registration_number' },
  'United Arab Emirates': { label: 'Trade License Number', placeholder: 'DED-123456', hint: 'Your DED or free zone trade license number.', maxLength: 30, autoVerify: false, fieldKey: 'registration_number' },
  Thailand: { label: 'DBD Registration Number', placeholder: '0105512345678', hint: 'Your Department of Business Development registration number (13 digits).', maxLength: 13, autoVerify: false, fieldKey: 'registration_number' },
  Indonesia: { label: 'NIB', placeholder: '1234567890123', hint: 'Your 13-digit Nomor Induk Berusaha from the OSS system.', maxLength: 13, autoVerify: false, fieldKey: 'registration_number' },
  Egypt: { label: 'Commercial Registry Number', placeholder: '12345', hint: 'Your commercial registry number from GAFI.', maxLength: 20, autoVerify: false, fieldKey: 'registration_number' },
};

// EU countries use VAT number
const EU_COUNTRIES = ['Austria', 'Belgium', 'Bulgaria', 'Croatia', 'Cyprus', 'Czech Republic', 'Estonia', 'Finland', 'France', 'Germany', 'Greece', 'Hungary', 'Ireland', 'Italy', 'Latvia', 'Lithuania', 'Luxembourg', 'Malta', 'Netherlands', 'Poland', 'Portugal', 'Romania', 'Slovakia', 'Slovenia', 'Spain', 'Sweden'];
const EU_VAT_PREFIXES = { Austria: 'ATU', Belgium: 'BE0', Bulgaria: 'BG', Croatia: 'HR', Cyprus: 'CY', 'Czech Republic': 'CZ', Estonia: 'EE', Finland: 'FI', France: 'FR', Germany: 'DE', Greece: 'EL', Hungary: 'HU', Ireland: 'IE', Italy: 'IT', Latvia: 'LV', Lithuania: 'LT', Luxembourg: 'LU', Malta: 'MT', Netherlands: 'NL', Poland: 'PL', Portugal: 'PT', Romania: 'RO', Slovakia: 'SK', Slovenia: 'SI', Spain: 'ES', Sweden: 'SE' };

function getIdConfig(country) {
  if (COUNTRY_ID_CONFIG[country]) return COUNTRY_ID_CONFIG[country];
  if (EU_COUNTRIES.includes(country)) {
    const prefix = EU_VAT_PREFIXES[country] || '';
    return { label: 'VAT Number', placeholder: `${prefix}123456789`, hint: 'Your EU VAT identification number. Will be verified via VIES.', maxLength: 20, autoVerify: false, fieldKey: 'registration_number' };
  }
  return { label: 'Business Registration Number', placeholder: 'Your official registration number', hint: 'The official registration number issued by your local business authority.', maxLength: 30, autoVerify: false, fieldKey: 'registration_number' };
}

const BUSINESS_TYPES = [
  { value: 'dive_center', label: 'Dive Center' },
  { value: 'dive_resort', label: 'Dive Resort' },
  { value: 'liveaboard', label: 'Liveaboard' },
  { value: 'dive_school', label: 'Dive School' },
  { value: 'tour_operator', label: 'Tour Operator' },
  { value: 'equipment_rental', label: 'Equipment Rental' },
  { value: 'other', label: 'Other' },
];

const CERT_AGENCIES = ['PADI', 'SSI', 'NAUI', 'CMAS', 'BSAC', 'SDI/TDI', 'RAID', 'GUE', 'IANTD'];

const COUNTRIES_LEGACY_REMOVED = null;
/* Local list removed; canonical 245-entry list with iso/code/flag is imported above
   from ../pages/cart/countries (which re-exports /app/frontend/src/data/countries.js). */

function CountrySelect({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef(null);
  const filtered = COUNTRIES.filter(c => {
    const q = search.toLowerCase();
    if (!q) return true;
    return c.name.toLowerCase().includes(q) || c.iso.toLowerCase().includes(q) || c.code.includes(search);
  });

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen(o => !o)}
        className="input-field flex items-center justify-between w-full text-left" data-testid="app-country-select">
        <span className={value ? 'text-slate-900' : 'text-slate-400'}>{value || 'Select country'}</span>
        <ChevronDown size={16} className="text-slate-400 flex-shrink-0" />
      </button>
      {open && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden">
          <div className="p-2 border-b border-slate-100 flex items-center gap-2">
            <Search size={14} className="text-slate-400 flex-shrink-0" />
            <input autoFocus type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search country..." className="w-full text-sm py-1 focus:outline-none bg-transparent text-slate-900 placeholder-slate-400" />
          </div>
          <div className="max-h-52 overflow-y-auto">
            {filtered.length > 0 ? filtered.map(c => (
              <button key={c.iso} type="button"
                className={`w-full text-left px-4 py-2.5 text-sm transition-colors hover:bg-cyan-50 flex items-center justify-between gap-3 ${value === c.name ? 'text-cyan-600 font-semibold bg-cyan-50' : 'text-slate-800'}`}
                onClick={() => { onChange(c.name); setOpen(false); setSearch(''); }}
                data-testid={`app-country-item-${c.iso}`}>
                <span className="flex items-center gap-2 truncate"><span className="shrink-0">{c.flag}</span>{c.name}</span>
                <span className="text-xs text-slate-400 font-medium shrink-0">{c.code}</span>
              </button>
            )) : <p className="text-center text-slate-400 text-sm py-4">No countries found</p>}
          </div>
        </div>
      )}
    </div>
  );
}

export default function OperatorApplicationForm({ onSubmitted }) {
  const [form, setForm] = useState({
    country: '', city: '', address: '',
    business_name: '', business_type: 'dive_center',
    registration_number: '', gstin: '',
    years_in_business: '', num_employees: '',
    certifications: [],
    website: '', contact_email: '', contact_phone: '',
    description: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [gstinVerifying, setGstinVerifying] = useState(false);
  const [gstinResult, setGstinResult] = useState(null);

  const idConfig = useMemo(() => getIdConfig(form.country), [form.country]);
  const isIndia = form.country === 'India';

  const set = (key, val) => setForm(prev => ({ ...prev, [key]: val }));

  const toggleCert = (cert) => {
    setForm(prev => ({
      ...prev,
      certifications: prev.certifications.includes(cert)
        ? prev.certifications.filter(c => c !== cert)
        : [...prev.certifications, cert],
    }));
  };

  const verifyGstin = async () => {
    if (!form.gstin || form.gstin.length < 15) return;
    setGstinVerifying(true);
    try {
      const res = await axios.post('/operator-listings/verify-gstin', { gstin: form.gstin });
      setGstinResult(res.data);
      if (res.data.govt_verified && res.data.active) {
        toast.success('GSTIN verified against government records');
      } else if (res.data.govt_verified && !res.data.active) {
        toast.error(`GSTIN is not active. Status: ${res.data.status}`);
      }
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Verification failed');
      setGstinResult(null);
    } finally { setGstinVerifying(false); }
  };

  const handleSubmit = async () => {
    if (!form.country) { toast.error('Please select your country'); return; }
    if (!form.business_name.trim()) { toast.error('Business name is required'); return; }
    if (isIndia && !form.gstin) { toast.error('GSTIN is mandatory for Indian operators'); return; }
    if (isIndia && (!gstinResult?.govt_verified || !gstinResult?.active)) { toast.error('Please verify your GSTIN first'); return; }

    setSubmitting(true);
    try {
      const payload = {
        country: form.country,
        city: form.city,
        address: form.address,
        business_name: form.business_name,
        business_type: form.business_type,
        registration_number: isIndia ? '' : form.registration_number,
        gstin: isIndia ? form.gstin : '',
        years_in_business: form.years_in_business ? parseInt(form.years_in_business) : 0,
        num_employees: form.num_employees ? parseInt(form.num_employees) : 1,
        certifications: form.certifications,
        website: form.website,
        contact_email: form.contact_email,
        contact_phone: form.contact_phone,
        description: form.description,
      };
      await axios.post('/operator-listings/apply', payload);
      toast.success('Application submitted! Our team will review it shortly.');
      onSubmitted?.();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to submit application');
    } finally { setSubmitting(false); }
  };

  return (
    <div className="max-w-2xl mx-auto" data-testid="operator-application-form">
      <div className="text-center mb-8">
        <div className="w-14 h-14 rounded-2xl bg-cyan-50 flex items-center justify-center mx-auto mb-4">
          <Building2 size={24} className="text-cyan-500" />
        </div>
        <h2 className="text-2xl font-bold tracking-tight text-slate-900">Register Your Dive Business</h2>
        <p className="text-slate-500 text-sm mt-1">Tell us about your business so we can verify and approve your operator account</p>
      </div>

      <div className="space-y-6">
        {/* Section: Location */}
        <FormSection icon={<MapPin size={16} />} title="Business Location">
          <div>
            <Label required>Country of Registration</Label>
            <CountrySelect value={form.country} onChange={v => set('country', v)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>City</Label>
              <input className="input-field" placeholder="e.g., Koh Tao" value={form.city} onChange={e => set('city', e.target.value)} data-testid="app-city" />
            </div>
            <div>
              <Label>Address</Label>
              <input className="input-field" placeholder="Street address" value={form.address} onChange={e => set('address', e.target.value)} data-testid="app-address" />
            </div>
          </div>
        </FormSection>

        {/* Section: Business Details */}
        <FormSection icon={<Building2 size={16} />} title="Business Details">
          <div>
            <Label required>Business Name</Label>
            <input className="input-field" placeholder="Your dive center or company name" value={form.business_name} onChange={e => set('business_name', e.target.value)} data-testid="app-business-name" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Business Type</Label>
              <select className="input-field" value={form.business_type} onChange={e => set('business_type', e.target.value)} data-testid="app-business-type">
                {BUSINESS_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <Label>Years in Business</Label>
              <input className="input-field" type="number" min="0" placeholder="e.g., 5" value={form.years_in_business} onChange={e => set('years_in_business', e.target.value)} data-testid="app-years" />
            </div>
          </div>
          <div>
            <Label>Number of Staff</Label>
            <input className="input-field" type="number" min="1" placeholder="e.g., 12" value={form.num_employees} onChange={e => set('num_employees', e.target.value)} data-testid="app-employees" />
          </div>
          <div>
            <Label>Description</Label>
            <textarea className="input-field h-20 py-2" placeholder="Tell us about your business, specialties, and what makes you unique..." value={form.description} onChange={e => set('description', e.target.value)} data-testid="app-description" />
          </div>
        </FormSection>

        {/* Section: Country-Specific Verification */}
        {form.country && (
          <FormSection icon={<Shield size={16} />} title="Business Verification">
            {isIndia ? (
              <div>
                <Label required>{idConfig.label}</Label>
                <div className="flex gap-2">
                  <input className="input-field flex-1 uppercase" maxLength={idConfig.maxLength} placeholder={idConfig.placeholder}
                    value={form.gstin} onChange={e => { set('gstin', e.target.value.toUpperCase()); setGstinResult(null); }} data-testid="app-gstin" />
                  <button type="button" onClick={verifyGstin} disabled={gstinVerifying || !form.gstin || form.gstin.length < 15}
                    className="px-4 py-2 bg-cyan-400 text-white text-xs font-bold rounded-xl hover:bg-cyan-500 disabled:opacity-40 transition-colors flex items-center gap-1.5"
                    data-testid="app-verify-gstin-btn">
                    {gstinVerifying ? <Loader2 size={14} className="animate-spin" /> : <Shield size={14} />}
                    Verify
                  </button>
                </div>
                {gstinResult?.govt_verified && gstinResult?.active && (
                  <div className="mt-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2 flex items-center gap-2" data-testid="gstin-verified">
                    <CheckCircle size={14} className="text-green-600" />
                    <span className="text-xs text-green-700 font-medium">Verified: {gstinResult.legal_name} ({gstinResult.status})</span>
                  </div>
                )}
                <p className="text-[10px] text-slate-400 mt-1">{idConfig.hint}</p>
              </div>
            ) : (
              <div>
                <Label>{idConfig.label}</Label>
                <input className="input-field" maxLength={idConfig.maxLength} placeholder={idConfig.placeholder}
                  value={form.registration_number} onChange={e => set('registration_number', e.target.value)} data-testid="app-reg-number" />
                <p className="text-[10px] text-slate-400 mt-1">{idConfig.hint}</p>
              </div>
            )}
            <VerificationNote country={form.country} />
          </FormSection>
        )}

        {/* Section: Certifications */}
        <FormSection icon={<FileText size={16} />} title="Dive Certifications">
          <div>
            <Label>Affiliated Agencies</Label>
            <div className="flex flex-wrap gap-2">
              {CERT_AGENCIES.map(cert => (
                <button key={cert} type="button" onClick={() => toggleCert(cert)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${form.certifications.includes(cert) ? 'bg-cyan-400 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                  data-testid={`app-cert-${cert}`}>{cert}</button>
              ))}
            </div>
          </div>
        </FormSection>

        {/* Section: Contact */}
        <FormSection icon={<Globe size={16} />} title="Contact Information">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Contact Email</Label>
              <input className="input-field" type="email" placeholder="business@example.com" value={form.contact_email} onChange={e => set('contact_email', e.target.value)} data-testid="app-contact-email" />
            </div>
            <div>
              <Label>Contact Phone</Label>
              <input className="input-field" placeholder="+66 812 345 678" value={form.contact_phone} onChange={e => set('contact_phone', e.target.value)} data-testid="app-contact-phone" />
            </div>
          </div>
          <div>
            <Label>Website</Label>
            <input className="input-field" placeholder="https://yourbusiness.com" value={form.website} onChange={e => set('website', e.target.value)} data-testid="app-website" />
          </div>
        </FormSection>

        {/* Submit */}
        <button onClick={handleSubmit} disabled={submitting}
          className="w-full py-3.5 bg-cyan-400 hover:bg-cyan-500 text-white font-bold rounded-xl text-sm transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          data-testid="app-submit-btn">
          {submitting ? <><Loader2 size={16} className="animate-spin" /> Submitting...</> : 'Submit Application'}
        </button>
      </div>
    </div>
  );
}

function FormSection({ icon, title, children }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-5 space-y-4">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-cyan-500">{icon}</span>
        <h3 className="text-sm font-bold text-slate-900">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function Label({ children, required }) {
  return (
    <label className="block text-xs font-medium text-slate-600 mb-1">
      {children}{required && <span className="text-red-400 ml-0.5">*</span>}
    </label>
  );
}

function VerificationNote({ country }) {
  const PORTAL_LINKS = {
    Thailand: { url: 'https://datawarehouse.dbd.go.th/', label: 'DBD DataWarehouse' },
    Indonesia: { url: 'https://oss.go.id/', label: 'OSS Portal' },
    Japan: { url: 'https://www.houjin-bangou.nta.go.jp/en/', label: 'NTA Corporate Number Search' },
    China: { url: 'https://www.gsxt.gov.cn/', label: 'NECIPS/GSXT' },
    Egypt: { url: 'https://www.gafi.gov.eg/', label: 'GAFI Portal' },
    'United Arab Emirates': { url: 'https://eservices.dubaided.gov.ae/', label: 'DED eServices' },
    'United Kingdom': { url: 'https://find-and-update.company-information.service.gov.uk/', label: 'Companies House' },
    Philippines: { url: 'https://portal.sec.gov.ph/', label: 'SEC Portal' },
    Australia: { url: 'https://abr.business.gov.au/', label: 'ABN Lookup' },
    Singapore: { url: 'https://www.uen.gov.sg/', label: 'UEN Search' },
    'New Zealand': { url: 'https://www.nzbn.govt.nz/', label: 'NZBN Register' },
    Denmark: { url: 'https://datacvr.virk.dk/', label: 'CVR Register' },
  };

  const isAutoVerified = country === 'India';
  const portal = PORTAL_LINKS[country];
  const isEU = EU_COUNTRIES.includes(country);

  if (isAutoVerified) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3">
        <p className="text-xs text-green-700 font-medium flex items-center gap-1.5">
          <Shield size={12} /> Automated verification via government records
        </p>
      </div>
    );
  }

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 space-y-1.5">
      <p className="text-xs text-slate-600">
        {isEU
          ? 'Your VAT number will be verified via the EU VIES system during review.'
          : portal
            ? 'Our compliance team will verify your registration against the official registry.'
            : 'Our compliance team will verify your registration during review.'}
      </p>
      {portal && (
        <a href={portal.url} target="_blank" rel="noopener noreferrer"
          className="text-[10px] text-cyan-600 hover:underline flex items-center gap-1">
          <ExternalLink size={10} /> {portal.label}
        </a>
      )}
    </div>
  );
}
