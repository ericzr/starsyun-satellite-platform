import { createContext, useContext, useState, ReactNode } from 'react';
import type { Product, ProcessingLevel, ValueAddedService } from '../data/products';
import type { ProcessLevel } from '../lib/pricing';

/** Local cart lines can come from the legacy processing controls or the
 * product-detail L1-L4 selector. Keeping both values preserves compatibility
 * while preventing different detail-page levels from being merged. */
export type CartProcessLevel = ProcessLevel | ProcessingLevel;

export interface CartItem {
  product: Product;
  processLevel: CartProcessLevel;
  services?: ValueAddedService[];
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
  addToCart: (product: Product, processLevel: CartProcessLevel, price: number, services?: ValueAddedService[]) => void;
  removeFromCart: (productId: string, processLevel?: CartProcessLevel, services?: ValueAddedService[]) => void;
  updateQuantity: (productId: string, quantity: number, processLevel?: CartProcessLevel, services?: ValueAddedService[]) => void;
  clearCart: () => void;
  createOrder: (paymentMethod: 'alipay' | 'wechat' | 'bank') => Order;
  getOrder: (orderId: string) => Order | undefined;
  cartTotal: number;
}

const CartContext = createContext<CartContextValue | undefined>(undefined);

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);

  const addToCart = (product: Product, processLevel: CartProcessLevel, price: number, services: ValueAddedService[] = []) => {
    const normalizedServices = [...new Set(services)].sort();
    setItems((prev) => {
      const existing = prev.find((item) => item.product.id === product.id
        && item.processLevel === processLevel
        && sameServices(item.services, normalizedServices));
      if (existing) {
        return prev.map((item) =>
          item.product.id === product.id
            && item.processLevel === processLevel
            && sameServices(item.services, normalizedServices)
            ? { ...item, services: normalizedServices, quantity: item.quantity + 1, price: price * (item.quantity + 1) }
            : item
        );
      }
      return [...prev, { product, processLevel, services: normalizedServices, quantity: 1, price }];
    });
  };

  const removeFromCart = (productId: string, processLevel?: CartProcessLevel, services?: ValueAddedService[]) => {
    setItems((prev) => prev.filter((item) => !matchesLine(item, productId, processLevel, services)));
  };

  const updateQuantity = (productId: string, quantity: number, processLevel?: CartProcessLevel, services?: ValueAddedService[]) => {
    if (quantity <= 0) {
      removeFromCart(productId, processLevel, services);
      return;
    }
    setItems((prev) =>
      prev.map((item) =>
        matchesLine(item, productId, processLevel, services)
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

function sameServices(left: ValueAddedService[] | undefined, right: ValueAddedService[]) {
  const a = [...(left ?? [])].sort();
  return a.length === right.length && a.every((service, index) => service === right[index]);
}

function matchesLine(item: CartItem, productId: string, processLevel?: CartProcessLevel, services?: ValueAddedService[]) {
  return item.product.id === productId
    && (!processLevel || item.processLevel === processLevel)
    && (services === undefined || sameServices(item.services, services));
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within CartProvider');
  }
  return context;
}
