import React, { useState } from 'react';
import { AlertCircle, Lock, Phone, KeyRound, Building2, ShieldCheck, Mail, CheckCircle2, ArrowLeft } from 'lucide-react';
import { t } from '../i18n/en';

interface LoginPageProps {
  onLoginSuccess: (userData: {
    username: string;
    name?: string;
    role: string;
    is_platform_admin: boolean;
    default_tenant_id?: number;
  }) => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onLoginSuccess }) => {
  const [mobileNumber, setMobileNumber] = useState('');
  const [passcode, setPasscode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // First-login mandatory passcode change - set when the account was created
  // with a temporary passcode (e.g. new tenant welcome emails/WhatsApp
  // shares) and hasn't been changed yet.
  const [mustChangePasscode, setMustChangePasscode] = useState(false);
  const [pendingSession, setPendingSession] = useState<Parameters<LoginPageProps['onLoginSuccess']>[0] | null>(null);
  const [newPasscode, setNewPasscode] = useState('');
  const [confirmPasscode, setConfirmPasscode] = useState('');
  const [isSavingPasscode, setIsSavingPasscode] = useState(false);

  // "Forgot Password?" - emails the account's current username + passcode
  // to the tenant's email on file (passcodes are plaintext throughout this
  // app, so there's no reset-link/token flow, just a lookup + send).
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotMobile, setForgotMobile] = useState('');
  const [isSendingLoginInfo, setIsSendingLoginInfo] = useState(false);
  const [forgotResult, setForgotResult] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleMobileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Only allow numeric digits, max 10
    const val = e.target.value.replace(/\D/g, '').slice(0, 10);
    setMobileNumber(val);
    setError(null);
  };

  const handlePasscodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Only allow numeric digits, max 6
    const val = e.target.value.replace(/\D/g, '').slice(0, 6);
    setPasscode(val);
    setError(null);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (mobileNumber.length > 0 && mobileNumber.length < 10 && mobileNumber !== 'admin' && mobileNumber !== 'root') {
      setError('Please enter a valid 10-digit mobile number');
      return;
    }

    if (passcode.length < 6 && passcode !== '123456' && passcode !== 'admin') {
      setError('Please enter your 6-digit PIN passcode');
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch('/php/api/router.php?action=login_user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          mobile_number: mobileNumber,
          passcode: passcode,
        }),
      });

      const data = await response.json();

      if (data.success && data.user) {
        const sessionData = {
          username: data.user.username,
          name: data.user.name,
          role: data.user.role,
          is_platform_admin: data.user.is_platform_admin,
          default_tenant_id: data.user.default_tenant_id,
        };

        if (data.user.must_change_passcode) {
          // Don't establish the session yet - hold onto it until a new
          // passcode is set, matching the "temporary credentials can't be
          // used past first login" requirement.
          setPendingSession(sessionData);
          setMustChangePasscode(true);
          setIsLoading(false);
          return;
        }

        // Store session
        localStorage.setItem('artists_farm_user_session', JSON.stringify(sessionData));

        // Call success callback with session data (will trigger redirect)
        onLoginSuccess(sessionData);
      } else {
        setError(data.message || 'Login failed. Please check your credentials.');
        setPasscode('');
      }
    } catch (err) {
      console.error('Login error:', err);
      setError('Login failed. Please try again.');
      setPasscode('');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSetNewPasscode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!/^\d{6}$/.test(newPasscode)) {
      setError('New passcode must be exactly 6 digits');
      return;
    }
    if (newPasscode !== confirmPasscode) {
      setError('Passcodes do not match');
      return;
    }
    if (newPasscode === passcode) {
      setError('New passcode must be different from the temporary one');
      return;
    }

    setIsSavingPasscode(true);
    try {
      const response = await fetch('/php/api/router.php?action=force_set_passcode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          username: pendingSession?.username || mobileNumber,
          current_passcode: passcode,
          new_passcode: newPasscode,
        }),
      });
      const data = await response.json();

      if (data.success && pendingSession) {
        localStorage.setItem('artists_farm_user_session', JSON.stringify(pendingSession));
        onLoginSuccess(pendingSession);
      } else {
        setError(data.message || 'Failed to set new passcode. Please try again.');
      }
    } catch (err) {
      console.error('Set passcode error:', err);
      setError('Failed to set new passcode. Please try again.');
    } finally {
      setIsSavingPasscode(false);
    }
  };

  const handleRequestLoginInfo = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotResult(null);

    if (forgotMobile.length < 10 && forgotMobile !== 'admin' && forgotMobile !== 'root') {
      setForgotResult({ type: 'error', text: 'Enter your full 10-digit mobile number' });
      return;
    }

    setIsSendingLoginInfo(true);
    try {
      const response = await fetch('/php/api/router.php?action=request_login_info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: forgotMobile,
          login_url: window.location.origin + '/artists_farm/',
        }),
      });
      const data = await response.json();
      setForgotResult({
        type: data.success ? 'success' : 'error',
        text: data.message || (data.success ? 'Login info sent to your email' : 'Something went wrong. Please try again.'),
      });
    } catch (err) {
      console.error('Request login info error:', err);
      setForgotResult({ type: 'error', text: 'Failed to send. Please try again.' });
    } finally {
      setIsSendingLoginInfo(false);
    }
  };

  if (showForgotPassword) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 p-8">
          <div className="flex justify-center mb-6">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl shadow-md">
              <Mail className="w-8 h-8 text-white" />
            </div>
          </div>

          <h1 className="text-2xl font-extrabold text-gray-900 dark:text-white text-center tracking-tight">
            {t('forgot_passcode_title', 'Forgot Your Passcode?')}
          </h1>
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 text-center mb-8">
            {t('forgot_passcode_description', "Enter your mobile number and we'll email your login details to the address on file.")}
          </p>

          <form onSubmit={handleRequestLoginInfo} className="space-y-5">
            {forgotResult && (
              <div className={`flex gap-3 p-3 rounded-xl border ${
                forgotResult.type === 'success'
                  ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800'
                  : 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800'
              }`}>
                {forgotResult.type === 'success' ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                )}
                <p className={`text-xs font-medium ${
                  forgotResult.type === 'success' ? 'text-emerald-800 dark:text-emerald-300' : 'text-red-800 dark:text-red-300'
                }`}>
                  {forgotResult.text}
                </p>
              </div>
            )}

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-2">
                {t('mobile_username_label', 'Mobile Number / Username')}
              </label>
              <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5 text-gray-400 dark:text-gray-500">
                  <Phone className="w-4 h-4" />
                  <span className="text-xs font-bold text-gray-400 dark:text-gray-500 border-r border-gray-200 dark:border-gray-700 pr-2">+91</span>
                </div>
                <input
                  type="text"
                  value={forgotMobile}
                  onChange={(e) => {
                    setForgotMobile(e.target.value.replace(/\D/g, '').slice(0, 10));
                    setForgotResult(null);
                  }}
                  placeholder={t('mobile_number_placeholder', '10-digit Mobile Number')}
                  className="w-full pl-16 pr-4 py-3 rounded-xl border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-gray-900 dark:text-white font-semibold text-sm placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                  disabled={isSendingLoginInfo}
                  autoFocus
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isSendingLoginInfo || forgotMobile.length === 0}
              className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 text-white font-bold py-3 px-4 rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              {isSendingLoginInfo ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>{t('sending_button', 'Sending...')}</span>
                </>
              ) : (
                <>
                  <Mail className="w-4 h-4" />
                  <span>{t('send_login_info_button', 'Send Login Info')}</span>
                </>
              )}
            </button>
          </form>

          <div className="mt-6 text-center">
            <button
              onClick={() => {
                setShowForgotPassword(false);
                setForgotResult(null);
              }}
              className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> {t('back_to_login_button', 'Back to Login')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (mustChangePasscode) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 p-8">
          <div className="flex justify-center mb-6">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-amber-500 to-orange-600 rounded-2xl shadow-md">
              <ShieldCheck className="w-8 h-8 text-white" />
            </div>
          </div>

          <h1 className="text-2xl font-extrabold text-gray-900 dark:text-white text-center tracking-tight">
            {t('set_new_passcode_title', 'Set a New Passcode')}
          </h1>
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 text-center mb-8">
            You're using a temporary passcode. Choose a new 6-digit passcode to continue{pendingSession?.name ? `, ${pendingSession.name}` : ''}.
          </p>

          <form onSubmit={handleSetNewPasscode} className="space-y-5">
            {error && (
              <div className="flex gap-3 p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl">
                <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                <p className="text-xs font-medium text-red-800 dark:text-red-300">{error}</p>
              </div>
            )}

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-2">
                {t('new_passcode_label', 'New 6-Digit Passcode')}
              </label>
              <div className="relative">
                <KeyRound className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
                <input
                  type="password"
                  value={newPasscode}
                  onChange={(e) => setNewPasscode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="• • • • • •"
                  maxLength={6}
                  autoFocus
                  className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-gray-900 dark:text-white font-mono text-center tracking-[0.4em] font-bold text-lg placeholder-gray-400 focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none transition-all"
                  disabled={isSavingPasscode}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-2">
                {t('confirm_new_passcode_label', 'Confirm New Passcode')}
              </label>
              <div className="relative">
                <KeyRound className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
                <input
                  type="password"
                  value={confirmPasscode}
                  onChange={(e) => setConfirmPasscode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="• • • • • •"
                  maxLength={6}
                  className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-gray-900 dark:text-white font-mono text-center tracking-[0.4em] font-bold text-lg placeholder-gray-400 focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none transition-all"
                  disabled={isSavingPasscode}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isSavingPasscode || newPasscode.length !== 6 || confirmPasscode.length !== 6}
              className="w-full bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 disabled:opacity-50 text-white font-bold py-3 px-4 rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              {isSavingPasscode ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>{t('saving_button', 'Saving...')}</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  <span>{t('set_passcode_continue_button', 'Set Passcode & Continue')}</span>
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 p-8">
        {/* Logo */}
        <div className="flex justify-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl shadow-md">
            <Building2 className="w-8 h-8 text-white" />
          </div>
        </div>

        {/* Title */}
        <h1 className="text-2xl font-extrabold text-gray-900 dark:text-white text-center tracking-tight">
          Artists Farm
        </h1>
        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 text-center mb-8 uppercase tracking-wider">
          {t('login_subtitle', 'Mobile & Passcode Terminal Login')}
        </p>

        {/* Login Form */}
        <form onSubmit={handleLogin} className="space-y-5">
          {/* Error Message */}
          {error && (
            <div className="flex gap-3 p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl">
              <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs font-medium text-red-800 dark:text-red-300">{error}</p>
            </div>
          )}

          {/* Mobile Number Input */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-2">
              {t('mobile_username_label', 'Mobile Number / Username')}
            </label>
            <div className="relative">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5 text-gray-400 dark:text-gray-500">
                <Phone className="w-4 h-4" />
                <span className="text-xs font-bold text-gray-400 dark:text-gray-500 border-r border-gray-200 dark:border-gray-700 pr-2">+91</span>
              </div>
              <input
                type="text"
                value={mobileNumber}
                onChange={handleMobileChange}
                placeholder={t('mobile_number_placeholder', '10-digit Mobile Number')}
                className="w-full pl-16 pr-4 py-3 rounded-xl border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-gray-900 dark:text-white font-semibold text-sm placeholder-gray-400 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all"
                disabled={isLoading}
                autoFocus
              />
            </div>
          </div>

          {/* 6-Digit Passcode Input */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-2">
              {t('pin_passcode_label', '6-Digit PIN Passcode')}
            </label>
            <div className="relative">
              <KeyRound className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
              <input
                type="password"
                value={passcode}
                onChange={handlePasscodeChange}
                placeholder="• • • • • •"
                maxLength={6}
                className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-gray-900 dark:text-white font-mono text-center tracking-[0.4em] font-bold text-lg placeholder-gray-400 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all"
                disabled={isLoading}
              />
            </div>
            <div className="text-right mt-2">
              <button
                type="button"
                onClick={() => {
                  setForgotMobile(mobileNumber);
                  setForgotResult(null);
                  setShowForgotPassword(true);
                }}
                className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300 transition-colors cursor-pointer"
              >
                {t('forgot_password_link', 'Forgot Password?')}
              </button>
            </div>
          </div>

          {/* Login Button */}
          <button
            type="submit"
            disabled={isLoading || mobileNumber.length === 0 || passcode.length === 0}
            className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 disabled:opacity-50 text-white font-bold py-3 px-4 rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            {isLoading ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>{t('authenticating_button', 'Authenticating...')}</span>
              </>
            ) : (
              <>
                <Lock className="w-4 h-4" />
                <span>{t('login_button', 'Log In')}</span>
              </>
            )}
          </button>
        </form>

        {/* Footer */}
        <p className="text-[11px] text-gray-400 dark:text-gray-500 text-center mt-6">
          {t('login_footer_copyright', '© 2026 Artists Farm Resort & Kitchen Management System')}
        </p>

        {/* Back Button */}
        <div className="mt-4 text-center">
          <a
            href="/artists_farm/"
            className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
          >
            {t('back_to_home_link', '← Back to Home')}
          </a>
        </div>
      </div>
    </div>
  );
};
