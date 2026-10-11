'use client'

import { useCallback, useEffect, useState } from 'react'
import { Check, Mail, Shield, Trash2, User, UserPlus, Users, X } from 'lucide-react'
import { api, type ProjectInvitationsResponse } from '@/lib/api'
import { useAuth } from '@/lib/auth'

interface InviteCollaboratorModalProps {
  repoId: string
  isOpen: boolean
  onClose: () => void
  onUpdated?: () => void
}

export function InviteCollaboratorModal({
  repoId,
  isOpen,
  onClose,
  onUpdated,
}: InviteCollaboratorModalProps) {
  const { user } = useAuth()
  const [data, setData] = useState<ProjectInvitationsResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    if (!repoId) return
    setLoading(true)
    try {
      const res = await api.listProjectInvitations(repoId)
      setData(res)
    } catch (e: any) {
      setError(e instanceof Error ? e.message : 'Could not load collaborator information.')
    } finally {
      setLoading(false)
    }
  }, [repoId])

  useEffect(() => {
    if (isOpen) {
      setError(null)
      setSuccess(null)
      setEmail('')
      loadData()
    }
  }, [isOpen, loadData])

  if (!isOpen) return null

  const isCollaborator = Boolean(user && data && data.collaborator?.id === user.id)
  const isOwner = Boolean(
    user && (data?.owner ? data.owner.id === user.id : !isCollaborator)
  )
  const memberCount = data?.memberCount ?? 1
  const isAtMaxCapacity = memberCount >= 2
  const hasPending = Boolean(data?.pendingInvitation)

  async function handleSendInvite(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) return

    setSubmitting(true)
    setError(null)
    setSuccess(null)

    try {
      const res = await api.inviteCollaborator(repoId, email.trim())
      setSuccess(res.message || `Invitation sent to ${email.trim()}`)
      setEmail('')
      await loadData()
      onUpdated?.()
    } catch (err: any) {
      setError(err instanceof Error ? err.message : 'Failed to send invitation.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleCancelInvitation() {
    if (!window.confirm('Are you sure you want to cancel this pending invitation?')) return
    setCancelling(true)
    setError(null)
    setSuccess(null)

    try {
      const res = await api.cancelProjectInvitation(repoId)
      setSuccess(res.message || 'Invitation cancelled.')
      await loadData()
      onUpdated?.()
    } catch (err: any) {
      setError(err instanceof Error ? err.message : 'Failed to cancel invitation.')
    } finally {
      setCancelling(false)
    }
  }

  async function handleRemoveCollaborator() {
    const confirmPrompt = isOwner
      ? `Remove ${data?.collaborator?.email} from this project? They will lose access immediately.`
      : 'Leave this project? You will lose access immediately.'
    if (!window.confirm(confirmPrompt)) return

    setRemoving(true)
    setError(null)
    setSuccess(null)

    try {
      const res = await api.removeCollaborator(repoId)
      setSuccess(res.message || (isOwner ? 'Collaborator removed.' : 'Left project.'))
      await loadData()
      onUpdated?.()
    } catch (err: any) {
      setError(err instanceof Error ? err.message : 'Failed to remove collaborator.')
    } finally {
      setRemoving(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="dialog-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Manage Project Collaborators"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="panel-head">
          <div className="row" style={{ gap: 8 }}>
            <Users size={18} style={{ color: 'var(--primary)' }} />
            <div>
              <div style={{ fontWeight: 600 }}>Project Collaborators</div>
              <div className="xsmall muted">Maximum 2 members (1 owner + 1 collaborator)</div>
            </div>
          </div>
          <button
            className="btn btn-ghost btn-icon"
            aria-label="Close dialog"
            onClick={onClose}
          >
            <X size={16} />
          </button>
        </div>

        {/* Modal Content */}
        <div className="stack" style={{ padding: 20, gap: 18, overflowY: 'auto' }}>
          {/* Member Count Indicator */}
          <div
            className="row"
            style={{
              justifyContent: 'space-between',
              padding: '8px 12px',
              borderRadius: 'var(--radius)',
              background: 'var(--sunken)',
              border: '1px solid var(--border)',
            }}
          >
            <span className="small muted">Members</span>
            <span
              className={`badge ${isAtMaxCapacity ? 'badge-lav' : ''}`}
              style={{ fontWeight: 600 }}
            >
              {memberCount} / 2 users {isAtMaxCapacity ? '(Capacity Full)' : ''}
            </span>
          </div>

          {/* Messages */}
          {error && (
            <div
              className="small"
              style={{
                padding: '10px 12px',
                borderRadius: 'var(--radius)',
                background: 'var(--danger-soft)',
                color: 'var(--danger)',
                border: '1px solid rgba(180, 51, 74, 0.2)',
              }}
            >
              {error}
            </div>
          )}

          {success && (
            <div
              className="small"
              style={{
                padding: '10px 12px',
                borderRadius: 'var(--radius)',
                background: 'var(--ok-soft)',
                color: 'var(--ok)',
                border: '1px solid rgba(47, 138, 91, 0.2)',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <Check size={14} />
              {success}
            </div>
          )}

          {/* Current Members List */}
          <div className="stack" style={{ gap: 8 }}>
            <div className="xsmall muted" style={{ textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>
              Active Members
            </div>

            {loading && !data && (
              <div className="skeleton" style={{ height: 48, borderRadius: 'var(--radius)' }} />
            )}

            {data && (
              <>
                {/* Owner Item */}
                <div
                  className="row"
                  style={{
                    padding: '10px 12px',
                    borderRadius: 'var(--radius)',
                    background: 'var(--panel)',
                    border: '1px solid var(--border)',
                    justifyContent: 'space-between',
                  }}
                >
                  <div className="row" style={{ gap: 10, minWidth: 0 }}>
                    <div
                      style={{
                        width: 30,
                        height: 30,
                        borderRadius: '50%',
                        background: 'var(--primary-soft)',
                        color: 'var(--primary)',
                        display: 'grid',
                        placeItems: 'center',
                        flexShrink: 0,
                      }}
                    >
                      <Shield size={15} />
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div className="small" style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {data?.owner?.email || (isOwner ? user?.email : 'Project Owner')}
                      </div>
                      <div className="xsmall muted">Project Owner</div>
                    </div>
                  </div>
                  <span className="badge badge-lav">Owner</span>
                </div>

                {/* Collaborator Item if accepted */}
                {data.collaborator ? (
                  <div
                    className="row"
                    style={{
                      padding: '10px 12px',
                      borderRadius: 'var(--radius)',
                      background: 'var(--panel)',
                      border: '1px solid var(--border)',
                      justifyContent: 'space-between',
                    }}
                  >
                    <div className="row" style={{ gap: 10, minWidth: 0 }}>
                      <div
                        style={{
                          width: 30,
                          height: 30,
                          borderRadius: '50%',
                          background: 'var(--ok-soft)',
                          color: 'var(--ok)',
                          display: 'grid',
                          placeItems: 'center',
                          flexShrink: 0,
                        }}
                      >
                        <User size={15} />
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div className="small" style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {data.collaborator.email}
                        </div>
                        <div className="xsmall muted">Collaborator</div>
                      </div>
                    </div>
                    <div className="row" style={{ gap: 8 }}>
                      <span className="badge badge-ready">Collaborator</span>
                      {(isOwner || isCollaborator) && (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm btn-danger"
                          onClick={handleRemoveCollaborator}
                          disabled={removing}
                          title={isOwner ? 'Remove collaborator' : 'Leave project'}
                        >
                          <Trash2 size={13} />
                          <span>{isOwner ? 'Remove' : 'Leave'}</span>
                        </button>
                      )}
                    </div>
                  </div>
                ) : null}
              </>
            )}
          </div>

          {/* Pending Invitation Section */}
          {data?.pendingInvitation && (
            <div className="stack" style={{ gap: 8 }}>
              <div className="xsmall muted" style={{ textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>
                Pending Invitation
              </div>
              <div
                className="row"
                style={{
                  padding: '10px 12px',
                  borderRadius: 'var(--radius)',
                  background: 'var(--warn-soft)',
                  border: '1px solid rgba(168, 106, 18, 0.25)',
                  justifyContent: 'space-between',
                }}
              >
                <div className="row" style={{ gap: 10, minWidth: 0 }}>
                  <div
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: '50%',
                      background: '#fff',
                      color: 'var(--warn)',
                      display: 'grid',
                      placeItems: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <Mail size={15} />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div className="small" style={{ fontWeight: 500, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {data.pendingInvitation.invitee?.email || 'Invited user'}
                    </div>
                    <div className="xsmall" style={{ color: 'var(--warn)' }}>
                      Waiting for acceptance
                    </div>
                  </div>
                </div>
                <div className="row" style={{ gap: 8 }}>
                  <span className="badge badge-busy">Pending</span>
                  {isOwner && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm btn-danger"
                      onClick={handleCancelInvitation}
                      disabled={cancelling}
                      title="Cancel invitation"
                    >
                      <X size={13} />
                      <span>Cancel</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Invite Form (Owner Only) */}
          {isOwner && (
            <div
              className="stack"
              style={{
                gap: 12,
                padding: '14px',
                borderRadius: 'var(--radius)',
                background: 'var(--sunken)',
                border: '1px solid var(--border)',
              }}
            >
              <div className="row" style={{ gap: 8 }}>
                <UserPlus size={16} style={{ color: 'var(--primary)' }} />
                <span className="small" style={{ fontWeight: 600 }}>Invite Collaborator</span>
              </div>

              {isAtMaxCapacity ? (
                <div className="small muted">
                  This project has reached the 2-member limit. Remove the current collaborator if you wish to invite someone else.
                </div>
              ) : hasPending ? (
                <div className="small muted">
                  An invitation is currently pending. Cancel it above to invite a different user.
                </div>
              ) : (
                <form onSubmit={handleSendInvite} className="stack" style={{ gap: 10 }}>
                  <div className="stack" style={{ gap: 4 }}>
                    <label htmlFor="collaborator-email" className="xsmall muted">
                      User Email (must be registered on CodeSphere)
                    </label>
                    <input
                      id="collaborator-email"
                      type="email"
                      className="input"
                      placeholder="e.g. colleague@company.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      disabled={submitting}
                    />
                  </div>

                  <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
                    <button
                      type="submit"
                      className="btn btn-primary btn-sm"
                      disabled={submitting || !email.trim()}
                    >
                      <UserPlus size={14} />
                      <span>{submitting ? 'Sending...' : 'Send Invitation'}</span>
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

          {!isOwner && !isCollaborator && (
            <div className="small muted" style={{ textAlign: 'center', padding: '8px 0' }}>
              Only the project owner can invite collaborators.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
