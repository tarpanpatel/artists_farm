import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { PettyCashEntry } from '../types';
import {
  fetchExpensesFromDB,
  addExpenseToDB,
  updateExpenseInDB,
  deleteExpenseFromDB,
} from '../services/api';
import { useAuth } from './AuthContext';

interface FinanceContextValue {
  pettyCash: PettyCashEntry[];
  refreshPettyCash: () => Promise<void>;
  addPettyCash: (entry: PettyCashEntry) => void;
  updatePettyCash: (entry: PettyCashEntry) => void;
  deletePettyCash: (id: string) => void;
}

interface FinanceProviderProps {
  children: React.ReactNode;
  onLogAudit?: (action: string, extra?: any) => void;
  currentUser?: { name?: string } | null;
}

const FinanceContext = createContext<FinanceContextValue | null>(null);

export const useFinance = (): FinanceContextValue => {
  const ctx = useContext(FinanceContext);
  if (!ctx) throw new Error('useFinance must be used within FinanceProvider');
  return ctx;
};

export const FinanceProvider: React.FC<FinanceProviderProps> = ({
  children,
  onLogAudit,
  currentUser,
}) => {
  const { isAuthenticated } = useAuth();
  const [pettyCash, setPettyCash] = useState<PettyCashEntry[]>([]);

  const refreshPettyCash = useCallback(async () => {
    const data = await fetchExpensesFromDB();
    if (data && data.length > 0) setPettyCash(data); else setPettyCash([]);
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      refreshPettyCash();
    }
  }, [refreshPettyCash, isAuthenticated]);

  const addPettyCash = (entry: PettyCashEntry) => {
    setPettyCash((prev) => [entry, ...prev]);
    addExpenseToDB(entry);
    const currentUserName = currentUser?.name || 'Admin';
    onLogAudit?.(`${currentUserName} recorded petty cash ${entry.type}: ₹${entry.amount} - ${entry.description}`);
  };

  const updatePettyCash = (entry: PettyCashEntry) => {
    const oldEntry = pettyCash.find(e => e.id === entry.id);
    const changes: string[] = [];
    if (oldEntry) {
      if (entry.amount !== undefined && entry.amount !== oldEntry.amount) changes.push(`amount from ₹${oldEntry.amount} to ₹${entry.amount}`);
      if (entry.description !== undefined && entry.description !== oldEntry.description) changes.push(`description from "${oldEntry.description}" to "${entry.description}"`);
      if (entry.vendor !== undefined && entry.vendor !== oldEntry.vendor) changes.push(`vendor from "${oldEntry.vendor || ''}" to "${entry.vendor || ''}"`);
      if (entry.category !== undefined && entry.category !== oldEntry.category) changes.push(`category from "${oldEntry.category || ''}" to "${entry.category || ''}"`);
    }
    const detail = changes.length > 0 ? changes.join(', ') : `petty cash entry #${entry.id}`;
    const currentUserName = currentUser?.name || 'Admin';
    setPettyCash((prev) => prev.map((e) => (e.id === entry.id ? entry : e)));
    updateExpenseInDB(entry);
    onLogAudit?.(`${currentUserName} updated ${detail}`);
  };

  const deletePettyCash = (id: string) => {
    const oldEntry = pettyCash.find(e => e.id === id);
    const detail = oldEntry ? ` #${id}: ₹${oldEntry.amount} - "${oldEntry.description}"` : ` #${id}`;
    const currentUserName = currentUser?.name || 'Admin';
    setPettyCash((prev) => prev.filter((e) => e.id !== id));
    deleteExpenseFromDB(id);
    onLogAudit?.(`${currentUserName} deleted petty cash entry${detail}`);
  };

  return (
    <FinanceContext.Provider
      value={{
        pettyCash,
        refreshPettyCash,
        addPettyCash,
        updatePettyCash,
        deletePettyCash,
      }}
    >
      {children}
    </FinanceContext.Provider>
  );
};
