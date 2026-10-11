'use client'

import React, { useState, useEffect, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/lib/auth'
import { ApiError, api } from '@/lib/api'
import {
  Orbit,
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
  Lock,
  User,
  Eye,
  EyeOff,
  Check,
  KeyRound,
} from 'lucide-react'



function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirectPath = searchParams.get('redirect') || '/'

  const {
    isAuthenticated,
    isLoading: authLoading,
    login,
    signupSendOtp,
    signupVerifyOtp,
    signupComplete,
    forgotPasswordSendOtp,
    forgotPasswordVerifyOtp,
    forgotPasswordReset,
    refreshUser,
  } = useAuth()

  // Mode: Sign In | Sign Up | Forgot Password
  const [mode, setMode] = useState<'signin' | 'signup' | 'forgot-password'>('signin')

  // ==================== Sign In State ====================
  const [loginEmail, setLoginEmail] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [showLoginPassword, setShowLoginPassword] = useState(false)
  const [loginSubmitting, setLoginSubmitting] = useState(false)
  const [loginErrorMsg, setLoginErrorMsg] = useState<string | null>(null)
  const [loginSuccessMsg, setLoginSuccessMsg] = useState<string | null>(null)
  const [loginNeedsPasswordSetup, setLoginNeedsPasswordSetup] = useState(false)

  // ==================== Sign Up State ====================
  const [signupStep, setSignupStep] = useState<'details' | 'otp' | 'password' | 'success'>('details')
  const [signupName, setSignupName] = useState('')
  const [signupEmail, setSignupEmail] = useState('')
  const [signupOtpDigits, setSignupOtpDigits] = useState<string[]>(['', '', '', '', '', ''])
  const [signupToken, setSignupToken] = useState<string>('')
  const [signupPassword, setSignupPassword] = useState('')
  const [signupConfirmPassword, setSignupConfirmPassword] = useState('')
  const [showSignupPassword, setShowSignupPassword] = useState(false)
  const [showSignupConfirmPassword, setShowSignupConfirmPassword] = useState(false)
  const [signupSubmitting, setSignupSubmitting] = useState(false)
  const [signupErrorMsg, setSignupErrorMsg] = useState<string | null>(null)
  const [signupSuccessMsg, setSignupSuccessMsg] = useState<string | null>(null)
  const [signupRemainingAttempts, setSignupRemainingAttempts] = useState<number | null>(null)
  const [signupExpirySeconds, setSignupExpirySeconds] = useState<number>(300)
  const [signupResendCooldown, setSignupResendCooldown] = useState<number>(0)
  const [signupIsExpired, setSignupIsExpired] = useState(false)
  const signupInputRefs = useRef<(HTMLInputElement | null)[]>([])

  // ==================== Forgot Password State ====================
  const [fpStep, setFpStep] = useState<'email' | 'otp' | 'password' | 'success'>('email')
  const [fpEmail, setFpEmail] = useState('')
  const [fpOtpDigits, setFpOtpDigits] = useState<string[]>(['', '', '', '', '', ''])
  const [fpResetToken, setFpResetToken] = useState('')
  const [fpPassword, setFpPassword] = useState('')
  const [fpConfirmPassword, setFpConfirmPassword] = useState('')
  const [showFpPassword, setShowFpPassword] = useState(false)
  const [showFpConfirmPassword, setShowFpConfirmPassword] = useState(false)
  const [fpSubmitting, setFpSubmitting] = useState(false)
  const [fpErrorMsg, setFpErrorMsg] = useState<string | null>(null)
  const [fpSuccessMsg, setFpSuccessMsg] = useState<string | null>(null)
  const [fpRemainingAttempts, setFpRemainingAttempts] = useState<number | null>(null)
  const [fpExpirySeconds, setFpExpirySeconds] = useState<number>(300)
  const [fpResendCooldown, setFpResendCooldown] = useState<number>(0)
  const [fpIsExpired, setFpIsExpired] = useState(false)
  const fpInputRefs = useRef<(HTMLInputElement | null)[]>([])

  // Redirect if authenticated
  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      router.replace(redirectPath)
    }
  }, [authLoading, isAuthenticated, router, redirectPath])

  // Handle URL query parameters (e.g. from mode triggers)
  useEffect(() => {
    const initialModeParam = searchParams.get('mode')
    if (initialModeParam === 'signup') {
      setMode('signup')
    } else if (initialModeParam === 'forgot-password') {
      setMode('forgot-password')
    }
  }, [searchParams])

  // Signup OTP Timers
  useEffect(() => {
    if (signupStep !== 'otp' || signupExpirySeconds <= 0) {
      if (signupExpirySeconds <= 0 && signupStep === 'otp') {
        setSignupIsExpired(true)
      }
      return
    }
    const timer = setInterval(() => {
      setSignupExpirySeconds((prev) => {
        if (prev <= 1) {
          setSignupIsExpired(true)
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [signupStep, signupExpirySeconds])

  useEffect(() => {
    if (signupResendCooldown <= 0) return
    const timer = setInterval(() => {
      setSignupResendCooldown((prev) => (prev <= 1 ? 0 : prev - 1))
    }, 1000)
    return () => clearInterval(timer)
  }, [signupResendCooldown])

  // Forgot Password OTP Timers
  useEffect(() => {
    if (fpStep !== 'otp' || fpExpirySeconds <= 0) {
      if (fpExpirySeconds <= 0 && fpStep === 'otp') {
        setFpIsExpired(true)
      }
      return
    }
    const timer = setInterval(() => {
      setFpExpirySeconds((prev) => {
        if (prev <= 1) {
          setFpIsExpired(true)
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [fpStep, fpExpirySeconds])

  useEffect(() => {
    if (fpResendCooldown <= 0) return
    const timer = setInterval(() => {
      setFpResendCooldown((prev) => (prev <= 1 ? 0 : prev - 1))
    }, 1000)
    return () => clearInterval(timer)
  }, [fpResendCooldown])

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  // Clear messages when switching tabs
  const handleSwitchMode = (
    newMode: 'signin' | 'signup' | 'forgot-password',
    defaultEmail?: string
  ) => {
    setMode(newMode)
    setLoginErrorMsg(null)
    setLoginSuccessMsg(null)
    setLoginNeedsPasswordSetup(false)
    setSignupErrorMsg(null)
    setSignupSuccessMsg(null)
    setFpErrorMsg(null)
    setFpSuccessMsg(null)

    if (newMode === 'forgot-password') {
      setFpStep('email')
      if (defaultEmail) {
        setFpEmail(defaultEmail)
      } else if (loginEmail) {
        setFpEmail(loginEmail)
      }
    }
  }

  // ==================== Sign In Handlers ====================
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoginErrorMsg(null)
    setLoginSuccessMsg(null)
    setLoginNeedsPasswordSetup(false)

    const trimmedEmail = loginEmail.trim()
    if (!trimmedEmail) {
      setLoginErrorMsg('Please enter your email address.')
      return
    }

    if (!loginPassword) {
      setLoginErrorMsg('Please enter your password.')
      return
    }

    setLoginSubmitting(true)
    try {
      await login(trimmedEmail, loginPassword)
      setLoginSuccessMsg('Authentication successful! Taking you to CodeSphere...')
      setTimeout(() => {
        router.replace(redirectPath)
      }, 700)
    } catch (err: any) {
      if (err instanceof ApiError) {
        if (err.code === 'PASSWORD_SETUP_REQUIRED') {
          setLoginNeedsPasswordSetup(true)
          setLoginErrorMsg(err.message)
        } else {
          setLoginErrorMsg(err.message || 'Invalid email or password.')
        }
      } else {
        setLoginErrorMsg(err?.message || 'Failed to sign in. Please try again.')
      }
    } finally {
      setLoginSubmitting(false)
    }
  }

  // ==================== Sign Up Handlers ====================
  const handleSignupSendOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    setSignupErrorMsg(null)
    setSignupSuccessMsg(null)
    setSignupRemainingAttempts(null)

    const trimmedName = signupName.trim()
    const trimmedEmail = signupEmail.trim()

    if (!trimmedName || trimmedName.length < 2) {
      setSignupErrorMsg('Please enter your full name (at least 2 characters).')
      return
    }

    if (!trimmedEmail) {
      setSignupErrorMsg('Please enter your email address.')
      return
    }

    setSignupSubmitting(true)
    try {
      const res = await signupSendOtp(trimmedName, trimmedEmail)
      setSignupStep('otp')
      setSignupExpirySeconds(300)
      setSignupIsExpired(false)
      setSignupResendCooldown(res.cooldownSeconds || 60)
      setSignupOtpDigits(['', '', '', '', '', ''])
      setSignupSuccessMsg(res.message || 'Verification code sent to your email!')

      setTimeout(() => {
        signupInputRefs.current[0]?.focus()
      }, 100)
    } catch (err: any) {
      if (err instanceof ApiError) {
        setSignupErrorMsg(err.message)
        if (err.cooldownSeconds) {
          setSignupResendCooldown(err.cooldownSeconds)
        }
      } else {
        setSignupErrorMsg(err?.message || 'Failed to send verification code. Please try again.')
      }
    } finally {
      setSignupSubmitting(false)
    }
  }

  const handleSignupVerifyOtp = async (codeToVerify?: string) => {
    const code = (codeToVerify || signupOtpDigits.join('')).trim()
    setSignupErrorMsg(null)
    setSignupSuccessMsg(null)

    if (code.length !== 6) {
      setSignupErrorMsg('Please enter the full 6-digit verification code.')
      return
    }

    if (signupIsExpired) {
      setSignupErrorMsg('This code has expired. Please request a new one.')
      return
    }

    setSignupSubmitting(true)
    try {
      const res = await signupVerifyOtp(signupEmail.trim(), code, signupName.trim())
      setSignupToken(res.signupToken)
      setSignupStep('password')
      setSignupSuccessMsg('Email verified! Please set up your password.')
    } catch (err: any) {
      if (err instanceof ApiError) {
        setSignupErrorMsg(err.message)
        if (err.remainingAttempts !== undefined) {
          setSignupRemainingAttempts(err.remainingAttempts)
          if (err.remainingAttempts <= 0) {
            setSignupIsExpired(true)
          }
        }
      } else {
        setSignupErrorMsg(err?.message || 'Verification failed. Please check the code and try again.')
      }
    } finally {
      setSignupSubmitting(false)
    }
  }

  const handleSignupDigitChange = (index: number, val: string) => {
    const cleanVal = val.replace(/\D/g, '')
    if (!cleanVal) {
      const newDigits = [...signupOtpDigits]
      newDigits[index] = ''
      setSignupOtpDigits(newDigits)
      return
    }

    const char = cleanVal.slice(-1)
    const newDigits = [...signupOtpDigits]
    newDigits[index] = char
    setSignupOtpDigits(newDigits)

    if (index < 5) {
      signupInputRefs.current[index + 1]?.focus()
    } else {
      const fullCode = newDigits.join('')
      if (fullCode.length === 6) {
        handleSignupVerifyOtp(fullCode)
      }
    }
  }

  const handleSignupKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !signupOtpDigits[index] && index > 0) {
      signupInputRefs.current[index - 1]?.focus()
    } else if (e.key === 'ArrowLeft' && index > 0) {
      signupInputRefs.current[index - 1]?.focus()
    } else if (e.key === 'ArrowRight' && index < 5) {
      signupInputRefs.current[index + 1]?.focus()
    } else if (e.key === 'Enter') {
      e.preventDefault()
      handleSignupVerifyOtp()
    }
  }

  const handleSignupPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault()
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (pasted.length > 0) {
      const newDigits = [...signupOtpDigits]
      for (let i = 0; i < 6; i++) {
        newDigits[i] = pasted[i] || ''
      }
      setSignupOtpDigits(newDigits)
      const nextFocus = Math.min(pasted.length, 5)
      signupInputRefs.current[nextFocus]?.focus()
      if (pasted.length === 6) {
        handleSignupVerifyOtp(pasted)
      }
    }
  }

  const handleSignupComplete = async (e: React.FormEvent) => {
    e.preventDefault()
    setSignupErrorMsg(null)
    setSignupSuccessMsg(null)

    if (!signupPassword) {
      setSignupErrorMsg('Please enter a password.')
      return
    }

    if (signupPassword.length < 8) {
      setSignupErrorMsg('Password must be at least 8 characters long.')
      return
    }

    if (signupPassword !== signupConfirmPassword) {
      setSignupErrorMsg('Passwords do not match. Please re-enter.')
      return
    }

    if (!signupToken) {
      setSignupErrorMsg('Signup session is missing or invalid. Please verify your email again.')
      setSignupStep('details')
      return
    }

    setSignupSubmitting(true)
    try {
      await signupComplete(signupToken, signupPassword, signupName.trim(), signupConfirmPassword)
      setSignupStep('success')
    } catch (err: any) {
      if (err instanceof ApiError) {
        setSignupErrorMsg(err.message)
      } else {
        setSignupErrorMsg(err?.message || 'Failed to complete signup. Please try again.')
      }
    } finally {
      setSignupSubmitting(false)
    }
  }

  const handleProceedToLoginFromSignup = () => {
    setMode('signin')
    setLoginEmail(signupEmail)
    setLoginPassword('')
    setLoginErrorMsg(null)
    setLoginSuccessMsg('Account created successfully! You can now sign in.')
    setSignupStep('details')
    setSignupName('')
    setSignupEmail('')
    setSignupPassword('')
    setSignupConfirmPassword('')
    setSignupToken('')
  }

  // ==================== Forgot Password Handlers ====================
  const handleFpSendOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    setFpErrorMsg(null)
    setFpSuccessMsg(null)
    setFpRemainingAttempts(null)

    const trimmedEmail = fpEmail.trim()
    if (!trimmedEmail) {
      setFpErrorMsg('Please enter your email address.')
      return
    }

    setFpSubmitting(true)
    try {
      const res = await forgotPasswordSendOtp(trimmedEmail)
      setFpStep('otp')
      setFpExpirySeconds(300)
      setFpIsExpired(false)
      setFpResendCooldown(res.cooldownSeconds || 60)
      setFpOtpDigits(['', '', '', '', '', ''])
      setFpSuccessMsg(res.message || 'Verification code sent to your email!')

      setTimeout(() => {
        fpInputRefs.current[0]?.focus()
      }, 100)
    } catch (err: any) {
      if (err instanceof ApiError) {
        setFpErrorMsg(err.message)
        if (err.cooldownSeconds) {
          setFpResendCooldown(err.cooldownSeconds)
        }
      } else {
        setFpErrorMsg(err?.message || 'Failed to send reset code. Please try again.')
      }
    } finally {
      setFpSubmitting(false)
    }
  }

  const handleFpVerifyOtp = async (codeToVerify?: string) => {
    const code = (codeToVerify || fpOtpDigits.join('')).trim()
    setFpErrorMsg(null)
    setFpSuccessMsg(null)

    if (code.length !== 6) {
      setFpErrorMsg('Please enter the full 6-digit verification code.')
      return
    }

    if (fpIsExpired) {
      setFpErrorMsg('This code has expired. Please request a new one.')
      return
    }

    setFpSubmitting(true)
    try {
      const res = await forgotPasswordVerifyOtp(fpEmail.trim(), code)
      setFpResetToken(res.resetToken)
      setFpStep('password')
      setFpSuccessMsg('Code verified! Please set your new password.')
    } catch (err: any) {
      if (err instanceof ApiError) {
        setFpErrorMsg(err.message)
        if (err.remainingAttempts !== undefined) {
          setFpRemainingAttempts(err.remainingAttempts)
          if (err.remainingAttempts <= 0) {
            setFpIsExpired(true)
          }
        }
      } else {
        setFpErrorMsg(err?.message || 'Verification failed. Please check the code and try again.')
      }
    } finally {
      setFpSubmitting(false)
    }
  }

  const handleFpDigitChange = (index: number, val: string) => {
    const cleanVal = val.replace(/\D/g, '')
    if (!cleanVal) {
      const newDigits = [...fpOtpDigits]
      newDigits[index] = ''
      setFpOtpDigits(newDigits)
      return
    }

    const char = cleanVal.slice(-1)
    const newDigits = [...fpOtpDigits]
    newDigits[index] = char
    setFpOtpDigits(newDigits)

    if (index < 5) {
      fpInputRefs.current[index + 1]?.focus()
    } else {
      const fullCode = newDigits.join('')
      if (fullCode.length === 6) {
        handleFpVerifyOtp(fullCode)
      }
    }
  }

  const handleFpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !fpOtpDigits[index] && index > 0) {
      fpInputRefs.current[index - 1]?.focus()
    } else if (e.key === 'ArrowLeft' && index > 0) {
      fpInputRefs.current[index - 1]?.focus()
    } else if (e.key === 'ArrowRight' && index < 5) {
      fpInputRefs.current[index + 1]?.focus()
    } else if (e.key === 'Enter') {
      e.preventDefault()
      handleFpVerifyOtp()
    }
  }

  const handleFpPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault()
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (pasted.length > 0) {
      const newDigits = [...fpOtpDigits]
      for (let i = 0; i < 6; i++) {
        newDigits[i] = pasted[i] || ''
      }
      setFpOtpDigits(newDigits)
      const nextFocus = Math.min(pasted.length, 5)
      fpInputRefs.current[nextFocus]?.focus()
      if (pasted.length === 6) {
        handleFpVerifyOtp(pasted)
      }
    }
  }

  const handleFpReset = async (e: React.FormEvent) => {
    e.preventDefault()
    setFpErrorMsg(null)
    setFpSuccessMsg(null)

    if (!fpPassword) {
      setFpErrorMsg('Please enter a new password.')
      return
    }

    if (fpPassword.length < 8) {
      setFpErrorMsg('Password must be at least 8 characters long.')
      return
    }

    if (fpPassword !== fpConfirmPassword) {
      setFpErrorMsg('Passwords do not match. Please re-enter.')
      return
    }

    if (!fpResetToken) {
      setFpErrorMsg('Reset session is missing or invalid. Please request a new code.')
      setFpStep('email')
      return
    }

    setFpSubmitting(true)
    try {
      await forgotPasswordReset(fpResetToken, fpPassword, fpConfirmPassword)
      setFpStep('success')
    } catch (err: any) {
      if (err instanceof ApiError) {
        setFpErrorMsg(err.message)
      } else {
        setFpErrorMsg(err?.message || 'Failed to reset password. Please try again.')
      }
    } finally {
      setFpSubmitting(false)
    }
  }

  const handleProceedToLoginFromFp = () => {
    setMode('signin')
    setLoginEmail(fpEmail)
    setLoginPassword('')
    setLoginErrorMsg(null)
    setLoginSuccessMsg('Password updated successfully! You can now sign in.')
    setFpStep('email')
    setFpEmail('')
    setFpPassword('')
    setFpConfirmPassword('')
    setFpResetToken('')
  }

  // Loading indicator
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
      <div className="panel" style={{ padding: '32px 28px', boxShadow: 'var(--shadow-pop)' }}>
        {/* Top Mode Selector Tabs */}
        <div
          style={{
            display: 'flex',
            borderBottom: '1px solid var(--border)',
            marginBottom: 24,
            gap: 8,
          }}
        >
          <button
            type="button"
            id="auth-tab-signin"
            onClick={() => handleSwitchMode('signin')}
            style={{
              flex: 1,
              padding: '10px 0',
              border: 'none',
              background: 'transparent',
              fontWeight: 600,
              fontSize: 'var(--text-sm)',
              color: mode === 'signin' ? 'var(--primary)' : 'var(--muted)',
              borderBottom: mode === 'signin' ? '2px solid var(--primary)' : '2px solid transparent',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            Sign In
          </button>
          <button
            type="button"
            id="auth-tab-signup"
            onClick={() => handleSwitchMode('signup')}
            style={{
              flex: 1,
              padding: '10px 0',
              border: 'none',
              background: 'transparent',
              fontWeight: 600,
              fontSize: 'var(--text-sm)',
              color: mode === 'signup' ? 'var(--primary)' : 'var(--muted)',
              borderBottom: mode === 'signup' ? '2px solid var(--primary)' : '2px solid transparent',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            Create Account
          </button>
        </div>

        {/* ============================================================== */}
        {/* MODE: SIGN IN (EMAIL + PASSWORD)                               */}
        {/* ============================================================== */}
        {mode === 'signin' && (
          <>
            {/* Header info */}
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <div
                style={{
                  width: 50,
                  height: 50,
                  borderRadius: 14,
                  background: 'var(--primary-soft)',
                  color: 'var(--primary)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: 14,
                }}
              >
                <Lock size={24} />
              </div>
              <h1 className="title-lg" style={{ marginBottom: 6 }}>
                Sign in to CodeSphere
              </h1>
              <p className="small muted" style={{ margin: 0 }}>
                Enter your email and password to access your account
              </p>
            </div>

            {/* Error Banner */}
            {loginErrorMsg && (
              <div
                id="login-error-banner"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                  padding: '12px 14px',
                  borderRadius: 'var(--radius)',
                  background: 'var(--danger-soft)',
                  color: 'var(--danger)',
                  fontSize: 'var(--text-sm)',
                  marginBottom: 18,
                  border: '1px solid rgba(180, 51, 74, 0.2)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <XCircle size={18} style={{ flexShrink: 0, marginTop: 2 }} />
                  <span style={{ flex: 1 }}>{loginErrorMsg}</span>
                </div>

                {/* Legacy / OTP-Only User Setup Password Action */}
                {loginNeedsPasswordSetup && (
                  <button
                    type="button"
                    id="setup-password-action-btn"
                    className="btn btn-sm btn-primary"
                    style={{ alignSelf: 'flex-start', marginTop: 4 }}
                    onClick={() => handleSwitchMode('forgot-password', loginEmail)}
                  >
                    <KeyRound size={14} />
                    Set Up Password via Email Verification
                  </button>
                )}
              </div>
            )}

            {/* Success Banner */}
            {loginSuccessMsg && !loginErrorMsg && (
              <div
                id="login-success-banner"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '12px 14px',
                  borderRadius: 'var(--radius)',
                  background: 'var(--ok-soft)',
                  color: 'var(--ok)',
                  fontSize: 'var(--text-sm)',
                  marginBottom: 18,
                  border: '1px solid rgba(47, 138, 91, 0.2)',
                }}
              >
                <CheckCircle2 size={18} style={{ flexShrink: 0 }} />
                <span>{loginSuccessMsg}</span>
              </div>
            )}

            {/* Normal Login Form */}
            <form onSubmit={handleLogin} className="stack" style={{ gap: 16 }}>
              <div>
                <label htmlFor="login-email-input" className="label">
                  Email Address
                </label>
                <input
                  id="login-email-input"
                  type="email"
                  className="input"
                  placeholder="developer@example.com"
                  autoFocus
                  required
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  disabled={loginSubmitting}
                />
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <label htmlFor="login-password-input" className="label" style={{ margin: 0 }}>
                    Password
                  </label>
                  <button
                    type="button"
                    id="forgot-password-link"
                    className="small"
                    onClick={() => handleSwitchMode('forgot-password')}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--primary)',
                      cursor: 'pointer',
                      padding: 0,
                      fontWeight: 500,
                    }}
                  >
                    Forgot password?
                  </button>
                </div>
                <div style={{ position: 'relative' }}>
                  <input
                    id="login-password-input"
                    type={showLoginPassword ? 'text' : 'password'}
                    className="input"
                    placeholder="Enter your password"
                    required
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    disabled={loginSubmitting}
                    style={{ paddingRight: 40 }}
                  />
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setShowLoginPassword(!showLoginPassword)}
                    style={{
                      position: 'absolute',
                      right: 4,
                      top: 4,
                      height: 32,
                      width: 32,
                      padding: 0,
                    }}
                    tabIndex={-1}
                    aria-label={showLoginPassword ? 'Hide password' : 'Show password'}
                  >
                    {showLoginPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <button
                id="login-submit-btn"
                type="submit"
                className="btn btn-primary"
                style={{ width: '100%', height: 42, marginTop: 4 }}
                disabled={loginSubmitting || !loginEmail.trim() || !loginPassword}
              >
                {loginSubmitting ? (
                  <>
                    <Loader2 className="animate-spin spin" size={16} />
                    Signing in...
                  </>
                ) : (
                  <>
                    Sign In
                    <ArrowRight size={16} />
                  </>
                )}
              </button>

              <div style={{ textAlign: 'center', marginTop: 2 }}>
                <span className="small muted">Don&apos;t have an account? </span>
                <button
                  type="button"
                  id="switch-to-signup-btn"
                  className="small"
                  onClick={() => handleSwitchMode('signup')}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--primary)',
                    fontWeight: 600,
                    cursor: 'pointer',
                    padding: 0,
                  }}
                >
                  Create an account
                </button>
              </div>
            </form>
          </>
        )}

        {/* ============================================================== */}
        {/* MODE: FORGOT / RESET PASSWORD                                  */}
        {/* ============================================================== */}
        {mode === 'forgot-password' && (
          <>
            <div style={{ textAlign: 'center', marginBottom: 24 }}>
              <div
                style={{
                  width: 50,
                  height: 50,
                  borderRadius: 14,
                  background: 'var(--primary-soft)',
                  color: 'var(--primary)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: 14,
                }}
              >
                {fpStep === 'email' && <KeyRound size={24} />}
                {fpStep === 'otp' && <ShieldCheck size={24} />}
                {fpStep === 'password' && <Lock size={24} />}
                {fpStep === 'success' && <CheckCircle2 size={24} style={{ color: 'var(--ok)' }} />}
              </div>
              <h1 className="title-lg" style={{ marginBottom: 6 }}>
                {fpStep === 'email' && 'Reset your password'}
                {fpStep === 'otp' && 'Verify your email'}
                {fpStep === 'password' && 'Set new password'}
                {fpStep === 'success' && 'Password updated!'}
              </h1>
              <p className="small muted" style={{ margin: 0 }}>
                {fpStep === 'email' && 'Enter your email to receive a password reset code'}
                {fpStep === 'otp' && `Enter the 6-digit code sent to ${fpEmail}`}
                {fpStep === 'password' && `Choose a new secure password for ${fpEmail}`}
                {fpStep === 'success' && 'Your password has been successfully updated'}
              </p>
            </div>

            {fpErrorMsg && (
              <div
                id="fp-error-banner"
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
                  <span>{fpErrorMsg}</span>
                  {fpRemainingAttempts !== null && fpRemainingAttempts > 0 && (
                    <div style={{ fontWeight: 600, marginTop: 4 }}>
                      {fpRemainingAttempts} attempt(s) remaining before code is invalidated.
                    </div>
                  )}
                </div>
              </div>
            )}

            {fpIsExpired && fpStep === 'otp' && (
              <div
                id="fp-expired-banner"
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

            {fpSuccessMsg && !fpErrorMsg && fpStep !== 'success' && (
              <div
                id="fp-success-banner"
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
                <span>{fpSuccessMsg}</span>
              </div>
            )}

            {fpStep === 'email' && (
              <form onSubmit={handleFpSendOtp} className="stack" style={{ gap: 18 }}>
                <div>
                  <label htmlFor="fp-email-input" className="label">
                    Account Email
                  </label>
                  <input
                    id="fp-email-input"
                    type="email"
                    className="input"
                    placeholder="developer@example.com"
                    autoFocus
                    required
                    value={fpEmail}
                    onChange={(e) => setFpEmail(e.target.value)}
                    disabled={fpSubmitting}
                  />
                </div>

                <button
                  id="fp-send-otp-btn"
                  type="submit"
                  className="btn btn-primary"
                  style={{ width: '100%', height: 42, marginTop: 4 }}
                  disabled={fpSubmitting || !fpEmail.trim() || fpResendCooldown > 0}
                >
                  {fpSubmitting ? (
                    <>
                      <Loader2 className="animate-spin spin" size={16} />
                      Sending code...
                    </>
                  ) : fpResendCooldown > 0 ? (
                    `Wait ${fpResendCooldown}s to request code`
                  ) : (
                    <>
                      Send Reset Code
                      <ArrowRight size={16} />
                    </>
                  )}
                </button>

                <div style={{ textAlign: 'center', marginTop: 4 }}>
                  <button
                    type="button"
                    id="fp-back-to-login-btn"
                    className="small"
                    onClick={() => handleSwitchMode('signin')}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--primary)',
                      fontWeight: 600,
                      cursor: 'pointer',
                      padding: 0,
                    }}
                  >
                    Back to Sign In
                  </button>
                </div>
              </form>
            )}

            {fpStep === 'otp' && (
              <div className="stack" style={{ gap: 24 }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <label className="label" style={{ margin: 0 }}>
                      One-Time Password
                    </label>
                    <span
                      id="fp-otp-expiry-timer"
                      className={`badge ${
                        fpIsExpired
                          ? 'badge-failed'
                          : fpExpirySeconds <= 60
                          ? 'badge-busy'
                          : 'badge-lav'
                      }`}
                      style={{ fontSize: 'var(--text-xs)', gap: 4 }}
                    >
                      <Clock size={12} />
                      {fpIsExpired ? 'Expired' : `Expires in ${formatTime(fpExpirySeconds)}`}
                    </span>
                  </div>

                  <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                    {fpOtpDigits.map((digit, idx) => (
                      <input
                        key={idx}
                        id={`fp-otp-digit-${idx}`}
                        ref={(el) => {
                          fpInputRefs.current[idx] = el
                        }}
                        type="text"
                        inputMode="numeric"
                        maxLength={1}
                        className="input"
                        disabled={fpSubmitting || fpIsExpired}
                        value={digit}
                        onChange={(e) => handleFpDigitChange(idx, e.target.value)}
                        onKeyDown={(e) => handleFpKeyDown(idx, e)}
                        onPaste={handleFpPaste}
                        style={{
                          width: 48,
                          height: 54,
                          fontSize: 22,
                          fontWeight: 600,
                          textAlign: 'center',
                          padding: 0,
                          fontFamily: 'var(--font-mono)',
                          borderColor: fpIsExpired
                            ? 'var(--danger)'
                            : digit
                            ? 'var(--primary)'
                            : undefined,
                        }}
                      />
                    ))}
                  </div>

                  <input id="fp-otp-input" type="hidden" value={fpOtpDigits.join('')} readOnly />
                </div>

                <button
                  id="fp-verify-otp-btn"
                  type="button"
                  className="btn btn-primary"
                  style={{ width: '100%', height: 42 }}
                  disabled={fpSubmitting || fpIsExpired || fpOtpDigits.join('').length !== 6}
                  onClick={() => handleFpVerifyOtp()}
                >
                  {fpSubmitting ? (
                    <>
                      <Loader2 className="animate-spin spin" size={16} />
                      Verifying code...
                    </>
                  ) : (
                    <>
                      Verify & Reset Password
                      <ArrowRight size={16} />
                    </>
                  )}
                </button>

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
                    id="fp-change-email-btn"
                    className="btn btn-ghost btn-sm"
                    onClick={() => {
                      setFpStep('email')
                      setFpErrorMsg(null)
                      setFpSuccessMsg(null)
                    }}
                    disabled={fpSubmitting}
                  >
                    <ArrowLeft size={14} />
                    Change email
                  </button>

                  <button
                    id="fp-resend-otp-btn"
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={fpSubmitting || fpResendCooldown > 0}
                    onClick={() => handleFpSendOtp()}
                    style={{ color: fpResendCooldown > 0 ? 'var(--muted)' : 'var(--primary)' }}
                  >
                    <RotateCcw size={14} />
                    {fpResendCooldown > 0 ? `Resend in ${fpResendCooldown}s` : 'Resend code'}
                  </button>
                </div>
              </div>
            )}

            {fpStep === 'password' && (
              <form onSubmit={handleFpReset} className="stack" style={{ gap: 18 }}>
                <div>
                  <label htmlFor="fp-password-input" className="label">
                    New Password
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input
                      id="fp-password-input"
                      type={showFpPassword ? 'text' : 'password'}
                      className="input"
                      placeholder="At least 8 characters"
                      autoFocus
                      required
                      value={fpPassword}
                      onChange={(e) => setFpPassword(e.target.value)}
                      disabled={fpSubmitting}
                      style={{ paddingRight: 40 }}
                    />
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => setShowFpPassword(!showFpPassword)}
                      style={{
                        position: 'absolute',
                        right: 4,
                        top: 4,
                        height: 32,
                        width: 32,
                        padding: 0,
                      }}
                      tabIndex={-1}
                      aria-label={showFpPassword ? 'Hide password' : 'Show password'}
                    >
                      {showFpPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <div>
                  <label htmlFor="fp-confirm-password-input" className="label">
                    Confirm New Password
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input
                      id="fp-confirm-password-input"
                      type={showFpConfirmPassword ? 'text' : 'password'}
                      className="input"
                      placeholder="Re-enter new password"
                      required
                      value={fpConfirmPassword}
                      onChange={(e) => setFpConfirmPassword(e.target.value)}
                      disabled={fpSubmitting}
                      style={{ paddingRight: 40 }}
                    />
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => setShowFpConfirmPassword(!showFpConfirmPassword)}
                      style={{
                        position: 'absolute',
                        right: 4,
                        top: 4,
                        height: 32,
                        width: 32,
                        padding: 0,
                      }}
                      tabIndex={-1}
                      aria-label={showFpConfirmPassword ? 'Hide password' : 'Show password'}
                    >
                      {showFpConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <div
                  style={{
                    padding: '10px 12px',
                    borderRadius: 'var(--radius)',
                    background: 'var(--sunken)',
                    border: '1px solid var(--border)',
                    fontSize: 'var(--text-xs)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      color: fpPassword.length >= 8 ? 'var(--ok)' : 'var(--muted)',
                    }}
                  >
                    <Check size={13} style={{ opacity: fpPassword.length >= 8 ? 1 : 0.4 }} />
                    <span>Minimum 8 characters</span>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      color:
                        fpConfirmPassword && fpPassword === fpConfirmPassword
                          ? 'var(--ok)'
                          : 'var(--muted)',
                    }}
                  >
                    <Check
                      size={13}
                      style={{
                        opacity: fpConfirmPassword && fpPassword === fpConfirmPassword ? 1 : 0.4,
                      }}
                    />
                    <span>Passwords match</span>
                  </div>
                </div>

                <button
                  id="fp-reset-btn"
                  type="submit"
                  className="btn btn-primary"
                  style={{ width: '100%', height: 42, marginTop: 4 }}
                  disabled={
                    fpSubmitting || fpPassword.length < 8 || fpPassword !== fpConfirmPassword
                  }
                >
                  {fpSubmitting ? (
                    <>
                      <Loader2 className="animate-spin spin" size={16} />
                      Updating password...
                    </>
                  ) : (
                    <>
                      Update Password
                      <ArrowRight size={16} />
                    </>
                  )}
                </button>
              </form>
            )}

            {fpStep === 'success' && (
              <div className="stack" style={{ gap: 20, textAlign: 'center', padding: '12px 0 8px' }}>
                <div
                  style={{
                    padding: '16px 14px',
                    borderRadius: 'var(--radius)',
                    background: 'var(--ok-soft)',
                    color: 'var(--ok)',
                    fontSize: 'var(--text-sm)',
                    border: '1px solid rgba(47, 138, 91, 0.2)',
                  }}
                >
                  <p style={{ margin: 0, fontWeight: 500 }}>
                    Your password has been successfully updated! You can now log in with your new password.
                  </p>
                </div>

                <button
                  id="fp-proceed-login-btn"
                  type="button"
                  className="btn btn-primary"
                  style={{ width: '100%', height: 42 }}
                  onClick={handleProceedToLoginFromFp}
                >
                  Proceed to Sign In
                  <ArrowRight size={16} />
                </button>
              </div>
            )}
          </>
        )}

        {/* ============================================================== */}
        {/* MODE: SIGN UP (DETAILS + OTP + PASSWORD)                       */}
        {/* ============================================================== */}
        {mode === 'signup' && (
          <>
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <div
                style={{
                  width: 50,
                  height: 50,
                  borderRadius: 14,
                  background: 'var(--primary-soft)',
                  color: 'var(--primary)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: 14,
                }}
              >
                {signupStep === 'details' && <User size={24} />}
                {signupStep === 'otp' && <ShieldCheck size={24} />}
                {signupStep === 'password' && <Lock size={24} />}
                {signupStep === 'success' && <CheckCircle2 size={24} style={{ color: 'var(--ok)' }} />}
              </div>
              <h1 className="title-lg" style={{ marginBottom: 6 }}>
                {signupStep === 'details' && 'Create your account'}
                {signupStep === 'otp' && 'Verify your email'}
                {signupStep === 'password' && 'Set up your password'}
                {signupStep === 'success' && 'Account Created!'}
              </h1>
              <p className="small muted" style={{ margin: 0 }}>
                {signupStep === 'details' && 'Enter your details to receive an email verification code'}
                {signupStep === 'otp' && `Enter the 6-digit code sent to ${signupEmail}`}
                {signupStep === 'password' && `Choose a strong password for ${signupEmail}`}
                {signupStep === 'success' && 'Your account has been successfully created and verified'}
              </p>
            </div>

            {signupErrorMsg && (
              <div
                id="signup-error-banner"
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 10,
                  padding: '12px 14px',
                  borderRadius: 'var(--radius)',
                  background: 'var(--danger-soft)',
                  color: 'var(--danger)',
                  fontSize: 'var(--text-sm)',
                  marginBottom: 18,
                  border: '1px solid rgba(180, 51, 74, 0.2)',
                }}
              >
                <XCircle size={18} style={{ flexShrink: 0, marginTop: 2 }} />
                <div style={{ flex: 1 }}>
                  <span>{signupErrorMsg}</span>
                  {signupRemainingAttempts !== null && signupRemainingAttempts > 0 && (
                    <div style={{ fontWeight: 600, marginTop: 4 }}>
                      {signupRemainingAttempts} attempt(s) remaining before code is invalidated.
                    </div>
                  )}
                </div>
              </div>
            )}

            {signupIsExpired && signupStep === 'otp' && (
              <div
                id="signup-expired-banner"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '12px 14px',
                  borderRadius: 'var(--radius)',
                  background: 'var(--warn-soft)',
                  color: 'var(--warn)',
                  fontSize: 'var(--text-sm)',
                  marginBottom: 18,
                  border: '1px solid rgba(168, 106, 18, 0.2)',
                }}
              >
                <AlertTriangle size={18} style={{ flexShrink: 0 }} />
                <span>This code has expired. Please request a new code.</span>
              </div>
            )}

            {signupSuccessMsg && !signupErrorMsg && signupStep !== 'success' && (
              <div
                id="signup-success-banner"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '12px 14px',
                  borderRadius: 'var(--radius)',
                  background: 'var(--ok-soft)',
                  color: 'var(--ok)',
                  fontSize: 'var(--text-sm)',
                  marginBottom: 18,
                  border: '1px solid rgba(47, 138, 91, 0.2)',
                }}
              >
                <CheckCircle2 size={18} style={{ flexShrink: 0 }} />
                <span>{signupSuccessMsg}</span>
              </div>
            )}

            {/* Step 1: Details */}
            {signupStep === 'details' && (
              <>
                <form onSubmit={handleSignupSendOtp} className="stack" style={{ gap: 16 }}>
                  <div>
                    <label htmlFor="signup-name-input" className="label">
                      Full Name
                    </label>
                    <input
                      id="signup-name-input"
                      type="text"
                      className="input"
                      placeholder="Jane Doe"
                      autoFocus
                      required
                      value={signupName}
                      onChange={(e) => setSignupName(e.target.value)}
                      disabled={signupSubmitting}
                    />
                  </div>

                  <div>
                    <label htmlFor="signup-email-input" className="label">
                      Email Address
                    </label>
                    <input
                      id="signup-email-input"
                      type="email"
                      className="input"
                      placeholder="jane@example.com"
                      required
                      value={signupEmail}
                      onChange={(e) => setSignupEmail(e.target.value)}
                      disabled={signupSubmitting}
                    />
                  </div>

                  <button
                    id="signup-send-otp-btn"
                    type="submit"
                    className="btn btn-primary"
                    style={{ width: '100%', height: 42, marginTop: 4 }}
                    disabled={
                      signupSubmitting ||
                      !signupName.trim() ||
                      !signupEmail.trim() ||
                      signupResendCooldown > 0
                    }
                  >
                    {signupSubmitting ? (
                      <>
                        <Loader2 className="animate-spin spin" size={16} />
                        Sending code...
                      </>
                    ) : signupResendCooldown > 0 ? (
                      `Wait ${signupResendCooldown}s to request code`
                    ) : (
                      <>
                        Send Verification Code
                        <ArrowRight size={16} />
                      </>
                    )}
                  </button>

                  <div style={{ textAlign: 'center', marginTop: 2 }}>
                    <span className="small muted">Already have an account? </span>
                    <button
                      type="button"
                      id="switch-to-signin-btn"
                      className="small"
                      onClick={() => handleSwitchMode('signin')}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--primary)',
                        fontWeight: 600,
                        cursor: 'pointer',
                        padding: 0,
                      }}
                    >
                      Sign in
                    </button>
                  </div>
                </form>
              </>
            )}

            {/* Step 2: OTP Verification */}
            {signupStep === 'otp' && (
              <div className="stack" style={{ gap: 24 }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <label className="label" style={{ margin: 0 }}>
                      One-Time Password
                    </label>
                    <span
                      id="signup-otp-expiry-timer"
                      className={`badge ${
                        signupIsExpired
                          ? 'badge-failed'
                          : signupExpirySeconds <= 60
                          ? 'badge-busy'
                          : 'badge-lav'
                      }`}
                      style={{ fontSize: 'var(--text-xs)', gap: 4 }}
                    >
                      <Clock size={12} />
                      {signupIsExpired ? 'Expired' : `Expires in ${formatTime(signupExpirySeconds)}`}
                    </span>
                  </div>

                  <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                    {signupOtpDigits.map((digit, idx) => (
                      <input
                        key={idx}
                        id={`signup-otp-digit-${idx}`}
                        ref={(el) => {
                          signupInputRefs.current[idx] = el
                        }}
                        type="text"
                        inputMode="numeric"
                        maxLength={1}
                        className="input"
                        disabled={signupSubmitting || signupIsExpired}
                        value={digit}
                        onChange={(e) => handleSignupDigitChange(idx, e.target.value)}
                        onKeyDown={(e) => handleSignupKeyDown(idx, e)}
                        onPaste={handleSignupPaste}
                        style={{
                          width: 48,
                          height: 54,
                          fontSize: 22,
                          fontWeight: 600,
                          textAlign: 'center',
                          padding: 0,
                          fontFamily: 'var(--font-mono)',
                          borderColor: signupIsExpired
                            ? 'var(--danger)'
                            : digit
                            ? 'var(--primary)'
                            : undefined,
                        }}
                      />
                    ))}
                  </div>

                  <input id="signup-otp-input" type="hidden" value={signupOtpDigits.join('')} readOnly />
                </div>

                <button
                  id="signup-verify-otp-btn"
                  type="button"
                  className="btn btn-primary"
                  style={{ width: '100%', height: 42 }}
                  disabled={signupSubmitting || signupIsExpired || signupOtpDigits.join('').length !== 6}
                  onClick={() => handleSignupVerifyOtp()}
                >
                  {signupSubmitting ? (
                    <>
                      <Loader2 className="animate-spin spin" size={16} />
                      Verifying code...
                    </>
                  ) : (
                    <>
                      Verify & Set Password
                      <ArrowRight size={16} />
                    </>
                  )}
                </button>

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
                    id="signup-back-details-btn"
                    className="btn btn-ghost btn-sm"
                    onClick={() => {
                      setSignupStep('details')
                      setSignupErrorMsg(null)
                      setSignupSuccessMsg(null)
                    }}
                    disabled={signupSubmitting}
                  >
                    <ArrowLeft size={14} />
                    Change details
                  </button>

                  <button
                    id="signup-resend-otp-btn"
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={signupSubmitting || signupResendCooldown > 0}
                    onClick={() => handleSignupSendOtp()}
                    style={{ color: signupResendCooldown > 0 ? 'var(--muted)' : 'var(--primary)' }}
                  >
                    <RotateCcw size={14} />
                    {signupResendCooldown > 0 ? `Resend in ${signupResendCooldown}s` : 'Resend code'}
                  </button>
                </div>
              </div>
            )}

            {/* Step 3: Password Setup */}
            {signupStep === 'password' && (
              <form onSubmit={handleSignupComplete} className="stack" style={{ gap: 18 }}>
                <div>
                  <label htmlFor="signup-password-input" className="label">
                    Password
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input
                      id="signup-password-input"
                      type={showSignupPassword ? 'text' : 'password'}
                      className="input"
                      placeholder="At least 8 characters"
                      autoFocus
                      required
                      value={signupPassword}
                      onChange={(e) => setSignupPassword(e.target.value)}
                      disabled={signupSubmitting}
                      style={{ paddingRight: 40 }}
                    />
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => setShowSignupPassword(!showSignupPassword)}
                      style={{
                        position: 'absolute',
                        right: 4,
                        top: 4,
                        height: 32,
                        width: 32,
                        padding: 0,
                      }}
                      tabIndex={-1}
                      aria-label={showSignupPassword ? 'Hide password' : 'Show password'}
                    >
                      {showSignupPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <div>
                  <label htmlFor="signup-confirm-password-input" className="label">
                    Confirm Password
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input
                      id="signup-confirm-password-input"
                      type={showSignupConfirmPassword ? 'text' : 'password'}
                      className="input"
                      placeholder="Re-enter your password"
                      required
                      value={signupConfirmPassword}
                      onChange={(e) => setSignupConfirmPassword(e.target.value)}
                      disabled={signupSubmitting}
                      style={{ paddingRight: 40 }}
                    />
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => setShowSignupConfirmPassword(!showSignupConfirmPassword)}
                      style={{
                        position: 'absolute',
                        right: 4,
                        top: 4,
                        height: 32,
                        width: 32,
                        padding: 0,
                      }}
                      tabIndex={-1}
                      aria-label={showSignupConfirmPassword ? 'Hide password' : 'Show password'}
                    >
                      {showSignupConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <div
                  style={{
                    padding: '10px 12px',
                    borderRadius: 'var(--radius)',
                    background: 'var(--sunken)',
                    border: '1px solid var(--border)',
                    fontSize: 'var(--text-xs)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      color: signupPassword.length >= 8 ? 'var(--ok)' : 'var(--muted)',
                    }}
                  >
                    <Check size={13} style={{ opacity: signupPassword.length >= 8 ? 1 : 0.4 }} />
                    <span>Minimum 8 characters</span>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      color:
                        signupConfirmPassword && signupPassword === signupConfirmPassword
                          ? 'var(--ok)'
                          : 'var(--muted)',
                    }}
                  >
                    <Check
                      size={13}
                      style={{
                        opacity:
                          signupConfirmPassword && signupPassword === signupConfirmPassword ? 1 : 0.4,
                      }}
                    />
                    <span>Passwords match</span>
                  </div>
                </div>

                <button
                  id="signup-complete-btn"
                  type="submit"
                  className="btn btn-primary"
                  style={{ width: '100%', height: 42, marginTop: 4 }}
                  disabled={
                    signupSubmitting ||
                    signupPassword.length < 8 ||
                    signupPassword !== signupConfirmPassword
                  }
                >
                  {signupSubmitting ? (
                    <>
                      <Loader2 className="animate-spin spin" size={16} />
                      Creating account...
                    </>
                  ) : (
                    <>
                      Complete Signup
                      <ArrowRight size={16} />
                    </>
                  )}
                </button>
              </form>
            )}

            {/* Step 4: Success & Confirmation */}
            {signupStep === 'success' && (
              <div className="stack" style={{ gap: 20, textAlign: 'center', padding: '12px 0 8px' }}>
                <div
                  style={{
                    padding: '16px 14px',
                    borderRadius: 'var(--radius)',
                    background: 'var(--ok-soft)',
                    color: 'var(--ok)',
                    fontSize: 'var(--text-sm)',
                    border: '1px solid rgba(47, 138, 91, 0.2)',
                  }}
                >
                  <p style={{ margin: 0, fontWeight: 500 }}>
                    Welcome to CodeSphere, {signupName}! Your account with <strong>{signupEmail}</strong> is ready.
                  </p>
                </div>

                <p className="small muted" style={{ margin: '4px 0 0' }}>
                  You can now sign in using your verified email and password.
                </p>

                <button
                  id="signup-proceed-login-btn"
                  type="button"
                  className="btn btn-primary"
                  style={{ width: '100%', height: 42 }}
                  onClick={handleProceedToLoginFromSignup}
                >
                  Proceed to Sign In
                  <ArrowRight size={16} />
                </button>
              </div>
            )}
          </>
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
