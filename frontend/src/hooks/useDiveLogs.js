import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useDiveLogsQuery, diveKeys } from './queries/useDiveQueries';

export default function useDiveLogs(user) {
  const [search, setSearch] = useState('');
  const qc = useQueryClient();
  const { data, isLoading } = useDiveLogsQuery(user, search);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const refreshLogs = useCallback((query) => {
    if (query !== undefined) {
      setSearch(query || '');
    } else {
      qc.invalidateQueries({ queryKey: diveKeys.all });
    }
  }, [qc]);

  return {
    logs: data?.logs || [],
    stats: data?.stats || {},
    loading: isLoading,
    refreshLogs,
  };
}
