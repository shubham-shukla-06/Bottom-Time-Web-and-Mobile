import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';

export default function PrivacyBanner() {
  const [visible, setVisible] = useState(false);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!localStorage.getItem('privacy_accepted')) {
      setVisible(true);
    }
  }, []);

  const accept = () => {
    localStorage.setItem('privacy_accepted', 'true');
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="fixed bottom-0 inset-x-0 z-50 bg-slate-900/95 backdrop-blur border-t border-slate-700 px-6 py-4" data-testid="privacy-banner">
      <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <p className="text-sm text-slate-300 flex-1">
          We use your personal data <strong className="text-white">only</strong> to deliver services you use — bookings, purchases, messaging, and your dive log. Nothing else. Read our{' '}
          <Link to="/privacy" className="text-cyan-400 underline underline-offset-2">Privacy Policy</Link>.
        </p>
        <button
          onClick={accept}
          className="bg-cyan-400 hover:bg-cyan-300 text-slate-900 font-semibold text-sm px-6 py-2 rounded-full transition-colors whitespace-nowrap"
          data-testid="privacy-accept-btn"
        >
          I understand
        </button>
      </div>
    </div>
  );
}
