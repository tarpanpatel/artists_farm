import React, { useState, useEffect } from 'react';
import { Card } from 'flowbite-react';
import { UserCog, User, Phone, Mail, ShieldCheck, KeyRound, Loader2, Save } from './icons/FlowbiteIcons';
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
  onLogout: () => void;
}

/**
 * Root Admin's own account settings: username, full name, phone, email, GSTIN
 * and passcode. Persists to the `users` table via the root-admin-only
 * get/update_platform_admin_profile router actions.
 */
export const AccountSettings: React.FC<AccountSettingsProps> = ({ username, onUsernameChange, onLogout }) => {
  const { showToast } = useToast();

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const [profileUsername, setProfileUsername] = useState(username);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [gstin, setGstin] = useState('');

  const [currentPasscode, setCurrentPasscode] = useState('');
  const [newPasscode, setNewPasscode] = useState('');
  const [confirmPasscode, setConfirmPasscode] = useState('');

  // Real-time validation feedback (Flowbite forms.md validation states) - flags a mismatch as
  // soon as both fields have something typed, rather than only on Save.
  const newPasscodeInvalid = newPasscode.length > 0 && !/^\d{6}$/.test(newPasscode);
  const passcodeMismatch = newPasscode.length > 0 && confirmPasscode.length > 0 && newPasscode !== confirmPasscode;
  const passcodeMatch = newPasscode.length > 0 && confirmPasscode.length > 0 && newPasscode === confirmPasscode;

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/php/api/router.php?action=get_platform_admin_profile', { credentials: 'include' });
        if (res.status === 401 || res.status === 403) {
          // Same fix as RootAdminDashboard.tsx's loadNavItems() (23 Aug 2026) -
          // an expired session must not leave this form silently sitting on
          // empty/default values, go straight back to login instead.
          onLogout();
          return;
        }
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
          phone_number: profileUsername.trim(),
          full_name: fullName.trim() || null,
          email: email.trim() || null,
          gstin: gstin.trim() || null,
          current_passcode: currentPasscode || undefined,
          new_passcode: newPasscode || undefined,
        }),
      });
      const json = await res.json();
      if (json.success) {
        showToast('Account details saved successfully', { type: 'success' });
        if (profileUsername.trim() !== username) {
          onUsernameChange(profileUsername.trim());
        }
        setCurrentPasscode('');
        setNewPasscode('');
        setConfirmPasscode('');
      } else {
        showToast(json.message || 'Failed to save account details', { type: 'error' });
      }
    } catch (err) {
      console.error('Failed to save account settings:', err);
      showToast('Failed to save account details', { type: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="account-settings flex items-center justify-center p-12 text-gray-500 dark:text-gray-400">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        <span>Loading account details...</span>
      </div>
    );
  }

  return (
    <div className="account-settings space-y-6 max-w-3xl">
      {/* Profile Details */}
      <Card className="account-settings__section border-gray-200 dark:border-gray-700">
        <h3 className="account-settings__section-title text-base font-bold text-gray-900 dark:text-white flex items-center gap-2 mb-1">
          <UserCog className="account-settings__section-icon w-5 h-5 text-blue-600 dark:text-blue-400" /> Platform Admin Profile
        </h3>
        <p className="account-settings__section-desc text-xs text-gray-500 dark:text-gray-400 mb-4">
          Personal details and contact information for your root administrative account.
        </p>

        <div className="account-settings__grid grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="account-settings__field">
            <Input
              label="Phone Number (Login Username)"
              type="tel"
              value={profileUsername}
              // No maxLength - see GuestManagement.tsx's onChange comment (23 Aug 2026): it
              // truncates raw typed characters before digit-stripping runs, silently dropping
              // trailing digits from any formatted phone number.
              onChange={(e) => setProfileUsername(e.target.value.replace(/\D/g, '').slice(0, 10))}
              placeholder="10-digit mobile number"
              inputMode="numeric"
              leftIcon={<Phone className="w-4 h-4" />}
              helperText="Used to log in - same value everywhere in the app, no separate username."
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
      </Card>

      {/* Passcode */}
      <Card className="account-settings__section border-gray-200 dark:border-gray-700">
        <h3 className="account-settings__section-title text-base font-bold text-gray-900 dark:text-white flex items-center gap-2 mb-1">
          <KeyRound className="account-settings__section-icon w-5 h-5 text-amber-500" /> Change Passcode
        </h3>
        <p className="account-settings__section-desc text-xs text-gray-500 dark:text-gray-400 mb-4">
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
              error={newPasscodeInvalid ? 'Must be exactly 6 digits' : undefined}
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
              error={passcodeMismatch ? "Passcodes don't match" : undefined}
              success={passcodeMatch ? 'Passcodes match' : undefined}
            />
          </div>
        </div>
      </Card>

      <div className="account-settings__actions flex flex-wrap items-center gap-3">
        <Button variant="primary" size="md" onClick={handleSave} disabled={isSaving}>
          {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {isSaving ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>
    </div>
  );
};
