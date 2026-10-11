'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Bell, Check, Loader2, Mail, Shield, User, X } from 'lucide-react'
import { api, type ProjectInvitation } from '@/lib/api'
import { useAuth } from '@/lib/auth'

interface PendingInvitationsProps {
  onChanged?: (acceptedRepoId?: string) => void
}

export function PendingInvitations({ onChanged }: PendingInvitationsProps) {
  const { isAuthenticated } = useAuth()
  const router = useRouter()
  const [invitations, setInvitations] = useState<ProjectInvitation[]>([])
  const [loading, setLoading] = useState(true)
  const [actionId, setActionId] = useState<string | null>(null)
  const [actionType, setActionType] = useState<'accept' | 'reject' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const loadInvitations = useCallback(async () => {
    if (!isAuthenticated) {
      setLoading(false)
      return
    }
    try {
      setLoading(true)
      const list = await api.listMyInvitations()
      setInvitations(list || [])
      setError(null)
    } catch (e: any) {
      console.error('Failed to load invitations:', e)
      setError(e instanceof Error ? e.message : 'Could not check for project invitations.')
    } finally {
      setLoading(false)
    }
  }, [isAuthenticated])

  useEffect(() => {
    loadInvitations()
    const timer = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        api.listMyInvitations()
          .then((list) => setInvitations(list || []))
          .catch(() => {})
      }
    }, 6000)
    return () => clearInterval(timer)
  }, [loadInvitations])

  if (!isAuthenticated) return null

  async function handleAccept(inv: ProjectInvitation) {
    setActionId(inv.id)
    setActionType('accept')
    setError(null)
    setSuccessMessage(null)

    try {
      await api.acceptInvitation(inv.id)
      setInvitations((prev) => prev.filter((i) => i.id !== inv.id))
      setSuccessMessage(
        `Successfully joined "${inv.repository?.name || 'Project'}". Access granted!`
      )
      onChanged?.(inv.repositoryId)
    } catch (err: any) {
      setError(err instanceof Error ? err.message : 'Failed to accept invitation.')
    } finally {
      setActionId(null)
      setActionType(null)
    }
  }

  async function handleReject(inv: ProjectInvitation) {
    setActionId(inv.id)
    setActionType('reject')
    setError(null)
    setSuccessMessage(null)

    try {
      await api.rejectInvitation(inv.id)
      setInvitations((prev) => prev.filter((i) => i.id !== inv.id))
      setSuccessMessage(`Declined invitation for "${inv.repository?.name || 'Project'}".`)
      onChanged?.()
    } catch (err: any) {
      setError(err instanceof Error ? err.message : 'Failed to decline invitation.')
    } finally {
      setActionId(null)
      setActionType(null)
    }
  }

  return (
    <section
      className="panel"
      aria-labelledby="invitations-heading"
      style={{
        borderColor: invitations.length > 0 ? 'var(--primary)' : 'var(--border)',
        boxShadow: invitations.length > 0 ? '0 4px 16px rgba(110, 91, 191, 0.08)' : undefined,
      }}
    >
      <div
        className="panel-head"
        style={{
          background: invitations.length > 0 ? 'var(--primary-soft)' : undefined,
        }}
      >
        <div className="row" style={{ gap: 8 }}>
          <Bell size={18} style={{ color: 'var(--primary)' }} />
          <h2 id="invitations-heading" className="title-md" style={{ fontSize: 'var(--text-base)' }}>
            Invitations & Notifications
          </h2>
          {invitations.length > 0 && (
            <span className="badge badge-lav" style={{ fontWeight: 600 }}>
              {invitations.length} pending
            </span>
          )}
        </div>
      </div>

      <div className="panel-pad stack" style={{ gap: 14 }}>
        {/* Loading State */}
        {loading && (
          <div className="row" style={{ color: 'var(--muted)', padding: '8px 0', gap: 10 }}>
            <Loader2 size={16} className="spin" />
            <span className="small">Checking for invitations…</span>
          </div>
        )}

        {/* Success Message Banner */}
        {successMessage && (
          <div
            className="row"
            style={{
              padding: '10px 14px',
              borderRadius: 'var(--radius)',
              background: 'var(--ok-soft)',
              color: 'var(--ok)',
              border: '1px solid rgba(47, 138, 91, 0.25)',
              fontSize: 'var(--text-sm)',
              justifyContent: 'space-between',
            }}
          >
            <div className="row" style={{ gap: 8 }}>
              <Check size={16} />
              <span>{successMessage}</span>
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              style={{ color: 'var(--ok)', height: 24, padding: '0 6px' }}
              onClick={() => setSuccessMessage(null)}
            >
              <X size={12} />
            </button>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div
            className="row"
            style={{
              padding: '10px 14px',
              borderRadius: 'var(--radius)',
              background: 'var(--danger-soft)',
              color: 'var(--danger)',
              border: '1px solid rgba(180, 51, 74, 0.25)',
              fontSize: 'var(--text-sm)',
              justifyContent: 'space-between',
            }}
          >
            <span>{error}</span>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              style={{ color: 'var(--danger)' }}
              onClick={() => loadInvitations()}
            >
              Retry
            </button>
          </div>
        )}

        {/* Empty State */}
        {!loading && invitations.length === 0 && !error && (
          <div
            className="row"
            style={{
              gap: 12,
              padding: '8px 4px',
              color: 'var(--muted)',
            }}
          >
            <Mail size={16} style={{ color: 'var(--faint)' }} />
            <span className="small">
              No pending invitations. When another user invites you to collaborate on a project, invitations will appear here.
            </span>
          </div>
        )}

        {/* Active Pending Invitations List */}
        {!loading && invitations.length > 0 && (
          <div className="stack" style={{ gap: 10 }}>
            {invitations.map((inv) => {
              const isActing = actionId === inv.id
              return (
                <div
                  key={inv.id}
                  className="row"
                  style={{
                    justifyContent: 'space-between',
                    padding: '12px 14px',
                    borderRadius: 'var(--radius)',
                    background: 'var(--panel)',
                    border: '1px solid var(--border-strong)',
                    flexWrap: 'wrap',
                    gap: 12,
                  }}
                >
                  <div className="row" style={{ gap: 12, minWidth: 0, flex: 1 }}>
                    <div
                      style={{
                        width: 38,
                        height: 38,
                        borderRadius: 'var(--radius)',
                        background: 'var(--primary-soft)',
                        color: 'var(--primary)',
                        display: 'grid',
                        placeItems: 'center',
                        flexShrink: 0,
                      }}
                    >
                      <User size={20} />
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div className="row" style={{ gap: 8, alignItems: 'center' }}>
                        <span style={{ fontWeight: 600, fontSize: 'var(--text-sm)' }}>
                          {inv.repository?.name || 'Project'}
                        </span>
                        <span className="badge badge-lav" style={{ fontSize: '0.6875rem' }}>
                          Collaboration Invite
                        </span>
                      </div>
                      <div className="xsmall muted" style={{ marginTop: 2 }}>
                        Invited by <strong style={{ color: 'var(--text)' }}>{inv.inviter?.email || 'Owner'}</strong>
                      </div>
                    </div>
                  </div>

                  <div className="row" style={{ gap: 8 }}>
                    <button
                      id={`accept-invite-${inv.id}`}
                      type="button"
                      className="btn btn-primary btn-sm"
                      disabled={isActing}
                      onClick={() => handleAccept(inv)}
                      title="Accept invitation and join project"
                    >
                      {isActing && actionType === 'accept' ? (
                        <>
                          <Loader2 size={13} className="spin" />
                          <span>Accepting…</span>
                        </>
                      ) : (
                        <>
                          <Check size={14} />
                          <span>Accept</span>
                        </>
                      )}
                    </button>
                    <button
                      id={`reject-invite-${inv.id}`}
                      type="button"
                      className="btn btn-ghost btn-sm btn-danger"
                      disabled={isActing}
                      onClick={() => handleReject(inv)}
                      title="Decline invitation"
                    >
                      {isActing && actionType === 'reject' ? (
                        <>
                          <Loader2 size={13} className="spin" />
                          <span>Declining…</span>
                        </>
                      ) : (
                        <>
                          <X size={14} />
                          <span>Decline</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </section>
  )
}
