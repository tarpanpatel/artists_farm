import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Order } from '../types';
import { fetchOrdersFromDB } from '../services/api';
import { useAuth } from './AuthContext';
import { useModules } from './ModulesContext';

interface KitchenContextValue {
  orders: Order[];
  pendingOrdersCount: number;
  ordersLoading: boolean;
  refreshOrders: () => Promise<void>;
  addOrder: (order: Order) => void;
  updateOrderStatus: (orderId: string, status: Order['status']) => void;
}

interface KitchenProviderProps {
  children: React.ReactNode;
}

const KitchenContext = createContext<KitchenContextValue | null>(null);

export const useKitchenContext = (): KitchenContextValue => {
  const ctx = useContext(KitchenContext);
  if (!ctx) throw new Error('useKitchenContext must be used within KitchenProvider');
  return ctx;
};

export const KitchenProvider: React.FC<KitchenProviderProps> = ({ children }) => {
  const { isAuthenticated } = useAuth();
  const { isEnabled } = useModules();
  const [orders, setOrders] = useState<Order[]>([]);
  // Same fix as InventoryContext (14 Aug 2026): downstream empty states
  // ("No food orders", KDS/POS boards) rendered off `orders.length === 0`
  // before the first fetch ever resolved. Defaults true so consumers can
  // gate on it.
  const [ordersLoading, setOrdersLoading] = useState(true);

  const refreshOrders = useCallback(async () => {
    const data = await fetchOrdersFromDB();
    if (data && data.length > 0) setOrders(data); else setOrders([]);
    setOrdersLoading(false);
  }, []);

  useEffect(() => {
    if (isAuthenticated && isEnabled('kitchen')) {
      refreshOrders();
    } else {
      setOrdersLoading(false);
    }
  }, [refreshOrders, isAuthenticated, isEnabled]);

  const pendingOrdersCount = orders.filter((o) => o.status === 'Pending' || o.status === 'Preparing').length;

  const addOrder = (newOrder: Order) => {
    setOrders((prev) => [newOrder, ...prev]);
  };

  const updateOrderStatus = (orderId: string, status: Order['status']) => {
    setOrders((prev) =>
      prev.map((o) => (o.id === orderId ? { ...o, status } : o))
    );
  };

  return (
    <KitchenContext.Provider
      value={{
        orders,
        pendingOrdersCount,
        ordersLoading,
        refreshOrders,
        addOrder,
        updateOrderStatus,
      }}
    >
      {children}
    </KitchenContext.Provider>
  );
};
