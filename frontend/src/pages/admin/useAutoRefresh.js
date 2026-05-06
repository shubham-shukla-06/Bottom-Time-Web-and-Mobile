import { useEffect, useRef } from 'react';

export function useAutoRefresh(callback, interval = 30000) {
  const savedCallback = useRef(callback);

  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  useEffect(() => {
    const id = setInterval(() => savedCallback.current(), interval);
    return () => clearInterval(id);
  }, [interval]);
}
