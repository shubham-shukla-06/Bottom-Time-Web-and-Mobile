import { useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import useAuthStore from '../stores/authStore';
import Navbar from '../components/Navbar';
import { CheckCircle, Circle, ChevronRight, Lock, ArrowRight, Waves } from 'lucide-react';
import Footer from '../components/Footer';

const PATHWAY = [
  {
    id: 'swimming',
    title: 'Swimming & Water Comfort',
    duration: 'Self-paced',
    description: 'Build comfort in the water. Learn basic swimming, floating, and breathing techniques essential for diving.',
    unlockLevel: null,
    features: [
      'Basic swimming proficiency',
      'Treading water for 10 minutes',
      'Floating and breathing techniques',
      'Comfort in open water'
    ]
  },
  {
    id: 'discover_scuba',
    title: 'Discover Scuba Diving (DSD)',
    duration: 'Half day',
    description: 'Your first breath underwater. A supervised introductory experience in a pool or calm water — no certification needed.',
    unlockLevel: null,
    features: [
      'Introduction to scuba equipment',
      'Breathing underwater for the first time',
      'Guided dive to 12 meters max',
      'No prior experience required'
    ]
  },
  {
    id: 'open_water',
    title: 'Open Water Diver (OWD)',
    duration: '3-4 days',
    description: 'Your first real certification. Dive independently to 18 meters worldwide with a buddy.',
    unlockLevel: 'try_dive',
    features: [
      'Theory sessions and exam',
      'Confined water (pool) training',
      '4 open water dives',
      'Internationally recognized by PADI'
    ],
    popular: true
  },
  {
    id: 'advanced_open_water',
    title: 'Advanced Open Water Diver',
    duration: '2 days',
    description: 'Go deeper and develop specialized skills. Dive to 30 meters with 5 adventure dives.',
    unlockLevel: 'open_water',
    features: [
      'Deep dive (up to 30 meters)',
      'Underwater navigation',
      '3 elective adventure dives',
      'Night diving, wreck diving options'
    ]
  },
  {
    id: 'specialty',
    title: 'Specialty Courses',
    duration: 'Varies',
    description: 'Master specific skills — from nitrox to underwater photography, wreck diving to night diving.',
    unlockLevel: 'open_water',
    features: [
      'Enriched Air Nitrox',
      'Deep Diver (to 40m)',
      'Wreck Diver',
      'Underwater Photography',
      'Night Diver',
      'Drift Diver'
    ]
  },
  {
    id: 'rescue',
    title: 'Rescue Diver',
    duration: '3-4 days',
    description: 'Think about others, not just yourself. Learn to prevent and manage diving emergencies.',
    unlockLevel: 'advanced_open_water',
    features: [
      'Self-rescue techniques',
      'Recognizing diver stress',
      'Emergency management scenarios',
      'EFR (First Aid) prerequisite'
    ]
  },
  {
    id: 'divemaster',
    title: 'Divemaster',
    duration: '4-12 weeks',
    description: 'Your first professional-level certification. Lead dives, assist instructors, and mentor new divers.',
    unlockLevel: 'rescue',
    features: [
      'Leadership and dive management',
      'Assisting in courses',
      'Independent dive guiding',
      'Professional career pathway'
    ]
  },
  {
    id: 'instructor',
    title: 'Instructor Development Course (IDC)',
    duration: '2-4 weeks',
    description: 'Become a PADI Instructor. Teach others to discover the underwater world.',
    unlockLevel: 'divemaster',
    features: [
      'Teaching methodology',
      'Course planning and execution',
      'Student assessment',
      'PADI Instructor Examination (IE)'
    ]
  }
];

function getCertIndex(certLevel) {
  const map = {
    open_water: 2,
    advanced_open_water: 3,
    rescue: 5,
    divemaster: 6,
    instructor: 7
  };
  return map[certLevel] ?? -1;
}

function getUserStepIndex(user) {
  if (!user || !user.onboarding_complete) return -1;
  if (user.experience_level === 'never') return -1;
  if (user.experience_level === 'try_dive') return 1;
  if (user.experience_level === 'certified') {
    return getCertIndex(user.certification_level);
  }
  return -1;
}

export default function BeginnerPathways() {
  const user = useAuthStore(s => s.user);
  const navigate = useNavigate();

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { window.scrollTo(0, 0); }, []);

  const completedUpTo = getUserStepIndex(user);
  const nextStepIndex = completedUpTo + 1;

  const getTitle = () => {
    if (!user?.onboarding_complete) return 'Your Diving Journey';
    if (user.experience_level === 'never') return 'Start Your Diving Journey';
    if (user.experience_level === 'try_dive') return 'Continue Your Journey';
    return 'Your Dive Pathway';
  };

  const getSubtitle = () => {
    if (!user?.onboarding_complete) return 'The complete certification pathway from first splash to instructor';
    if (user.experience_level === 'never') return "Here's how to go from curious to certified — step by step";
    if (user.experience_level === 'try_dive') return "You've had a taste — here's your path to full certification";
    if (completedUpTo < PATHWAY.length - 1) {
      return `Your next step: ${PATHWAY[nextStepIndex]?.title}`;
    }
    return "You've reached the highest level — explore teaching opportunities";
  };

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <Navbar />

      <div className="flex-1 max-w-3xl mx-auto w-full px-6 md:px-12 py-12" data-testid="pathways-page">
        {/* Header */}
        <div className="mb-10">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight leading-none mb-3">
            {getTitle()}
          </h1>
          <p className="text-base text-slate-500 max-w-xl">{getSubtitle()}</p>
        </div>

        {/* Pathway Timeline */}
        <div className="relative">
          {/* Vertical line */}
          <div className="absolute left-6 top-0 bottom-0 w-px bg-slate-200" />

          <div className="space-y-0">
            {PATHWAY.map((step, idx) => {
              const isCompleted = idx <= completedUpTo;
              const isNext = idx === nextStepIndex;
              const isLocked = idx > nextStepIndex && completedUpTo >= 0;
              const showHighlight = isNext && user?.onboarding_complete;

              return (
                <div
                  key={step.id}
                  className={`relative pl-16 pb-10 ${isLocked ? 'opacity-50' : ''}`}
                  data-testid={`pathway-step-${step.id}`}
                >
                  {/* Timeline node */}
                  <div className="absolute left-0 top-0">
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center border-2 transition-all ${
                      isCompleted
                        ? 'bg-cyan-400 border-cyan-400 text-white'
                        : isNext && user?.onboarding_complete
                          ? 'bg-white border-cyan-400 text-cyan-400 shadow-lg shadow-cyan-400/20'
                          : 'bg-white border-slate-200 text-slate-400'
                    }`}>
                      {isCompleted ? (
                        <CheckCircle size={20} />
                      ) : isLocked ? (
                        <Lock size={16} />
                      ) : (
                        <span className="text-sm font-bold">{idx + 1}</span>
                      )}
                    </div>
                  </div>

                  {/* Content */}
                  <div className={`rounded-2xl p-6 transition-all ${
                    showHighlight
                      ? 'bg-cyan-50 border-2 border-cyan-200'
                      : isCompleted
                        ? 'bg-slate-50'
                        : 'bg-white border border-slate-100'
                  }`}>
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="text-lg font-bold">{step.title}</h3>
                          {step.popular && (
                            <span className="text-xs px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full font-semibold">
                              Most Popular
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-400 font-medium">{step.duration}</p>
                      </div>
                      {isCompleted && (
                        <span className="text-xs font-semibold text-cyan-400 bg-cyan-100 px-2.5 py-1 rounded-full">
                          Completed
                        </span>
                      )}
                      {showHighlight && (
                        <span className="text-xs font-semibold text-cyan-400 bg-cyan-200 px-2.5 py-1 rounded-full flex items-center gap-1">
                          Next Step
                          <ArrowRight size={12} />
                        </span>
                      )}
                    </div>

                    <p className="text-sm text-slate-600 leading-relaxed mb-4">{step.description}</p>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
                      {step.features.slice(0, 4).map((f, fi) => (
                        <div key={`feat-${fi}`} className="flex items-center gap-2 text-sm text-slate-600">
                          <CheckCircle size={14} className="text-cyan-400 flex-shrink-0" />
                          <span>{f}</span>
                        </div>
                      ))}
                    </div>

                    {(showHighlight || (!isLocked && !isCompleted)) && (
                      <button
                        onClick={() => navigate(`/discover?type=course&search=${encodeURIComponent(step.title)}`)}
                        className={`text-sm font-semibold flex items-center gap-1 transition-colors ${
                          showHighlight ? 'text-cyan-400 hover:text-cyan-400' : 'text-slate-500 hover:text-cyan-400'
                        }`}
                        data-testid={`find-course-${step.id}`}
                      >
                        Find courses
                        <ChevronRight size={14} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Bottom CTA */}
        <div className="mt-12 bg-gradient-to-b from-cyan-500 to-slate-900 rounded-2xl p-8 text-center text-white">
          <Waves className="mx-auto mb-3 text-cyan-400" size={36} />
          <h2 className="text-lg sm:text-xl font-bold mb-2">Ready to take the next step?</h2>
          <p className="text-cyan-200 text-sm mb-6 max-w-md mx-auto">
            Find certified instructors and dive centers ready to help you progress
          </p>
          <button
            onClick={() => navigate('/discover?type=course')}
            className="bg-white text-cyan-400 font-bold px-8 py-3 rounded-full hover:bg-cyan-50 transition-all"
            data-testid="bottom-cta-btn"
          >
            Browse Courses
          </button>
        </div>
      </div>
      <Footer />
    </div>
  );
}
