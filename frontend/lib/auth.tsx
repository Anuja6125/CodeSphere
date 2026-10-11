'use client'

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { api, AuthUser, ApiError } from './api'
import { useRouter } from 'next/navigation'

interface AuthContextType {
  user: AuthUser | null
  isLoading: boolean
  isAuthenticated: boolean
  login: (email: string, password: string) => Promise<AuthUser>
  sendOtp: (email: string) => Promise<{ success: boolean; message: string; cooldownSeconds: number }>
  verifyOtp: (email: string, code: string) => Promise<AuthUser>
  signupSendOtp: (name: string, email: string) => Promise<{ success: boolean; message: string; cooldownSeconds: number }>
  signupVerifyOtp: (email: string, code: string, name?: string) => Promise<{ success: boolean; message: string; signupToken: string; email: string }>
  signupComplete: (signupToken: string, password: string, name?: string, confirmPassword?: string) => Promise<AuthUser>
  forgotPasswordSendOtp: (email: string) => Promise<{ success: boolean; message: string; cooldownSeconds: number }>
  forgotPasswordVerifyOtp: (email: string, code: string) => Promise<{ success: boolean; message: string; resetToken: string; email: string }>
  forgotPasswordReset: (resetToken: string, password: string, confirmPassword?: string) => Promise<{ success: boolean; message: string }>
  logout: () => Promise<void>
  refreshUser: () => Promise<AuthUser | null>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const router = useRouter()

  const refreshUser = useCallback(async (): Promise<AuthUser | null> => {
    try {
      const currentUser = await api.getMe()
      setUser(currentUser)
      return currentUser
    } catch {
      setUser(null)
      return null
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    refreshUser()
  }, [refreshUser])

  const login = async (email: string, password: string) => {
    const res = await api.login(email, password)
    setUser(res.user)
    return res.user
  }

  const sendOtp = async (email: string) => {
    return await api.sendOtp(email)
  }

  const verifyOtp = async (email: string, code: string) => {
    const res = await api.verifyOtp(email, code)
    setUser(res.user)
    return res.user
  }

  const signupSendOtp = async (name: string, email: string) => {
    return await api.signupSendOtp(name, email)
  }

  const signupVerifyOtp = async (email: string, code: string, name?: string) => {
    return await api.signupVerifyOtp(email, code, name)
  }

  const signupComplete = async (signupToken: string, password: string, name?: string, confirmPassword?: string) => {
    const res = await api.signupComplete(signupToken, password, name, confirmPassword)
    return res.user
  }

  const forgotPasswordSendOtp = async (email: string) => {
    return await api.forgotPasswordSendOtp(email)
  }

  const forgotPasswordVerifyOtp = async (email: string, code: string) => {
    return await api.forgotPasswordVerifyOtp(email, code)
  }

  const forgotPasswordReset = async (resetToken: string, password: string, confirmPassword?: string) => {
    return await api.forgotPasswordReset(resetToken, password, confirmPassword)
  }

  const logout = async () => {
    try {
      await api.logout()
    } catch (err) {
      console.error('Logout error:', err)
    } finally {
      setUser(null)
      router.push('/login')
    }
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        login,
        sendOtp,
        verifyOtp,
        signupSendOtp,
        signupVerifyOtp,
        signupComplete,
        forgotPasswordSendOtp,
        forgotPasswordVerifyOtp,
        forgotPasswordReset,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
