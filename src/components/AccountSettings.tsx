import React, { useState, useEffect } from 'react';
import { UserCog, User, Phone, Mail, ShieldCheck, KeyRound, Loader2, Save } from 'lucide-react';
import { Input } from './Input';
import { Button } from './Button';
import { useToast } from './ToastContext';

interface PlatformAdminProfile {
  id: number;
  username: string;
  full_name: string | null;
  phone_number: string | null;
  email: string | null;
  gstin: string | null;
}

interface AccountSettingsProps {
  username: string;
  onUsernameChange: (username: string) => void;
}

/**
 * Root Admin's own account settings: username, full name, phone, email, GSTIN
 * and passcode. Persists to the `users` table via the root-admin-only
 * get/update_platform_admin_profile router actions.
 */
export const AccountSettings: React.FC<AccountSettingsProps> = ({ username, onUsernameChange }) => {
  const { showToast } = useToast();

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Username and phone number are the SAME value everywhere else in the app
  // (staff, tenant users all log in with "Phone Number (Login Username)" as
  // one field - see StaffManagement.tsx) - this screen used to treat them as
  // two independently-editable fields, which is how a root admin account
  // could end up with a username that didn't match its own phone number
  // and therefore couldn't be typed into the numeric-only login field at
  // all. One field now; phone_number is sent identical to username.
  const [profileUsername, setProfileUsername] = useState(username);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [gstin, setGstin] = useState('');

  const [currentPasscode, setCurrentPasscode] = useState('');
  const [newPasscode, setNewPasscode] = useState('');
  const [confirmPasscode, setConfirmPasscode] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/php/api/router.php?action=get_platform_admin_profile', { credentials: 'include' });
        const json = await res.json();
        if (json.success && json.data) {
          const p: PlatformAdminProfile = json.data;
          setProfileUsername(p.username);
          setFullName(p.full_name || '');
          setEmail(p.email || '');
          setGstin(p.gstin || '');
        } else {
          showToast(json.message || 'Failed to load account details', { type: 'error' });
        }
      } catch (err) {
        console.error('Failed to load account settings:', err);
        showToast('Failed to load account details', { type: 'error' });
      } finally {
        setIsLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSave = async () => {
    if (!profileUsername.trim()) {
      showToast('Username is required', { type: 'warning' });
      return;
    }
    if (!/^\d{10}$/.test(profileUsername.trim())) {
      showToast('Username must be your 10-digit phone number - it doubles as your login (the login screen only accepts digits)', { type: 'warning' });
      return;
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      showToast('Please enter a valid email address', { type: 'warning' });
      return;
    }
    if (gstin && !/^[0-9A-Z]{15}$/.test(gstin)) {
      showToast('GSTIN must be 15 alphanumeric characters (e.g. 27ABCDE1234F1Z5)', { type: 'warning' });
      return;
    }
    if (newPasscode) {
      if (!/^\d{6}$/.test(newPasscode)) {
        showToast('New passcode must be exactly 6 digits', { type: 'warning' });
        return;
      }
      if (newPasscode !== confirmPasscode) {
        showToast('New passcodes do not match', { type: 'warning' });
        return;
      }
    }

    setIsSaving(true);
    try {
      const res = await fetch('/php/api/router.php?action=update_platform_admin_profile', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: profileUsername.trim(),
          full_name: fullName.trim(),
          phone_number: profileUsername.trim(),
          email: email.trim(),
          gstin: gstin.trim().toUpperCase(),
          current_passcode: currentPasscode,
          new_passcode: newPasscode,
        }),
      });
      const json = await res.json();
      if (json.success) {
        showToast(json.message || 'Account details updated', { type: 'success' });
        onUsernameChange(profileUsername.trim());
        setCurrentPasscode('');
        setNewPasscode('');
        setConfirmPasscode('');
      } else {
        showToast(json.message || 'Failed to update account details', { type: 'error' });
      }
    } catch (err) {
      console.error('Failed to save account settings:', err);
      showToast('Failed to update account details', { type: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return <div className="account-settings__loading p-8 text-center text-slate-400 dark:text-slate-500 text-sm">Loading account settings...</div>;
  }

  return (
    <div className="account-settings space-y-4">
      {/* Profile Details */}
      <div className="account-settings__section account-settings__section--profile bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5">
        <h3 className="account-settings__section-title text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2 mb-1">
          <UserCog className="account-settings__section-icon w-4 h-4 text-blue-500" /> Profile Details
        </h3>
        <p className="account-settings__section-desc text-xs text-slate-500 dark:text-slate-400 mb-4">
          Your platform login and contact details. GSTIN appears on the platform owner's records and can be edited anytime.
        </p>

        <div className="account-settings__grid grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="account-settings__field">
            <Input
              label="Phone Number (Login Username)"
              type="tel"
              maxLength={10}
              value={profileUsername}
              onChange={(e) => setProfileUsername(e.target.value.replace(/\D/g, '').slice(0, 10))}
              placeholder="10-digit mobile number"
              inputMode="numeric"
              leftIcon={<Phone className="w-4 h-4" />}
              helperText="Used to log in - same value everywhere in the app, no separate username. Changing it takes effect immediately."
            />
          </div>
          <div className="account-settings__field">
            <Input
              label="Full Name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="e.g. Root Admin"
              leftIcon={<User className="w-4 h-4" />}
            />
          </div>
          <div className="account-settings__field">
            <Input
              label="Root Admin Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              leftIcon={<Mail className="w-4 h-4" />}
            />
          </div>
          <div className="account-settings__field account-settings__field--full sm:col-span-2">
            <Input
              label="GSTIN"
              value={gstin}
              onChange={(e) => setGstin(e.target.value.toUpperCase())}
              placeholder="e.g. 27ABCDE1234F1Z5"
              leftIcon={<ShieldCheck className="w-4 h-4" />}
              helperText="15-character GST identification number (auto-uppercased)."
            />
          </div>
        </div>
      </div>

      {/* Passcode */}
      <div className="account-settings__section account-settings__section--passcode bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5">
        <h3 className="account-settings__section-title text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2 mb-1">
          <KeyRound className="account-settings__section-icon w-4 h-4 text-amber-500" /> Change Passcode
        </h3>
        <p className="account-settings__section-desc text-xs text-slate-500 dark:text-slate-400 mb-4">
          Leave the passcode fields blank to keep your current passcode. The current passcode is required to set a new one.
        </p>

        <div className="account-settings__grid grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="account-settings__field">
            <Input
              label="Current Passcode"
              type="password"
              value={currentPasscode}
              onChange={(e) => setCurrentPasscode(e.target.value)}
              placeholder="6-digit passcode"
              inputMode="numeric"
            />
          </div>
          <div className="account-settings__field">
            <Input
              label="New Passcode"
              type="password"
              value={newPasscode}
              onChange={(e) => setNewPasscode(e.target.value)}
              placeholder="6-digit passcode"
              inputMode="numeric"
            />
          </div>
          <div className="account-settings__field">
            <Input
              label="Confirm New Passcode"
              type="password"
              value={confirmPasscode}
              onChange={(e) => setConfirmPasscode(e.target.value)}
              placeholder="Repeat new passcode"
              inputMode="numeric"
            />
          </div>
        </div>
      </div>

      <div className="account-settings__actions flex flex-wrap items-center gap-3">
        <Button variant="primary" size="md" onClick={handleSave} disabled={isSaving}>
          {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {isSaving ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>
    </div>
  );
};
