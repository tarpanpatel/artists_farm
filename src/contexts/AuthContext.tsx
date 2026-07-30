import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { StaffMember } from '../types';
import { getPropertySlug } from '../services/api';

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

// Session keys are namespaced per property so logging out of one property
// (e.g. /goa/) doesn't clear the session of another (e.g. /jaipur/) sharing
// the same browser origin.
const authKey = () => `artists_farm_authenticated_${getPropertySlug()}`;
const userKey = () => `artists_farm_user_${getPropertySlug()}`;

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem(authKey()) === 'true';
    }
    return false;
  });

  const [currentUser, setCurrentUser] = useState<StaffMember | null>(() => {
    if (typeof window !== 'undefined') {
      const savedUser = localStorage.getItem(userKey());
      if (savedUser) {
        try { return JSON.parse(savedUser); } catch (e) {}
      }
    }
    return null;
  });

  const [activeRole, setActiveRole] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const savedUser = localStorage.getItem(userKey());
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
    localStorage.setItem(authKey(), 'true');
    localStorage.setItem(userKey(), JSON.stringify(staff));
  }, []);

  const logout = useCallback(() => {
    setIsAuthenticated(false);
    setCurrentUser(null);
    localStorage.removeItem(authKey());
    localStorage.removeItem(userKey());
  }, []);
  return (
    <AuthContext.Provider value={{ currentUser, activeRole, isAuthenticated, setActiveRole, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
