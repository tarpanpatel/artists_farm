import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { InventoryItem, Requisition } from '../types';
import {
  fetchInventoryFromDB,
  updateInventoryStockInDB,
  fetchStockRequestsFromDB,
  StockRequestSheet,
} from '../services/api';
import { useAuth } from './AuthContext';
import { useModules } from './ModulesContext';

interface InventoryContextValue {
  inventory: InventoryItem[];
  requisitions: Requisition[];
  stockRequests: StockRequestSheet[];
  pendingStockRequestsCount: number;
  lowStockCount: number;
  inventoryLoading: boolean;
  refreshInventory: () => Promise<void>;
  refreshStockRequests: () => Promise<void>;
  updateStock: (itemId: string, newStock: number) => void;
  addInventoryItem: (item: InventoryItem) => void;
  updateInventoryItemImage: (itemId: string, imagePath: string) => void;
  addRequisition: (req: Requisition) => void;
}

interface InventoryProviderProps {
  children: React.ReactNode;
  onLogAudit?: (action: string, extra?: any) => void;
  currentUser?: { name?: string } | null;
}

const InventoryContext = createContext<InventoryContextValue | null>(null);

export const useInventoryContext = (): InventoryContextValue => {
  const ctx = useContext(InventoryContext);
  if (!ctx) throw new Error('useInventoryContext must be used within InventoryProvider');
  return ctx;
};

export const InventoryProvider: React.FC<InventoryProviderProps> = ({
  children,
  onLogAudit,
  currentUser,
}) => {
  const { isAuthenticated } = useAuth();
  const { isEnabled } = useModules();
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [requisitions, setRequisitions] = useState<Requisition[]>([]);
  const [stockRequests, setStockRequests] = useState<StockRequestSheet[]>([]);
  const [inventoryLoading, setInventoryLoading] = useState(true);
  const currentUserName = currentUser?.name || 'Admin';

  const lowStockCount = inventory.filter((i) => i.currentStock <= i.minThreshold).length;
  const pendingStockRequestsCount = stockRequests.filter((r) => (r.status || '').toUpperCase() === 'PENDING').length;

  const refreshInventory = useCallback(async () => {
    const data = await fetchInventoryFromDB();
    if (data && data.length > 0) setInventory(data); else setInventory([]);
    setInventoryLoading(false);
  }, []);

  const refreshStockRequests = useCallback(async () => {
    const data = await fetchStockRequestsFromDB();
    if (data && data.length > 0) setStockRequests(data); else setStockRequests([]);
  }, []);

  useEffect(() => {
    if (isAuthenticated && isEnabled('kitchen')) {
      refreshInventory();
      refreshStockRequests();
    } else {
      setInventoryLoading(false);
    }
  }, [refreshInventory, refreshStockRequests, isAuthenticated, isEnabled]);

  const updateStock = (itemId: string, newStock: number) => {
    const item = inventory.find((i) => i.id === itemId);
    const oldStock = item ? item.currentStock : 0;
    setInventory((prev) =>
      prev.map((i) => (i.id === itemId ? { ...i, currentStock: newStock } : i))
    );
    updateInventoryStockInDB(itemId, newStock);
    onLogAudit?.(`${currentUserName} updated stock of ${item?.name || itemId} from ${oldStock} ${item?.unit || ''} to ${newStock} ${item?.unit || ''}`);
  };

  const addInventoryItem = (item: InventoryItem) => {
    setInventory((prev) => [...prev, item]);
    onLogAudit?.(`${currentUserName} added new inventory catalog item: ${item.name}`);
  };

  const updateInventoryItemImage = (itemId: string, imagePath: string) => {
    setInventory((prev) =>
      prev.map((i) => (i.id === itemId ? { ...i, imagePath } : i))
    );
    const item = inventory.find((i) => i.id === itemId);
    onLogAudit?.(`${currentUserName} updated image for inventory item ${item?.name || itemId}`);
  };

  const addRequisition = (req: Requisition) => {
    setRequisitions((prev) => [req, ...prev]);
    onLogAudit?.(`${currentUserName} created material requisition ${req.id} for ${req.requestedQty} ${req.unit} of ${req.itemName}`);
  };

  return (
    <InventoryContext.Provider
      value={{
        inventory,
        requisitions,
        stockRequests,
        pendingStockRequestsCount,
        lowStockCount,
        inventoryLoading,
        refreshInventory,
        refreshStockRequests,
        updateStock,
        addInventoryItem,
        updateInventoryItemImage,
        addRequisition,
      }}
    >
      {children}
    </InventoryContext.Provider>
  );
};
