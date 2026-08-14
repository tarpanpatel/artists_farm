import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { InventoryItem, Requisition } from '../types';
import {
  fetchInventoryFromDB,
  updateInventoryStockInDB,
} from '../services/api';
import { useAuth } from './AuthContext';
import { useModules } from './ModulesContext';

interface InventoryContextValue {
  inventory: InventoryItem[];
  requisitions: Requisition[];
  lowStockCount: number;
  inventoryLoading: boolean;
  refreshInventory: () => Promise<void>;
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
  // Every "No catalog items found" / "No inventory items found" empty state
  // downstream (InventoryManagement.tsx, KitchenManagement.tsx) used to
  // render straight off `inventory.length === 0`, which is also true for
  // the split second before this context's very first fetch resolves -
  // found 14 Aug 2026, same class of bug as StaffManagement's staff/payees
  // tables. Defaults true so consumers can gate their empty state on it.
  const [inventoryLoading, setInventoryLoading] = useState(true);
  const currentUserName = currentUser?.name || 'Admin';

  const lowStockCount = inventory.filter((i) => i.currentStock <= i.minThreshold).length;

  const refreshInventory = useCallback(async () => {
    const data = await fetchInventoryFromDB();
    if (data && data.length > 0) setInventory(data); else setInventory([]);
    setInventoryLoading(false);
  }, []);

  useEffect(() => {
    if (isAuthenticated && isEnabled('kitchen')) {
      refreshInventory();
    } else {
      // Not going to fetch (unauthenticated, or kitchen module off) - don't
      // leave consumers stuck showing a spinner forever.
      setInventoryLoading(false);
    }
  }, [refreshInventory, isAuthenticated, isEnabled]);

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
        lowStockCount,
        inventoryLoading,
        refreshInventory,
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
