import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';

export const diveKeys = {
  all: ['dives'],
  logs: (search) => ['dives', 'logs', search || ''],
  stats: () => ['dives', 'stats'],
};

export function useDiveLogsQuery(user, search = '') {
  return useQuery({
    queryKey: diveKeys.logs(search),
    queryFn: async () => {
      const params = search ? `?search=${encodeURIComponent(search)}` : '';
      const res = await axios.get(`/dive-log${params}`);
      return { logs: res.data.logs, stats: res.data.stats };
    },
    enabled: !!user,
  });
}

export function useLogDiveMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (diveData) => axios.post('/dive-log', diveData),
    onSuccess: () => qc.invalidateQueries({ queryKey: diveKeys.all }),
  });
}

export function useDeleteDiveMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => axios.delete(`/dive-log/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: diveKeys.all }),
  });
}

export function useUpdateDiveMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }) => axios.put(`/dive-log/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: diveKeys.all }),
  });
}
