import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { StaffMember } from '../types';
import { getPropertySlug } from '../services/api';

// Normalize role string from backend (e.g., 'super_admin' -> 'Super Admin')
function normalizeRole(role: string): string {
  if (!role) return 'Super Admin';
  return role
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

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
      const value = localStorage.getItem(authKey());
      return value === 'true';
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
          if (parsed && parsed.role) return normalizeRole(parsed.role);
        } catch (e) {}
      }
    }
    return 'Super Admin';
  });

  // Sync auth state with localStorage on mount and whenever it changes
  useEffect(() => {
    const checkAuthState = () => {
      const key = authKey();

      // Check property-specific auth key first
      let authValue = localStorage.getItem(key);
      let isAuth = authValue === 'true';

      // Fallback to generic session if property-specific auth not found
      // (for users coming from LoginPage redirect or root admin auto-login)
      if (!isAuth) {
        const genericSession = localStorage.getItem('artists_farm_user_session');
        if (genericSession) {
          try {
            const session = JSON.parse(genericSession);

            // Auto-login root admins to any property
            if (session.is_platform_admin) {
              localStorage.setItem(key, 'true');
              isAuth = true;

              // Create root admin session for this property
              const user: StaffMember = {
                id: session.username,
                name: session.username,
                username: session.username,
                role: 'root_admin', // Root admin has full access to any property
              };
              localStorage.setItem(userKey(), JSON.stringify(user));
              setIsAuthenticated(true);
              setCurrentUser(user);
              setActiveRole(normalizeRole('root_admin'));
              return;
            }

            // Regular user login
            localStorage.setItem(key, 'true');
            isAuth = true;

            const user: StaffMember = {
              id: session.username,
              name: session.username,
              username: session.username,
              role: session.role || 'Staff',
            };
            localStorage.setItem(userKey(), JSON.stringify(user));
            setIsAuthenticated(true);
            setCurrentUser(user);
            setActiveRole(normalizeRole(user.role || 'Staff'));
            return;
          } catch (e) {
            console.error('Failed to parse generic session:', e);
          }
        }
      }

      setIsAuthenticated(isAuth);

      if (isAuth) {
        const savedUser = localStorage.getItem(userKey());
        if (savedUser) {
          try {
            const user = JSON.parse(savedUser);
            setCurrentUser(user);
            setActiveRole(normalizeRole(user.role || 'Staff'));
          } catch (e) {}
        }
      }
    };

    checkAuthState();

    // Listen for storage changes (e.g., from other tabs)
    window.addEventListener('storage', checkAuthState);
    return () => window.removeEventListener('storage', checkAuthState);
  }, []);

  const login = useCallback((staff: StaffMember) => {
    setIsAuthenticated(true);
    setCurrentUser(staff);
    setActiveRole(normalizeRole(staff.role || 'Staff'));
    localStorage.setItem(authKey(), 'true');
    localStorage.setItem(userKey(), JSON.stringify(staff));
  }, []);

  const logout = useCallback(() => {
    setIsAuthenticated(false);
    setCurrentUser(null);
    localStorage.removeItem(authKey());
    localStorage.removeItem(userKey());
    // Also clear generic session for consistency
    localStorage.removeItem('artists_farm_user_session');
  }, []);
  return (
    <AuthContext.Provider value={{ currentUser, activeRole, isAuthenticated, setActiveRole, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
