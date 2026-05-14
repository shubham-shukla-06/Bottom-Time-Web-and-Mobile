import { useEffect } from 'react';
import { CheckCircle, Clock } from 'lucide-react';
import { useAuthFlow } from './auth/useAuthFlow';
import { StepRoleSelect, StepLogin, StepSignup, StepVerifyEmail, StepPhone, StepVerifyPhone } from './auth/AuthSteps';

function StepIndicator({ step }) {
  if (step <= 1) return null;
  return (
    <div className="mb-6">
      <div className="flex items-center justify-center gap-2">
        <div className={`flex items-center justify-center w-8 h-8 rounded-full ${step >= 3 ? 'bg-green-500' : step >= 2 ? 'bg-cyan-400' : 'bg-slate-200'} text-white text-sm font-bold`}>
          {step >= 3 ? <CheckCircle size={16} /> : '1'}
        </div>
        <div className={`h-1 w-12 ${step >= 4 ? 'bg-cyan-400' : 'bg-slate-200'}`} />
        <div className={`flex items-center justify-center w-8 h-8 rounded-full ${step >= 5 ? 'bg-green-500' : step >= 4 ? 'bg-cyan-400' : 'bg-slate-200'} text-white text-sm font-bold`}>
          {step >= 5 ? <CheckCircle size={16} /> : '2'}
        </div>
      </div>
      <div className="flex justify-between text-xs text-slate-500 mt-2">
        <span>Email</span>
        <span>Phone</span>
      </div>
    </div>
  );
}

function PendingOperatorScreen({ onClose }) {
  return (
    <div className="text-center py-4" data-testid="pending-operator-screen">
      <div className="w-16 h-16 rounded-full bg-amber-50 flex items-center justify-center mx-auto mb-5">
        <Clock size={28} className="text-amber-500" />
      </div>
      <h3 className="text-xl font-bold text-slate-900 mb-2">Application Under Review</h3>
      <p className="text-sm text-slate-500 leading-relaxed mb-5">
        Your operator account is currently being reviewed by the
        <strong className="text-slate-700"> Bottom Time Compliance team</strong>.
        We'll notify you via email once a decision has been made.
      </p>
      <div className="bg-slate-50 rounded-xl p-4 text-left mb-5">
        <p className="text-xs text-slate-500 leading-relaxed">
          This usually takes less than <strong>48 hours</strong>. You'll receive an email update at
          the address you signed up with. Check your spam folder if you haven't heard from us.
        </p>
      </div>
      <button onClick={onClose} className="btn-primary w-full" data-testid="pending-close-btn">Got it</button>
    </div>
  );
}

export default function AuthModal({ onClose, initialMode = 'signin' }) {
  const flow = useAuthFlow({ onClose, initialMode });

  // Lock body scroll while the auth modal is mounted. AuthModal is a custom
  // fixed-overlay (not a Radix Dialog), so Radix's built-in scroll lock
  // doesn't apply — toggle `document.body.style.overflow` directly. Restore
  // the previous inline value (not a hard-coded '') on unmount so we don't
  // clobber any other consumer that set it.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 px-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }} data-testid="auth-modal">
      <div className="bg-white rounded-3xl p-8 max-w-md w-full max-h-[90vh] overflow-y-auto">
        {flow.pendingOperator ? (
          <PendingOperatorScreen onClose={onClose} />
        ) : (
          <>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-3xl font-bold">{flow.getStepTitle()}</h2>
              <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl" data-testid="auth-modal-close">&#x2715;</button>
            </div>

            <StepIndicator step={flow.step} />

            {flow.step === 1 && flow.isSignup && <StepRoleSelect onSelect={flow.handleRoleSelect} onSwitchToSignin={flow.switchToSignin} />}
            {flow.step === 2 && !flow.isSignup && <StepLogin email={flow.email} setEmail={flow.setEmail} loading={flow.loading} onSendOTP={flow.handleSendEmailOTP} onSwitchToSignup={flow.switchToSignup} onPasskeyLogin={flow.handlePasskeyLogin} passkeysAvailable={flow.passkeysAvailable} />}
            {flow.step === 2 && flow.isSignup && <StepSignup name={flow.name} setName={flow.setName} email={flow.email} setEmail={flow.setEmail} loading={flow.loading} onSendOTP={flow.handleSendEmailOTP} onSwitchToSignin={flow.switchToSignin} />}
            {flow.step === 3 && <StepVerifyEmail email={flow.email} emailOTP={flow.emailOTP} setEmailOTP={flow.setEmailOTP} loading={flow.loading} onVerify={flow.handleVerifyEmailOTP} onResend={flow.handleSendEmailOTP} emailResendCooldown={flow.timers.emailResendCooldown} emailTimeRemaining={flow.timers.emailTimeRemaining} formatTime={flow.timers.formatTime} />}
            {flow.step === 4 && <StepPhone isSignup={flow.isSignup} userPhone={flow.userPhone} phone={flow.phone} setPhone={flow.setPhone} loading={flow.loading} onSendOTP={flow.handleSendPhoneOTP} />}
            {flow.step === 5 && <StepVerifyPhone phone={flow.phone} phoneOTP={flow.phoneOTP} setPhoneOTP={flow.setPhoneOTP} loading={flow.loading} onVerify={flow.handleVerifyPhoneOTP} onResend={flow.handleSendPhoneOTP} phoneResendCooldown={flow.timers.phoneResendCooldown} phoneTimeRemaining={flow.timers.phoneTimeRemaining} formatTime={flow.timers.formatTime} />}

            {flow.isSignup && (
              <p className="text-[11px] text-slate-400 text-center mt-5 leading-relaxed" data-testid="signup-privacy-notice">
                By signing up you agree to our <a href="/privacy" className="text-cyan-400 hover:underline" target="_blank" rel="noopener noreferrer">Privacy Policy</a>. We use your data only to deliver services you use.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
