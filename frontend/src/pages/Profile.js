import { useState, useEffect, useRef, useCallback, useMemo, memo } from 'react';
import useAuthStore from '../stores/authStore';
import useUIStore from '../stores/uiStore';
import Navbar from '../components/Navbar';
import { User, MapPin, Award, Calendar, Anchor, Heart, Languages, AlertTriangle, Briefcase, Globe, Phone, Mail, Instagram, Facebook, Clock, Users, FileText, BellOff, Shield } from 'lucide-react';
import axios from 'axios';
import { toast } from 'sonner';
import Footer from '../components/Footer';
import { useNavigate } from 'react-router-dom';
import { Section, ReadField, ProfilePhotoUpload, PrivacyDataSection, NotificationPreferencesSection, CurrencyPreference } from './profile/ProfileSections';
import SecuritySection from '../components/profile/SecuritySection';

const CERT_AGENCIES = [
  { value: 'padi', label: 'PADI' }, { value: 'ssi', label: 'SSI' },
  { value: 'naui', label: 'NAUI' }, { value: 'cmas', label: 'CMAS' },
  { value: 'bsac', label: 'BSAC' }, { value: 'other', label: 'Other' }
];
const DIVE_TYPES = ['Reef', 'Wreck', 'Cave', 'Night', 'Drift', 'Muck', 'Deep', 'Pelagic', 'Photography', 'Conservation'];
const EQUIPMENT_OPTIONS = [{ value: 'full', label: 'I own full gear' }, { value: 'partial', label: 'I own some gear' }, { value: 'none', label: 'I need to rent everything' }];
const TRAVEL_OPTIONS = [{ value: 'local', label: 'Local dives only' }, { value: 'weekend', label: 'Weekend trips' }, { value: 'international', label: 'International travel' }];
const EXPERIENCE_LABELS = { never: 'Never dived', try_dive: 'Done a try dive', certified: 'Certified diver' };
const CERT_LABELS = { open_water: 'Open Water Diver', advanced_open_water: 'Advanced Open Water', rescue: 'Rescue Diver', divemaster: 'Divemaster', instructor: 'Instructor' };
const INSTR_CERT_LABELS = { divemaster: 'Divemaster', instructor: 'Instructor', course_director: 'Course Director' };
const BUSINESS_TYPES = [
  { value: 'dives', label: 'Fun Dives' }, { value: 'liveaboards', label: 'Liveaboard' },
  { value: 'dive_school', label: 'Dive School' }, { value: 'equipment_rental', label: 'Equipment Rental' }
];
const SEASON_OPTIONS = [
  { value: 'year_round', label: 'Year-round' }, { value: 'seasonal', label: 'Seasonal' }
];

export default function Profile() {
  const user = useAuthStore(s => s.user);
  const setUser = useAuthStore(s => s.setUser);
  const isDiver = useMemo(() => user?.role === 'diver', [user?.role]);
  const isInstructor = useMemo(() => user?.role === 'instructor', [user?.role]);
  const isOperator = useMemo(() => user?.role === 'operator', [user?.role]);
  const isAdmin = useMemo(() => user?.role === 'admin', [user?.role]);
  const isCertified = useMemo(() => user?.experience_level === 'certified', [user?.experience_level]);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({});
  const [langInput, setLangInput] = useState('');

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (user) setForm({
      name: user.name || '', location_country: user.location_country || '', location_city: user.location_city || '',
      date_of_birth: user.date_of_birth || '', certification_agency: user.certification_agency || '',
      last_dive_date: user.last_dive_date || '', total_dives: user.total_dives ?? '',
      preferred_dive_types: user.preferred_dive_types || [], medical_fitness: user.medical_fitness ?? null,
      equipment_ownership: user.equipment_ownership || '', languages: user.languages || [],
      travel_willingness: user.travel_willingness || '',
      emergency_contact_name: user.emergency_contact_name || '', emergency_contact_phone: user.emergency_contact_phone || '',
      emergency_contact_relationship: user.emergency_contact_relationship || '',
      business_name: user.business_name || '', business_type: user.business_type || '',
      year_established: user.year_established ?? '', certifying_agencies: user.certifying_agencies || [],
      staff_count: user.staff_count ?? '', business_address: user.business_address || '',
      gstin: user.gstin || '',
      business_phone: user.business_phone || '', business_email: user.business_email || '',
      website_url: user.website_url || '', social_instagram: user.social_instagram || '',
      social_facebook: user.social_facebook || '', operating_season: user.operating_season || '',
      insurance_number: user.insurance_number || ''
    });
  }, [user]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const saveSection = useCallback(async (fields) => {
    setSaving(true);
    try {
      const payload = {};
      fields.forEach(f => {
        const val = form[f];
        if (['total_dives', 'year_established', 'staff_count'].includes(f)) payload[f] = val === '' ? null : parseInt(val);
        else payload[f] = val === '' ? null : val;
      });
      const res = await axios.put('/auth/profile', payload);
      setUser(res.data);
      setEditing(null);
      toast.success('Profile updated');
    } catch (e) { toast.error('Failed to update'); }
    finally { setSaving(false); }
  }, [form, setUser]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const toggleItem = useCallback((field, item) => setForm(prev => ({
    ...prev, [field]: prev[field].includes(item) ? prev[field].filter(t => t !== item) : [...prev[field], item]
  })), []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const addLanguage = useCallback(() => {
    if (langInput.trim() && !form.languages.includes(langInput.trim())) {
      setForm(prev => ({ ...prev, languages: [...prev.languages, langInput.trim()] }));
      setLangInput('');
    }
  }, [langInput, form.languages]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const removeLanguage = useCallback((lang) => setForm(prev => ({ ...prev, languages: prev.languages.filter(l => l !== lang) })), []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const isEditing = useCallback((sec) => editing === sec, [editing]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const sectionProps = useCallback((sec, fields) => ({
    editing: isEditing(sec),
    onEdit: () => setEditing(sec),
    onSave: () => saveSection(fields),
    onCancel: () => setEditing(null),
    saving,
  }), [isEditing, saveSection, saving]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const handlePhotoUpdated = useCallback((url) => setUser(prev => ({ ...prev, profile_photo: url })), [setUser]);

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <Navbar />
      <div className="flex-1 max-w-3xl mx-auto w-full px-6 md:px-12 py-12" data-testid="profile-page">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mb-2">Your Profile</h1>
        <p className="text-slate-500 mb-6">{isAdmin ? 'Manage your admin account' : isOperator ? 'Manage your business profile' : isInstructor ? 'Manage your instructor profile' : 'Manage your diving profile'}</p>

        {/* Profile Photo */}
        <ProfilePhotoUpload user={user} onUpdated={handlePhotoUpdated} />

        {/* Account — everyone (read-only) */}
        <Section title="Account" icon={<User size={18} />}>
          <ReadField label="Name" value={user?.name} />
          <ReadField label="Email" value={user?.email} />
          <ReadField label="Phone" value={user?.phone} />
          <ReadField label="Role" value={user?.role?.charAt(0).toUpperCase() + user?.role?.slice(1)} />
          {isDiver && <ReadField label="Experience" value={EXPERIENCE_LABELS[user?.experience_level]} />}
          {isDiver && isCertified && <ReadField label="Certification" value={CERT_LABELS[user?.certification_level]} />}
          {isOperator && <ReadField label="Status" value={user?.status === 'active' ? 'Approved' : user?.status === 'pending_approval' ? 'Pending Approval' : user?.status} />}
        </Section>

        {/* Default Currency */}
        <CurrencyPreference />

        {/* ========== OPERATOR SECTIONS ========== */}
        {isOperator && (
          <>
            <Section title="Business Information" icon={<Briefcase size={18} />} {...sectionProps('business', ['business_name', 'business_type', 'year_established', 'certifying_agencies', 'staff_count', 'gstin'])}>
              {isEditing('business') ? (
                <div className="space-y-3">
                  <div><label className="block text-sm font-medium mb-1">Business Name</label><input className="input-field" value={form.business_name} onChange={e => setForm({...form, business_name: e.target.value})} placeholder="Your dive center name" data-testid="edit-business-name" /></div>
                  <div><label className="block text-sm font-medium mb-1">Business Type</label>
                    <select className="input-field" value={form.business_type} onChange={e => setForm({...form, business_type: e.target.value})} data-testid="edit-business-type">
                      <option value="">Select type</option>{BUSINESS_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="block text-sm font-medium mb-1">Year Established</label><input type="number" className="input-field" value={form.year_established} onChange={e => setForm({...form, year_established: e.target.value})} placeholder="e.g., 2015" data-testid="edit-year-est" /></div>
                    <div><label className="block text-sm font-medium mb-1">Staff / Instructors</label><input type="number" className="input-field" value={form.staff_count} onChange={e => setForm({...form, staff_count: e.target.value})} placeholder="e.g., 8" data-testid="edit-staff-count" /></div>
                  </div>
                  {user?.location_country?.toLowerCase() === 'india' && (
                    <GSTINField gstin={form.gstin} onChange={val => setForm({...form, gstin: val})} verified={user?.gstin_verified} />
                  )}
                  <div>
                    <label className="block text-sm font-medium mb-2">Certifying Agencies</label>
                    <div className="flex flex-wrap gap-2">
                      {CERT_AGENCIES.map(a => (
                        <button key={a.value} onClick={() => toggleItem('certifying_agencies', a.value)} className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${form.certifying_agencies.includes(a.value) ? 'bg-cyan-400 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`} data-testid={`agency-${a.value}`}>{a.label}</button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <ReadField label="Business Name" value={user?.business_name} />
                  <ReadField label="Type" value={BUSINESS_TYPES.find(t => t.value === user?.business_type)?.label} />
                  <ReadField label="Established" value={user?.year_established ? String(user.year_established) : null} />
                  <ReadField label="Staff" value={user?.staff_count ? String(user.staff_count) : null} />
                  {user?.location_country?.toLowerCase() === 'india' && (
                    <ReadField label="GSTIN" value={user?.gstin ? `${user.gstin}${user.gstin_verified ? ' (Verified)' : ''}` : 'Not provided'} />
                  )}
                  <ReadField label="Agencies" value={user?.certifying_agencies?.length ? user.certifying_agencies.map(a => CERT_AGENCIES.find(c => c.value === a)?.label || a).join(', ') : null} />
                </>
              )}
            </Section>

            <Section title="Contact & Online" icon={<Globe size={18} />} {...sectionProps('contact', ['business_phone', 'business_email', 'website_url', 'social_instagram', 'social_facebook'])}>
              {isEditing('contact') ? (
                <div className="flex flex-col gap-3">
                  <div><label className="block text-sm font-medium mb-1">Business Phone</label><input type="tel" className="input-field" value={form.business_phone} onChange={e => setForm({...form, business_phone: e.target.value})} placeholder="+1234567890" data-testid="edit-biz-phone" /></div>
                  <div><label className="block text-sm font-medium mb-1">Business Email</label><input type="email" className="input-field" value={form.business_email} onChange={e => setForm({...form, business_email: e.target.value})} placeholder="info@yourbusiness.com" data-testid="edit-biz-email" /></div>
                  <div><label className="block text-sm font-medium mb-1">Website</label><input type="url" className="input-field" value={form.website_url} onChange={e => setForm({...form, website_url: e.target.value})} placeholder="https://..." data-testid="edit-website" /></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="block text-sm font-medium mb-1">Instagram</label><input className="input-field" value={form.social_instagram} onChange={e => setForm({...form, social_instagram: e.target.value})} placeholder="@handle" data-testid="edit-instagram" /></div>
                    <div><label className="block text-sm font-medium mb-1">Facebook</label><input className="input-field" value={form.social_facebook} onChange={e => setForm({...form, social_facebook: e.target.value})} placeholder="Page URL" data-testid="edit-facebook" /></div>
                  </div>
                </div>
              ) : (
                <>
                  <ReadField label="Business Phone" value={user?.business_phone} />
                  <ReadField label="Business Email" value={user?.business_email} />
                  <ReadField label="Website" value={user?.website_url} />
                  <ReadField label="Instagram" value={user?.social_instagram} />
                  <ReadField label="Facebook" value={user?.social_facebook} />
                </>
              )}
            </Section>

            <Section title="Location" icon={<MapPin size={18} />} {...sectionProps('location', ['location_country', 'location_city', 'business_address'])}>
              {isEditing('location') ? (
                <div className="flex flex-col gap-3">
                  <div><label className="block text-sm font-medium mb-1">Country</label><input className="input-field" value={form.location_country} onChange={e => setForm({...form, location_country: e.target.value})} data-testid="edit-country" /></div>
                  <div><label className="block text-sm font-medium mb-1">City</label><input className="input-field" value={form.location_city} onChange={e => setForm({...form, location_city: e.target.value})} data-testid="edit-city" /></div>
                  <div><label className="block text-sm font-medium mb-1">Full Address</label><input className="input-field" value={form.business_address} onChange={e => setForm({...form, business_address: e.target.value})} placeholder="Street address" data-testid="edit-address" /></div>
                </div>
              ) : (
                <><ReadField label="Country" value={user?.location_country} /><ReadField label="City" value={user?.location_city} /><ReadField label="Address" value={user?.business_address} /></>
              )}
            </Section>

            {/* Tax Registration — only for Indian operators */}
            {(user?.role === 'operator' || user?.role === 'instructor') && (
              <Section title="Tax Registration" icon={<FileText size={18} />} {...sectionProps('tax_reg', ['gstin', 'location_state'])}>
                {isEditing('tax_reg') ? (
                  <div className="flex flex-col gap-3">
                    <div>
                      <label className="block text-sm font-medium mb-1">GSTIN (GST Registration Number)</label>
                      <input className="input-field uppercase" maxLength={15} placeholder="22AAAAA0000A1Z5" value={form.gstin || ''} onChange={e => setForm({...form, gstin: e.target.value.toUpperCase()})} data-testid="edit-gstin" />
                      <p className="text-[10px] text-slate-400 mt-1">Required for Indian operators to charge Goods and Services Tax on bookings. Format: 15 alphanumeric characters.</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">State of Registration</label>
                      <input className="input-field" placeholder="e.g., Maharashtra" value={form.location_state || ''} onChange={e => setForm({...form, location_state: e.target.value})} data-testid="edit-state" />
                      <p className="text-[10px] text-slate-400 mt-1">Determines IGST vs CGST+SGST split for domestic bookings.</p>
                    </div>
                  </div>
                ) : (
                  <>
                    <ReadField label="GSTIN" value={user?.gstin || 'Not registered'} />
                    <ReadField label="State of Registration" value={user?.location_state || 'Not set'} />
                    {!user?.gstin && user?.location_country?.toLowerCase() === 'india' && (
                      <p className="text-[10px] text-amber-600 bg-amber-50 px-2.5 py-1.5 rounded-lg mt-2">Add your GSTIN to charge GST on bookings. Without it, GST will not be applied to your listings.</p>
                    )}
                  </>
                )}
              </Section>
            )}

            <Section title="Operations" icon={<Clock size={18} />} {...sectionProps('operations', ['operating_season', 'insurance_number'])}>
              {isEditing('operations') ? (
                <div className="flex flex-col gap-3">
                  <div><label className="block text-sm font-medium mb-1">Operating Season</label>
                    <select className="input-field" value={form.operating_season} onChange={e => setForm({...form, operating_season: e.target.value})} data-testid="edit-season">
                      <option value="">Select</option>{SEASON_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                  <div><label className="block text-sm font-medium mb-1">Insurance / License Number</label><input className="input-field" value={form.insurance_number} onChange={e => setForm({...form, insurance_number: e.target.value})} placeholder="Optional — builds trust" data-testid="edit-insurance" /></div>
                </div>
              ) : (
                <><ReadField label="Season" value={SEASON_OPTIONS.find(o => o.value === user?.operating_season)?.label} /><ReadField label="Insurance / License" value={user?.insurance_number} /></>
              )}
            </Section>

            <Section title="Languages" icon={<Languages size={18} />} {...sectionProps('languages', ['languages'])}>
              {isEditing('languages') ? (
                <div>
                  <div className="flex gap-2 mb-3"><input type="text" className="input-field flex-1" placeholder="e.g., English" value={langInput} onChange={e => setLangInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addLanguage())} data-testid="lang-input" /><button onClick={addLanguage} className="btn-secondary px-4 py-2 text-sm" data-testid="add-lang-btn">Add</button></div>
                  <div className="flex flex-wrap gap-2">{form.languages.map(l => (<span key={l} className="flex items-center gap-1 px-3 py-1 bg-cyan-50 text-cyan-400 rounded-full text-sm font-medium">{l}<button onClick={() => removeLanguage(l)} className="hover:text-red-500 ml-1">&times;</button></span>))}</div>
                </div>
              ) : <ReadField label="Staff Languages" value={user?.languages?.length ? user.languages.join(', ') : null} />}
            </Section>
          </>
        )}

        {/* ========== INSTRUCTOR SECTIONS ========== */}
        {isInstructor && (
          <>
            <Section title="Qualifications" icon={<Award size={18} />}>
              <ReadField label="Certification" value={INSTR_CERT_LABELS[user?.instructor_certification]} />
              <ReadField label="Agency" value={CERT_AGENCIES.find(a => a.value === user?.instructor_agency)?.label} />
              <ReadField label="Years" value={user?.instructor_years != null ? String(user.instructor_years) : null} />
              <ReadField label="Specialties" value={user?.instructor_specialties?.length ? user.instructor_specialties.join(', ') : null} />
            </Section>

            <Section title="Location" icon={<MapPin size={18} />} {...sectionProps('location', ['location_country', 'location_city'])}>
              {isEditing('location') ? (
                <div className="flex flex-col gap-3">
                  <div><label className="block text-sm font-medium mb-1">Country</label><input className="input-field" value={form.location_country} onChange={e => setForm({...form, location_country: e.target.value})} data-testid="edit-country" /></div>
                  <div><label className="block text-sm font-medium mb-1">City</label><input className="input-field" value={form.location_city} onChange={e => setForm({...form, location_city: e.target.value})} data-testid="edit-city" /></div>
                </div>
              ) : (<><ReadField label="Country" value={user?.location_country} /><ReadField label="City" value={user?.location_city} /></>)}
            </Section>

            <Section title="Languages" icon={<Languages size={18} />} {...sectionProps('languages', ['languages'])}>
              {isEditing('languages') ? (
                <div>
                  <div className="flex gap-2 mb-3"><input type="text" className="input-field flex-1" placeholder="e.g., English" value={langInput} onChange={e => setLangInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addLanguage())} data-testid="lang-input" /><button onClick={addLanguage} className="btn-secondary px-4 py-2 text-sm" data-testid="add-lang-btn">Add</button></div>
                  <div className="flex flex-wrap gap-2">{form.languages.map(l => (<span key={l} className="flex items-center gap-1 px-3 py-1 bg-cyan-50 text-cyan-400 rounded-full text-sm font-medium">{l}<button onClick={() => removeLanguage(l)} className="hover:text-red-500 ml-1">&times;</button></span>))}</div>
                </div>
              ) : <ReadField label="Languages" value={user?.languages?.length ? user.languages.join(', ') : null} />}
            </Section>

            <Section title="Emergency Contact" icon={<AlertTriangle size={18} />} {...sectionProps('emergency', ['emergency_contact_name', 'emergency_contact_phone', 'emergency_contact_relationship'])}>
              {isEditing('emergency') ? (
                <div className="space-y-3">
                  <div><label className="block text-sm font-medium mb-1">Name</label><input className="input-field" value={form.emergency_contact_name} onChange={e => setForm({...form, emergency_contact_name: e.target.value})} data-testid="edit-emergency-name" /></div>
                  <div><label className="block text-sm font-medium mb-1">Phone</label><input type="tel" className="input-field" value={form.emergency_contact_phone} onChange={e => setForm({...form, emergency_contact_phone: e.target.value})} data-testid="edit-emergency-phone" /></div>
                  <div><label className="block text-sm font-medium mb-1">Relationship</label><input className="input-field" value={form.emergency_contact_relationship} onChange={e => setForm({...form, emergency_contact_relationship: e.target.value})} data-testid="edit-emergency-relationship" /></div>
                </div>
              ) : (<><ReadField label="Name" value={user?.emergency_contact_name} /><ReadField label="Phone" value={user?.emergency_contact_phone} /><ReadField label="Relationship" value={user?.emergency_contact_relationship} /></>)}
            </Section>
          </>
        )}

        {/* ========== DIVER SECTIONS ========== */}
        {isDiver && (
          <>
            <Section title="Location" icon={<MapPin size={18} />} {...sectionProps('location', ['location_country', 'location_city'])}>
              {isEditing('location') ? (
                <div className="flex flex-col gap-3">
                  <div><label className="block text-sm font-medium mb-1">Country</label><input className="input-field" value={form.location_country} onChange={e => setForm({...form, location_country: e.target.value})} data-testid="edit-country" /></div>
                  <div><label className="block text-sm font-medium mb-1">City</label><input className="input-field" value={form.location_city} onChange={e => setForm({...form, location_city: e.target.value})} data-testid="edit-city" /></div>
                </div>
              ) : (<><ReadField label="Country" value={user?.location_country} /><ReadField label="City" value={user?.location_city} /></>)}
            </Section>

            <Section title="Date of Birth" icon={<Calendar size={18} />} {...sectionProps('dob', ['date_of_birth'])}>
              {isEditing('dob') ? <input type="date" className="input-field" value={form.date_of_birth} onChange={e => setForm({...form, date_of_birth: e.target.value})} max={new Date().toISOString().split('T')[0]} data-testid="edit-dob" /> : <ReadField label="Date of Birth" value={user?.date_of_birth || 'Not set'} />}
            </Section>

            {isCertified && (
              <Section title="Diving Profile" icon={<Anchor size={18} />} {...sectionProps('diving', ['certification_agency', 'last_dive_date', 'total_dives'])}>
                {isEditing('diving') ? (
                  <div className="flex flex-col gap-3">
                    <div><label className="block text-sm font-medium mb-1">Agency</label><select className="input-field" value={form.certification_agency} onChange={e => setForm({...form, certification_agency: e.target.value})} data-testid="edit-cert-agency"><option value="">Select</option>{CERT_AGENCIES.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}</select></div>
                    <div><label className="block text-sm font-medium mb-1">Last Dive Date</label><input type="date" className="input-field" value={form.last_dive_date} onChange={e => setForm({...form, last_dive_date: e.target.value})} data-testid="edit-last-dive" /></div>
                    <div><label className="block text-sm font-medium mb-1">Total Dives</label><input type="number" className="input-field" value={form.total_dives} onChange={e => setForm({...form, total_dives: e.target.value})} data-testid="edit-total-dives" /></div>
                  </div>
                ) : (<><ReadField label="Agency" value={CERT_AGENCIES.find(a => a.value === user?.certification_agency)?.label} /><ReadField label="Last Dive" value={user?.last_dive_date} /><ReadField label="Total Dives" value={user?.total_dives != null ? String(user.total_dives) : null} /></>)}
              </Section>
            )}

            <Section title="Dive Preferences" icon={<Heart size={18} />} {...sectionProps('prefs', ['preferred_dive_types', 'equipment_ownership', 'travel_willingness'])}>
              {isEditing('prefs') ? (
                <div className="flex flex-col gap-4">
                  <div><label className="block text-sm font-medium mb-2">Dive Types</label><div className="flex flex-wrap gap-2">{DIVE_TYPES.map(t => (<button key={t} onClick={() => toggleItem('preferred_dive_types', t)} className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${form.preferred_dive_types.includes(t) ? 'bg-cyan-400 text-white' : 'bg-slate-100 text-slate-600'}`}>{t}</button>))}</div></div>
                  <div><label className="block text-sm font-medium mb-1">Equipment</label><select className="input-field" value={form.equipment_ownership} onChange={e => setForm({...form, equipment_ownership: e.target.value})}><option value="">Select</option>{EQUIPMENT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></div>
                  <div><label className="block text-sm font-medium mb-1">Travel</label><select className="input-field" value={form.travel_willingness} onChange={e => setForm({...form, travel_willingness: e.target.value})}><option value="">Select</option>{TRAVEL_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></div>
                </div>
              ) : (<><ReadField label="Dive Types" value={user?.preferred_dive_types?.length ? user.preferred_dive_types.join(', ') : null} /><ReadField label="Equipment" value={EQUIPMENT_OPTIONS.find(o => o.value === user?.equipment_ownership)?.label} /><ReadField label="Travel" value={TRAVEL_OPTIONS.find(o => o.value === user?.travel_willingness)?.label} /></>)}
            </Section>

            <Section title="Medical Fitness" icon={<Shield size={18} />} {...sectionProps('medical', ['medical_fitness'])}>
              {isEditing('medical') ? (
                <div><p className="text-sm text-slate-600 mb-3">Are you medically fit to dive?</p><div className="flex gap-3">
                  <button onClick={() => setForm({...form, medical_fitness: true})} className={`flex-1 p-3 rounded-xl border-2 text-sm font-semibold ${form.medical_fitness === true ? 'border-green-500 bg-green-50 text-green-700' : 'border-slate-200'}`} data-testid="medical-yes">Yes</button>
                  <button onClick={() => setForm({...form, medical_fitness: false})} className={`flex-1 p-3 rounded-xl border-2 text-sm font-semibold ${form.medical_fitness === false ? 'border-amber-500 bg-amber-50 text-amber-700' : 'border-slate-200'}`} data-testid="medical-no">Need clearance</button>
                </div></div>
              ) : <ReadField label="Status" value={user?.medical_fitness === true ? 'Fit to dive' : user?.medical_fitness === false ? 'Needs clearance' : null} />}
            </Section>

            <Section title="Languages" icon={<Languages size={18} />} {...sectionProps('languages', ['languages'])}>
              {isEditing('languages') ? (
                <div>
                  <div className="flex gap-2 mb-3"><input type="text" className="input-field flex-1" placeholder="e.g., English" value={langInput} onChange={e => setLangInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addLanguage())} data-testid="lang-input" /><button onClick={addLanguage} className="btn-secondary px-4 py-2 text-sm" data-testid="add-lang-btn">Add</button></div>
                  <div className="flex flex-wrap gap-2">{form.languages.map(l => (<span key={l} className="flex items-center gap-1 px-3 py-1 bg-cyan-50 text-cyan-400 rounded-full text-sm font-medium">{l}<button onClick={() => removeLanguage(l)} className="hover:text-red-500 ml-1">&times;</button></span>))}</div>
                </div>
              ) : <ReadField label="Languages" value={user?.languages?.length ? user.languages.join(', ') : null} />}
            </Section>

            <Section title="Emergency Contact" icon={<AlertTriangle size={18} />} {...sectionProps('emergency', ['emergency_contact_name', 'emergency_contact_phone', 'emergency_contact_relationship'])}>
              {isEditing('emergency') ? (
                <div className="space-y-3">
                  <div><label className="block text-sm font-medium mb-1">Name</label><input className="input-field" value={form.emergency_contact_name} onChange={e => setForm({...form, emergency_contact_name: e.target.value})} data-testid="edit-emergency-name" /></div>
                  <div><label className="block text-sm font-medium mb-1">Phone</label><input type="tel" className="input-field" value={form.emergency_contact_phone} onChange={e => setForm({...form, emergency_contact_phone: e.target.value})} data-testid="edit-emergency-phone" /></div>
                  <div><label className="block text-sm font-medium mb-1">Relationship</label><input className="input-field" value={form.emergency_contact_relationship} onChange={e => setForm({...form, emergency_contact_relationship: e.target.value})} data-testid="edit-emergency-relationship" /></div>
                </div>
              ) : (<><ReadField label="Name" value={user?.emergency_contact_name} /><ReadField label="Phone" value={user?.emergency_contact_phone} /><ReadField label="Relationship" value={user?.emergency_contact_relationship} /></>)}
            </Section>
          </>
        )}

        {/* ========== NOTIFICATION PREFERENCES (ALL USERS) ========== */}
        <NotificationPreferencesSection />

        {/* ========== SECURITY (ALL USERS — Phase B web passkeys + Phase A sessions) ========== */}
        <SecuritySection />

        {/* ========== PRIVACY & DATA SECTION (ALL USERS) ========== */}
        <PrivacyDataSection user={user} />
      </div>
      <Footer />
    </div>
  );
}



function GSTINField({ gstin, onChange, verified }) {
  const [verifying, setVerifying] = useState(false);
  const [result, setResult] = useState(null);

  const handleVerify = async () => {
    if (!gstin || gstin.length !== 15) { setResult({ valid: false, errors: ['GSTIN must be exactly 15 characters'] }); return; }
    setVerifying(true);
    try {
      const res = await axios.post('/operator-listings/verify-gstin', { gstin });
      setResult(res.data);
      if (res.data.valid) toast.success(`GSTIN verified — ${res.data.state_name}`);
      else toast.error(res.data.errors?.[0] || 'Invalid GSTIN');
    } catch (e) {
      setResult({ valid: false, errors: [e.response?.data?.detail || 'Verification failed'] });
      toast.error(e.response?.data?.detail || 'Verification failed');
    } finally { setVerifying(false); }
  };

  return (
    <div>
      <label className="block text-sm font-medium mb-1">GSTIN <span className="text-red-400">*</span></label>
      <div className="flex gap-2">
        <input
          className="input-field flex-1 uppercase tracking-wider font-mono"
          value={gstin}
          onChange={e => { onChange(e.target.value.toUpperCase()); setResult(null); }}
          placeholder="e.g., 29ABCDE1234F1Z5"
          maxLength={15}
          data-testid="edit-gstin"
        />
        <button
          type="button"
          onClick={handleVerify}
          disabled={verifying || !gstin || gstin.length < 15}
          className="px-4 py-2 rounded-xl text-sm font-semibold bg-cyan-400 text-white hover:bg-cyan-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
          data-testid="verify-gstin-btn"
        >
          {verifying ? 'Verifying...' : 'Verify'}
        </button>
      </div>
      {verified && !result && (
        <p className="text-xs text-emerald-500 mt-1 font-medium flex items-center gap-1" data-testid="gstin-verified-badge">
          <Shield size={12} /> GSTIN verified
        </p>
      )}
      {result && result.valid && (
        <p className="text-xs text-emerald-500 mt-1 font-medium" data-testid="gstin-valid">
          Valid — State: {result.state_name} | PAN: {result.pan}
        </p>
      )}
      {result && !result.valid && (
        <p className="text-xs text-red-500 mt-1 font-medium" data-testid="gstin-invalid">
          {result.errors?.[0]}
        </p>
      )}
      <p className="text-[10px] text-slate-400 mt-1">Mandatory for operators registered in India. Must be a valid 15-character GSTIN.</p>
    </div>
  );
}
