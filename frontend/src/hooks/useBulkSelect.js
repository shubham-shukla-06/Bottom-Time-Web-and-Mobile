import { useCallback, useMemo, useState } from 'react';

/**
 * Hook for managing bulk-selection state for admin list pages.
 *
 * Usage:
 *   const sel = useBulkSelect(items, it => it.id);
 *   sel.isSelected(id)              // boolean
 *   sel.toggle(id)                  // toggle one row
 *   sel.toggleAll()                 // select all / clear all on the current page
 *   sel.clear()                     // always clear
 *   sel.selected                    // Array<id>
 *   sel.selectedItems               // Array<item>
 *   sel.count                       // number
 *   sel.allSelected, sel.someSelected
 */
export function useBulkSelect(items, getId = (it) => it.id) {
  const [ids, setIds] = useState(new Set());

  // Reconcile selection when the underlying list changes (e.g., after refetch)
  const allIds = useMemo(() => (items || []).map(getId), [items, getId]);

  const toggle = useCallback((id) => {
    setIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    setIds((prev) => {
      const allSelected = allIds.length > 0 && allIds.every((id) => prev.has(id));
      if (allSelected) return new Set();
      return new Set(allIds);
    });
  }, [allIds]);

  const clear = useCallback(() => setIds(new Set()), []);

  const isSelected = useCallback((id) => ids.has(id), [ids]);

  const selected = useMemo(() => Array.from(ids), [ids]);
  const selectedItems = useMemo(
    () => (items || []).filter((it) => ids.has(getId(it))),
    [items, ids, getId]
  );

  const allSelected = allIds.length > 0 && allIds.every((id) => ids.has(id));
  const someSelected = !allSelected && allIds.some((id) => ids.has(id));

  return {
    selected,
    selectedItems,
    count: ids.size,
    isSelected,
    toggle,
    toggleAll,
    clear,
    allSelected,
    someSelected,
  };
}
