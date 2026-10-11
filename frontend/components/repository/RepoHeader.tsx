'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BookOpen, History, LayoutGrid, MessageSquare, Network, RefreshCw, Shield, UserPlus, Users } from 'lucide-react'
import { api } from '@/lib/api'
import { hasAnalysis, isBusy, sourceLabel } from '@/lib/status'
import { useRepo } from './RepoContext'
import { PipelineSteps, StatusBadge } from './StatusBadge'
import { Alert } from '@/components/common/States'
import { InviteCollaboratorModal } from './InviteCollaboratorModal'

export function RepoHeader() {
  const { id, repo, refresh } = useRepo()
  const pathname = usePathname()
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [inviteOpen, setInviteOpen] = useState(false)

  const base = `/repositories/${id}`
  const ready = !!repo && hasAnalysis(repo.status)
  const tabs = [
    { href: base, label: 'Overview', icon: LayoutGrid, enabled: true },
    { href: `${base}/graph`, label: 'Graph', icon: Network, enabled: ready || !!repo?.graph },
    { href: `${base}/documentation`, label: 'Documentation', icon: BookOpen, enabled: ready },
    { href: `${base}/chat`, label: 'Chat', icon: MessageSquare, enabled: ready },
    { href: `${base}/history`, label: 'History', icon: History, enabled: true },
  ]

  async function reanalyze() {
    setStarting(true)
    setError(null)
    try {
      await api.reanalyze(id)
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start the analysis.')
    } finally {
      setStarting(false)
    }
  }

  const busy = !repo || isBusy(repo.status) || repo.isProcessing

  return (
    <div className="repo-header">
      <div className="repo-header-inner">
        <div className="row" style={{ alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="row-wrap">
              <h1 className="title-lg" style={{ overflowWrap: 'anywhere' }}>{repo?.name ?? <span className="skeleton" style={{ display: 'inline-block', width: 220, height: 28 }} />}</h1>
              {repo && <StatusBadge status={repo.status} />}
            </div>
            {repo && (
              <div className="row-wrap" style={{ marginTop: 6, gap: 10, alignItems: 'center' }}>
                <div className="muted small">
                  {repo.url ? <a href={repo.url.replace(/\.git$/, '')} target="_blank" rel="noreferrer noopener">{sourceLabel(repo)}</a> : sourceLabel(repo)}
                  {repo.totalFiles > 0 && `, ${repo.totalFiles.toLocaleString()} files, ${repo.totalLines.toLocaleString()} lines`}
                </div>

                {repo.user && (
                  <span className="badge badge-lav" title={`Project owner: ${repo.user.email}`}>
                    <Shield size={12} />
                    <span>Owner: {repo.user.email}</span>
                  </span>
                )}

                {repo.collaborator && (
                  <span className="badge badge-ready" title={`Collaborator: ${repo.collaborator.email}`}>
                    <Users size={12} />
                    <span>Collaborator: {repo.collaborator.email}</span>
                  </span>
                )}
              </div>
            )}
          </div>
          <div className="row" style={{ gap: 8 }}>
            <button
              id="invite-collaborator-btn"
              type="button"
              className="btn btn-ghost"
              onClick={() => setInviteOpen(true)}
              title="Invite or manage collaborators"
            >
              <UserPlus size={16} />
              <span>Invite Collaborator</span>
            </button>
            <button className="btn" onClick={reanalyze} disabled={busy || starting} title="Run the full analysis again">
              <RefreshCw className={starting ? 'spin' : undefined} />
              Re-analyze
            </button>
          </div>
        </div>

        <InviteCollaboratorModal
          repoId={id}
          isOpen={inviteOpen}
          onClose={() => setInviteOpen(false)}
          onUpdated={refresh}
        />

        {repo && isBusy(repo.status) && <PipelineSteps status={repo.status} />}
        {error && <Alert>{error}</Alert>}

        <nav className="tabs" aria-label="Repository sections">
          {tabs.map(({ href, label, icon: Icon, enabled }) => (
            <Link
              key={href}
              href={href}
              className="tab"
              aria-current={pathname === href ? 'page' : undefined}
              aria-disabled={!enabled}
              tabIndex={enabled ? undefined : -1}
            >
              <Icon aria-hidden />
              {label}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  )
}
