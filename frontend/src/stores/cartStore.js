import { create } from 'zustand';
import axios from 'axios';

const useCartStore = create((set) => ({
  cartItems: [],
  cartCount: 0,
  cartTotal: 0,

  refreshCart: async () => {
    try {
      const res = await axios.get('/cart');
      const items = res.data.items || [];
      set({
        cartItems: items,
        cartCount: items.reduce((sum, i) => sum + i.quantity, 0),
        cartTotal: res.data.total || 0,
      });
    } catch (e) {
      set({ cartItems: [], cartCount: 0, cartTotal: 0 });
    }
  },

  clearCart: () => set({ cartItems: [], cartCount: 0, cartTotal: 0 }),
}));

export default useCartStore;
