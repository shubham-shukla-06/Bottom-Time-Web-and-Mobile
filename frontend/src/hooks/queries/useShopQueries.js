import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';

export const shopKeys = {
  all: ['products'],
  list: (params) => ['products', 'list', params],
  detail: (id) => ['products', 'detail', id],
};

export function useProductsQuery(params = {}) {
  const key = JSON.stringify(params);
  return useQuery({
    queryKey: shopKeys.list(key),
    queryFn: async () => {
      const p = new URLSearchParams();
      if (params.category) p.append('category', params.category);
      if (params.search) p.append('search', params.search);
      if (params.sort) p.append('sort', params.sort);
      if (params.min_price) p.append('min_price', String(params.min_price));
      if (params.max_price) p.append('max_price', String(params.max_price));
      if (params.limit) p.append('limit', String(params.limit));
      if (params.skip) p.append('skip', String(params.skip));
      const res = await axios.get(`/products?${p.toString()}`);
      return res.data;
    },
  });
}

export function useProductDetailQuery(id) {
  return useQuery({
    queryKey: shopKeys.detail(id),
    queryFn: async () => {
      const res = await axios.get(`/products/${id}`);
      return res.data;
    },
    enabled: !!id,
  });
}

export function useAddToCartMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ productId, quantity }) =>
      axios.post('/cart/add', { product_id: productId, quantity }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cart'] }),
  });
}
