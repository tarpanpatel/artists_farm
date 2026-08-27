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
  /** True once the backend check_session call has resolved (success or fail).
   *  Use `authChecked && isAuthenticated` as the guard for data-fetching effects
   *  so they wait for the real session result, not just the optimistic
   *  localStorage snapshot. */
  authChecked: boolean;
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

  // authChecked starts false and flips to true ONLY once check_session (or the
  // demo-login fallback) has actually resolved. This is the reliable gate for
  // all data-fetching useEffects — isAuthenticated on its own is NOT enough
  // because it initialises optimistically from localStorage (for a fast first
  // paint) and can be true BEFORE the server confirms the session is still
  // valid, causing all the data-fetching effects to fire and get 401s.
  // Gating on `authChecked && isAuthenticated` means: "we have confirmed with
  // the backend that we are actually logged in right now."
  const [authChecked, setAuthChecked] = useState(false);

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

  // Sync auth state on mount and whenever it changes. The optimistic
  // useState initializers above read localStorage for a fast first paint,
  // but this effect is what actually decides isAuthenticated - always by
  // asking the real backend session (check_session), never by trusting
  // localStorage alone.
  useEffect(() => {
    const checkAuthState = async () => {
      try {
        const res = await apiFetch(`${API_ROOT_BASE}/php/api/router.php?action=check_session`);
        const data = await res.json();
        if (data?.authenticated && data?.user) {
          localStorage.setItem(authKey(), 'true');

          const user: StaffMember = {
            id: String(data.user.id ?? data.user.username),
            name: data.user.name || data.user.username,
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
          setAuthChecked(true);
          return;
        }

        // SECURITY/CORRECTNESS (18 Aug 2026): a real session already exists
        // for this browser but just isn't authorized for THIS property
        // (session_property_mismatch) - do NOT fall through to demo
        // auto-login below.
        if (data?.session_property_mismatch) {
          localStorage.removeItem(authKey());
          localStorage.removeItem(userKey());
          setIsAuthenticated(false);
          setCurrentUser(null);
          setAuthChecked(true);
          return;
        }

        // Public demo mode: a designated property lets anonymous visitors in
        // without a real login via demo credentials.
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
            localStorage.setItem(authKey(), 'true');

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
            setAuthChecked(true);
            return;
          }
        }
      } catch (e) {
        console.error('check_session/demo login failed:', e);
      }

      // No real backend session, and not a public demo property either.
      localStorage.removeItem(authKey());
      localStorage.removeItem(userKey());
      setIsAuthenticated(false);
      setCurrentUser(null);
      setAuthChecked(true);
    };

    checkAuthState();

    window.addEventListener('storage', checkAuthState);
    // Same-tab equivalent: 'storage' only fires in OTHER tabs, never the one
    // that made the change. apiFetch() dispatches this event on any 401 that
    // isn't login_user/check_session itself.
    window.addEventListener('artists_farm_session_expired', checkAuthState);
    return () => {
      window.removeEventListener('storage', checkAuthState);
      window.removeEventListener('artists_farm_session_expired', checkAuthState);
    };
  }, []);

  const login = useCallback((staff: StaffMember) => {
    setIsAuthenticated(true);
    setAuthChecked(true);
    setCurrentUser(staff);
    setActiveRole(normalizeRole(staff.role || 'Staff'));
    localStorage.setItem(authKey(), 'true');
    localStorage.setItem(userKey(), JSON.stringify(staff));
  }, []);

  const logout = useCallback(() => {
    // Best-effort server-side invalidation. Fire-and-forget: client-side
    // state below still clears either way, so a failed request here doesn't
    // block the sign-out UX.
    apiFetch('/php/api/router.php?action=logout', { method: 'POST' }).catch(() => {});
    setIsAuthenticated(false);
    setCurrentUser(null);
    localStorage.removeItem(authKey());
    localStorage.removeItem(userKey());
    localStorage.removeItem('artists_farm_user_session');
  }, []);

  return (
    <AuthContext.Provider value={{ currentUser, activeRole, isAuthenticated, authChecked, setActiveRole, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
