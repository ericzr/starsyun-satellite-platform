import { createContext, useContext, useState, ReactNode } from 'react';
import type { Product } from '../data/products';
import type { ProcessLevel } from '../lib/pricing';

export interface CartItem {
  product: Product;
  processLevel: ProcessLevel;
  quantity: number;
  price: number; // 总价
}

export interface Order {
  id: string;
  items: CartItem[];
  totalAmount: number;
  status: 'pending' | 'paid' | 'processing' | 'completed' | 'cancelled';
  createdAt: string;
  paidAt?: string;
  deliveredAt?: string;
  paymentMethod?: 'alipay' | 'wechat' | 'bank';
  deliveryUrl?: string;
}

interface CartContextValue {
  items: CartItem[];
  orders: Order[];
  addToCart: (product: Product, processLevel: ProcessLevel, price: number) => void;
  removeFromCart: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
  createOrder: (paymentMethod: 'alipay' | 'wechat' | 'bank') => Order;
  getOrder: (orderId: string) => Order | undefined;
  cartTotal: number;
}

const CartContext = createContext<CartContextValue | undefined>(undefined);

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);

  const addToCart = (product: Product, processLevel: ProcessLevel, price: number) => {
    setItems((prev) => {
      const existing = prev.find((item) => item.product.id === product.id && item.processLevel === processLevel);
      if (existing) {
        return prev.map((item) =>
          item.product.id === product.id && item.processLevel === processLevel
            ? { ...item, quantity: item.quantity + 1, price: price * (item.quantity + 1) }
            : item
        );
      }
      return [...prev, { product, processLevel, quantity: 1, price }];
    });
  };

  const removeFromCart = (productId: string) => {
    setItems((prev) => prev.filter((item) => item.product.id !== productId));
  };

  const updateQuantity = (productId: string, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(productId);
      return;
    }
    setItems((prev) =>
      prev.map((item) =>
        item.product.id === productId
          ? { ...item, quantity, price: (item.price / item.quantity) * quantity }
          : item
      )
    );
  };

  const clearCart = () => {
    setItems([]);
  };

  const createOrder = (paymentMethod: 'alipay' | 'wechat' | 'bank'): Order => {
    const order: Order = {
      id: `ORD-${Date.now()}-${Math.random().toString(36).slice(2, 9).toUpperCase()}`,
      items: [...items],
      totalAmount: cartTotal,
      status: 'pending',
      createdAt: new Date().toISOString(),
      paymentMethod,
    };
    setOrders((prev) => [order, ...prev]);
    clearCart();
    return order;
  };

  const getOrder = (orderId: string) => {
    return orders.find((o) => o.id === orderId);
  };

  const cartTotal = items.reduce((sum, item) => sum + item.price, 0);

  return (
    <CartContext.Provider
      value={{
        items,
        orders,
        addToCart,
        removeFromCart,
        updateQuantity,
        clearCart,
        createOrder,
        getOrder,
        cartTotal,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within CartProvider');
  }
  return context;
}
