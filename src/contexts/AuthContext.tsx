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

  // Sync auth state on mount and whenever it changes. The optimistic
  // useState initializers above read localStorage for a fast first paint,
  // but this effect is what actually decides isAuthenticated - always by
  // asking the real backend session (check_session), never by trusting
  // localStorage alone.
  //
  // Previously, an "auto-login root admins to any property" shortcut (and
  // a similar one for any cached login) set isAuthenticated=true directly
  // from a localStorage snapshot of a PAST login response, without ever
  // confirming the CURRENT backend session was still valid for THIS
  // property. Once that snapshot went stale (expired session, browser
  // profile with an old/unrelated session cookie, etc.) the frontend kept
  // believing it was logged in while every real data call 401/403'd
  // against the actual backend - the exact "Access Denied on a page that
  // claims you're logged in" report this was rewritten to fix. This
  // mirrors the same class of bug already fixed once for the public-demo
  // anonymous-visitor path (see git history) - same fix, applied
  // consistently instead of leaving this one shortcut behind.
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
          return;
        }

        // SECURITY/CORRECTNESS (18 Aug 2026): a real session already exists
        // for this browser but just isn't authorized for THIS property
        // (session_property_mismatch) - do NOT fall through to demo
        // auto-login below. PHP session cookies are shared across every tab
        // on the same domain; login_user (which the demo path calls) issues
        // a fresh cookie, silently overwriting whatever real session was
        // active - including a root/tenant admin session open in a
        // completely different tab. This is exactly how a tab sitting on the
        // public-demo property could silently kick a Root Dashboard session
        // in another tab back to "logged in as the demo account," making the
        // dashboard show 0 tenants/properties and "session expired" even
        // right after a fresh, correct root-admin login elsewhere. Only
        // attempt demo auto-login when there's truly no session at all.
        if (data?.session_property_mismatch) {
          localStorage.removeItem(authKey());
          localStorage.removeItem(userKey());
          setIsAuthenticated(false);
          setCurrentUser(null);
          return;
        }

        // Public demo mode (12 Aug 2026, replaced with this simpler design
        // later the same day): a designated property (see
        // properties.is_public_demo) lets anonymous visitors in without a
        // real login. The first version of this auto-created/overwrote the
        // session server-side on arbitrary GET requests - three rounds of
        // fixes there still left visitors intermittently stuck on "Access
        // Denied" for reasons that never reproduced in direct testing.
        // Replaced with a completely normal login_user POST using this
        // property's demo credentials (fetched from a public endpoint that
        // only ever returns a designated demo-only account, never a real
        // tenant's) - the exact same, thousands-of-times-a-day-tested code
        // path every real staff login uses, instead of a bespoke path only
        // demo visitors ever hit.
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
            return;
          }
        }
      } catch (e) {
        console.error('check_session/demo login failed:', e);
      }

      // No real backend session, and not a public demo property either -
      // clear any stale optimistic state from a previous, now-invalid
      // session so the login screen shows instead of a broken "logged in"
      // shell.
      localStorage.removeItem(authKey());
      localStorage.removeItem(userKey());
      setIsAuthenticated(false);
      setCurrentUser(null);
    };

    checkAuthState();

    // Listen for storage changes (e.g., from other tabs)
    window.addEventListener('storage', checkAuthState);
    // Same-tab equivalent (found 21 Aug 2026): 'storage' only fires in OTHER
    // tabs, never the one that made the change, so a real session ending
    // mid-session in THIS tab (session expired, or just-fixed Sign Out
    // Terminal - see router.php's 'logout' case) had nothing telling this
    // tab to re-check. apiFetch() in services/api.ts dispatches this event
    // on any 401 that isn't login_user/check_session itself.
    window.addEventListener('artists_farm_session_expired', checkAuthState);
    return () => {
      window.removeEventListener('storage', checkAuthState);
      window.removeEventListener('artists_farm_session_expired', checkAuthState);
    };
  }, []);

  const login = useCallback((staff: StaffMember) => {
    setIsAuthenticated(true);
    setCurrentUser(staff);
    setActiveRole(normalizeRole(staff.role || 'Staff'));
    localStorage.setItem(authKey(), 'true');
    localStorage.setItem(userKey(), JSON.stringify(staff));
  }, []);

  const logout = useCallback(() => {
    // Best-effort server-side invalidation (found 21 Aug 2026: this used to
    // be client-state-only - PHP session cookie stayed valid, so a plain
    // navigation silently re-authenticated the same user even after
    // "signing out". See router.php's 'logout' case for the full story).
    // Fire-and-forget: client-side state below still clears either way, so
    // a failed request here doesn't block the sign-out UX.
    apiFetch('/php/api/router.php?action=logout', { method: 'POST' }).catch(() => {});
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
