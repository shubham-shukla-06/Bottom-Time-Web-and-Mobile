import { QueryClient } from '@tanstack/react-query';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,       // Data is fresh for 30s (no refetch)
      gcTime: 5 * 60_000,      // Keep unused data in cache for 5 min
      retry: 1,                // Retry failed requests once
      refetchOnWindowFocus: false,
    },
  },
});

export default queryClient;
