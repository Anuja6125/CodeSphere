'use client'

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { api, AuthUser, ApiError } from './api'
import { useRouter } from 'next/navigation'

interface AuthContextType {
  user: AuthUser | null
  isLoading: boolean
  isAuthenticated: boolean
  sendOtp: (email: string) => Promise<{ success: boolean; message: string; cooldownSeconds: number }>
  verifyOtp: (email: string, code: string) => Promise<AuthUser>
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

  const sendOtp = async (email: string) => {
    return await api.sendOtp(email)
  }

  const verifyOtp = async (email: string, code: string) => {
    const res = await api.verifyOtp(email, code)
    setUser(res.user)
    return res.user
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
        sendOtp,
        verifyOtp,
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
