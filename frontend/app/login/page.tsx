'use client'

import React, { useState, useEffect, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/lib/auth'
import { ApiError } from '@/lib/api'
import {
  Orbit,
  Mail,
  ShieldCheck,
  ArrowRight,
  Clock,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Network,
  FileText,
  BotMessageSquare,
  ArrowLeft,
  Loader2,
} from 'lucide-react'

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirectPath = searchParams.get('redirect') || '/'

  const { isAuthenticated, isLoading: authLoading, sendOtp, verifyOtp } = useAuth()

  // Form states
  const [step, setStep] = useState<'email' | 'otp'>('email')
  const [email, setEmail] = useState('')
  const [otpDigits, setOtpDigits] = useState<string[]>(['', '', '', '', '', ''])

  // UI status
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [remainingAttempts, setRemainingAttempts] = useState<number | null>(null)

  // Timers
  const [expirySeconds, setExpirySeconds] = useState<number>(300) // 5 minutes
  const [resendCooldown, setResendCooldown] = useState<number>(0)
  const [isExpired, setIsExpired] = useState(false)

  // Input refs for 6 digits
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

  // If already logged in, redirect
  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      router.replace(redirectPath)
    }
  }, [authLoading, isAuthenticated, router, redirectPath])

  // Expiry countdown timer (5 minutes = 300 seconds)
  useEffect(() => {
    if (step !== 'otp' || expirySeconds <= 0) {
      if (expirySeconds <= 0 && step === 'otp') {
        setIsExpired(true)
      }
      return
    }

    const timer = setInterval(() => {
      setExpirySeconds((prev) => {
        if (prev <= 1) {
          setIsExpired(true)
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [step, expirySeconds])

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown <= 0) return

    const timer = setInterval(() => {
      setResendCooldown((prev) => (prev <= 1 ? 0 : prev - 1))
    }, 1000)

    return () => clearInterval(timer)
  }, [resendCooldown])

  // Format seconds to mm:ss
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  // Handle Send OTP
  const handleSendOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    setErrorMsg(null)
    setSuccessMsg(null)
    setRemainingAttempts(null)

    const trimmedEmail = email.trim()
    if (!trimmedEmail) {
      setErrorMsg('Please enter your email address.')
      return
    }

    setIsSubmitting(true)
    try {
      const res = await sendOtp(trimmedEmail)
      setStep('otp')
      setExpirySeconds(300) // Reset to 5 mins
      setIsExpired(false)
      setResendCooldown(res.cooldownSeconds || 60)
      setOtpDigits(['', '', '', '', '', ''])
      setSuccessMsg(res.message || 'Verification code sent to your email!')

      // Focus first digit after render
      setTimeout(() => {
        inputRefs.current[0]?.focus()
      }, 100)
    } catch (err: any) {
      if (err instanceof ApiError) {
        setErrorMsg(err.message)
        if (err.cooldownSeconds) {
          setResendCooldown(err.cooldownSeconds)
        }
      } else {
        setErrorMsg(err?.message || 'Failed to send verification code. Please try again.')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  // Handle Verify OTP
  const handleVerifyOtp = async (codeToVerify?: string) => {
    const code = (codeToVerify || otpDigits.join('')).trim()
    setErrorMsg(null)
    setSuccessMsg(null)

    if (code.length !== 6) {
      setErrorMsg('Please enter the full 6-digit verification code.')
      return
    }

    if (isExpired) {
      setErrorMsg('This code has expired. Please request a new one.')
      return
    }

    setIsSubmitting(true)
    try {
      await verifyOtp(email.trim(), code)
      setSuccessMsg('Authentication successful! Taking you to CodeSphere...')
      setTimeout(() => {
        router.replace(redirectPath)
      }, 800)
    } catch (err: any) {
      if (err instanceof ApiError) {
        setErrorMsg(err.message)
        if (err.remainingAttempts !== undefined) {
          setRemainingAttempts(err.remainingAttempts)
          if (err.remainingAttempts <= 0) {
            setIsExpired(true)
          }
        }
      } else {
        setErrorMsg(err?.message || 'Verification failed. Please check the code and try again.')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  // Digit Input Handlers
  const handleDigitChange = (index: number, val: string) => {
    const cleanVal = val.replace(/\D/g, '')
    if (!cleanVal) {
      const newDigits = [...otpDigits]
      newDigits[index] = ''
      setOtpDigits(newDigits)
      return
    }

    // Single digit entry
    const char = cleanVal.slice(-1)
    const newDigits = [...otpDigits]
    newDigits[index] = char
    setOtpDigits(newDigits)

    // Advance to next input
    if (index < 5) {
      inputRefs.current[index + 1]?.focus()
    } else {
      // Completed 6 digits, auto-verify
      const fullCode = newDigits.join('')
      if (fullCode.length === 6) {
        handleVerifyOtp(fullCode)
      }
    }
  }

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otpDigits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus()
    } else if (e.key === 'ArrowLeft' && index > 0) {
      inputRefs.current[index - 1]?.focus()
    } else if (e.key === 'ArrowRight' && index < 5) {
      inputRefs.current[index + 1]?.focus()
    } else if (e.key === 'Enter') {
      e.preventDefault()
      handleVerifyOtp()
    }
  }

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault()
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (pasted.length > 0) {
      const newDigits = [...otpDigits]
      for (let i = 0; i < 6; i++) {
        newDigits[i] = pasted[i] || ''
      }
      setOtpDigits(newDigits)
      const nextFocus = Math.min(pasted.length, 5)
      inputRefs.current[nextFocus]?.focus()
      if (pasted.length === 6) {
        handleVerifyOtp(pasted)
      }
    }
  }

  if (authLoading) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', minHeight: '60vh' }}>
        <Loader2 className="animate-spin spin" size={32} style={{ color: 'var(--primary)' }} />
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 460, width: '100%', margin: '0 auto' }}>
      {/* Card Panel */}
      <div className="panel" style={{ padding: '36px 32px', boxShadow: 'var(--shadow-pop)' }}>
        {/* Header info */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: 14,
              background: 'var(--primary-soft)',
              color: 'var(--primary)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 16,
            }}
          >
            {step === 'email' ? <Mail size={26} /> : <ShieldCheck size={26} />}
          </div>
          <h1 className="title-lg" style={{ marginBottom: 8 }}>
            {step === 'email' ? 'Sign in to CodeSphere' : 'Enter verification code'}
          </h1>
          <p className="small muted" style={{ margin: 0 }}>
            {step === 'email'
              ? 'We will send a 6-digit one-time password to your email'
              : `Sent to ${email}`}
          </p>
        </div>

        {/* Error Banner */}
        {errorMsg && (
          <div
            id="auth-error-banner"
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
              padding: '12px 14px',
              borderRadius: 'var(--radius)',
              background: 'var(--danger-soft)',
              color: 'var(--danger)',
              fontSize: 'var(--text-sm)',
              marginBottom: 20,
              border: '1px solid rgba(180, 51, 74, 0.2)',
            }}
          >
            <XCircle size={18} style={{ flexShrink: 0, marginTop: 2 }} />
            <div style={{ flex: 1 }}>
              <span>{errorMsg}</span>
              {remainingAttempts !== null && remainingAttempts > 0 && (
                <div style={{ fontWeight: 600, marginTop: 4 }}>
                  {remainingAttempts} attempt(s) remaining before code is invalidated.
                </div>
              )}
            </div>
          </div>
        )}

        {/* Expiry Warning Banner */}
        {isExpired && step === 'otp' && (
          <div
            id="auth-expired-banner"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '12px 14px',
              borderRadius: 'var(--radius)',
              background: 'var(--warn-soft)',
              color: 'var(--warn)',
              fontSize: 'var(--text-sm)',
              marginBottom: 20,
              border: '1px solid rgba(168, 106, 18, 0.2)',
            }}
          >
            <AlertTriangle size={18} style={{ flexShrink: 0 }} />
            <span>This code has expired. Please request a new code.</span>
          </div>
        )}

        {/* Success Banner */}
        {successMsg && !errorMsg && (
          <div
            id="auth-success-banner"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '12px 14px',
              borderRadius: 'var(--radius)',
              background: 'var(--ok-soft)',
              color: 'var(--ok)',
              fontSize: 'var(--text-sm)',
              marginBottom: 20,
              border: '1px solid rgba(47, 138, 91, 0.2)',
            }}
          >
            <CheckCircle2 size={18} style={{ flexShrink: 0 }} />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Step 1: Email Form */}
        {step === 'email' ? (
          <form onSubmit={handleSendOtp} className="stack" style={{ gap: 20 }}>
            <div>
              <label htmlFor="email-input" className="label">
                Email Address
              </label>
              <input
                id="email-input"
                type="email"
                className="input"
                placeholder="developer@example.com"
                autoFocus
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isSubmitting}
              />
            </div>

            <button
              id="send-code-btn"
              type="submit"
              className="btn btn-primary"
              style={{ width: '100%', height: 42 }}
              disabled={isSubmitting || !email.trim() || resendCooldown > 0}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="animate-spin spin" size={16} />
                  Sending code...
                </>
              ) : resendCooldown > 0 ? (
                `Wait ${resendCooldown}s to request code`
              ) : (
                <>
                  Send Verification Code
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </form>
        ) : (
          /* Step 2: OTP Form */
          <div className="stack" style={{ gap: 24 }}>
            {/* 6 Digit Inputs */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <label className="label" style={{ margin: 0 }}>
                  One-Time Password
                </label>

                {/* Expiry Timer Pill */}
                <span
                  id="otp-expiry-timer"
                  className={`badge ${isExpired ? 'badge-failed' : expirySeconds <= 60 ? 'badge-busy' : 'badge-lav'}`}
                  style={{ fontSize: 'var(--text-xs)', gap: 4 }}
                >
                  <Clock size={12} />
                  {isExpired ? 'Expired' : `Expires in ${formatTime(expirySeconds)}`}
                </span>
              </div>

              {/* Digit Boxes */}
              <div
                style={{
                  display: 'flex',
                  gap: 8,
                  justifyContent: 'center',
                }}
              >
                {otpDigits.map((digit, idx) => (
                  <input
                    key={idx}
                    id={`otp-digit-${idx}`}
                    ref={(el) => {
                      inputRefs.current[idx] = el
                    }}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    className="input"
                    disabled={isSubmitting || isExpired}
                    value={digit}
                    onChange={(e) => handleDigitChange(idx, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(idx, e)}
                    onPaste={handlePaste}
                    style={{
                      width: 48,
                      height: 54,
                      fontSize: 22,
                      fontWeight: 600,
                      textAlign: 'center',
                      padding: 0,
                      fontFamily: 'var(--font-mono)',
                      borderColor: isExpired
                        ? 'var(--danger)'
                        : digit
                        ? 'var(--primary)'
                        : undefined,
                    }}
                  />
                ))}
              </div>

              {/* Hidden single input for automated tests / assistive tech */}
              <input
                id="otp-input"
                type="hidden"
                value={otpDigits.join('')}
                readOnly
              />
            </div>

            {/* Verify Button */}
            <button
              id="verify-otp-btn"
              type="button"
              className="btn btn-primary"
              style={{ width: '100%', height: 42 }}
              disabled={isSubmitting || isExpired || otpDigits.join('').length !== 6}
              onClick={() => handleVerifyOtp()}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="animate-spin spin" size={16} />
                  Verifying code...
                </>
              ) : (
                <>
                  Verify & Sign In
                  <ArrowRight size={16} />
                </>
              )}
            </button>

            {/* Action Row: Resend Code & Back */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingTop: 8,
                borderTop: '1px solid var(--border)',
              }}
            >
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  setStep('email')
                  setErrorMsg(null)
                  setSuccessMsg(null)
                }}
                disabled={isSubmitting}
              >
                <ArrowLeft size={14} />
                Change email
              </button>

              <button
                id="resend-otp-btn"
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={isSubmitting || resendCooldown > 0}
                onClick={() => handleSendOtp()}
                style={{ color: resendCooldown > 0 ? 'var(--muted)' : 'var(--primary)' }}
              >
                <RotateCcw size={14} />
                {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend code'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Value Props Footer */}
      <div
        style={{
          marginTop: 28,
          padding: '16px 20px',
          borderRadius: 'var(--radius)',
          background: 'var(--sunken)',
          border: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          fontSize: 'var(--text-xs)',
          color: 'var(--muted)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text)', fontWeight: 500 }}>
          <Network size={14} style={{ color: 'var(--primary)' }} />
          Visual interactive code dependency graphs
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text)', fontWeight: 500 }}>
          <FileText size={14} style={{ color: 'var(--ok)' }} />
          Automated high-level architecture documentation
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text)', fontWeight: 500 }}>
          <BotMessageSquare size={14} style={{ color: 'var(--warn)' }} />
          Repository-grounded RAG intelligence chat
        </div>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
      {/* Top Header */}
      <header className="topbar">
        <Link href="/" className="brand" aria-label="CodeSphere home">
          <span className="brand-mark"><Orbit /></span>
          CodeSphere
        </Link>
      </header>

      {/* Main Container */}
      <main
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '40px 20px',
        }}
      >
        <Suspense
          fallback={
            <div style={{ display: 'grid', placeItems: 'center', minHeight: '50vh' }}>
              <Loader2 className="animate-spin spin" size={32} style={{ color: 'var(--primary)' }} />
            </div>
          }
        >
          <LoginForm />
        </Suspense>
      </main>
    </div>
  )
}
