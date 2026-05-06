import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';

export const socialKeys = {
  feed: (page) => ['social', 'feed', page],
  buddies: () => ['social', 'buddies'],
  buddyRequests: () => ['social', 'buddy-requests'],
  profile: (userId) => ['social', 'profile', userId],
  notifications: () => ['notifications'],
};

export function useFeedQuery(page = 1) {
  return useQuery({
    queryKey: socialKeys.feed(page),
    queryFn: async () => {
      const res = await axios.get(`/connect/feed?page=${page}`);
      return res.data;
    },
    staleTime: 15_000, // feed is more real-time
  });
}

export function useBuddiesQuery() {
  return useQuery({
    queryKey: socialKeys.buddies(),
    queryFn: async () => {
      const res = await axios.get('/connect/buddies');
      return res.data;
    },
  });
}

export function useUserProfileQuery(userId) {
  return useQuery({
    queryKey: socialKeys.profile(userId),
    queryFn: async () => {
      const res = await axios.get(`/users/${userId}/profile`);
      return res.data;
    },
    enabled: !!userId,
  });
}

export function useNotificationsQuery(enabled = true) {
  return useQuery({
    queryKey: socialKeys.notifications(),
    queryFn: async () => {
      const res = await axios.get('/notifications');
      return res.data;
    },
    enabled,
    staleTime: 10_000,
  });
}

export function useBuddyRequestMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, action }) =>
      axios.post(`/connect/buddy-request`, { user_id: userId, action }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: socialKeys.buddies() });
      qc.invalidateQueries({ queryKey: socialKeys.buddyRequests() });
    },
  });
}
