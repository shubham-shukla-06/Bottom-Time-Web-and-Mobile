import { useEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

/**
 * Scrolls the window to the top whenever the user navigates to a new path.
 *
 * - Triggers on `pathname` change only — search-param changes (used by tab
 *   state via useTabParam) do NOT cause a scroll, so switching tabs keeps the
 *   user where they are.
 * - On POP navigations (back/forward), the browser already restores scroll
 *   position, so we do not interfere.
 * - If the URL contains a hash, we let the browser handle anchor scrolling.
 */
export default function RouteScrollRestorer() {
  const { pathname, hash } = useLocation();
  const navigationType = useNavigationType();
  const prevPathRef = useRef(pathname);

  useEffect(() => {
    if (prevPathRef.current === pathname) return;
    prevPathRef.current = pathname;

    if (navigationType === 'POP') return;
    if (hash) return;

    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [pathname, hash, navigationType]);

  return null;
}
