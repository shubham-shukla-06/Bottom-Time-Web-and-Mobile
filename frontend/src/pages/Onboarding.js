import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import useAuthStore from '../stores/authStore';
import { ChevronRight, ChevronLeft, Sparkles, MapPin, Calendar, Hash, ChevronDown, Search, Waves } from 'lucide-react';
import axios from 'axios';
import { toast } from 'sonner';

const EXPERIENCE_OPTIONS = [
  { value: 'never', title: "I've never dived before", desc: "Curious about the underwater world", icon: '🌊' },
  { value: 'try_dive', title: "I've done a try dive", desc: "Had an introductory experience but not certified", icon: '🤿' },
  { value: 'certified', title: "I'm a certified diver", desc: "I hold a diving certification", icon: '🏅' }
];

const CERT_OPTIONS = [
  { value: 'open_water', label: 'Open Water Diver', desc: 'Dive to 18m' },
  { value: 'advanced_open_water', label: 'Advanced Open Water', desc: 'Dive to 30m' },
  { value: 'rescue', label: 'Rescue Diver', desc: 'Emergency trained' },
  { value: 'divemaster', label: 'Divemaster', desc: 'Professional level' },
  { value: 'instructor', label: 'Instructor', desc: 'Qualified to teach' }
];

const DIVE_COUNT_OPTIONS = [
  { value: 5, label: '1-10 dives', desc: 'Just getting started' },
  { value: 25, label: '11-50 dives', desc: 'Building experience' },
  { value: 75, label: '51-100 dives', desc: 'Experienced diver' },
  { value: 150, label: '100+ dives', desc: 'Seasoned veteran' }
];

const INSTRUCTOR_CERT_OPTIONS = [
  { value: 'divemaster', label: 'Divemaster', desc: 'Guide and assist courses' },
  { value: 'instructor', label: 'Instructor', desc: 'Teach certifications' },
  { value: 'course_director', label: 'Course Director', desc: 'Train instructors' }
];

const AGENCY_OPTIONS = [
  { value: 'padi', label: 'PADI' }, { value: 'ssi', label: 'SSI' },
  { value: 'naui', label: 'NAUI' }, { value: 'cmas', label: 'CMAS' },
  { value: 'bsac', label: 'BSAC' }, { value: 'other', label: 'Other' }
];

const SPECIALTY_OPTIONS = [
  'Open Water', 'Advanced Open Water', 'Rescue Diver', 'Nitrox',
  'Deep Diving', 'Wreck Diving', 'Night Diving', 'Underwater Photography',
  'Drift Diving', 'Cavern/Cave', 'Sidemount', 'Technical Diving'
];

const REFERRAL_OPTIONS = [
  { value: 'friend', label: 'A friend or dive buddy' },
  { value: 'social_media', label: 'Social media' },
  { value: 'search', label: 'Google / search engine' },
  { value: 'dive_shop', label: 'A dive shop or instructor' },
  { value: 'other', label: 'Other' }
];

const COUNTRIES = [
  'Afghanistan', 'Albania', 'Algeria', 'Andorra', 'Angola', 'Antigua and Barbuda',
  'Argentina', 'Armenia', 'Australia', 'Austria', 'Azerbaijan', 'Bahamas', 'Bahrain',
  'Bangladesh', 'Barbados', 'Belarus', 'Belgium', 'Belize', 'Benin', 'Bhutan',
  'Bolivia', 'Bosnia and Herzegovina', 'Botswana', 'Brazil', 'Brunei', 'Bulgaria',
  'Burkina Faso', 'Burundi', 'Cabo Verde', 'Cambodia', 'Cameroon', 'Canada',
  'Central African Republic', 'Chad', 'Chile', 'China', 'Colombia', 'Comoros',
  'Congo', 'Costa Rica', 'Croatia', 'Cuba', 'Cyprus', 'Czech Republic', 'Denmark',
  'Djibouti', 'Dominica', 'Dominican Republic', 'DR Congo', 'Ecuador', 'Egypt',
  'El Salvador', 'Equatorial Guinea', 'Eritrea', 'Estonia', 'Eswatini', 'Ethiopia',
  'Fiji', 'Finland', 'France', 'Gabon', 'Gambia', 'Georgia', 'Germany', 'Ghana',
  'Greece', 'Grenada', 'Guatemala', 'Guinea', 'Guinea-Bissau', 'Guyana', 'Haiti',
  'Honduras', 'Hungary', 'Iceland', 'India', 'Indonesia', 'Iran', 'Iraq', 'Ireland',
  'Israel', 'Italy', 'Ivory Coast', 'Jamaica', 'Japan', 'Jordan', 'Kazakhstan',
  'Kenya', 'Kiribati', 'Kuwait', 'Kyrgyzstan', 'Laos', 'Latvia', 'Lebanon',
  'Lesotho', 'Liberia', 'Libya', 'Liechtenstein', 'Lithuania', 'Luxembourg',
  'Madagascar', 'Malawi', 'Malaysia', 'Maldives', 'Mali', 'Malta', 'Marshall Islands',
  'Mauritania', 'Mauritius', 'Mexico', 'Micronesia', 'Moldova', 'Monaco', 'Mongolia',
  'Montenegro', 'Morocco', 'Mozambique', 'Myanmar', 'Namibia', 'Nauru', 'Nepal',
  'Netherlands', 'New Zealand', 'Nicaragua', 'Niger', 'Nigeria', 'North Korea',
  'North Macedonia', 'Norway', 'Oman', 'Pakistan', 'Palau', 'Palestine', 'Panama',
  'Papua New Guinea', 'Paraguay', 'Peru', 'Philippines', 'Poland', 'Portugal',
  'Qatar', 'Romania', 'Russia', 'Rwanda', 'Saint Kitts and Nevis', 'Saint Lucia',
  'Saint Vincent and the Grenadines', 'Samoa', 'San Marino', 'Sao Tome and Principe',
  'Saudi Arabia', 'Senegal', 'Serbia', 'Seychelles', 'Sierra Leone', 'Singapore',
  'Slovakia', 'Slovenia', 'Solomon Islands', 'Somalia', 'South Africa', 'South Korea',
  'South Sudan', 'Spain', 'Sri Lanka', 'Sudan', 'Suriname', 'Sweden', 'Switzerland',
  'Syria', 'Taiwan', 'Tajikistan', 'Tanzania', 'Thailand', 'Timor-Leste', 'Togo',
  'Tonga', 'Trinidad and Tobago', 'Tunisia', 'Turkey', 'Turkmenistan', 'Tuvalu',
  'Uganda', 'Ukraine', 'United Arab Emirates', 'United Kingdom', 'United States',
  'Uruguay', 'Uzbekistan', 'Vanuatu', 'Vatican City', 'Venezuela', 'Vietnam',
  'Yemen', 'Zambia', 'Zimbabwe',
];

function CountrySelect({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef(null);

  const filtered = COUNTRIES.filter(c => c.toLowerCase().includes(search.toLowerCase()));

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className="relative mb-2" ref={ref} data-testid="country-select-wrapper">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="input-field flex items-center justify-between w-full text-left"
        data-testid="location-country"
      >
        <span className={value ? 'text-slate-900' : 'text-slate-400'}>{value || 'Select country'}</span>
        <ChevronDown size={16} className="text-slate-400 flex-shrink-0" />
      </button>
      {open && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden">
          <div className="p-2 border-b border-slate-100 flex items-center gap-2">
            <Search size={14} className="text-slate-400 flex-shrink-0" />
            <input
              autoFocus
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search country..."
              className="w-full text-sm py-1 focus:outline-none bg-transparent text-slate-900 placeholder-slate-400"
            />
          </div>
          <div className="max-h-52 overflow-y-auto">
            {filtered.length > 0 ? filtered.map(c => (
              <button
                key={c}
                type="button"
                className={`w-full text-left px-4 py-2.5 text-sm transition-colors hover:bg-cyan-50 ${value === c ? 'text-cyan-600 font-semibold bg-cyan-50' : 'text-slate-800'}`}
                onClick={() => { onChange(c); setOpen(false); setSearch(''); }}
              >
                {c}
              </button>
            )) : (
              <p className="text-center text-slate-400 text-sm py-4">No countries found</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function Onboarding() {
  const user = useAuthStore(s => s.user);
  const setUser = useAuthStore(s => s.setUser);
  const navigate = useNavigate();
  const isInstructor = user?.role === 'instructor';

  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);

  // Diver fields
  const [experience, setExperience] = useState('');
  const [certification, setCertification] = useState('');
  const [diveCount, setDiveCount] = useState(null);

  // Instructor fields
  const [instrCert, setInstrCert] = useState('');
  const [instrAgency, setInstrAgency] = useState('');
  const [instrSpecialties, setInstrSpecialties] = useState([]);
  const [instrYears, setInstrYears] = useState('');

  // Shared fields
  const [locationCountry, setLocationCountry] = useState('');
  const [locationCity, setLocationCity] = useState('');
  const [dob, setDob] = useState('');
  const [referral, setReferral] = useState('');

  // Step config
  const getSteps = () => {
    if (isInstructor) return ['instrProfile', 'info', 'referral'];
    if (experience === 'certified') return ['experience', 'cert', 'diveCount', 'info', 'referral'];
    return ['experience', 'info', 'referral'];
  };

  const steps = getSteps();
  const currentStepName = steps[step - 1];
  const totalSteps = steps.length;
  const isLastStep = step === totalSteps;

  const canAdvance = () => {
    switch (currentStepName) {
      case 'experience': return !!experience;
      case 'cert': return !!certification;
      case 'diveCount': return diveCount !== null;
      case 'instrProfile': return !!instrCert && !!instrAgency;
      case 'info': return !!locationCountry;
      default: return true;
    }
  };

  const handleNext = () => {
    if (!canAdvance()) {
      toast.error('Please make a selection');
      return;
    }
    if (isLastStep) { handleSubmit(); return; }
    setStep(step + 1);
  };

  const handleSubmit = async () => {
    if (!isInstructor && !experience) {
      toast.error('Please select your experience level first');
      setStep(1);
      return;
    }
    setSaving(true);
    try {
      const payload = {
        location_country: locationCountry || null,
        location_city: locationCity || null,
        date_of_birth: dob || null,
        referral_source: referral || null,
      };

      if (isInstructor) {
        payload.experience_level = 'certified';
        payload.certification_level = 'instructor';
        payload.interests = ['both'];
        payload.instructor_certification = instrCert;
        payload.instructor_agency = instrAgency;
        payload.instructor_specialties = instrSpecialties;
        payload.instructor_years = instrYears ? parseInt(instrYears) : null;
      } else {
        payload.experience_level = experience;
        payload.certification_level = experience === 'certified' ? certification : null;
        payload.interests = [experience === 'never' || experience === 'try_dive' ? 'learn' : 'both'];
        payload.total_dives = diveCount;
      }

      const response = await axios.put('/auth/onboarding', payload);
      toast.success("You're all set!");

      let dest;
      if (isInstructor) dest = '/operator';
      else if (experience === 'never' || experience === 'try_dive') dest = '/pathways';
      else if (certification === 'open_water') dest = '/pathways';
      else dest = '/discover';

      navigate(dest);
      setTimeout(() => setUser(response.data), 100);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  };

  const toggleSpecialty = (s) => {
    setInstrSpecialties(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-50 to-white flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg" data-testid="onboarding-page">
        <div className="text-center mb-8 fade-in">
          <div className="flex items-center justify-center gap-2 mb-3">
            <Waves className="text-cyan-400 w-8 h-8" />
            <span className="text-xl font-bold tracking-tight text-slate-900">Bottom Time</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mb-1">Welcome, {user?.name?.split(' ')[0]}</h1>
          <p className="text-slate-500 text-sm">Let's personalize your experience</p>
        </div>

        {/* Progress */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {Array.from({ length: totalSteps }).map((_, i) => (
            <div key={`k${i}`} className={`h-1.5 rounded-full transition-all duration-500 ${i + 1 <= step ? 'bg-cyan-400 w-12' : 'bg-slate-200 w-8'}`} />
          ))}
        </div>

        {/* DIVER: Experience */}
        {currentStepName === 'experience' && (
          <StepContainer title="What's your diving experience?" sub="This helps us show you the right content">
            {EXPERIENCE_OPTIONS.map(opt => (
              <OptionButton key={opt.value} selected={experience === opt.value} onClick={() => setExperience(opt.value)} testId={`exp-${opt.value}`}>
                <span className="text-2xl mr-3">{opt.icon}</span>
                <div><div className="font-bold text-base">{opt.title}</div><div className="text-slate-500 text-sm">{opt.desc}</div></div>
              </OptionButton>
            ))}
          </StepContainer>
        )}

        {/* DIVER: Certification */}
        {currentStepName === 'cert' && (
          <StepContainer title="Highest certification?" sub="We'll show your next steps on the pathway">
            {CERT_OPTIONS.map(opt => (
              <OptionButton key={opt.value} selected={certification === opt.value} onClick={() => setCertification(opt.value)} testId={`cert-${opt.value}`} compact>
                <div><div className="font-bold text-sm">{opt.label}</div><div className="text-slate-500 text-xs">{opt.desc}</div></div>
              </OptionButton>
            ))}
          </StepContainer>
        )}

        {/* DIVER: Dive count */}
        {currentStepName === 'diveCount' && (
          <StepContainer title="How many dives have you logged?" sub="Helps us recommend the right difficulty level">
            {DIVE_COUNT_OPTIONS.map(opt => (
              <OptionButton key={opt.value} selected={diveCount === opt.value} onClick={() => setDiveCount(opt.value)} testId={`dives-${opt.value}`} compact>
                <div className="flex items-center justify-between w-full">
                  <div><div className="font-bold text-sm">{opt.label}</div><div className="text-slate-500 text-xs">{opt.desc}</div></div>
                  <Hash size={16} className="text-slate-300" />
                </div>
              </OptionButton>
            ))}
          </StepContainer>
        )}

        {/* INSTRUCTOR: Profile */}
        {currentStepName === 'instrProfile' && (
          <StepContainer title="Your instructor profile" sub="Tell us about your qualifications">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1.5">Highest Certification</label>
                <div className="space-y-2">
                  {INSTRUCTOR_CERT_OPTIONS.map(opt => (
                    <OptionButton key={opt.value} selected={instrCert === opt.value} onClick={() => setInstrCert(opt.value)} testId={`instr-cert-${opt.value}`} compact>
                      <div><div className="font-bold text-sm">{opt.label}</div><div className="text-slate-500 text-xs">{opt.desc}</div></div>
                    </OptionButton>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">Agency</label>
                <select className="input-field" value={instrAgency} onChange={e => setInstrAgency(e.target.value)} data-testid="instr-agency">
                  <option value="">Select agency</option>
                  {AGENCY_OPTIONS.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">Years of Experience</label>
                <input type="number" className="input-field" placeholder="e.g., 5" value={instrYears} onChange={e => setInstrYears(e.target.value)} min="0" data-testid="instr-years" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Specialties You Teach</label>
                <div className="flex flex-wrap gap-2">
                  {SPECIALTY_OPTIONS.map(s => (
                    <button key={s} onClick={() => toggleSpecialty(s)} className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${instrSpecialties.includes(s) ? 'bg-cyan-400 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`} data-testid={`specialty-${s.toLowerCase().replace(/\s/g,'-')}`}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </StepContainer>
        )}

        {/* SHARED: Location + DOB */}
        {currentStepName === 'info' && (
          <StepContainer title="A bit about you" sub="Helps us find relevant experiences nearby">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1.5"><MapPin size={14} className="inline mr-1 text-cyan-400" />Country of Residence *</label>
                <CountrySelect value={locationCountry} onChange={setLocationCountry} />
                {!locationCountry && (
                  <p className="text-[10px] text-amber-600 mt-1.5 bg-amber-50 px-2.5 py-1.5 rounded-lg">Required — your country of residence determines applicable taxes (Goods and Services Tax, Tax Collected at Source) as per Indian tax law.</p>
                )}
                <input type="text" placeholder="City (optional)" className="input-field mt-2" value={locationCity} onChange={e => setLocationCity(e.target.value)} data-testid="location-city" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5"><Calendar size={14} className="inline mr-1 text-cyan-400" />Date of birth</label>
                <input type="date" className="input-field" value={dob} onChange={e => setDob(e.target.value)} max={new Date().toISOString().split('T')[0]} data-testid="dob-input" />
                <p className="text-xs text-slate-400 mt-1">Used for age-appropriate recommendations</p>
              </div>
            </div>
          </StepContainer>
        )}

        {/* SHARED: Referral */}
        {currentStepName === 'referral' && (
          <StepContainer title="How did you find us?" sub="Just curious — helps us grow">
            {REFERRAL_OPTIONS.map(opt => (
              <OptionButton key={opt.value} selected={referral === opt.value} onClick={() => setReferral(opt.value)} testId={`referral-${opt.value}`} compact>
                <div className="font-semibold text-sm">{opt.label}</div>
              </OptionButton>
            ))}
          </StepContainer>
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between mt-8">
          {step > 1 ? (
            <button onClick={() => setStep(step - 1)} className="btn-secondary flex items-center gap-1.5 px-5 py-2.5" data-testid="onboarding-back-btn">
              <ChevronLeft size={16} /> Back
            </button>
          ) : <div />}
          <button onClick={handleNext} disabled={saving} className="btn-primary flex items-center gap-2 px-6 py-3" data-testid="onboarding-next-btn">
            {saving ? 'Saving...' : isLastStep ? (<><Sparkles size={16} /> Let's Go</>) : (<>Next <ChevronRight size={16} /></>)}
          </button>
        </div>
        <div className="text-center mt-4">
          <button onClick={handleSubmit} className="text-slate-400 hover:text-slate-600 text-sm transition-colors" data-testid="skip-onboarding-btn">Skip for now</button>
        </div>
      </div>
    </div>
  );
}

function StepContainer({ title, sub, children }) {
  return (
    <div className="fade-in">
      <h2 className="text-xl font-bold mb-1 text-center">{title}</h2>
      <p className="text-slate-500 text-sm text-center mb-6">{sub}</p>
      <div className="space-y-2.5">{children}</div>
    </div>
  );
}

function OptionButton({ selected, onClick, testId, compact, children }) {
  return (
    <button
      onClick={onClick}
      className={`w-full ${compact ? 'p-4' : 'p-5'} rounded-2xl border-2 text-left transition-all duration-300 flex items-center ${
        selected ? 'border-cyan-400 bg-cyan-50 shadow-lg shadow-cyan-400/10' : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm'
      }`}
      data-testid={testId}
    >
      {children}
    </button>
  );
}
