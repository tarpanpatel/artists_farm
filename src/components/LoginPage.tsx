import React, { useState, useRef, useEffect } from 'react';
import { Alert } from 'flowbite-react';
import { AlertCircle, Lock, ShieldCheck, Mail, CheckCircle2, ArrowLeft, Loader2, Backspace, Sparkles } from './icons/FlowbiteIcons';
import { Input } from './Input';
import { t } from '../i18n/en';
import { useAuthOptional } from '../contexts/AuthContext';

const NOOP = () => {};

interface LoginPageProps {
  variant?: 'management' | 'terminal';
  onLoginSuccess: (user: any) => void;
  onLoginFailed?: (username: string) => void;
  onNeedsPropertySelection?: (info: { tenantId: number; tenantSlug: string; user: any }) => void;
  onStartTrial?: () => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ variant = 'management', onLoginSuccess, onLoginFailed, onNeedsPropertySelection, onStartTrial }) => {
  const isTerminal = variant === 'terminal';
  const auth = useAuthOptional();
  const clearSessionMismatchNotice = auth?.clearSessionMismatchNotice ?? NOOP;

  const [mobileNumber, setMobileNumber] = useState('');
  const [passcode, setPasscode] = useState('');
  const [mobileTouched, setMobileTouched] = useState(false);
  const [passcodeTouched, setPasscodeTouched] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const mobileInputRef = useRef<HTMLInputElement>(null);
  const passcodeInputRef = useRef<HTMLInputElement>(null);
  const loginFormRef = useRef<HTMLFormElement>(null);

  const [mustChangePasscode, setMustChangePasscode] = useState(false);
  const [pendingUser, setPendingUser] = useState<any | null>(null);
  const [newPasscode, setNewPasscode] = useState('');
  const [confirmPasscode, setConfirmPasscode] = useState('');
  const [newPasscodeTouched, setNewPasscodeTouched] = useState(false);
  const [isSavingPasscode, setIsSavingPasscode] = useState(false);

  // Real-time validation feedback (Flowbite forms.md validation states)
  const passcodeMismatch = newPasscode.length > 0 && confirmPasscode.length > 0 && newPasscode !== confirmPasscode;
  const passcodeMatch = newPasscode.length === 6 && confirmPasscode.length === 6 && newPasscode === confirmPasscode;

  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotMobile, setForgotMobile] = useState('');
  const [forgotMobileTouched, setForgotMobileTouched] = useState(false);
  const [isSendingLoginInfo, setIsSendingLoginInfo] = useState(false);
  const [forgotResult, setForgotResult] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Sync browser autofill on mount & delay ticks
  useEffect(() => {
    const syncAutofill = () => {
      if (mobileInputRef.current?.value && !mobileNumber) {
        setMobileNumber(mobileInputRef.current.value);
      }
      if (passcodeInputRef.current?.value && !passcode) {
        setPasscode(passcodeInputRef.current.value);
      }
    };

    syncAutofill();
    const t1 = setTimeout(syncAutofill, 50);
    const t2 = setTimeout(syncAutofill, 200);
    const t3 = setTimeout(syncAutofill, 600);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [mobileNumber, passcode]);

  // Validation state calculations with DOM autofill fallback
  const effectiveMobile = mobileNumber || mobileInputRef.current?.value || '';
  const effectivePasscode = passcode || passcodeInputRef.current?.value || '';

  const mobileEmpty = mobileTouched && !effectiveMobile.trim();
  const mobileInvalid = mobileTouched && effectiveMobile.length > 0 && effectiveMobile.length < 10 && effectiveMobile !== 'admin' && effectiveMobile !== 'root';

  const passcodeEmpty = passcodeTouched && !effectivePasscode.trim();
  const passcodeInvalid = passcodeTouched && effectivePasscode.length > 0 && effectivePasscode.length < 6 && effectivePasscode !== '123456' && effectivePasscode !== 'admin';

  const forgotMobileEmpty = forgotMobileTouched && !forgotMobile.trim();
  const forgotMobileInvalid = forgotMobileTouched && forgotMobile.length > 0 && forgotMobile.length < 10 && forgotMobile !== 'admin' && forgotMobile !== 'root';

  const newPasscodeEmpty = newPasscodeTouched && !newPasscode.trim();
  const newPasscodeInvalid = newPasscodeTouched && newPasscode.length > 0 && !/^\d{6}$/.test(newPasscode);
  const newPasscodeSameAsOld = newPasscodeTouched && newPasscode.length === 6 && newPasscode === effectivePasscode;

  const handleMobileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawVal = e.target.value;
    const val = (rawVal === 'admin' || rawVal === 'root') ? rawVal : rawVal.replace(/\D/g, '').slice(0, 10);
    setMobileNumber(val);
    setError(null);
    clearSessionMismatchNotice();
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
    clearSessionMismatchNotice();
  };

  const handlePasscodeKey = (num: string) => {
    if (passcode.length < 6) {
      const nextPasscode = passcode + num;
      setPasscode(nextPasscode);
      setError(null);

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
    setMobileTouched(true);
    setPasscodeTouched(true);
    setError(null);

    const loginMobile = (mobileNumber || mobileInputRef.current?.value || '').trim();
    const loginPasscode = (passcode || passcodeInputRef.current?.value || '').trim();

    if (loginMobile.length > 0 && loginMobile.length < 10 && loginMobile !== 'admin' && loginMobile !== 'root') {
      setError(t('enter_10_digit_mobile_error'));
      return;
    }
    if (loginPasscode.length < 6 && loginPasscode !== '123456' && loginPasscode !== 'admin') {
      setError(t('enter_6_digit_passcode_error'));
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch('/php/api/router.php?action=login_user', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mobile_number: loginMobile, passcode: loginPasscode }),
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
                <Input
                  id="forgotMobile"
                  name="forgotMobile"
                  type="tel"
                  label={t('mobile_username_label', 'Mobile Number / Username')}
                  value={forgotMobile}
                  onChange={(e) => {
                    setForgotMobile(e.target.value.replace(/\D/g, '').slice(0, 10));
                    setForgotResult(null);
                  }}
                  onBlur={() => setForgotMobileTouched(true)}
                  placeholder={t('mobile_number_placeholder', '10-digit mobile number')}
                  disabled={isSendingLoginInfo}
                  autoFocus
                  required
                  className="font-medium"
                  error={forgotMobileEmpty ? 'Mobile number is required' : forgotMobileInvalid ? 'Enter your full 10-digit mobile number' : undefined}
                />
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
                    setForgotMobileTouched(false);
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
                <Input
                  id="newPasscode"
                  name="newPasscode"
                  type="password"
                  label={t('new_passcode_label', 'New 6-Digit Passcode')}
                  value={newPasscode}
                  onChange={(e) => setNewPasscode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  onBlur={() => setNewPasscodeTouched(true)}
                  placeholder="••••••"
                  maxLength={6}
                  inputMode="numeric"
                  autoFocus
                  disabled={isSavingPasscode}
                  required
                  className="font-mono tracking-[0.25em]"
                  error={
                    newPasscodeEmpty
                      ? 'New passcode is required'
                      : newPasscodeInvalid
                      ? 'New passcode must be exactly 6 digits'
                      : newPasscodeSameAsOld
                      ? 'New passcode must be different from the temporary one'
                      : undefined
                  }
                />
              </div>

              <div>
                <Input
                  id="confirmPasscode"
                  name="confirmPasscode"
                  type="password"
                  label={t('confirm_new_passcode_label', 'Confirm New Passcode')}
                  value={confirmPasscode}
                  onChange={(e) => setConfirmPasscode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="••••••"
                  maxLength={6}
                  inputMode="numeric"
                  disabled={isSavingPasscode}
                  required
                  className="font-mono tracking-[0.25em]"
                  error={passcodeMismatch ? "Passcodes don't match" : undefined}
                  success={passcodeMatch ? "Passcodes match" : undefined}
                />
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
      {/* Real brand mark (app-icons/icon-source.png) paired with the wordmark, matching
          Flowbite's own recommended sign-in block markup (img + text inside the same
          font-semibold anchor) rather than a generic icon-in-a-box placeholder - swapped in
          27 Aug 2026 per explicit request, extended to the terminal variant the same day (it
          was still on the old Lock-icon-in-a-box treatment even after the management variant
          was fixed). */}
      <a href="/" className="flex items-center mb-6 text-2xl font-semibold text-gray-900 dark:text-white">
        <img src="/app-icons/icon-source.png" alt="" className="w-8 h-8 mr-2" />
        <span>{isTerminal ? t('login_modal_brand') : 'Ground Code'}</span>
      </a>

      <div className="w-full bg-white rounded-lg shadow-sm dark:border md:mt-0 sm:max-w-md xl:p-0 dark:bg-gray-800 dark:border-gray-700">
        <div className="p-6 space-y-4 md:space-y-6 sm:p-8">
          <h1 className="text-xl font-bold leading-tight tracking-tight text-gray-900 md:text-2xl dark:text-white">
            {isTerminal ? t('terminal_authorization_heading', 'Sign in') : t('sign_in_heading', 'Sign in to your account')}
          </h1>

          <form onSubmit={handleLogin} ref={loginFormRef} className="space-y-4 md:space-y-6">

            {error && (
              <Alert color="failure" icon={AlertCircle} className="rounded-lg">
                <span>{error}</span>
              </Alert>
            )}

            <div>
              <Input
                id="mobileNumber"
                name="mobileNumber"
                type="tel"
                label={t('mobile_username_label', 'Mobile Number / Username')}
                value={mobileNumber}
                onChange={handleMobileChange}
                onBlur={() => {
                  if (mobileInputRef.current?.value && !mobileNumber) {
                    setMobileNumber(mobileInputRef.current.value);
                  }
                  setMobileTouched(true);
                }}
                placeholder={t('mobile_number_placeholder', '10-digit mobile number')}
                disabled={isLoading}
                autoFocus
                autoComplete="off"
                ref={mobileInputRef}
                required
                className="font-medium"
                error={mobileEmpty ? 'Mobile number is required' : mobileInvalid ? t('enter_10_digit_mobile_error', 'Enter 10-digit mobile number') : undefined}
              />
            </div>

            <div>
              <div className="relative">
                {!isTerminal && (
                  <div className="absolute right-0 top-0 z-10">
                    <button
                      type="button"
                      onClick={() => {
                        setForgotMobile(mobileNumber);
                        setForgotResult(null);
                        setForgotMobileTouched(false);
                        setShowForgotPassword(true);
                      }}
                      className="text-sm font-medium text-blue-600 hover:underline dark:text-blue-500 cursor-pointer"
                    >
                      {t('forgot_password_link', 'Forgot passcode?')}
                    </button>
                  </div>
                )}
                <Input
                  id="passcode"
                  name="passcode"
                  type="password"
                  label={t('pin_passcode_label', '6-Digit Security Passcode')}
                  value={passcode}
                  onChange={handlePasscodeChange}
                  onBlur={() => {
                    if (passcodeInputRef.current?.value && !passcode) {
                      setPasscode(passcodeInputRef.current.value);
                    }
                    setPasscodeTouched(true);
                  }}
                  placeholder="••••••"
                  maxLength={6}
                  inputMode="numeric"
                  disabled={isLoading}
                  autoComplete="off"
                  ref={passcodeInputRef}
                  required
                  className="font-mono tracking-[0.25em]"
                  error={passcodeEmpty ? 'Passcode is required' : passcodeInvalid ? t('enter_6_digit_passcode_error', 'Enter 6-digit passcode') : undefined}
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
                  <Backspace className="w-4 h-4 mx-auto" />
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

            {onStartTrial && (
              <div className="pt-3 border-t border-slate-200 dark:border-slate-700 text-center space-y-2">
                <p className="text-2xs font-medium text-slate-500 dark:text-slate-400">New resort or hotel owner?</p>
                <button
                  type="button"
                  onClick={onStartTrial}
                  className="w-full py-2.5 px-4 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold text-xs rounded-lg shadow-md flex items-center justify-center gap-2 cursor-pointer transition-all hover:scale-[1.01]"
                >
                  <Sparkles className="w-4 h-4 text-amber-300 animate-pulse" />
                  <span>Start 30-Day Free Trial (No Credit Card Needed)</span>
                </button>
              </div>
            )}
          </form>
        </div>
      </div>
    </section>
  );
};
