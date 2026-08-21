import React, { useState, useRef } from 'react';
import { Alert } from 'flowbite-react';
import { AlertCircle, Lock, Phone, KeyRound, Building2, ShieldCheck, Mail, CheckCircle2, ArrowLeft, Loader2, Delete } from 'lucide-react';
import { t } from '../i18n/en';

interface LoginPageProps {
  // 'management': tenant/platform admin login - redirects to a dashboard on success.
  // 'terminal': property staff login (front desk, kitchen, etc.) - stays in place and
  // hands off to a staff session instead of navigating away. Defaults to 'management'.
  variant?: 'management' | 'terminal';
  // Raw `data.user` from the login_user API response, passed through unmodified - the
  // two variants need completely different post-login handling (redirect+tenant session
  // vs in-place staff-context login), so that's left entirely to the caller rather than
  // this component trying to know both.
  onLoginSuccess: (user: any) => void;
  // terminal-only: logs a failed attempt against the property's audit trail.
  onLoginFailed?: (username: string) => void;
  // terminal-only: called instead of onLoginSuccess when the authenticated account has
  // access_all_properties set (see php/security/access_control.php) - the caller should
  // show StaffPropertyPicker rather than entering this property's dashboard directly,
  // since which property to work in hasn't been decided yet.
  onNeedsPropertySelection?: (info: { tenantId: number; tenantSlug: string; user: any }) => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ variant = 'management', onLoginSuccess, onLoginFailed, onNeedsPropertySelection }) => {
  const isTerminal = variant === 'terminal';

  const [mobileNumber, setMobileNumber] = useState('');
  const [passcode, setPasscode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const mobileInputRef = useRef<HTMLInputElement>(null);
  const passcodeInputRef = useRef<HTMLInputElement>(null);
  const loginFormRef = useRef<HTMLFormElement>(null);

  // First-login mandatory passcode change - set when the account was created with a
  // temporary passcode (e.g. new tenant welcome emails/WhatsApp shares) and hasn't been
  // changed yet. Previously only enforced in 'management' mode (LoginPage.tsx) - the old
  // separate LoginModal.tsx never checked must_change_passcode at all, so a staff account
  // with a still-temporary PIN could log into a property terminal without ever being
  // forced onto a real one. Sharing this flow across both variants fixes that gap.
  const [mustChangePasscode, setMustChangePasscode] = useState(false);
  const [pendingUser, setPendingUser] = useState<any | null>(null);
  const [newPasscode, setNewPasscode] = useState('');
  const [confirmPasscode, setConfirmPasscode] = useState('');
  const [isSavingPasscode, setIsSavingPasscode] = useState(false);

  // "Forgot Password?" - emails the account's current username + passcode to the
  // tenant's email on file. Only surfaced in 'management' mode's UI below (unconfirmed
  // whether staff accounts have an email on file for this to actually reach), but the
  // flow itself stays shared so there's one implementation either way.
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotMobile, setForgotMobile] = useState('');
  const [isSendingLoginInfo, setIsSendingLoginInfo] = useState(false);
  const [forgotResult, setForgotResult] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleMobileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawVal = e.target.value;
    const val = (rawVal === 'admin' || rawVal === 'root') ? rawVal : rawVal.replace(/\D/g, '').slice(0, 10);
    setMobileNumber(val);
    setError(null);
    // Auto-focus passcode field when 10 digits (or 'admin'/'root') are entered
    if (val.length === 10 || val === 'admin' || val === 'root') {
      setTimeout(() => {
        passcodeInputRef.current?.focus();
        const passInput = passcodeInputRef.current;
        if (passInput) {
          const len = passInput.value.length;
          passInput.setSelectionRange(len, len);
        }
      }, 30);
    }
  };

  const handlePasscodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/\D/g, '').slice(0, 6);
    setPasscode(val);
    setError(null);
    // No auto-submit here (found 21 Aug 2026, directly downstream of finally
    // fixing "Sign Out Terminal" server-side - see router.php's 'logout'
    // case): this handler fires for BOTH real keystrokes AND the browser's
    // own autofill repopulating a saved credential after any successful
    // login on this shared-terminal form (autoComplete="off" above does not
    // reliably stop Chrome from doing this for an already-saved login form -
    // a known override, not something fixable from this attribute alone).
    // Auto-submitting here meant Chrome silently re-logged in the PREVIOUS
    // staff member the instant the login screen next rendered, no human
    // interaction at all - a correctly-working sign-out was not enough to
    // protect a shared terminal on its own. handlePasscodeKey's auto-submit
    // (the on-screen keypad below, this component's actual intended fast-
    // entry method for a shared terminal) is untouched - autofill can only
    // ever reach this real <input>'s onChange, never the keypad's onClick
    // handlers, so this closes the exploited path without changing the
    // on-screen PIN-pad UX at all. A human typing on a physical keyboard now
    // presses Enter or the submit button instead of auto-submitting - a
    // normal login flow, not a meaningful regression.
  };

  const handlePasscodeKey = (num: string) => {
    if (passcode.length < 6) {
      const nextPasscode = passcode + num;
      setPasscode(nextPasscode);
      setError(null);

      // Auto-submit when 6 digits are reached via keypad
      if (nextPasscode.length === 6 && !isLoading) {
        const validMobile = mobileNumber.length === 10 || mobileNumber === 'admin' || mobileNumber === 'root';
        if (validMobile) {
          setTimeout(() => {
            loginFormRef.current?.requestSubmit();
          }, 100);
        }
      }
    }
  };

  const handleBackspace = () => {
    setPasscode((prev) => prev.slice(0, -1));
    setError(null);
  };

  const handleClear = () => {
    setPasscode('');
    setError(null);
  };

  const handleLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError(null);

    if (mobileNumber.length > 0 && mobileNumber.length < 10 && mobileNumber !== 'admin' && mobileNumber !== 'root') {
      setError(t('enter_10_digit_mobile_error'));
      return;
    }
    if (passcode.length < 6 && passcode !== '123456' && passcode !== 'admin') {
      setError(t('enter_6_digit_passcode_error'));
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch('/php/api/router.php?action=login_user', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mobile_number: mobileNumber, passcode }),
      });
      const data = await response.json();

      if (data.success && data.user) {
        if (data.user.must_change_passcode) {
          // Don't hand off the session yet - hold onto it until a new passcode is set,
          // matching "temporary credentials can't be used past first login".
          setPendingUser(data.user);
          setMustChangePasscode(true);
          setIsLoading(false);
          return;
        }

        if (isTerminal && data.user.access_all_properties && onNeedsPropertySelection) {
          onNeedsPropertySelection({
            tenantId: data.user.tenant_id,
            tenantSlug: data.user.tenant_slug,
            user: data.user,
          });
          return;
        }

        onLoginSuccess(data.user);
      } else {
        setError(data.message || t('login_failed_error'));
        setPasscode('');
        if (isTerminal && onLoginFailed) onLoginFailed(mobileNumber);
      }
    } catch (err) {
      console.error('Login error:', err);
      setError(t('network_auth_error'));
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
          username: pendingUser?.username || mobileNumber,
          current_passcode: passcode,
          new_passcode: newPasscode,
        }),
      });
      const data = await response.json();

      if (data.success && pendingUser) {
        onLoginSuccess({ ...pendingUser, must_change_passcode: false });
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
          login_url: window.location.origin + '/',
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
      <div className="login-page login-page--forgot min-h-screen bg-gradient-to-br from-slate-100 via-slate-50 to-blue-50/60 dark:from-slate-950 dark:via-slate-900 dark:to-indigo-950 flex items-center justify-center p-4 sm:p-6 relative overflow-hidden">
        <div className="absolute -top-32 -left-32 w-80 h-80 bg-blue-500/10 dark:bg-blue-600/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-32 -right-32 w-80 h-80 bg-indigo-500/10 dark:bg-indigo-600/20 rounded-full blur-3xl pointer-events-none" />

        <div className="login-page__card relative max-w-md w-full bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl rounded-lg shadow-xl shadow-slate-200/50 dark:shadow-slate-950/60 border border-slate-200/80 dark:border-slate-800 p-8 sm:p-9 transition-all">
          <div className="flex justify-center mb-5">
            <div className="inline-flex items-center justify-center w-14 h-14 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-lg shadow-lg shadow-blue-500/25 ring-4 ring-blue-500/10">
              <Mail className="w-7 h-7 text-white" />
            </div>
          </div>

          <div className="text-center mb-6">
            <h1 className="login-page__page-title text-xl font-bold text-slate-900 dark:text-white tracking-tight">
              {t('forgot_passcode_title', 'Forgot Your Passcode?')}
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">
              {t('forgot_passcode_description', "Enter your mobile number and we'll email your login details to the address on file.")}
            </p>
          </div>

          <form onSubmit={handleRequestLoginInfo} className="app-form app-form--request-login-info space-y-4">
            {forgotResult && (
              <div className={`flex gap-3 p-3 rounded-lg border ${
                forgotResult.type === 'success'
                  ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800'
                  : 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800'
              }`}>
                {forgotResult.type === 'success' ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                )}
                <p className={`text-xs font-medium ${
                  forgotResult.type === 'success' ? 'text-emerald-800 dark:text-emerald-300' : 'text-red-800 dark:text-red-300'
                }`}>
                  {forgotResult.text}
                </p>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                {t('mobile_username_label', 'Mobile Number / Username')}
              </label>
              <div className="relative flex items-center">
                <div className="absolute left-3.5 z-10 flex items-center gap-1.5 text-slate-400 dark:text-slate-500 pointer-events-none select-none">
                  <Phone className="w-4 h-4 text-slate-400" />
                  <span className="text-xs font-semibold text-slate-400 dark:text-slate-500 border-r border-slate-200 dark:border-slate-700 pr-2">+91</span>
                </div>
                <input
                  type="tel"
                  value={forgotMobile}
                  onChange={(e) => {
                    setForgotMobile(e.target.value.replace(/\D/g, '').slice(0, 10));
                    setForgotResult(null);
                  }}
                  placeholder={t('mobile_number_placeholder', '10-digit mobile number')}
                  className="w-full h-11 pl-[72px] pr-4 bg-slate-50/80 dark:bg-slate-800/80 hover:bg-slate-50 dark:hover:bg-slate-800 focus:bg-white dark:focus:bg-slate-900 border border-slate-200 dark:border-slate-700 focus:border-blue-500 dark:focus:border-blue-500 focus:ring-4 focus:ring-blue-500/15 rounded-lg text-sm font-medium text-slate-900 dark:text-white placeholder:text-slate-400 transition-all outline-none"
                  disabled={isSendingLoginInfo}
                  autoFocus
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isSendingLoginInfo || forgotMobile.length === 0}
              className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 active:from-blue-800 active:to-indigo-800 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-2.5 px-4 rounded-lg shadow-md shadow-blue-500/20 hover:shadow-lg hover:shadow-blue-500/30 hover:-translate-y-0.5 active:translate-y-0 transition-all flex items-center justify-center gap-2 cursor-pointer select-none"
            >
              {isSendingLoginInfo ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
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

          <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 text-center">
            <button
              onClick={() => {
                setShowForgotPassword(false);
                setForgotResult(null);
              }}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer"
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
      <div className="login-page login-page--set-passcode min-h-screen bg-gradient-to-br from-slate-100 via-slate-50 to-blue-50/60 dark:from-slate-950 dark:via-slate-900 dark:to-indigo-950 flex items-center justify-center p-4 sm:p-6 relative overflow-hidden">
        <div className="absolute -top-32 -left-32 w-80 h-80 bg-amber-500/10 dark:bg-amber-600/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-32 -right-32 w-80 h-80 bg-orange-500/10 dark:bg-orange-600/20 rounded-full blur-3xl pointer-events-none" />

        <div className="login-page__card relative max-w-md w-full bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl rounded-lg shadow-xl shadow-slate-200/50 dark:shadow-slate-950/60 border border-slate-200/80 dark:border-slate-800 p-8 sm:p-9 transition-all">
          <div className="flex justify-center mb-5">
            <div className="inline-flex items-center justify-center w-14 h-14 bg-gradient-to-br from-amber-500 to-orange-600 rounded-lg shadow-lg shadow-amber-500/25 ring-4 ring-amber-500/10">
              <ShieldCheck className="w-7 h-7 text-white" />
            </div>
          </div>

          <div className="text-center mb-6">
            <h1 className="login-page__page-title text-xl font-bold text-slate-900 dark:text-white tracking-tight">
              {t('set_new_passcode_title', 'Set a New Passcode')}
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">
              You're using a temporary passcode. Choose a new 6-digit passcode to continue{pendingUser?.name ? `, ${pendingUser.name}` : ''}.
            </p>
          </div>

          <form onSubmit={handleSetNewPasscode} className="app-form app-form--set-passcode space-y-4">
            {error && (
              <div className="flex gap-3 p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg">
                <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                <p className="text-xs font-medium text-red-800 dark:text-red-300">{error}</p>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                {t('new_passcode_label', 'New 6-Digit Passcode')}
              </label>
              <div className="relative flex items-center">
                <div className="absolute left-3.5 z-10 flex items-center gap-1.5 text-slate-400 dark:text-slate-500 pointer-events-none select-none">
                  <KeyRound className="w-4 h-4 text-slate-400" />
                  <span className="text-xs font-semibold text-slate-400 dark:text-slate-500 border-r border-slate-200 dark:border-slate-700 pr-2">PIN</span>
                </div>
                <input
                  type="password"
                  value={newPasscode}
                  onChange={(e) => setNewPasscode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="••••••"
                  maxLength={6}
                  inputMode="numeric"
                  autoFocus
                  className="w-full h-11 pl-[72px] pr-4 bg-slate-50/80 dark:bg-slate-800/80 hover:bg-slate-50 dark:hover:bg-slate-800 focus:bg-white dark:focus:bg-slate-900 border border-slate-200 dark:border-slate-700 focus:border-amber-500 dark:focus:border-amber-500 focus:ring-4 focus:ring-amber-500/15 rounded-lg text-left text-sm tracking-[0.25em] font-mono text-slate-900 dark:text-white placeholder:text-slate-400 transition-all outline-none"
                  disabled={isSavingPasscode}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                {t('confirm_new_passcode_label', 'Confirm New Passcode')}
              </label>
              <div className="relative flex items-center">
                <div className="absolute left-3.5 z-10 flex items-center gap-1.5 text-slate-400 dark:text-slate-500 pointer-events-none select-none">
                  <KeyRound className="w-4 h-4 text-slate-400" />
                  <span className="text-xs font-semibold text-slate-400 dark:text-slate-500 border-r border-slate-200 dark:border-slate-700 pr-2">PIN</span>
                </div>
                <input
                  type="password"
                  value={confirmPasscode}
                  onChange={(e) => setConfirmPasscode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="••••••"
                  maxLength={6}
                  inputMode="numeric"
                  className="w-full h-11 pl-[72px] pr-4 bg-slate-50/80 dark:bg-slate-800/80 hover:bg-slate-50 dark:hover:bg-slate-800 focus:bg-white dark:focus:bg-slate-900 border border-slate-200 dark:border-slate-700 focus:border-amber-500 dark:focus:border-amber-500 focus:ring-4 focus:ring-amber-500/15 rounded-lg text-left text-sm tracking-[0.25em] font-mono text-slate-900 dark:text-white placeholder:text-slate-400 transition-all outline-none"
                  disabled={isSavingPasscode}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isSavingPasscode || newPasscode.length !== 6 || confirmPasscode.length !== 6}
              className="w-full bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 active:from-amber-800 active:to-orange-800 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-2.5 px-4 rounded-lg shadow-md shadow-amber-500/20 hover:shadow-lg hover:shadow-amber-500/30 hover:-translate-y-0.5 active:translate-y-0 transition-all flex items-center justify-center gap-2 cursor-pointer select-none"
            >
              {isSavingPasscode ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
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
    <div className="login-page min-h-screen bg-gradient-to-br from-slate-100 via-slate-50 to-blue-50/60 dark:from-slate-950 dark:via-slate-900 dark:to-indigo-950 flex items-center justify-center p-4 sm:p-6 relative overflow-hidden">
      <div className="absolute -top-32 -left-32 w-80 h-80 bg-blue-500/10 dark:bg-blue-600/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-32 -right-32 w-80 h-80 bg-indigo-500/10 dark:bg-indigo-600/20 rounded-full blur-3xl pointer-events-none" />

      <div className="login-page__card relative max-w-md w-full bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl rounded-lg shadow-xl shadow-slate-200/50 dark:shadow-slate-950/60 border border-slate-200/80 dark:border-slate-800 p-8 sm:p-9 transition-all">
        {/* Brand Icon */}
        <div className="flex justify-center mb-5">
          <div className="relative inline-flex items-center justify-center w-16 h-16 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-600 shadow-lg shadow-blue-500/25 ring-4 ring-blue-500/10">
            {isTerminal ? (
              <Lock className="w-8 h-8 text-white stroke-[2.2]" />
            ) : (
              <Building2 className="w-8 h-8 text-white stroke-[2.2]" />
            )}
          </div>
        </div>

        {/* Title & Subtitle */}
        <div className="text-center mb-7">
          <h1 className="login-page__page-title text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
            {isTerminal ? t('login_modal_brand') : 'Ground Code'}
          </h1>
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mt-1">
            {isTerminal ? t('terminal_authorization_subtitle') : t('login_subtitle', 'Hospitality & Resort Management Portal')}
          </p>
        </div>

        {/* Login Form */}
        <form onSubmit={handleLogin} ref={loginFormRef} className="app-form app-form--login space-y-4">
          {error && (
            <Alert color="failure" icon={AlertCircle} className="rounded-lg">
              <span>{error}</span>
            </Alert>
          )}

          {/* Mobile Number Input */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              {t('mobile_username_label', 'Mobile Number / Username')}
            </label>
            <div className="relative flex items-center">
              <div className="absolute left-3.5 z-10 flex items-center gap-1.5 text-slate-400 dark:text-slate-500 pointer-events-none select-none">
                <Phone className="w-4 h-4 text-slate-400" />
                <span className="text-xs font-semibold text-slate-400 dark:text-slate-500 border-r border-slate-200 dark:border-slate-700 pr-2">+91</span>
              </div>
              <input
                type="tel"
                value={mobileNumber}
                onChange={handleMobileChange}
                placeholder={t('mobile_number_placeholder', '10-digit mobile number')}
                className="w-full h-11 pl-[72px] pr-4 bg-slate-50/80 dark:bg-slate-800/80 hover:bg-slate-50 dark:hover:bg-slate-800 focus:bg-white dark:focus:bg-slate-900 border border-slate-200 dark:border-slate-700 focus:border-blue-500 dark:focus:border-blue-500 focus:ring-4 focus:ring-blue-500/15 rounded-lg text-sm font-medium text-slate-900 dark:text-white placeholder:text-slate-400 transition-all outline-none"
                disabled={isLoading}
                autoFocus
                // Found 21 Aug 2026, directly downstream of finally fixing "Sign Out
                // Terminal" server-side (see router.php's 'logout' case): this form is
                // also used on a shared front-desk device (see the touch-keypad comment
                // below). autoComplete="username" invited Chrome to save/auto-refill a
                // staff member's mobile number after any successful login - combined with
                // the passcode field's own auto-refill (below) and handlePasscodeChange's
                // auto-submit-on-6-digits, that silently re-logged in the PREVIOUS staff
                // member the moment the login screen next rendered, with zero human
                // interaction. A correctly-working sign-out was not enough to protect a
                // shared terminal while the browser remembered the credentials for it.
                autoComplete="off"
                ref={mobileInputRef}
              />
            </div>
          </div>

          {/* 6-Digit Passcode Input */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                {t('pin_passcode_label', '6-Digit Security Passcode')}
              </label>
              {!isTerminal && (
                <button
                  type="button"
                  onClick={() => {
                    setForgotMobile(mobileNumber);
                    setForgotResult(null);
                    setShowForgotPassword(true);
                  }}
                  className="text-xs font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 transition-colors cursor-pointer"
                >
                  {t('forgot_password_link', 'Forgot Passcode?')}
                </button>
              )}
            </div>
            <div className="relative flex items-center">
              <div className="absolute left-3.5 z-10 flex items-center gap-1.5 text-slate-400 dark:text-slate-500 pointer-events-none select-none">
                <KeyRound className="w-4 h-4 text-slate-400" />
                <span className="text-xs font-semibold text-slate-400 dark:text-slate-500 border-r border-slate-200 dark:border-slate-700 pr-2">PIN</span>
              </div>
              <input
                type="password"
                value={passcode}
                onChange={handlePasscodeChange}
                placeholder="••••••"
                maxLength={6}
                inputMode="numeric"
                className="w-full h-11 pl-[72px] pr-4 bg-slate-50/80 dark:bg-slate-800/80 hover:bg-slate-50 dark:hover:bg-slate-800 focus:bg-white dark:focus:bg-slate-900 border border-slate-200 dark:border-slate-700 focus:border-blue-500 dark:focus:border-blue-500 focus:ring-4 focus:ring-blue-500/15 rounded-lg text-left text-sm tracking-[0.25em] font-mono text-slate-900 dark:text-white placeholder:text-slate-400 placeholder:tracking-normal transition-all outline-none"
                disabled={isLoading}
                // See the mobile number input's comment above - same reasoning, this is
                // the field that actually gets auto-submitted once Chrome refills 6 digits.
                autoComplete="off"
                ref={passcodeInputRef}
              />
            </div>
          </div>

          {/* Touch Keypad - terminal only: fast PIN entry on a shared front-desk device */}
          {isTerminal && (
            <div className="login-page__keypad grid grid-cols-3 gap-2 pt-1">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((num) => (
                <button
                  key={num}
                  type="button"
                  onClick={() => handlePasscodeKey(num)}
                  className="login-page__key login-page__key--number py-3 text-lg font-semibold bg-slate-50/80 dark:bg-slate-800/80 text-slate-800 dark:text-white rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:border-blue-300 hover:text-blue-600 transition-colors active:scale-95 cursor-pointer"
                >
                  {num}
                </button>
              ))}
              <button
                type="button"
                onClick={handleClear}
                className="login-page__key login-page__key--clear py-3 text-xs font-semibold bg-slate-50/80 dark:bg-slate-800/80 text-slate-500 dark:text-slate-400 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-red-50 dark:hover:bg-red-900/30 hover:text-red-600 transition-colors cursor-pointer"
              >
                {t('clear_keypad_button')}
              </button>
              <button
                type="button"
                onClick={() => handlePasscodeKey('0')}
                className="login-page__key login-page__key--number py-3 text-lg font-semibold bg-slate-50/80 dark:bg-slate-800/80 text-slate-800 dark:text-white rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:border-blue-300 hover:text-blue-600 transition-colors active:scale-95 cursor-pointer"
              >
                0
              </button>
              <button
                type="button"
                onClick={handleBackspace}
                className="login-page__key login-page__key--backspace py-3 text-xs font-semibold bg-slate-50/80 dark:bg-slate-800/80 text-slate-500 dark:text-slate-400 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-amber-50 dark:hover:bg-amber-900/30 hover:text-amber-600 transition-colors cursor-pointer"
              >
                <Delete className="w-4 h-4 mx-auto" />
              </button>
            </div>
          )}

          {/* Sign In Button */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={isLoading || mobileNumber.length === 0 || passcode.length === 0}
              className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 active:from-blue-800 active:to-indigo-800 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-2.5 px-4 rounded-lg shadow-md shadow-blue-500/20 hover:shadow-lg hover:shadow-blue-500/30 hover:-translate-y-0.5 active:translate-y-0 transition-all flex items-center justify-center gap-2 cursor-pointer select-none"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>{t('authenticating_button', 'Authenticating...')}</span>
                </>
              ) : (
                <>
                  <Lock className="w-4 h-4" />
                  <span>{isTerminal ? t('login_to_terminal_button') : t('login_button', 'Sign In to Terminal')}</span>
                </>
              )}
            </button>
          </div>
        </form>

        {/* Footer & Back Link - management only, terminal is embedded in a property's own device */}
        {!isTerminal && (
          <div className="mt-7 pt-5 border-t border-slate-100 dark:border-slate-800/80 text-center space-y-2.5">
            <p className="text-[11px] text-slate-400 dark:text-slate-500">
              {t('login_footer_copyright', '© 2026 Ground Code. All rights reserved.')}
            </p>
            <div>
              <a
                href="/"
                className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400 transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                {t('back_to_home_link', 'Back to Home')}
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
