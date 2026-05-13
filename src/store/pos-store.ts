import { create } from 'zustand';

interface CartItem {
  productId: number;
  name: string;
  barcode: string;
  quantity: number;
  price: number;
  stock: number;
}

interface PosStore {
  cart: CartItem[];
  isOpen: boolean;
  setOpen: (open: boolean) => void;
  addItem: (item: Omit<CartItem, 'quantity'>) => void;
  removeItem: (productId: number) => void;
  updateQuantity: (productId: number, quantity: number) => void;
  clearCart: () => void;
  setCart: (items: CartItem[]) => void;
  // Computed
  subtotal: () => number;
  total: () => number;
  itemCount: () => number;
}

export const usePosStore = create<PosStore>((set, get) => ({
  cart: [],
  isOpen: false,
  setOpen: (open) => set({ isOpen: open }),
  addItem: (item) => {
    const existing = get().cart.find(i => i.productId === item.productId);
    if (existing) {
      set({ cart: get().cart.map(i => 
        i.productId === item.productId 
          ? { ...i, quantity: i.quantity + 1 }
          : i
      )});
    } else {
      set({ cart: [...get().cart, { ...item, quantity: 1 }] });
    }
  },
  removeItem: (productId) => set({ cart: get().cart.filter(i => i.productId !== productId) }),
  updateQuantity: (productId, quantity) => set({ cart: get().cart.map(i => 
    i.productId === productId ? { ...i, quantity: Math.max(1, quantity) } : i
  )}),
  clearCart: () => set({ cart: [] }),
  setCart: (items) => set({ cart: items }),
  subtotal: () => get().cart.reduce((sum, i) => sum + i.price * i.quantity, 0),
  total: () => get().cart.reduce((sum, i) => sum + i.price * i.quantity, 0),
  itemCount: () => get().cart.reduce((sum, i) => sum + i.quantity, 0),
}));
