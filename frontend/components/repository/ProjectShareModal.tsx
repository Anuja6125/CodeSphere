'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { api, ProjectAccessRecord, RepositorySummary } from '@/lib/api'
import {
  UserPlus,
  Trash2,
  X,
  Shield,
  Eye,
  Edit3,
  Loader2,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react'

interface ProjectShareModalProps {
  repo: RepositorySummary
  onClose: () => void
}

export function ProjectShareModal({ repo, onClose }: ProjectShareModalProps) {
  const [accessList, setAccessList] = useState<ProjectAccessRecord[]>([])
  const [owner, setOwner] = useState<{ id: string; email: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [emailInput, setEmailInput] = useState('')
  const [roleInput, setRoleInput] = useState<'VIEWER' | 'EDITOR' | 'MANAGER'>('VIEWER')
  const [submitting, setSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  const loadAccess = useCallback(async () => {
    setLoading(true)
    setErrorMsg(null)
    try {
      const data = await api.listProjectAccess(repo.id)
      setAccessList(data.access)
      setOwner(data.owner)
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to load project permissions.')
    } finally {
      setLoading(false)
    }
  }, [repo.id])

  useEffect(() => {
    loadAccess()
  }, [loadAccess])

  const handleAddAccess = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!emailInput.trim()) return

    setSubmitting(true)
    setErrorMsg(null)
    setSuccessMsg(null)

    try {
      const res = await api.addProjectAccess(repo.id, emailInput.trim(), roleInput)
      setSuccessMsg(res.message)
      setEmailInput('')
      await loadAccess()
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to grant project access.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleRemoveAccess = async (userId: string, email: string) => {
    if (!window.confirm(`Revoke access for ${email}?`)) return

    try {
      await api.removeProjectAccess(repo.id, userId)
      setAccessList((prev) => prev.filter((a) => a.userId !== userId))
      setSuccessMsg(`Access revoked for ${email}.`)
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to revoke access.')
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0,0,0,0.6)',
        display: 'grid',
        placeItems: 'center',
        zIndex: 50,
        padding: 20,
      }}
      onClick={onClose}
    >
      <div
        className="panel"
        style={{
          width: '100%',
          maxWidth: 520,
          boxShadow: 'var(--shadow-pop)',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="panel-head">
          <div className="row" style={{ gap: 8 }}>
            <UserPlus size={18} style={{ color: 'var(--primary)' }} />
            <h3 className="title-md">Project Access: {repo.name}</h3>
          </div>
          <button type="button" className="btn btn-ghost btn-sm btn-icon" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="panel-pad stack" style={{ gap: 18, overflowY: 'auto' }}>
          {/* Status notices */}
          {errorMsg && (
            <div
              className="row"
              style={{
                padding: '8px 12px',
                borderRadius: 'var(--radius)',
                background: 'var(--danger-soft)',
                color: 'var(--danger)',
                fontSize: 'var(--text-xs)',
              }}
            >
              <AlertTriangle size={14} />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div
              className="row"
              style={{
                padding: '8px 12px',
                borderRadius: 'var(--radius)',
                background: 'var(--ok-soft)',
                color: 'var(--ok)',
                fontSize: 'var(--text-xs)',
              }}
            >
              <CheckCircle2 size={14} />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Share with Form */}
          <form onSubmit={handleAddAccess} className="stack" style={{ gap: 10 }}>
            <label className="label" style={{ margin: 0 }}>
              Share with a team member
            </label>
            <div className="row" style={{ gap: 8 }}>
              <input
                type="email"
                className="input"
                placeholder="colleague@codesphere.io"
                required
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                disabled={submitting}
                style={{ flex: 1 }}
              />

              <select
                className="input"
                value={roleInput}
                onChange={(e) => setRoleInput(e.target.value as any)}
                disabled={submitting}
                style={{ width: 110 }}
              >
                <option value="VIEWER">Viewer</option>
                <option value="EDITOR">Editor</option>
                <option value="MANAGER">Manager</option>
              </select>

              <button
                type="submit"
                className="btn btn-primary"
                disabled={submitting || !emailInput.trim()}
              >
                {submitting ? <Loader2 className="animate-spin spin" size={14} /> : 'Share'}
              </button>
            </div>
          </form>

          {/* Current Members List */}
          <div>
            <h4 className="small muted" style={{ marginBottom: 10, fontWeight: 600 }}>
              People with access
            </h4>

            {loading ? (
              <div style={{ display: 'grid', placeItems: 'center', padding: '20px 0' }}>
                <Loader2 className="animate-spin spin" size={20} style={{ color: 'var(--primary)' }} />
              </div>
            ) : (
              <div className="stack" style={{ gap: 8 }}>
                {/* Project Creator/Owner */}
                <div
                  className="row"
                  style={{
                    padding: '8px 12px',
                    borderRadius: 'var(--radius)',
                    background: 'var(--sunken)',
                    border: '1px solid var(--border)',
                    justifyContent: 'space-between',
                  }}
                >
                  <div>
                    <span style={{ fontWeight: 500, fontSize: 'var(--text-sm)' }}>
                      {owner?.email || 'Project Creator'}
                    </span>
                    <span className="muted small" style={{ marginLeft: 8 }}>
                      (Owner)
                    </span>
                  </div>
                  <span className="badge badge-lav" style={{ fontSize: 10 }}>
                    Full Access
                  </span>
                </div>

                {/* Explicitly Shared Users */}
                {accessList.map((access) => (
                  <div
                    key={access.id}
                    className="row"
                    style={{
                      padding: '8px 12px',
                      borderRadius: 'var(--radius)',
                      background: 'var(--panel)',
                      border: '1px solid var(--border)',
                      justifyContent: 'space-between',
                    }}
                  >
                    <div>
                      <span style={{ fontWeight: 500, fontSize: 'var(--text-sm)' }}>
                        {access.user.email}
                      </span>
                    </div>

                    <div className="row" style={{ gap: 8 }}>
                      <span
                        className={`badge ${
                          access.role === 'MANAGER'
                            ? 'badge-lav'
                            : access.role === 'EDITOR'
                            ? 'badge-ready'
                            : 'badge'
                        }`}
                        style={{ fontSize: 10 }}
                      >
                        {access.role === 'MANAGER' ? (
                          <Shield size={10} />
                        ) : access.role === 'EDITOR' ? (
                          <Edit3 size={10} />
                        ) : (
                          <Eye size={10} />
                        )}
                        {access.role}
                      </span>

                      <button
                        type="button"
                        className="btn btn-ghost btn-sm btn-icon btn-danger"
                        onClick={() => handleRemoveAccess(access.userId, access.user.email)}
                        title="Revoke access"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))}

                {accessList.length === 0 && !owner && (
                  <p className="muted small" style={{ textAlign: 'center', padding: '12px 0' }}>
                    This project is private and only visible to you.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
