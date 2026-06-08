import { useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';

/**
 * Portal-based hover tooltip. The custom inline `Tip` used to render the
 * tooltip as a sibling absolute span inside the trigger — which got clipped
 * by any ancestor with `overflow-hidden` (e.g. the `aspect-[16/9]` rounded
 * image containers on listing cards / hero). Rendering via a portal to
 * document.body means the tooltip is positioned in viewport space (fixed)
 * and never clipped by any ancestor container.
 *
 * Pure CSS-style API: <Tip label="…"><button …/></Tip>. No external deps.
 */
export default function Tip({ label, children, side = 'top', offset = 8 }) {
  const triggerRef = useRef(null);
  const [coords, setCoords] = useState(null);

  const show = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    // Default: above trigger, horizontally centred.
    if (side === 'bottom') {
      setCoords({ top: r.bottom + offset, left: r.left + r.width / 2, placement: 'bottom' });
    } else {
      setCoords({ top: r.top - offset, left: r.left + r.width / 2, placement: 'top' });
    }
  }, [side, offset]);

  const hide = useCallback(() => setCoords(null), []);

  return (
    <span
      ref={triggerRef}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      className="inline-flex"
    >
      {children}
      {coords && createPortal(
        <span
          className="pointer-events-none fixed z-[9999] px-2 py-1 rounded-md bg-slate-900 text-white text-[11px] font-medium whitespace-nowrap shadow-lg"
          style={{
            top: coords.top,
            left: coords.left,
            transform: coords.placement === 'top' ? 'translate(-50%, -100%)' : 'translate(-50%, 0)',
          }}
          role="tooltip"
        >
          {label}
        </span>,
        document.body
      )}
    </span>
  );
}
