import { useRef, useState, useEffect } from 'react';

export default function CountUp({ value, suffix = '', decimals = 0, duration = 1800 }) {
  const ref = useRef(null);
  const [display, setDisplay] = useState(0);
  const animating = useRef(false);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !animating.current && value > 0) {
        animating.current = true;
        const start = performance.now();
        const from = 0;
        const to = value;
        const step = (now) => {
          const elapsed = now - start;
          const progress = Math.min(elapsed / duration, 1);
          const eased = 1 - Math.pow(1 - progress, 3);
          const current = from + (to - from) * eased;
          setDisplay(decimals > 0 ? parseFloat(current.toFixed(decimals)) : Math.round(current));
          if (progress < 1) requestAnimationFrame(step);
          else animating.current = false;
        };
        requestAnimationFrame(step);
      } else if (!entry.isIntersecting) {
        animating.current = false;
        setDisplay(0);
      }
    }, { threshold: 0.3 });
    observer.observe(el);
    return () => observer.disconnect();
  }, [value, duration, decimals]);

  const formatted = decimals > 0 ? display.toFixed(decimals) : display.toLocaleString();
  return <span ref={ref}>{formatted}{suffix}</span>;
}
