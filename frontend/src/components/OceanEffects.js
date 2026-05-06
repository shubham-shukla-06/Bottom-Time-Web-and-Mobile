import { useEffect, useRef } from 'react';

/**
 * Full-page interactive ocean effects:
 * - Mouse ripple on click (expanding water rings)
 */
export default function OceanEffects() {
  const canvasRef = useRef(null);
  const ripplesRef = useRef([]);
  const rafRef = useRef(null);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const onClick = (e) => {
      ripplesRef.current.push({
        x: e.clientX,
        y: e.clientY,
        radius: 0,
        maxRadius: 120 + Math.random() * 80,
        opacity: 0.6,
        lineWidth: 2,
      });
      setTimeout(() => {
        ripplesRef.current.push({
          x: e.clientX,
          y: e.clientY,
          radius: 0,
          maxRadius: 80 + Math.random() * 60,
          opacity: 0.4,
          lineWidth: 1.5,
        });
      }, 100);

      // Burst of ripple bubbles on click (subtle)
      for (let i = 0; i < 3; i++) {
        ripplesRef.current.push({
          x: e.clientX + (Math.random() - 0.5) * 20,
          y: e.clientY + (Math.random() - 0.5) * 20,
          radius: 0,
          maxRadius: 40 + Math.random() * 30,
          opacity: 0.25,
          lineWidth: 1,
        });
      }
    };

    window.addEventListener('click', onClick);

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Draw ripples
      ripplesRef.current = ripplesRef.current.filter(r => r.opacity > 0.01);
      ripplesRef.current.forEach(r => {
        r.radius += 3;
        r.opacity *= 0.96;
        ctx.beginPath();
        ctx.arc(r.x, r.y, r.radius, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(34, 211, 238, ${r.opacity})`;
        ctx.lineWidth = r.lineWidth * (1 - r.radius / r.maxRadius);
        ctx.stroke();
        if (r.radius > 10) {
          ctx.beginPath();
          ctx.arc(r.x, r.y, r.radius * 0.6, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(34, 211, 238, ${r.opacity * 0.3})`;
          ctx.lineWidth = r.lineWidth * 0.5;
          ctx.stroke();
        }
      });

      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener('resize', resize);
      window.removeEventListener('click', onClick);
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-[9999]"
      style={{ mixBlendMode: 'screen' }}
    />
  );
}


/**
 * Animated SVG wave divider between sections
 */
export function WaveDivider({ flip = false, color = '#f8fafc', className = '' }) {
  return (
    <div className={`w-full overflow-hidden leading-[0] ${flip ? 'rotate-180' : ''} ${className}`} aria-hidden="true">
      <svg viewBox="0 0 1440 80" preserveAspectRatio="none" className="w-full h-[40px] md:h-[60px]">
        <path fill={color} d="M0,40 C360,80 720,0 1080,40 C1260,60 1380,50 1440,40 L1440,80 L0,80 Z">
          <animate attributeName="d"
            values="M0,40 C360,80 720,0 1080,40 C1260,60 1380,50 1440,40 L1440,80 L0,80 Z;
                    M0,50 C360,10 720,70 1080,30 C1260,20 1380,60 1440,50 L1440,80 L0,80 Z;
                    M0,40 C360,80 720,0 1080,40 C1260,60 1380,50 1440,40 L1440,80 L0,80 Z"
            dur="8s" repeatCount="indefinite" />
        </path>
      </svg>
    </div>
  );
}
