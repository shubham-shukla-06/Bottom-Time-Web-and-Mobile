import { Mail, Phone, User, CheckCircle } from 'lucide-react';
import { initiateGoogleAuth, initiateMSAuth, initiateAppleAuth } from './pkceHelpers';

const GoogleIcon = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
);
const MSIcon = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24"><rect x="1" y="1" width="10" height="10" fill="#F35325"/><rect x="13" y="1" width="10" height="10" fill="#81BC06"/><rect x="1" y="13" width="10" height="10" fill="#05A6F0"/><rect x="13" y="13" width="10" height="10" fill="#FFBA08"/></svg>
);
const AppleIcon = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24"><path fill="currentColor" d="M16.4 0c.07 1.27-.41 2.5-1.18 3.39-.78.92-2.04 1.63-3.27 1.54-.09-1.22.5-2.45 1.27-3.31C14.04.71 15.31.07 16.4 0zM21 17.62c-.66 1.43-.97 2.07-1.81 3.34-1.17 1.78-2.83 4-4.88 4.02-1.83.02-2.3-1.18-4.78-1.17-2.48.01-3 1.19-4.83 1.17-2.05-.02-3.62-2.04-4.79-3.82C-2.42 15.97-2.78 9.66.78 6.42 2.06 5.21 3.85 4.5 5.6 4.5c1.86 0 3.04 1.05 4.59 1.05 1.5 0 2.41-1.05 4.56-1.05 1.6 0 3.3.86 4.5 2.34-3.95 2.16-3.31 7.78 1.75 8.79z"/></svg>
);

export function StepRoleSelect({ onSelect, onSwitchToSignin }) {
  return (
    <div className="space-y-3">
      <button onClick={() => onSelect('diver')} className="w-full p-5 border-2 border-slate-200 rounded-2xl hover:border-cyan-400 transition-all text-left" data-testid="role-diver">
        <div className="font-bold text-base mb-1">I want to dive</div>
        <div className="text-slate-500 text-sm">Discover, learn, and book dive experiences</div>
      </button>
      <button onClick={() => onSelect('instructor')} className="w-full p-5 border-2 border-slate-200 rounded-2xl hover:border-cyan-400 transition-all text-left" data-testid="role-instructor">
        <div className="font-bold text-base mb-1">I'm a dive instructor</div>
        <div className="text-slate-500 text-sm">List your services and get discovered by divers</div>
      </button>
      <button onClick={() => onSelect('operator')} className="w-full p-5 border-2 border-slate-200 rounded-2xl hover:border-cyan-400 transition-all text-left" data-testid="role-operator">
        <div className="font-bold text-base mb-1">I run a dive business</div>
        <div className="text-slate-500 text-sm">Manage your dive center, liveaboard, or school</div>
      </button>
      <div className="text-center pt-3">
        <button onClick={onSwitchToSignin} className="text-cyan-400 hover:underline text-sm" data-testid="switch-to-signin">
          Already have an account? Dive in
        </button>
      </div>
    </div>
  );
}

export function StepLogin({ email, setEmail, loading, onSendOTP, onSwitchToSignup }) {
  return (
    <div className="space-y-3" data-testid="login-step">
      <button onClick={initiateGoogleAuth} className="w-full flex items-center justify-center gap-3 p-3.5 border border-slate-200 rounded-2xl hover:bg-slate-50 transition-all font-medium text-sm" data-testid="google-login-btn">
        <GoogleIcon /> Continue with Google
      </button>
      <button onClick={initiateMSAuth} className="w-full flex items-center justify-center gap-3 p-3.5 border border-slate-200 rounded-2xl hover:bg-slate-50 transition-all font-medium text-sm" data-testid="microsoft-login-btn">
        <MSIcon /> Continue with Microsoft
      </button>
      <button onClick={initiateAppleAuth} className="w-full flex items-center justify-center gap-3 p-3.5 border border-slate-200 rounded-2xl hover:bg-slate-50 transition-all font-medium text-sm text-slate-900" data-testid="apple-login-btn">
        <AppleIcon /> Continue with Apple
      </button>
      <div className="flex items-center gap-3 py-1">
        <div className="flex-1 h-px bg-slate-200" />
        <span className="text-xs text-slate-400">or sign in with email</span>
        <div className="flex-1 h-px bg-slate-200" />
      </div>
      <div>
        <div className="relative">
          <Mail className="absolute left-3 top-3 text-slate-400" size={18} />
          <input type="email" placeholder="your@email.com" className="input-field" style={{ paddingLeft: '2.5rem' }} value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && onSendOTP()} data-testid="email-input" />
        </div>
      </div>
      <button onClick={onSendOTP} disabled={loading} className="btn-primary w-full" data-testid="send-email-otp-btn">
        {loading ? 'Sending...' : 'Send Email Code'}
      </button>
      <div className="text-center">
        <button onClick={onSwitchToSignup} className="text-cyan-400 hover:underline text-sm" data-testid="switch-to-signup">
          New here? Create an account
        </button>
      </div>
    </div>
  );
}

export function StepSignup({ name, setName, email, setEmail, loading, onSendOTP, onSwitchToSignin }) {
  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <button onClick={initiateGoogleAuth} className="flex-1 flex items-center justify-center gap-2 p-3 border border-slate-200 rounded-xl hover:bg-slate-50 transition-all text-sm font-medium" data-testid="google-signup-btn">
          <GoogleIcon size={16} /> Google
        </button>
        <button onClick={initiateAppleAuth} className="flex-1 flex items-center justify-center gap-2 p-3 border border-slate-200 rounded-xl hover:bg-slate-50 transition-all text-sm font-medium text-slate-900" data-testid="apple-signup-btn">
          <AppleIcon size={16} /> Apple
        </button>
        <button onClick={initiateMSAuth} className="flex-1 flex items-center justify-center gap-2 p-3 border border-slate-200 rounded-xl hover:bg-slate-50 transition-all text-sm font-medium" data-testid="microsoft-signup-btn">
          <MSIcon size={16} /> Microsoft
        </button>
      </div>
      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-slate-200" />
        <span className="text-xs text-slate-400">or use email</span>
        <div className="flex-1 h-px bg-slate-200" />
      </div>
      <p className="text-slate-600 text-sm">We'll send a verification code to your email</p>
      <div>
        <label className="block text-sm font-medium mb-2">Your Name</label>
        <div className="relative">
          <User className="absolute left-3 top-3 text-slate-400" size={18} />
          <input type="text" placeholder="John Doe" className="input-field" style={{ paddingLeft: '2.5rem' }} value={name} onChange={(e) => setName(e.target.value)} data-testid="name-input" />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium mb-2">Email Address</label>
        <div className="relative">
          <Mail className="absolute left-3 top-3 text-slate-400" size={18} />
          <input type="email" placeholder="your@email.com" className="input-field" style={{ paddingLeft: '2.5rem' }} value={email} onChange={(e) => setEmail(e.target.value)} data-testid="email-input" />
        </div>
      </div>
      <button onClick={onSendOTP} disabled={loading} className="btn-primary w-full" data-testid="send-email-otp-btn">
        {loading ? 'Sending...' : 'Send Code'}
      </button>
      <div className="text-center">
        <button onClick={onSwitchToSignin} className="text-cyan-400 hover:underline text-sm" data-testid="switch-to-signin">
          Already have an account? Dive in
        </button>
      </div>
    </div>
  );
}

export function StepVerifyEmail({ email, emailOTP, setEmailOTP, loading, onVerify, onResend, emailResendCooldown, emailTimeRemaining, formatTime }) {
  return (
    <div className="space-y-4">
      <div className="text-center mb-4">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-cyan-100 text-cyan-400 mb-4">
          <Mail size={32} />
        </div>
        <p className="text-slate-600 text-sm">Code sent to<br /><span className="font-semibold">{email}</span></p>
      </div>
      <div>
        <label className="block text-sm font-medium mb-2">Email Verification Code</label>
        <input type="text" maxLength="6" placeholder="123456" className="input-field text-center text-2xl tracking-widest" value={emailOTP} onChange={(e) => setEmailOTP(e.target.value.replace(/\D/g, ''))} onKeyDown={(e) => e.key === 'Enter' && onVerify()} data-testid="email-otp-input" />
      </div>
      <button onClick={onVerify} disabled={loading} className="btn-primary w-full" data-testid="verify-email-btn">
        {loading ? 'Verifying...' : 'Verify Email'}
      </button>
      <button onClick={onResend} disabled={loading || emailResendCooldown > 0} className="btn-outline w-full">
        {emailResendCooldown > 0 ? `Resend (${emailResendCooldown}s)` : 'Resend Code'}
      </button>
      {emailTimeRemaining > 0 ? (
        <div className="text-center">
          <p className="text-sm text-slate-600">Code expires in</p>
          <p className="text-2xl font-bold text-cyan-400 tabular-nums">{formatTime(emailTimeRemaining)}</p>
        </div>
      ) : (
        <p className="text-xs text-red-500 text-center">Code expired</p>
      )}
    </div>
  );
}

export function StepPhone({ isSignup, userPhone, phone, setPhone, loading, onSendOTP }) {
  return (
    <div className="space-y-4">
      <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-4">
        <div className="flex items-center gap-2 text-green-700">
          <CheckCircle size={20} />
          <span className="font-semibold">Email Verified!</span>
        </div>
      </div>
      <p className="text-slate-600 text-sm">
        {isSignup ? 'Now verify your phone number for 2FA security' : `Verify your phone ending in ****${userPhone}`}
      </p>
      <div>
        <label className="block text-sm font-medium mb-2">Phone Number</label>
        <div className="relative">
          <Phone className="absolute left-3 top-3 text-slate-400" size={18} />
          <input type="tel" placeholder="+1234567890" className="input-field" style={{ paddingLeft: '2.5rem' }} value={phone} onChange={(e) => setPhone(e.target.value)} data-testid="phone-input" />
        </div>
        <p className="text-xs text-slate-500 mt-2">Include country code (e.g., +1)</p>
      </div>
      <button onClick={onSendOTP} disabled={loading} className="btn-primary w-full" data-testid="send-phone-otp-btn">
        {loading ? 'Sending...' : 'Send SMS Code'}
      </button>
    </div>
  );
}

export function StepVerifyPhone({ phone, phoneOTP, setPhoneOTP, loading, onVerify, onResend, phoneResendCooldown, phoneTimeRemaining, formatTime }) {
  return (
    <div className="space-y-4">
      <div className="text-center mb-4">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-cyan-100 text-cyan-400 mb-4">
          <Phone size={32} />
        </div>
        <p className="text-slate-600 text-sm">SMS sent to<br /><span className="font-semibold">{phone}</span></p>
      </div>
      <div>
        <label className="block text-sm font-medium mb-2">SMS Verification Code</label>
        <input type="text" maxLength="6" placeholder="123456" className="input-field text-center text-2xl tracking-widest" value={phoneOTP} onChange={(e) => setPhoneOTP(e.target.value.replace(/\D/g, ''))} data-testid="phone-otp-input" />
      </div>
      <button onClick={onVerify} disabled={loading} className="btn-primary w-full" data-testid="verify-phone-btn">
        {loading ? 'Verifying...' : 'Verify & Complete'}
      </button>
      <button onClick={onResend} disabled={loading || phoneResendCooldown > 0} className="btn-outline w-full">
        {phoneResendCooldown > 0 ? `Resend (${phoneResendCooldown}s)` : 'Resend Code'}
      </button>
      {phoneTimeRemaining > 0 ? (
        <div className="text-center">
          <p className="text-sm text-slate-600">Code expires in</p>
          <p className="text-2xl font-bold text-cyan-400 tabular-nums">{formatTime(phoneTimeRemaining)}</p>
        </div>
      ) : (
        <p className="text-xs text-red-500 text-center">Code expired</p>
      )}
    </div>
  );
}
