/**
 * useHighlightOnNavigate — scrolls a target element into view and applies a
 * temporary "ring" highlight when the page is opened with `?highlight=<id>`.
 *
 * Used by deep-linked notification clicks (booking_new, listing_approved,
 * trip_shared, order_update, etc.) so the user lands directly on the relevant
 * row instead of having to scan the page.
 *
 * Caller convention: target rows render `data-highlight-id={id}`.
 * Pass `ready` so the hook waits until the list has loaded.
 *
 * If the id is not found after `ready` becomes true, the optional
 * `onMissing` callback fires — typically to surface a toast.
 */
import { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';

export default function useHighlightOnNavigate({ ready, onMissing }) {
  const [searchParams] = useSearchParams();
  const handledRef = useRef(false);

  useEffect(() => {
    const id = searchParams.get('highlight');
    if (!id || !ready || handledRef.current) return;
    handledRef.current = true;

    // Run after the next paint so virtualised lists / freshly-mounted rows are
    // in the DOM.
    requestAnimationFrame(() => {
      const el = document.querySelector(`[data-highlight-id="${CSS.escape(id)}"]`);
      if (!el) {
        onMissing?.(id);
        return;
      }
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('highlight-ring');
      setTimeout(() => el.classList.remove('highlight-ring'), 2400);
    });
  }, [searchParams, ready, onMissing]);
}
