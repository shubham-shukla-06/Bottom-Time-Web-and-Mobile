import { useRef, useEffect } from 'react';

export default function DepthGauge() {
  const trackRef = useRef(null);
  const diverRef = useRef(null);
  const bubblesRef = useRef([]);
  const rafId = useRef(null);
  const lastScroll = useRef(0);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const track = trackRef.current;
    const diver = diverRef.current;
    if (!track || !diver) return;

    const onScroll = () => {
      if (rafId.current) return;
      rafId.current = requestAnimationFrame(() => {
        const scrollTop = window.scrollY;
        const docHeight = document.documentElement.scrollHeight - window.innerHeight;
        const progress = Math.min(scrollTop / docHeight, 1);
        const scrollDelta = Math.abs(scrollTop - lastScroll.current);
        lastScroll.current = scrollTop;

        const trackH = track.offsetHeight - 24;
        diver.style.transform = `translateY(${progress * trackH}px)`;
        track.style.setProperty('--progress', `${progress * 100}%`);

        const diverY = progress * trackH;
        bubblesRef.current.forEach((b, i) => {
          if (!b) return;
          const speed = 0.5 + i * 0.3;
          const time = performance.now() / 1000;
          const rise = ((time * speed * 60 + i * 80) % 200);
          const wobble = Math.sin(time * 2 + i * 1.5) * 8;
          const bubbleOpacity = scrollDelta > 1 ? Math.max(0, 0.8 - rise / 200) : Math.max(0, 0.4 - rise / 200);
          const scale = Math.max(0.3, 1 - rise / 250);
          b.style.transform = `translate(${wobble}px, ${diverY - rise}px) scale(${scale})`;
          b.style.opacity = rise < 180 ? bubbleOpacity : 0;
        });

        rafId.current = null;
      });
    };

    const animLoop = () => {
      onScroll();
      requestAnimationFrame(animLoop);
    };
    const loopId = requestAnimationFrame(animLoop);

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => { window.removeEventListener('scroll', onScroll); cancelAnimationFrame(loopId); cancelAnimationFrame(rafId.current); };
  }, []);

  return (
    <div className="depth-gauge" aria-hidden="true">
      <div className="depth-track" ref={trackRef}>
        {[0, 1, 2, 3, 4].map(i => (
          <div
            key={`k${i}`}
            ref={el => bubblesRef.current[i] = el}
            className="depth-bubble"
          />
        ))}
        <div ref={diverRef} className="depth-diver">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="8" r="3.5" />
            <path d="M7 20v-1a5 5 0 0 1 10 0v1" />
          </svg>
        </div>
        <span className="depth-label" style={{ top: '0' }}>0m</span>
        <span className="depth-label" style={{ top: '33%' }}>10m</span>
        <span className="depth-label" style={{ top: '66%' }}>20m</span>
        <span className="depth-label" style={{ bottom: '0' }}>30m</span>
      </div>
    </div>
  );
}
