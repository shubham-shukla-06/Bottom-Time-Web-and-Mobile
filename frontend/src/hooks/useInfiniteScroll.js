import { useRef, useCallback, useEffect } from 'react';

export function useInfiniteScroll(onLoadMore, hasMore, loading) {
  const sentinelRef = useRef(null);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const handleObserver = useCallback((entries) => {
    const target = entries[0];
    if (target.isIntersecting && hasMore && !loading) {
      onLoadMore();
    }
  }, [onLoadMore, hasMore, loading]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(handleObserver, {
      rootMargin: '200px',
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [handleObserver]);

  return sentinelRef;
}
