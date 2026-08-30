import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { supabase } from '../lib/supabase';
import LanguageToggle from '../components/LanguageToggle';

/**
 * LoginPage Component
 * Mobile-first authentication screen with phone number & password.
 */
export default function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Check if session already exists on load
  useEffect(() => {
    let isMounted = true;
    async function checkSession() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session && isMounted) {
          navigate('/', { replace: true });
        }
      } catch (err) {
        console.warn('Session check failed:', err);
      }
    }
    checkSession();
    return () => {
      isMounted = false;
    };
  }, [navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage('');

    const rawInput = phone.trim();
    if (!rawInput) {
      setErrorMessage(t('auth.phoneRequired', 'Please enter your phone number'));
      return;
    }
    if (!password) {
      setErrorMessage(t('auth.passwordRequired', 'Please enter your password'));
      return;
    }

    // Format phone to email (if not already an email)
    let email = rawInput;
    if (!email.includes('@')) {
      const cleanPhone = rawInput.replace(/\D/g, '');
      if (cleanPhone.length < 10) {
        setErrorMessage(t('auth.invalidPhone', 'Please enter a valid 10-digit phone number'));
        return;
      }
      email = `${cleanPhone}@stockeasy.local`;
    }

    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        throw error;
      }

      if (data?.user) {
        toast.success(t('auth.welcomeBack', 'Welcome back to StockEasy!'));
        navigate('/', { replace: true });
      }
    } catch (err) {
      console.error('Login error:', err);
      const friendlyError = err.message?.includes('Invalid login credentials')
        ? t('auth.loginError', 'Login failed. Please check your credentials.')
        : (err.message || t('auth.loginError', 'Login failed. Please check your credentials.'));
      
      setErrorMessage(friendlyError);
      toast.error(friendlyError);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex flex-col justify-between items-center bg-gradient-to-br from-blue-700 via-indigo-800 to-slate-900 p-4 sm:p-6 text-base-content">
      {/* Top spacing / decorative header */}
      <div className="w-full max-w-sm text-center pt-8 pb-4">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-white/10 backdrop-blur-md shadow-lg border border-white/20 mb-3 text-3xl">
          📦
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight drop-shadow-sm">
          {t('common.appName', 'StockEasy')}
        </h1>
        <p className="text-blue-200 text-sm font-medium mt-1">
          {t('auth.subtitle', 'Inventory Management')}
        </p>
      </div>

      {/* Main Login Card */}
      <div className="card w-full max-w-sm bg-base-100/95 backdrop-blur-md shadow-2xl rounded-3xl border border-white/10">
        <div className="card-body p-6 sm:p-8">
          <h2 className="text-2xl font-bold text-center text-base-content mb-2">
            {t('auth.login', 'Login')}
          </h2>
          <p className="text-center text-xs text-base-content/60 mb-4">
            {t('auth.loginInstruction', 'Enter your registered phone number to continue')}
          </p>

          {/* Error Alert Display */}
          {errorMessage && (
            <div className="alert alert-error shadow-sm text-xs sm:text-sm py-2.5 px-3 rounded-xl mb-4 animate-shake">
              <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-5 w-5" fill="none" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>{errorMessage}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Phone Number Input */}
            <div className="form-control">
              <label className="label py-1">
                <span className="label-text font-bold text-sm text-base-content">
                  {t('auth.phone', 'Phone Number')}
                </span>
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-base-content/50 text-lg">
                  📞
                </span>
                <input
                  type="tel"
                  inputMode="numeric"
                  placeholder={t('auth.phonePlaceholder', 'Enter 10-digit phone number')}
                  value={phone}
                  onChange={(e) => {
                    setPhone(e.target.value);
                    if (errorMessage) setErrorMessage('');
                  }}
                  className="input input-bordered input-lg w-full pl-11 text-base font-medium rounded-2xl focus:input-primary bg-base-200/50"
                  autoComplete="tel"
                  required
                />
              </div>
            </div>

            {/* Password Input */}
            <div className="form-control">
              <label className="label py-1">
                <span className="label-text font-bold text-sm text-base-content">
                  {t('auth.password', 'Password')}
                </span>
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-base-content/50 text-lg">
                  🔒
                </span>
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder={t('auth.passwordPlaceholder', 'Enter password')}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (errorMessage) setErrorMessage('');
                  }}
                  className="input input-bordered input-lg w-full pl-11 pr-11 text-base font-medium rounded-2xl focus:input-primary bg-base-200/50"
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-base-content/50 hover:text-base-content"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? '🙈' : '👁️'}
                </button>
              </div>
            </div>

            {/* Login Submit Button */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={loading}
                className="btn btn-primary btn-block btn-lg h-14 rounded-2xl text-base sm:text-lg font-bold shadow-lg shadow-primary/30 active:scale-98 transition-all"
              >
                {loading ? (
                  <span className="inline-flex items-center gap-2">
                    <span className="loading loading-spinner loading-md"></span>
                    {t('auth.loggingIn', 'Signing in...')}
                  </span>
                ) : (
                  t('auth.loginButton', 'Sign In')
                )}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Language Toggle at Bottom */}
      <div className="w-full max-w-sm py-6 text-center">
        <LanguageToggle className="inline-flex" />
        <p className="text-white/40 text-xs mt-3 font-mono">
          StockEasy v1.0 • Hyderabad Retail
        </p>
      </div>
    </div>
  );
}
