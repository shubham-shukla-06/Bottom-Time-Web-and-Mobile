import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from '../api/client';

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  phone?: string;
  onboarding_complete?: boolean;
  profile_photo?: string;
  location_country?: string;
  location_city?: string;
  certification_agency?: string;
  experience_level?: string;
  total_dives?: number;
  currency?: string;
  [key: string]: any;
}

interface AuthState {
  user: User | null;
  token: string | null;
  loading: boolean;
  setUser: (user: User | null) => void;
  login: (token: string, user: User) => void;
  logout: () => void;
  fetchCurrentUser: () => Promise<User | null>;
  setLoading: (loading: boolean) => void;
}

const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: null,
  loading: true,

  setUser: (user) => set({ user }),

  login: async (newToken: string, userData: User) => {
    await AsyncStorage.setItem('token', newToken);
    set({ token: newToken, user: userData });
  },

  logout: async () => {
    await AsyncStorage.removeItem('token');
    set({ token: null, user: null });
  },

  fetchCurrentUser: async () => {
    const token = await AsyncStorage.getItem('token');
    if (!token) {
      set({ loading: false, token: null });
      return null;
    }
    set({ token });
    try {
      const res = await api.get('/auth/me');
      set({ user: res.data, loading: false });
      return res.data;
    } catch {
      await AsyncStorage.removeItem('token');
      set({ token: null, user: null, loading: false });
      return null;
    }
  },

  setLoading: (loading) => set({ loading }),
}));

export default useAuthStore;
