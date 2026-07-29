import React, { createContext, useContext, useState, useCallback } from 'react';
import { StaffMember } from '../types';

interface AuthContextValue {
  currentUser: StaffMember | null;
  activeRole: string;
  isAuthenticated: boolean;
  setActiveRole: (role: string) => void;
  login: (staff: StaffMember) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('artists_farm_authenticated') === 'true';
    }
    return false;
  });

  const [currentUser, setCurrentUser] = useState<StaffMember | null>(() => {
    if (typeof window !== 'undefined') {
      const savedUser = localStorage.getItem('artists_farm_user');
      if (savedUser) {
        try { return JSON.parse(savedUser); } catch (e) {}
      }
    }
    return null;
  });

  const [activeRole, setActiveRole] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const savedUser = localStorage.getItem('artists_farm_user');
      if (savedUser) {
        try {
          const parsed = JSON.parse(savedUser);
          if (parsed && parsed.role) return parsed.role;
        } catch (e) {}
      }
    }
    return 'Super Admin';
  });

  const login = useCallback((staff: StaffMember) => {
    setIsAuthenticated(true);
    setCurrentUser(staff);
    setActiveRole(staff.role || 'Staff');
    localStorage.setItem('artists_farm_authenticated', 'true');
    localStorage.setItem('artists_farm_user', JSON.stringify(staff));
  }, []);

  const logout = useCallback(() => {
    setIsAuthenticated(false);
    setCurrentUser(null);
    localStorage.removeItem('artists_farm_authenticated');
    localStorage.removeItem('artists_farm_user');
  }, []);

  return (
    <AuthContext.Provider value={{ currentUser, activeRole, isAuthenticated, setActiveRole, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
