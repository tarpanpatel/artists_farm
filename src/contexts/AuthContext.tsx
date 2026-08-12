import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { StaffMember } from '../types';
import { getPropertySlug, apiFetch, API_ROOT_BASE } from '../services/api';

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
    const checkAuthState = async () => {
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
                name: session.name || session.username,
                username: session.username,
                role: 'root_admin', // Root admin has full access to any property
                phone: session.phone_number || session.username || '',
                monthlySalary: 0,
                status: 'Active',
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
              name: session.name || session.username,
              username: session.username,
              role: session.role || 'Staff',
              phone: session.phone_number || session.username || '',
              monthlySalary: 0,
              status: 'Active',
            };
            localStorage.setItem(userKey(), JSON.stringify(user));
            setIsAuthenticated(true);
            setCurrentUser(user);
            setActiveRole(normalizeRole(user.role || 'Staff'));
            return;
          } catch (e) {
            console.error('Failed to parse generic session:', e);
          }
        } else {
          try {
            const res = await apiFetch(`${API_ROOT_BASE}/php/api/router.php?action=check_session`);
            const data = await res.json();
            if (data?.authenticated && data?.user) {
              localStorage.setItem(key, 'true');
              isAuth = true;

              const user: StaffMember = {
                id: String(data.user.id ?? data.user.username),
                name: data.user.username,
                username: data.user.username,
                role: data.user.role || 'Staff',
                phone: data.user.username,
                monthlySalary: 0,
                status: 'Active',
              };
              localStorage.setItem(userKey(), JSON.stringify(user));
              setIsAuthenticated(true);
              setCurrentUser(user);
              setActiveRole(normalizeRole(user.role));
              return;
            }

            // Public demo mode (12 Aug 2026, replaced with this simpler
            // design later the same day): a designated property (see
            // properties.is_public_demo) lets anonymous visitors in without
            // a real login. The first version of this auto-created/
            // overwrote the session server-side on arbitrary GET requests -
            // three rounds of fixes there still left visitors intermittently
            // stuck on "Access Denied" for reasons that never reproduced in
            // direct testing. Replaced with a completely normal login_user
            // POST using this property's demo credentials (fetched from a
            // public endpoint that only ever returns a designated demo-only
            // account, never a real tenant's) - the exact same, thousands-
            // of-times-a-day-tested code path every real staff login uses,
            // instead of a bespoke path only demo visitors ever hit.
            const propertySlug = getPropertySlug();
            const credsRes = await apiFetch(
              `${API_ROOT_BASE}/php/api/router.php?action=get_demo_login_credentials&property_slug=${encodeURIComponent(propertySlug)}`
            );
            const creds = await credsRes.json();
            if (creds?.success && creds?.username && creds?.passcode) {
              const loginRes = await fetch(`${API_ROOT_BASE}/php/api/router.php?action=login_user`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ mobile_number: creds.username, passcode: creds.passcode }),
              });
              const loginData = await loginRes.json();
              if (loginData?.success && loginData?.user) {
                localStorage.setItem(key, 'true');
                isAuth = true;

                const user: StaffMember = {
                  id: String(loginData.user.id ?? loginData.user.username),
                  name: loginData.user.name || loginData.user.username,
                  username: loginData.user.username,
                  role: loginData.user.role || 'Staff',
                  phone: loginData.user.username,
                  monthlySalary: 0,
                  status: 'Active',
                };
                localStorage.setItem(userKey(), JSON.stringify(user));
                setIsAuthenticated(true);
                setCurrentUser(user);
                setActiveRole(normalizeRole(user.role));
                return;
              }
            }
          } catch (e) {
            console.error('check_session/demo login failed:', e);
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
