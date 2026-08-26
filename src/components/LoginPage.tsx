import React, { useState, useRef } from 'react';
import { Alert } from 'flowbite-react';
import { AlertCircle, Lock, Phone, KeyRound, Building2, ShieldCheck, Mail, CheckCircle2, ArrowLeft, Loader2, Delete } from './icons/FlowbiteIcons';
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

  // Real-time validation feedback (Flowbite forms.md validation states) - flags a mismatch as
  // soon as both fields have something typed, rather than only on submit.
  const passcodeMismatch = newPasscode.length > 0 && confirmPasscode.length > 0 && newPasscode !== confirmPasscode;
  const passcodeMatch = newPasscode.length === 6 && confirmPasscode.length === 6 && newPasscode === confirmPasscode;

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
      <section className="bg-gray-50 dark:bg-gray-900 min-h-screen flex flex-col items-center justify-center px-6 py-8 mx-auto md:h-screen lg:py-0">
        <a href="/" className="flex items-center mb-6 text-2xl font-semibold text-gray-900 dark:text-white">
          <div className="w-8 h-8 mr-2.5 rounded-lg bg-blue-600 flex items-center justify-center text-white shadow-xs">
            <Mail className="w-5 h-5" />
          </div>
          <span>Ground Code</span>
        </a>

        <div className="w-full bg-white rounded-lg shadow-sm dark:border md:mt-0 sm:max-w-md xl:p-0 dark:bg-gray-800 dark:border-gray-700">
          <div className="p-6 space-y-4 md:space-y-6 sm:p-8">
            <h1 className="text-xl font-bold leading-tight tracking-tight text-gray-900 md:text-2xl dark:text-white">
              {t('forgot_passcode_title', 'Forgot Your Passcode?')}
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {t('forgot_passcode_description', "Enter your mobile number and we'll email your login details to the address on file.")}
            </p>

            <form onSubmit={handleRequestLoginInfo} className="space-y-4 md:space-y-6">
              {forgotResult && (
                <div className={`flex gap-3 p-3 rounded-lg border text-sm ${
                  forgotResult.type === 'success'
                    ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
                    : 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800 text-red-800 dark:text-red-300'
                }`}>
                  {forgotResult.type === 'success' ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                  )}
                  <span className="font-medium">{forgotResult.text}</span>
                </div>
              )}

              <div>
                <label htmlFor="forgotMobile" className="block mb-2 text-sm font-medium text-gray-900 dark:text-white">
                  {t('mobile_username_label', 'Mobile Number / Username')}
                </label>
                <div className="relative flex items-center">
                  <div className="absolute left-3 z-10 flex items-center gap-1 text-gray-400 dark:text-gray-500 pointer-events-none select-none">
                    <Phone className="w-4 h-4 text-gray-400" />
                    <span className="text-xs font-semibold text-gray-400 dark:text-gray-500 border-r border-gray-300 dark:border-gray-600 pr-2">+91</span>
                  </div>
                  <input
                    type="tel"
                    id="forgotMobile"
                    name="forgotMobile"
                    value={forgotMobile}
                    onChange={(e) => {
                      setForgotMobile(e.target.value.replace(/\D/g, '').slice(0, 10));
                      setForgotResult(null);
                    }}
                    placeholder={t('mobile_number_placeholder', '10-digit mobile number')}
                    className="bg-gray-50 border border-gray-300 text-gray-900 sm:text-sm rounded-lg focus:ring-blue-600 focus:border-blue-600 block w-full pl-16 p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500 font-medium"
                    disabled={isSendingLoginInfo}
                    autoFocus
                    required
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isSendingLoginInfo || forgotMobile.length === 0}
                className="w-full text-white bg-blue-600 hover:bg-blue-700 focus:ring-4 focus:outline-none focus:ring-blue-300 font-medium rounded-lg text-sm px-5 py-2.5 text-center dark:bg-blue-600 dark:hover:bg-blue-700 dark:focus:ring-blue-800 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer"
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

              <p className="text-sm font-light text-gray-500 dark:text-gray-400 text-center pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setShowForgotPassword(false);
                    setForgotResult(null);
                  }}
                  className="inline-flex items-center gap-1.5 font-medium text-blue-600 hover:underline dark:text-blue-500 cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" /> {t('back_to_login_button', 'Back to Login')}
                </button>
              </p>
            </form>
          </div>
        </div>
      </section>
    );
  }

  if (mustChangePasscode) {
    return (
      <section className="bg-gray-50 dark:bg-gray-900 min-h-screen flex flex-col items-center justify-center px-6 py-8 mx-auto md:h-screen lg:py-0">
        <a href="/" className="flex items-center mb-6 text-2xl font-semibold text-gray-900 dark:text-white">
          <div className="w-8 h-8 mr-2.5 rounded-lg bg-amber-500 flex items-center justify-center text-white shadow-xs">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <span>{isTerminal ? t('login_modal_brand') : 'Ground Code'}</span>
        </a>

        <div className="w-full bg-white rounded-lg shadow-sm dark:border md:mt-0 sm:max-w-md xl:p-0 dark:bg-gray-800 dark:border-gray-700">
          <div className="p-6 space-y-4 md:space-y-6 sm:p-8">
            <h1 className="text-xl font-bold leading-tight tracking-tight text-gray-900 md:text-2xl dark:text-white">
              {t('set_new_passcode_title', 'Set a New Passcode')}
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              You're using a temporary passcode. Choose a new 6-digit passcode to continue{pendingUser?.name ? `, ${pendingUser.name}` : ''}.
            </p>

            <form onSubmit={handleSetNewPasscode} className="space-y-4 md:space-y-6">
              {error && (
                <Alert color="failure" icon={AlertCircle} className="rounded-lg">
                  <span>{error}</span>
                </Alert>
              )}

              <div>
                <label htmlFor="newPasscode" className="block mb-2 text-sm font-medium text-gray-900 dark:text-white">
                  {t('new_passcode_label', 'New 6-Digit Passcode')}
                </label>
                <div className="relative flex items-center">
                  <div className="absolute left-3 z-10 flex items-center gap-1 text-gray-400 dark:text-gray-500 pointer-events-none select-none">
                    <KeyRound className="w-4 h-4 text-gray-400" />
                    <span className="text-xs font-semibold text-gray-400 dark:text-gray-500 border-r border-gray-300 dark:border-gray-600 pr-2">PIN</span>
                  </div>
                  <input
                    type="password"
                    id="newPasscode"
                    name="newPasscode"
                    value={newPasscode}
                    onChange={(e) => setNewPasscode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="••••••"
                    maxLength={6}
                    inputMode="numeric"
                    autoFocus
                    className="bg-gray-50 border border-gray-300 text-gray-900 sm:text-sm rounded-lg focus:ring-blue-600 focus:border-blue-600 block w-full pl-16 p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500 font-mono tracking-[0.25em]"
                    disabled={isSavingPasscode}
                    required
                  />
                </div>
              </div>

              <div>
                <label htmlFor="confirmPasscode" className="block mb-2 text-sm font-medium text-gray-900 dark:text-white">
                  {t('confirm_new_passcode_label', 'Confirm New Passcode')}
                </label>
                <div className="relative flex items-center">
                  <div className="absolute left-3 z-10 flex items-center gap-1 text-gray-400 dark:text-gray-500 pointer-events-none select-none">
                    <KeyRound className="w-4 h-4 text-gray-400" />
                    <span className="text-xs font-semibold text-gray-400 dark:text-gray-500 border-r border-gray-300 dark:border-gray-600 pr-2">PIN</span>
                  </div>
                  <input
                    type="password"
                    id="confirmPasscode"
                    name="confirmPasscode"
                    value={confirmPasscode}
                    onChange={(e) => setConfirmPasscode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="••••••"
                    maxLength={6}
                    inputMode="numeric"
                    className={`block w-full pl-16 p-2.5 sm:text-sm rounded-lg font-mono tracking-[0.25em] ${
                      passcodeMismatch
                        ? 'bg-red-50 border border-red-500 text-red-900 placeholder-red-700 focus:ring-red-500 focus:border-red-500 dark:bg-red-100 dark:border-red-400 dark:focus:ring-red-500 dark:focus:border-red-500'
                        : passcodeMatch
                        ? 'bg-green-50 border border-green-500 text-green-900 placeholder-green-700 focus:ring-green-500 focus:border-green-500 dark:bg-green-100 dark:border-green-400 dark:focus:ring-green-500 dark:focus:border-green-500'
                        : 'bg-gray-50 border border-gray-300 text-gray-900 focus:ring-blue-600 focus:border-blue-600 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500'
                    }`}
                    disabled={isSavingPasscode}
                    required
                  />
                </div>
                {passcodeMismatch ? (
                  <p className="mt-2 text-sm text-red-600 dark:text-red-500">Passcodes don't match.</p>
                ) : passcodeMatch ? (
                  <p className="mt-2 text-sm text-green-600 dark:text-green-500">Passcodes match.</p>
                ) : null}
              </div>

              <button
                type="submit"
                disabled={isSavingPasscode || newPasscode.length !== 6 || confirmPasscode.length !== 6}
                className="w-full text-white bg-amber-600 hover:bg-amber-700 focus:ring-4 focus:outline-none focus:ring-amber-300 font-medium rounded-lg text-sm px-5 py-2.5 text-center dark:bg-amber-600 dark:hover:bg-amber-700 dark:focus:ring-amber-800 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer"
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
      </section>
    );
  }

  return (
    <section className="bg-gray-50 dark:bg-gray-900 min-h-screen flex flex-col items-center justify-center px-6 py-8 mx-auto md:h-screen lg:py-0">
      <a href="/" className="flex items-center mb-6 text-2xl font-semibold text-gray-900 dark:text-white">
        <div className="w-8 h-8 mr-2.5 rounded-lg bg-blue-600 flex items-center justify-center text-white shadow-xs">
          {isTerminal ? <Lock className="w-5 h-5 text-white" /> : <Building2 className="w-5 h-5 text-white" />}
        </div>
        <span>{isTerminal ? t('login_modal_brand') : 'Ground Code'}</span>
      </a>

      <div className="w-full bg-white rounded-lg shadow-sm dark:border md:mt-0 sm:max-w-md xl:p-0 dark:bg-gray-800 dark:border-gray-700">
        <div className="p-6 space-y-4 md:space-y-6 sm:p-8">
          <div className="space-y-1">
            <h1 className="text-xl font-bold leading-tight tracking-tight text-gray-900 md:text-2xl dark:text-white">
              {isTerminal ? t('terminal_authorization_heading', 'Sign in to Terminal') : t('sign_in_heading', 'Sign in to your account')}
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {isTerminal ? t('terminal_authorization_subtitle') : t('login_subtitle', 'Hospitality & Resort Management Portal')}
            </p>
          </div>

          <form onSubmit={handleLogin} ref={loginFormRef} className="space-y-4 md:space-y-6">
            {error && (
              <Alert color="failure" icon={AlertCircle} className="rounded-lg">
                <span>{error}</span>
              </Alert>
            )}

            <div>
              <label htmlFor="mobileNumber" className="block mb-2 text-sm font-medium text-gray-900 dark:text-white">
                {t('mobile_username_label', 'Mobile Number / Username')}
              </label>
              <div className="relative flex items-center">
                <div className="absolute left-3 z-10 flex items-center gap-1 text-gray-400 dark:text-gray-500 pointer-events-none select-none">
                  <Phone className="w-4 h-4 text-gray-400" />
                  <span className="text-xs font-semibold text-gray-400 dark:text-gray-500 border-r border-gray-300 dark:border-gray-600 pr-2">+91</span>
                </div>
                <input
                  type="tel"
                  id="mobileNumber"
                  name="mobileNumber"
                  value={mobileNumber}
                  onChange={handleMobileChange}
                  placeholder={t('mobile_number_placeholder', '10-digit mobile number')}
                  className="bg-gray-50 border border-gray-300 text-gray-900 sm:text-sm rounded-lg focus:ring-blue-600 focus:border-blue-600 block w-full pl-16 p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500 font-medium"
                  disabled={isLoading}
                  autoFocus
                  autoComplete="off"
                  ref={mobileInputRef}
                  required
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label htmlFor="passcode" className="block text-sm font-medium text-gray-900 dark:text-white">
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
                    className="text-sm font-medium text-blue-600 hover:underline dark:text-blue-500 cursor-pointer"
                  >
                    {t('forgot_password_link', 'Forgot passcode?')}
                  </button>
                )}
              </div>
              <div className="relative flex items-center">
                <div className="absolute left-3 z-10 flex items-center gap-1 text-gray-400 dark:text-gray-500 pointer-events-none select-none">
                  <KeyRound className="w-4 h-4 text-gray-400" />
                  <span className="text-xs font-semibold text-gray-400 dark:text-gray-500 border-r border-gray-300 dark:border-gray-600 pr-2">PIN</span>
                </div>
                <input
                  type="password"
                  id="passcode"
                  name="passcode"
                  value={passcode}
                  onChange={handlePasscodeChange}
                  placeholder="••••••"
                  maxLength={6}
                  inputMode="numeric"
                  className="bg-gray-50 border border-gray-300 text-gray-900 sm:text-sm rounded-lg focus:ring-blue-600 focus:border-blue-600 block w-full pl-16 p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500 font-mono tracking-[0.25em]"
                  disabled={isLoading}
                  autoComplete="off"
                  ref={passcodeInputRef}
                  required
                />
              </div>
            </div>

            {/* Touch Keypad - terminal only */}
            {isTerminal && (
              <div className="login-page__keypad grid grid-cols-3 gap-2 pt-1">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((num) => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => handlePasscodeKey(num)}
                    className="py-2.5 text-base font-semibold bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-600 focus:ring-2 focus:ring-blue-500 transition-colors active:scale-95 cursor-pointer"
                  >
                    {num}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={handleClear}
                  className="py-2.5 text-xs font-semibold bg-gray-50 dark:bg-gray-700 text-gray-500 dark:text-gray-400 rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-red-50 dark:hover:bg-red-900/30 hover:text-red-600 transition-colors cursor-pointer"
                >
                  {t('clear_keypad_button', 'Clear')}
                </button>
                <button
                  type="button"
                  onClick={() => handlePasscodeKey('0')}
                  className="py-2.5 text-base font-semibold bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-600 focus:ring-2 focus:ring-blue-500 transition-colors active:scale-95 cursor-pointer"
                >
                  0
                </button>
                <button
                  type="button"
                  onClick={handleBackspace}
                  className="py-2.5 text-xs font-semibold bg-gray-50 dark:bg-gray-700 text-gray-500 dark:text-gray-400 rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-amber-50 dark:hover:bg-amber-900/30 hover:text-amber-600 transition-colors cursor-pointer"
                >
                  <Delete className="w-4 h-4 mx-auto" />
                </button>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading || mobileNumber.length === 0 || passcode.length === 0}
              className="w-full text-white bg-blue-600 hover:bg-blue-700 focus:ring-4 focus:outline-none focus:ring-blue-300 font-medium rounded-lg text-sm px-5 py-2.5 text-center dark:bg-blue-600 dark:hover:bg-blue-700 dark:focus:ring-blue-800 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>{t('authenticating_button', 'Authenticating...')}</span>
                </>
              ) : (
                <>
                  <Lock className="w-4 h-4" />
                  <span>{isTerminal ? t('login_to_terminal_button', 'Sign In to Terminal') : t('login_button', 'Sign In')}</span>
                </>
              )}
            </button>

            {!isTerminal && (
              <p className="text-sm font-light text-gray-500 dark:text-gray-400 text-center pt-1">
                <a
                  href="/"
                  className="inline-flex items-center gap-1.5 font-medium text-blue-600 hover:underline dark:text-blue-500"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  {t('back_to_home_link', 'Back to Home')}
                </a>
              </p>
            )}
          </form>
        </div>
      </div>
    </section>
  );
};
