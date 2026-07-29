import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Order } from '../types';
import { fetchOrdersFromDB } from '../services/api';

interface KitchenContextValue {
  orders: Order[];
  pendingOrdersCount: number;
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
  const [orders, setOrders] = useState<Order[]>([]);

  const refreshOrders = useCallback(async () => {
    const data = await fetchOrdersFromDB();
    if (data && data.length > 0) setOrders(data); else setOrders([]);
  }, []);

  useEffect(() => {
    refreshOrders();
  }, [refreshOrders]);

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
        refreshOrders,
        addOrder,
        updateOrderStatus,
      }}
    >
      {children}
    </KitchenContext.Provider>
  );
};
