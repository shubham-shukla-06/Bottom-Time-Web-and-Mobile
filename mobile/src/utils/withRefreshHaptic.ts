/**
 * withRefreshHaptic — wraps a pull-to-refresh callback so the user gets a
 * subtle `selection` haptic the moment the refresh fires. Haptic failure
 * is swallowed (best-effort): never block the actual refresh.
 *
 * Usage:
 *   <RefreshControl
 *     refreshing={refreshing}
 *     onRefresh={withRefreshHaptic(() => { setRefreshing(true); fetchData(); })}
 *   />
 */
import { triggerHaptic } from './haptics';

export function withRefreshHaptic(fn: () => void): () => void {
  return () => {
    try { void triggerHaptic('selection'); } catch {/* noop */}
    fn();
  };
}
