import { useCallback } from 'react';
import axios from 'axios';

export function useTracker() {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const track = useCallback((eventType, data = {}) => {
    const token = sessionStorage.getItem('token');
    const endpoint = token ? '/track' : '/track/anon';
    axios.post(endpoint, { event_type: eventType, data }).catch(() => {});
  }, []);

  return track;
}
