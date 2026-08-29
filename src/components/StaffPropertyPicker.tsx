/**
 * Staff Property Switcher Modal
 * Enables multi-property staff users to switch active property contexts seamlessly.
 */
import React, { useEffect, useState } from 'react';
import { Building2, Layers, Home, ExternalLink, LogOut, Loader2, ArrowLeft } from './icons/FlowbiteIcons';
import { API_ROOT_BASE } from '../services/api';
import { StaffMember } from '../types';
import { t } from '../i18n/en';

interface PickerProperty {
  id: number;
  name: string;
  slug: string;
  property_type?: string;
  is_active: number;
}

interface StaffPropertyPickerProps {
  tenantId: number;
  tenantSlug: string;
  // Raw `user` object from the login_user/authenticate.php response - not yet a
  // StaffMember, since which property they're "at" isn't decided until they
  // pick one here.
  user: { id: string | number; username: string; name?: string; role?: string };
  onLogout: () => void;
  // Set only when this is shown mid-session (Header.tsx's Switch Property icon, for an
  // already-authenticated owner/access_all_properties account) rather than as part of the
  // login flow - gives this screen a way back to "stay where I was" that the login-flow
  // usage (no session yet to go back to) never needs, so it stays undefined there.
  onClose?: () => void;
}

// Shown after a staff member with `access_all_properties` logs in (see
// php/security/access_control.php + router.php/authenticate.php's login_user).
// Reuses TenantDashboard.tsx's property-card pattern per an explicit product
// decision (log in -> pick a property from a list -> work inside it, rather
// than a live in-app switcher) - see ROADMAP.md/git history, 11 Aug 2026.
export const StaffPropertyPicker: React.FC<StaffPropertyPickerProps> = ({
  tenantId,
  tenantSlug,
  user,
  onLogout,
  onClose,
}) => {
  const [properties, setProperties] = useState<PickerProperty[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_ROOT_BASE}/php/api/router.php?action=get_tenant_properties&tenant_id=${tenantId}`, {
          credentials: 'include',
        });
        const json = await res.json();
        if (!cancelled) {
          if (json.success && Array.isArray(json.data)) {
            setProperties(json.data.filter((p: PickerProperty) => p.is_active));
          } else {
            setError(json.message || t('staff_picker_load_error', 'Could not load properties for this account.'));
          }
        }
      } catch (err) {
        if (!cancelled) setError(t('staff_picker_load_error', 'Could not load properties for this account.'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [tenantId]);

  const handleSelectProperty = (property: PickerProperty) => {
    // Seed this specific property's namespaced localStorage keys (same format
    // AuthContext.tsx's authKey()/userKey() derive via getPropertySlug()) so the
    // full-page navigation below lands already authenticated - no second login
    // prompt, even though the browser has never been "on" this property's URL
    // before. The PHP session cookie (already set at login) is what actually
    // authorizes every API call from there; this just satisfies the client-side
    // gate that decides whether to render LoginPage (variant="terminal") at all.
    const slug = property.slug.toLowerCase();
    const staffMember: StaffMember = {
      id: String(user.id),
      name: user.name || user.username,
      username: user.username,
      role: user.role || 'Staff',
      phone: user.username,
      monthlySalary: 0,
      status: 'Active',
    };
    localStorage.setItem(`artists_farm_authenticated_${slug}`, 'true');
    localStorage.setItem(`artists_farm_user_${slug}`, JSON.stringify(staffMember));
    window.location.href = `${API_ROOT_BASE}/${tenantSlug}/${property.slug}/#dashboard`;
  };

  return (
    <div className="staff-property-picker min-h-screen bg-slate-50 dark:bg-slate-900 flex flex-col">
      {/* pt-[env(safe-area-inset-top)] (29 Aug 2026, user report + screenshot: header content
          overlapped by the phone's status bar) - same fix as TenantDashboard.tsx's header got
          27 Aug 2026 for the identical symptom; this in-flow (non-sticky) header had never gotten
          it. Added as extra top padding on top of the existing py-4, not a fixed h-[calc(...)]
          scheme - this header's height is already just "however tall its content is". */}
      <div className="staff-property-picker__header bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 px-6 pt-[calc(1rem+env(safe-area-inset-top,0px))] pb-4 flex items-center justify-between">
        <div className="staff-property-picker__user flex items-center gap-2.5">
          <div className="staff-property-picker__user-icon w-9 h-9 rounded-lg bg-gradient-to-br from-teal-100 to-emerald-100 dark:from-teal-900/40 dark:to-emerald-900/40 flex items-center justify-center">
            <Building2 className="w-5 h-5 text-teal-600 dark:text-teal-400" />
          </div>
          <div className="staff-property-picker__user-info">
            <p className="staff-property-picker__user-name text-sm font-semibold text-slate-900 dark:text-white">
              {t('staff_picker_heading', 'Choose a Property')}
            </p>
            <p className="staff-property-picker__user-role text-xs text-slate-500 dark:text-slate-400">
              {user.name || user.username}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {onClose && (
            <button
              onClick={onClose}
              className="staff-property-picker__back flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> {t('back_button', 'Back')}
            </button>
          )}
          <button
            onClick={onLogout}
            className="staff-property-picker__logout flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 transition-colors cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" /> {t('logout_button', 'Log Out')}
          </button>
        </div>
      </div>

      <div className="staff-property-picker__body flex-1 max-w-5xl w-full mx-auto px-6 py-8">
        <p className="staff-property-picker__subtitle text-sm text-slate-500 dark:text-slate-400 mb-6">
          {t('staff_picker_subtitle', 'This account can access every property under this tenant. Pick one to continue.')}
        </p>

        {loading ? (
          <div className="staff-property-picker__loading flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 text-slate-400 animate-spin" />
          </div>
        ) : error ? (
          <div className="staff-property-picker__error text-center py-16 text-red-600 dark:text-red-400 text-sm font-medium">{error}</div>
        ) : properties.length === 0 ? (
          <div className="staff-property-picker__empty text-center py-16 text-slate-500 dark:text-slate-400 text-sm font-medium">
            {t('staff_picker_no_properties', 'No active properties found for this tenant.')}
          </div>
        ) : (
          <div className="staff-property-picker__grid grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {properties.map((property) => {
              const isMultiKey = property.property_type === 'MULTI_KEY';
              return (
                <button
                  key={property.id}
                  onClick={() => handleSelectProperty(property)}
                  className="staff-property-picker__card text-left bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4 sm:p-6 shadow-md hover:shadow-md transition-all group cursor-pointer"
                >
                  <div className={`staff-property-picker__card-icon w-11 h-11 rounded-lg flex items-center justify-center shadow-sm mb-4 ${isMultiKey ? 'bg-gradient-to-br from-indigo-100 to-purple-100 dark:from-indigo-900/40 dark:to-purple-900/40' : 'bg-gradient-to-br from-teal-100 to-emerald-100 dark:from-teal-900/40 dark:to-emerald-900/40'}`}>
                    {isMultiKey ? (
                      <Layers className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                    ) : (
                      <Home className="w-5 h-5 text-teal-600 dark:text-teal-400" />
                    )}
                  </div>
                  <h3 className="staff-property-picker__card-name font-semibold text-slate-900 dark:text-white mb-1 group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors">
                    {property.name}
                  </h3>
                  <p className="staff-property-picker__card-slug text-xs text-slate-400 dark:text-slate-500 mb-3">/{property.slug}</p>
                  <div className="staff-property-picker__card-open flex items-center gap-1.5 text-xs font-semibold text-teal-600 dark:text-teal-400">
                    <ExternalLink className="w-3 h-3" /> {t('open_dashboard_link', 'Open Property')}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
