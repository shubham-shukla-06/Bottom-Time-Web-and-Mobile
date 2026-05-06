import { useEffect } from 'react';
import axios from 'axios';

/**
 * Capture UTM parameters from URL on page load.
 * Stores visitor_id in localStorage for cross-session attribution.
 * Links to user_id after login.
 */
export function useUTMCapture(userId) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const utmSource = params.get('utm_source');
    const utmMedium = params.get('utm_medium');
    const utmCampaign = params.get('utm_campaign');
    const utmContent = params.get('utm_content');
    const utmTerm = params.get('utm_term');
    const operatorId = params.get('ref') || params.get('operator_id') || '';

    // Only fire if there are UTM params
    if (!utmSource && !utmCampaign && !operatorId) return;

    let visitorId = localStorage.getItem('bt_visitor_id');
    if (!visitorId) {
      visitorId = 'v_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem('bt_visitor_id', visitorId);
    }

    axios.post('/utm/capture', {
      visitor_id: visitorId,
      user_id: userId || null,
      utm_source: utmSource || '',
      utm_medium: utmMedium || '',
      utm_campaign: utmCampaign || '',
      utm_content: utmContent || '',
      utm_term: utmTerm || '',
      landing_page: window.location.pathname,
      referrer: document.referrer || '',
      operator_id: operatorId,
    }).catch(() => {});
  }, [userId]);
}

/**
 * Link anonymous UTM events to user after login/signup.
 */
export function linkUTMToUser(userId) {
  const visitorId = localStorage.getItem('bt_visitor_id');
  if (visitorId && userId) {
    axios.post(`/utm/link-user?visitor_id=${visitorId}&user_id=${userId}`).catch(() => {});
  }
}
