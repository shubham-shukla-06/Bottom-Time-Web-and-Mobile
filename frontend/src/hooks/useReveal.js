import { useRef, useEffect } from 'react';

export function useReveal(threshold = 0.15) {
  const ref = useRef(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) el.classList.add('visible');
        else el.classList.remove('visible');
      },
      { threshold, rootMargin: '0px 0px -80px 0px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold]);
  return ref;
}

export function useRevealGroup(threshold = 0.1) {
  const ref = useRef(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        const children = el.querySelectorAll('[data-reveal-child]');
        if (entry.isIntersecting) children.forEach(c => c.classList.add('visible'));
        else children.forEach(c => c.classList.remove('visible'));
      },
      { threshold, rootMargin: '0px 0px -60px 0px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold]);
  return ref;
}
