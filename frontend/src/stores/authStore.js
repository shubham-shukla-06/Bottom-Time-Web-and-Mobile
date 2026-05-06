import { create } from 'zustand';
import axios from 'axios';

const useAuthStore = create((set, get) => ({
  user: null,
  token: sessionStorage.getItem('token'),
  loading: true,

  setUser: (user) => set({ user }),

  login: (newToken, userData) => {
    sessionStorage.setItem('token', newToken);
    axios.defaults.headers.common['Authorization'] = `Bearer ${newToken}`;
    set({ token: newToken, user: userData });
    // Always sync currency from backend profile (source of truth for logged-in users)
    if (userData?.currency) {
      import('./uiStore').then(m => {
        localStorage.setItem('bt_currency', userData.currency);
        m.default.setState({ currency: userData.currency });
      });
    }
    // Side effects: refresh cart + wishlist, clear query cache
    // Import lazily to avoid circular deps
    import('./cartStore').then(m => m.default.getState().refreshCart());
    import('../lib/queryClient').then(m => m.default.clear());
  },

  logout: () => {
    sessionStorage.removeItem('token');
    delete axios.defaults.headers.common['Authorization'];
    set({ token: null, user: null });
    // Side effects: clear cart + query cache
    import('./cartStore').then(m => m.default.getState().clearCart());
    import('../lib/queryClient').then(m => m.default.clear());
  },

  fetchCurrentUser: async () => {
    const { token } = get();
    if (!token) { set({ loading: false }); return null; }
    axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    try {
      const res = await axios.get('/auth/me');
      set({ user: res.data, loading: false });
      // Always sync currency from backend profile (source of truth for logged-in users)
      if (res.data?.currency) {
        const uiStore = (await import('./uiStore')).default;
        localStorage.setItem('bt_currency', res.data.currency);
        uiStore.setState({ currency: res.data.currency });
      }
      return res.data;
    } catch {
      get().logout();
      set({ loading: false });
      return null;
    }
  },

  setLoading: (loading) => set({ loading }),
}));

export default useAuthStore;
