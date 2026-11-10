'use client';
import { useState, useEffect } from 'react';
import { Phone, Lock, ArrowRight, RefreshCw } from 'lucide-react';

/* ==========================================================================
   Customer WhatsApp OTP Login Form
   
   Two-step authentication:
   1. Phone number input → Request OTP
   2. OTP input → Verify and login
   
   Features:
   - Resend OTP with countdown
   - Attempt tracking
   - Error handling
   - Loading states
   ========================================================================== */

export default function CustomerOtpForm({ onSuccess, redirectTo = '/customer/dashboard' }) {
  const [step, setStep] = useState('phone'); // 'phone' | 'otp' | 'confirm'
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [confirmationCode, setConfirmationCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [attemptsLeft, setAttemptsLeft] = useState(3);
  const [isNewUser, setIsNewUser] = useState(false);

  // Countdown timer for resend
  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  // Request OTP
  async function requestOtp() {
    if (loading) return;
    
    const phoneDigits = phone.replace(/\D/g, '');
    if (!phoneDigits || phoneDigits.length < 10) {
      setError('Enter a valid 10-digit phone number');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth/customer/request-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phoneDigits }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to send OTP');
        if (data.cooldownSeconds) {
          setResendCooldown(data.cooldownSeconds);
        }
        return;
      }

      setStep('otp');
      setResendCooldown(60);
      setAttemptsLeft(3);
      setError('');
    } catch (err) {
      setError('Could not reach the server. Please check your connection.');
    } finally {
      setLoading(false);
    }
  }

  // Verify OTP
  async function verifyOtp() {
    if (loading) return;
    
    if (!otp || otp.length !== 6) {
      setError('Enter the 6-digit OTP');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth/customer/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: phone.replace(/\D/g, ''),
          otp: otp,
          confirmationCode: confirmationCode || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        // Check if new user needs confirmation code
        if (data.code === 'CONFIRMATION_REQUIRED' || data.code === 'INVALID_CONFIRMATION') {
          setIsNewUser(true);
          setStep('confirm');
          setError(data.error);
          setLoading(false);
          return;
        }

        setError(data.error || 'Invalid OTP');
        if (data.attemptsLeft !== undefined) {
          setAttemptsLeft(data.attemptsLeft);
        }
        if (data.code === 'MAX_ATTEMPTS' || data.code === 'OTP_EXPIRED') {
          // Reset to phone step to request new OTP
          setTimeout(() => {
            setStep('phone');
            setOtp('');
            setConfirmationCode('');
            setError('');
          }, 2000);
        }
        return;
      }

      // Success - redirect or call callback
      if (onSuccess) {
        onSuccess(data.customer);
      } else {
        window.location.href = redirectTo;
      }
    } catch (err) {
      setError('Could not reach the server. Please check your connection.');
    } finally {
      setLoading(false);
    }
  }

  // Submit confirmation code and verify again
  async function submitConfirmation() {
    if (loading) return;
    
    if (!confirmationCode) {
      setError('Enter the confirmation code');
      return;
    }

    // Retry OTP verification with confirmation code
    verifyOtp();
  }

  // Resend OTP
  function resendOtp() {
    setOtp('');
    setError('');
    setAttemptsLeft(3);
    requestOtp();
  }

  // Handle Enter key
  function handleKeyDown(e) {
    if (e.key === 'Enter') {
      if (step === 'phone') requestOtp();
      else if (step === 'otp') verifyOtp();
      else if (step === 'confirm') submitConfirmation();
    }
  }

  return (
    <div className="w-full max-w-[420px]">
      {/* Error message */}
      {error && (
        <div
          role="alert"
          className="mb-4 flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[13.5px] text-red-700"
        >
          <span className="mt-0.5">⚠️</span>
          <span>{error}</span>
        </div>
      )}

      {step === 'phone' ? (
        /* Phone Number Step */
        <div>
          <h2 className="mb-6 text-center text-2xl font-bold text-slate-900">
            Sign in with WhatsApp
          </h2>
          
          <div className="mb-1.5">
            <label className="block text-[13.5px] font-semibold text-slate-800">
              Phone Number
            </label>
          </div>
          
          <div className="flex h-12 items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 transition-all focus-within:border-emerald-600 focus-within:shadow-[0_0_0_4px_rgba(5,150,105,.12)] hover:border-slate-300">
            <Phone className="h-[18px] w-[18px] shrink-0 text-slate-400" />
            <span className="text-[14px] font-medium text-slate-600">+91</span>
            <input
              type="tel"
              className="h-full w-full border-0 bg-transparent text-[14px] text-slate-900 outline-none placeholder:text-slate-400"
              placeholder="98765 43210"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              onKeyDown={handleKeyDown}
              maxLength={10}
              autoFocus
            />
          </div>

          <button
            type="button"
            onClick={requestOtp}
            disabled={loading || resendCooldown > 0}
            className="group mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 text-[15px] font-bold text-white shadow-lg shadow-emerald-500/30 transition-all duration-300 hover:shadow-xl hover:shadow-emerald-500/40 hover:-translate-y-0.5 active:translate-y-0 active:scale-[.99] disabled:opacity-60 disabled:hover:translate-y-0"
          >
            {loading ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Sending OTP...
              </>
            ) : resendCooldown > 0 ? (
              <>Wait {resendCooldown}s</>
            ) : (
              <>
                Send OTP
                <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
              </>
            )}
          </button>

          <p className="mt-4 text-center text-[12.5px] text-slate-500">
            You'll receive a 6-digit OTP on WhatsApp
          </p>
        </div>
      ) : step === 'otp' ? (
        /* OTP Verification Step */
        <div>
          <button
            type="button"
            onClick={() => {
              setStep('phone');
              setOtp('');
              setError('');
            }}
            className="mb-4 text-[13px] font-medium text-emerald-700 hover:text-emerald-800"
          >
            ← Change number
          </button>

          <h2 className="mb-2 text-center text-2xl font-bold text-slate-900">
            Enter OTP
          </h2>
          
          <p className="mb-6 text-center text-[13.5px] text-slate-600">
            Sent to +91 {phone.slice(-10).replace(/(\d{5})(\d{5})/, '$1 $2')}
          </p>

          <div className="mb-1.5">
            <label className="block text-[13.5px] font-semibold text-slate-800">
              6-Digit OTP
            </label>
          </div>
          
          <div className="flex h-12 items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 transition-all focus-within:border-emerald-600 focus-within:shadow-[0_0_0_4px_rgba(5,150,105,.12)] hover:border-slate-300">
            <Lock className="h-[18px] w-[18px] shrink-0 text-slate-400" />
            <input
              type="text"
              inputMode="numeric"
              className="h-full w-full border-0 bg-transparent text-[16px] font-semibold tracking-[0.3em] text-slate-900 outline-none placeholder:tracking-normal placeholder:font-normal placeholder:text-slate-400"
              placeholder="000000"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
              onKeyDown={handleKeyDown}
              maxLength={6}
              autoFocus
            />
          </div>

          {attemptsLeft < 3 && attemptsLeft > 0 && (
            <p className="mt-2 text-[12.5px] text-amber-700">
              {attemptsLeft} attempt{attemptsLeft > 1 ? 's' : ''} remaining
            </p>
          )}

          <button
            type="button"
            onClick={verifyOtp}
            disabled={loading || otp.length !== 6}
            className="group mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 text-[15px] font-bold text-white shadow-lg shadow-emerald-500/30 transition-all duration-300 hover:shadow-xl hover:shadow-emerald-500/40 hover:-translate-y-0.5 active:translate-y-0 active:scale-[.99] disabled:opacity-60 disabled:hover:translate-y-0"
          >
            {loading ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Verifying...
              </>
            ) : (
              <>
                Verify & Login
                <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
              </>
            )}
          </button>

          {/* Resend button */}
          <div className="mt-4 text-center">
            {resendCooldown > 0 ? (
              <p className="text-[13px] text-slate-500">
                Resend OTP in {resendCooldown}s
              </p>
            ) : (
              <button
                type="button"
                onClick={resendOtp}
                disabled={loading}
                className="inline-flex items-center gap-2 text-[13px] font-medium text-emerald-700 hover:text-emerald-800 disabled:opacity-50"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Resend OTP
              </button>
            )}
          </div>
        </div>
      ) : (
        /* Confirmation Code Step (for new registrations) */
        <div>
          <button
            type="button"
            onClick={() => {
              setStep('otp');
              setConfirmationCode('');
              setError('');
            }}
            className="mb-4 text-[13px] font-medium text-emerald-700 hover:text-emerald-800"
          >
            ← Back to OTP
          </button>

          <h2 className="mb-2 text-center text-2xl font-bold text-slate-900">
            New Registration
          </h2>
          
          <p className="mb-6 text-center text-[13.5px] text-slate-600">
            Enter the confirmation code to complete your registration
          </p>

          <div className="mb-1.5">
            <label className="block text-[13.5px] font-semibold text-slate-800">
              Confirmation Code
            </label>
          </div>
          
          <div className="flex h-12 items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 transition-all focus-within:border-emerald-600 focus-within:shadow-[0_0_0_4px_rgba(5,150,105,.12)] hover:border-slate-300">
            <Lock className="h-[18px] w-[18px] shrink-0 text-slate-400" />
            <input
              type="text"
              className="h-full w-full border-0 bg-transparent text-[14px] font-semibold text-slate-900 outline-none placeholder:font-normal placeholder:text-slate-400"
              placeholder="Enter confirmation code"
              value={confirmationCode}
              onChange={(e) => setConfirmationCode(e.target.value)}
              onKeyDown={handleKeyDown}
              autoFocus
            />
          </div>

          <button
            type="button"
            onClick={submitConfirmation}
            disabled={loading || !confirmationCode}
            className="group mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 text-[15px] font-bold text-white shadow-lg shadow-emerald-500/30 transition-all duration-300 hover:shadow-xl hover:shadow-emerald-500/40 hover:-translate-y-0.5 active:translate-y-0 active:scale-[.99] disabled:opacity-60 disabled:hover:translate-y-0"
          >
            {loading ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Verifying...
              </>
            ) : (
              <>
                Complete Registration
                <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
              </>
            )}
          </button>

          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-[12.5px] text-amber-800">
            <p className="font-semibold">Contact support if you don't have a confirmation code</p>
            <p className="mt-1">Only authorized users can register. The confirmation code is provided by TEMPLE FABRICS.</p>
          </div>
        </div>
      )}
    </div>
  );
}
