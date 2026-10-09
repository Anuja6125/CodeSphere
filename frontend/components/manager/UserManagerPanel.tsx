'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { api, UserListItem, ManagerStats, UserRole, ApiError } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import {
  Users,
  ShieldCheck,
  Briefcase,
  FolderGit2,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  UserCheck,
} from 'lucide-react'

export function UserManagerPanel() {
  const { user: currentUser } = useAuth()
  const [users, setUsers] = useState<UserListItem[]>([])
  const [stats, setStats] = useState<ManagerStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    setErrorMsg(null)
    try {
      const [userList, statsData] = await Promise.all([
        api.listUsers(),
        api.getManagerStats().catch(() => null),
      ])
      setUsers(userList)
      if (statsData) setStats(statsData)
    } catch (err: any) {
      if (err instanceof ApiError && err.status === 403) {
        setErrorMsg('Access denied: You do not have permission to view user administration.')
      } else {
        setErrorMsg(err?.message || 'Failed to load user list.')
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleRoleChange = async (targetUser: UserListItem, newRole: UserRole) => {
    if (targetUser.role === newRole) return

    if (currentUser?.id === targetUser.id) {
      setErrorMsg('Forbidden: Users cannot assign or modify their own role.')
      return
    }

    const confirmChange = window.confirm(
      `Are you sure you want to change the role of ${targetUser.email} to ${newRole}?`
    )
    if (!confirmChange) return

    setUpdatingUserId(targetUser.id)
    setErrorMsg(null)
    setSuccessMsg(null)

    try {
      const res = await api.updateUserRole(targetUser.id, newRole)
      setSuccessMsg(res.message || `Role updated successfully to ${newRole}.`)
      // Update local state
      setUsers((prev) =>
        prev.map((u) => (u.id === targetUser.id ? { ...u, role: newRole } : u))
      )
      // Refresh stats
      api.getManagerStats().then(setStats).catch(() => {})
    } catch (err: any) {
      if (err instanceof ApiError && err.status === 403) {
        setErrorMsg(err.message || 'Forbidden: You cannot modify this user role.')
      } else {
        setErrorMsg(err?.message || 'Failed to update user role.')
      }
    } finally {
      setUpdatingUserId(null)
    }
  }

  return (
    <section className="panel" aria-labelledby="manager-panel-title">
      <div className="panel-head">
        <div className="row" style={{ gap: 10 }}>
          <ShieldCheck size={20} style={{ color: 'var(--primary)' }} />
          <h2 id="manager-panel-title" className="title-md">
            Team & Role Administration
          </h2>
        </div>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={loadData}
          disabled={loading}
          title="Refresh user list"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin spin' : ''} />
          <span>Refresh</span>
        </button>
      </div>

      <div className="panel-pad stack" style={{ gap: 20 }}>
        {/* Manager Stats Cards */}
        {stats && (
          <div className="grid-4" style={{ gap: 12 }}>
            <div
              style={{
                padding: '12px 16px',
                borderRadius: 'var(--radius)',
                background: 'var(--sunken)',
                border: '1px solid var(--border)',
              }}
            >
              <div className="row" style={{ gap: 8, color: 'var(--muted)', marginBottom: 4 }}>
                <Users size={14} />
                <span className="small">Total Users</span>
              </div>
              <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--text)' }}>
                {stats.totalUsers}
              </div>
            </div>

            <div
              style={{
                padding: '12px 16px',
                borderRadius: 'var(--radius)',
                background: 'var(--sunken)',
                border: '1px solid var(--border)',
              }}
            >
              <div className="row" style={{ gap: 8, color: 'var(--primary)', marginBottom: 4 }}>
                <ShieldCheck size={14} />
                <span className="small">Managers</span>
              </div>
              <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--primary)' }}>
                {stats.totalManagers}
              </div>
            </div>

            <div
              style={{
                padding: '12px 16px',
                borderRadius: 'var(--radius)',
                background: 'var(--sunken)',
                border: '1px solid var(--border)',
              }}
            >
              <div className="row" style={{ gap: 8, color: 'var(--ok)', marginBottom: 4 }}>
                <Briefcase size={14} />
                <span className="small">Employees</span>
              </div>
              <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--ok)' }}>
                {stats.totalEmployees}
              </div>
            </div>

            <div
              style={{
                padding: '12px 16px',
                borderRadius: 'var(--radius)',
                background: 'var(--sunken)',
                border: '1px solid var(--border)',
              }}
            >
              <div className="row" style={{ gap: 8, color: 'var(--warn)', marginBottom: 4 }}>
                <FolderGit2 size={14} />
                <span className="small">Projects</span>
              </div>
              <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--warn)' }}>
                {stats.totalProjects}
              </div>
            </div>
          </div>
        )}

        {/* Feedback Messages */}
        {errorMsg && (
          <div
            className="row"
            style={{
              padding: '10px 14px',
              borderRadius: 'var(--radius)',
              background: 'var(--danger-soft)',
              color: 'var(--danger)',
              fontSize: 'var(--text-sm)',
            }}
          >
            <AlertTriangle size={16} />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div
            className="row"
            style={{
              padding: '10px 14px',
              borderRadius: 'var(--radius)',
              background: 'var(--ok-soft)',
              color: 'var(--ok)',
              fontSize: 'var(--text-sm)',
            }}
          >
            <CheckCircle2 size={16} />
            <span>{successMsg}</span>
          </div>
        )}

        {/* User Table */}
        {loading ? (
          <div style={{ display: 'grid', placeItems: 'center', padding: '40px 0' }}>
            <Loader2 className="animate-spin spin" size={24} style={{ color: 'var(--primary)' }} />
          </div>
        ) : users.length === 0 ? (
          <p className="muted small" style={{ textAlign: 'center', padding: '24px 0' }}>
            No team members registered yet.
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 'var(--text-sm)' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--muted)' }}>
                  <th style={{ padding: '10px 12px', fontWeight: 500 }}>User / Email</th>
                  <th style={{ padding: '10px 12px', fontWeight: 500 }}>Current Role</th>
                  <th style={{ padding: '10px 12px', fontWeight: 500 }}>Projects</th>
                  <th style={{ padding: '10px 12px', fontWeight: 500 }}>Joined</th>
                  <th style={{ padding: '10px 12px', fontWeight: 500, textAlign: 'right' }}>Role Action</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const isCurrent = currentUser?.id === u.id
                  const isUpdating = updatingUserId === u.id

                  return (
                    <tr
                      key={u.id}
                      style={{
                        borderBottom: '1px solid var(--border)',
                        background: isCurrent ? 'var(--sunken)' : 'transparent',
                      }}
                    >
                      <td style={{ padding: '12px' }}>
                        <div style={{ fontWeight: 500, color: 'var(--text)' }}>
                          {u.email}
                          {isCurrent && (
                            <span
                              className="badge badge-lav"
                              style={{ marginLeft: 8, fontSize: 10, padding: '1px 6px' }}
                            >
                              You
                            </span>
                          )}
                        </div>
                      </td>

                      <td style={{ padding: '12px' }}>
                        <span
                          className={`badge ${u.role === 'MANAGER' ? 'badge-lav' : 'badge-ready'}`}
                          style={{ textTransform: 'capitalize' }}
                        >
                          {u.role === 'MANAGER' ? <ShieldCheck size={12} /> : <Briefcase size={12} />}
                          {u.role.toLowerCase()}
                        </span>
                      </td>

                      <td style={{ padding: '12px', color: 'var(--muted)' }}>
                        {u._count.repositories} owned
                      </td>

                      <td style={{ padding: '12px', color: 'var(--muted)' }}>
                        {new Date(u.createdAt).toLocaleDateString()}
                      </td>

                      <td style={{ padding: '12px', textAlign: 'right' }}>
                        {isCurrent ? (
                          <span
                            className="muted small"
                            title="Requirement 2: Users must never be able to assign or modify their own role"
                            style={{ fontStyle: 'italic', fontSize: 12 }}
                          >
                            Cannot edit own role
                          </span>
                        ) : isUpdating ? (
                          <Loader2 className="animate-spin spin" size={16} style={{ display: 'inline' }} />
                        ) : (
                          <div style={{ display: 'inline-flex', gap: 6 }}>
                            {u.role === 'EMPLOYEE' ? (
                              <button
                                type="button"
                                className="btn btn-sm btn-primary"
                                onClick={() => handleRoleChange(u, 'MANAGER')}
                                title="Promote user to Manager"
                              >
                                <UserCheck size={12} />
                                Promote to Manager
                              </button>
                            ) : (
                              <button
                                type="button"
                                className="btn btn-sm"
                                onClick={() => handleRoleChange(u, 'EMPLOYEE')}
                                title="Change user role to Employee"
                              >
                                Demote to Employee
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  )
}
