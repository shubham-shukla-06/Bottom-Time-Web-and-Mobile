import { create } from 'zustand';

interface UIState {
  showAuthModal: boolean;
  authMode: 'signin' | 'signup';
  currency: string;
  exchangeRates: Record<string, number>;
  openAuth: (mode?: 'signin' | 'signup') => void;
  closeAuth: () => void;
  setCurrency: (code: string) => void;
  setExchangeRates: (rates: Record<string, number>) => void;
}

const useUIStore = create<UIState>((set) => ({
  showAuthModal: false,
  authMode: 'signin',
  currency: 'USD',
  exchangeRates: { USD: 1 },

  openAuth: (mode = 'signin') => set({ authMode: mode, showAuthModal: true }),
  closeAuth: () => set({ showAuthModal: false }),

  setCurrency: (code) => set({ currency: code }),
  setExchangeRates: (rates) => set({ exchangeRates: rates }),
}));

export default useUIStore;
