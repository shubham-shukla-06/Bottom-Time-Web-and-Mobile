import { create } from 'zustand';
import axios from 'axios';

const useUIStore = create((set, get) => ({
  // Auth modal
  showAuthModal: false,
  authMode: 'signin',
  openAuth: (mode = 'signin') => set({ authMode: mode, showAuthModal: true }),
  closeAuth: () => set({ showAuthModal: false }),

  // Currency
  currency: localStorage.getItem('bt_currency') || 'USD',
  exchangeRates: { USD: 1 },
  setCurrency: (code) => {
    localStorage.setItem('bt_currency', code);
    set({ currency: code });
    // Fire-and-forget profile update
    axios.put('/auth/profile', { currency: code }).catch(() => {});
  },
  setExchangeRates: (rates) => set({ exchangeRates: rates }),
  fetchExchangeRates: async () => {
    try {
      const res = await axios.get('/exchange-rates');
      set({ exchangeRates: res.data.rates });
    } catch (e) { console.debug('Exchange rates fetch failed:', e.message); }
  },

  // Wishlist
  wishlistedProductIds: [],
  refreshWishlist: async () => {
    try {
      const res = await axios.get('/wishlist/ids');
      set({ wishlistedProductIds: res.data.product_ids || [] });
    } catch (e) {
      set({ wishlistedProductIds: [] });
    }
  },

  // Push notifications (set externally by the hook)
  pushNotifs: null,
  setPushNotifs: (p) => set({ pushNotifs: p }),
}));

export default useUIStore;
