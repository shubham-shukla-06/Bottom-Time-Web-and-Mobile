import { useQuery } from '@tanstack/react-query';
import axios from 'axios';

export const listingKeys = {
  all: ['listings'],
  list: (params) => ['listings', 'list', params],
  detail: (id) => ['listings', 'detail', id],
  destinations: () => ['listings', 'destinations'],
};

export function useListingsQuery(params = {}, enabled = true) {
  const key = JSON.stringify(params);
  return useQuery({
    queryKey: listingKeys.list(key),
    queryFn: async () => {
      const p = new URLSearchParams();
      if (params.type) p.append('type', params.type);
      if (params.country) p.append('country', params.country);
      if (params.max_price) p.append('max_price', params.max_price);
      if (params.search) p.append('search', params.search);
      if (params.sort_by) p.append('sort_by', params.sort_by);
      if (params.limit) p.append('limit', String(params.limit));
      if (params.skip) p.append('skip', String(params.skip));
      if (params.include_reviews) p.append('include_reviews', 'true');
      if (params.available_from) p.append('available_from', params.available_from);
      if (params.available_to) p.append('available_to', params.available_to);
      const res = await axios.get(`/listings?${p.toString()}`);
      return res.data;
    },
    enabled,
  });
}

export function useListingDetailQuery(id) {
  return useQuery({
    queryKey: listingKeys.detail(id),
    queryFn: async () => {
      const res = await axios.get(`/listings/${id}`);
      return res.data;
    },
    enabled: !!id,
  });
}

export function useDestinationsQuery() {
  return useQuery({
    queryKey: listingKeys.destinations(),
    queryFn: async () => {
      const res = await axios.get('/destinations');
      return res.data.destinations;
    },
    staleTime: 60_000, // destinations change rarely
  });
}
