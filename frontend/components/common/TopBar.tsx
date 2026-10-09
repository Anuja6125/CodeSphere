'use client'

import Link from 'next/link'
import { ChevronRight, Orbit, LogOut, User as UserIcon } from 'lucide-react'
import { useAuth } from '@/lib/auth'

export function TopBar({ crumb }: { crumb?: string }) {
  const { user, isAuthenticated, logout } = useAuth()

  return (
    <header className="topbar">
      <Link href="/" className="brand" aria-label="CodeSphere home">
        <span className="brand-mark"><Orbit /></span>
        CodeSphere
      </Link>
      {crumb && (
        <span className="topbar-crumb">
          <ChevronRight aria-hidden />
          <strong>{crumb}</strong>
        </span>
      )}

      <div className="spacer" />

      {isAuthenticated && user ? (
        <div className="row" style={{ gap: 12 }}>
          <div
            className="row"
            style={{
              gap: 8,
              padding: '4px 10px',
              borderRadius: 'var(--radius)',
              background: 'var(--sunken)',
              border: '1px solid var(--border)',
            }}
          >
            <UserIcon size={14} style={{ color: 'var(--muted)' }} />
            <span style={{ fontSize: 'var(--text-xs)', fontWeight: 500, color: 'var(--text)' }}>
              {user.email}
            </span>
            <span
              className={`badge ${user.role === 'MANAGER' ? 'badge-lav' : 'badge-ready'}`}
              style={{ fontSize: '10px', padding: '1px 6px', textTransform: 'capitalize' }}
            >
              {user.role === 'MANAGER' ? 'Manager' : 'Employee'}
            </span>
          </div>

          <button
            id="logout-btn"
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => logout()}
            title="Sign out of CodeSphere"
            aria-label="Sign out"
          >
            <LogOut size={14} />
            <span>Sign out</span>
          </button>
        </div>
      ) : (
        <Link href="/login" className="btn btn-primary btn-sm">
          Sign in
        </Link>
      )}
    </header>
  )
}
