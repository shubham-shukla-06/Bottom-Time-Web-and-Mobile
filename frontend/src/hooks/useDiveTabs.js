import { useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

export default function useDiveTabs(defaultTab = 'overview') {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = searchParams.get('tab') || defaultTab;
  const [tab, setTab] = useState(initialTab);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const changeTab = useCallback((nextTab) => {
    setTab(nextTab);
    setSearchParams({ tab: nextTab });
  }, [setSearchParams]);

  return { tab, changeTab };
}
