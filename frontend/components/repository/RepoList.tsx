'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { FileArchive, GitBranch, LogOut, Shield, Trash2, Users } from 'lucide-react'
import { api, type RepositorySummary } from '@/lib/api'
import { isBusy, sourceLabel } from '@/lib/status'
import { StatusBadge } from './StatusBadge'
import { EmptyState, ErrorState } from '@/components/common/States'
import { useAuth } from '@/lib/auth'

function timeAgo(iso: string) {
  const seconds = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 1000))
  if (seconds < 60) return 'just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  return new Date(iso).toLocaleDateString()
}

type TabKey = 'personal' | 'shared' | 'all'

export function RepoList() {
  const { user } = useAuth()
  const [repos, setRepos] = useState<RepositorySummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<TabKey>('all')

  const requestIdRef = useRef<number>(0)

  const load = useCallback(async () => {
    const currentReqId = ++requestIdRef.current
    try {
      const data = await api.listRepositories()
      if (currentReqId < requestIdRef.current) return
      setRepos(data)
      setError(null)
    } catch (e) {
      if (currentReqId < requestIdRef.current) return
      setError(e instanceof Error ? e.message : 'Could not load projects.')
    }
  }, [])

  useEffect(() => { load() }, [load])

  // Refresh while any project is still being analyzed (3s) or background sync for shared updates (6s)
  const anyBusy = repos?.some((r) => isBusy(r.status))
  useEffect(() => {
    const intervalMs = anyBusy ? 3000 : 6000
    const timer = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        load()
      }
    }, intervalMs)
    return () => clearInterval(timer)
  }, [anyBusy, load])

  async function removeOwned(repo: RepositorySummary) {
    if (!window.confirm(`Delete "${repo.name}"? Its graph, docs, and chat history will be permanently removed.`)) return
    try {
      await api.remove(repo.id)
      setRepos((list) => list?.filter((r) => r.id !== repo.id) ?? null)
    } catch (e: any) {
      setError(e instanceof Error ? e.message : 'Could not delete the project.')
    }
  }

  async function leaveShared(repo: RepositorySummary) {
    if (!window.confirm(`Leave shared project "${repo.name}"? You will lose collaborator access to this repository.`)) return
    try {
      await api.removeCollaborator(repo.id)
      setRepos((list) => list?.filter((r) => r.id !== repo.id) ?? null)
    } catch (e: any) {
      setError(e instanceof Error ? e.message : 'Could not leave the project.')
    }
  }

  // Separate personally owned projects vs projects shared with the user
  const ownedRepos = repos?.filter((r) => !user || r.userId === user.id) ?? []
  const sharedRepos = repos?.filter((r) => user && r.collaborator?.id === user.id && r.userId !== user.id) ?? []

  function renderRepoItem(repo: RepositorySummary, isShared: boolean) {
    return (
      <li key={repo.id} className="repo-item">
        <span className="repo-icon" aria-hidden>
          {repo.sourceType === 'GITHUB' ? <GitBranch /> : <FileArchive />}
        </span>

        <Link href={`/repositories/${repo.id}`} className="repo-link">
          <div className="row" style={{ gap: 8, alignItems: 'center' }}>
            <span className="repo-name">{repo.name}</span>
            {isShared ? (
              <span
                className="badge"
                style={{
                  fontSize: '0.6875rem',
                  padding: '1px 6px',
                  gap: 4,
                  background: 'var(--primary-soft)',
                  color: 'var(--primary)',
                }}
              >
                <Users size={11} />
                <span>Shared</span>
              </span>
            ) : repo.collaborator ? (
              <span
                className="badge"
                style={{
                  fontSize: '0.6875rem',
                  padding: '1px 6px',
                  gap: 4,
                  background: 'var(--ok-soft)',
                  color: 'var(--ok)',
                }}
                title={`Collaborator: ${repo.collaborator.email}`}
              >
                <Users size={11} />
                <span>1 Collaborator</span>
              </span>
            ) : null}
          </div>

          <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginTop: 2 }}>
            <span className="muted xsmall">
              {sourceLabel(repo)}
              {repo.totalFiles > 0 && `, ${repo.totalFiles.toLocaleString()} files`}
              {`, updated ${timeAgo(repo.updatedAt)}`}
            </span>
            {isShared && repo.user && (
              <span className="xsmall" style={{ color: 'var(--primary)', fontWeight: 500 }}>
                • Owned by {repo.user.email}
              </span>
            )}
          </div>
        </Link>

        <StatusBadge status={repo.status} />

        {isShared ? (
          <button
            className="btn btn-ghost btn-icon btn-danger"
            aria-label={`Leave ${repo.name}`}
            title="Leave shared project"
            onClick={() => leaveShared(repo)}
          >
            <LogOut size={15} />
          </button>
        ) : (
          <button
            className="btn btn-ghost btn-icon btn-danger"
            aria-label={`Delete ${repo.name}`}
            title="Delete project"
            disabled={isBusy(repo.status)}
            onClick={() => removeOwned(repo)}
          >
            <Trash2 size={15} />
          </button>
        )}
      </li>
    )
  }

  return (
    <section className="panel" aria-labelledby="list-title">
      <div className="panel-head" style={{ flexWrap: 'wrap', gap: 12 }}>
        <div className="row" style={{ gap: 8 }}>
          <h2 id="list-title" className="title-md">Projects</h2>
          {repos && repos.length > 0 && (
            <span className="muted small">{repos.length} total</span>
          )}
        </div>

        {/* Separation Tabs */}
        {repos && repos.length > 0 && (
          <div className="row" style={{ gap: 4 }}>
            <button
              type="button"
              className={`btn btn-sm ${activeTab === 'all' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setActiveTab('all')}
            >
              All ({repos.length})
            </button>
            <button
              type="button"
              className={`btn btn-sm ${activeTab === 'personal' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setActiveTab('personal')}
            >
              Personal ({ownedRepos.length})
            </button>
            <button
              type="button"
              className={`btn btn-sm ${activeTab === 'shared' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setActiveTab('shared')}
            >
              Shared with You ({sharedRepos.length})
            </button>
          </div>
        )}
      </div>

      {error && !repos && <ErrorState title="Can't load projects" message={error} onRetry={load} />}

      {!repos && !error && (
        <div className="stack" style={{ padding: 20 }}>
          {[0, 1, 2].map((i) => <div key={i} className="skeleton" style={{ height: 40 }} />)}
        </div>
      )}

      {repos && repos.length === 0 && (
        <EmptyState icon={<FileArchive />} title="No projects found">
          Add a ZIP or a GitHub URL on the left to see its graph, docs, and chat.
        </EmptyState>
      )}

      {repos && repos.length > 0 && (
        <div className="stack" style={{ gap: 0 }}>
          {/* TAB: Personal Only */}
          {activeTab === 'personal' && (
            <>
              {ownedRepos.length === 0 ? (
                <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)', fontSize: 'var(--text-sm)' }}>
                  You have not created any personal projects yet.
                </div>
              ) : (
                <ul className="repo-list">
                  {ownedRepos.map((repo) => renderRepoItem(repo, false))}
                </ul>
              )}
            </>
          )}

          {/* TAB: Shared Only */}
          {activeTab === 'shared' && (
            <>
              {sharedRepos.length === 0 ? (
                <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)', fontSize: 'var(--text-sm)' }}>
                  No projects shared with you yet. Once an owner invites you and you accept, it will appear here.
                </div>
              ) : (
                <ul className="repo-list">
                  {sharedRepos.map((repo) => renderRepoItem(repo, true))}
                </ul>
              )}
            </>
          )}

          {/* TAB: All (Divided into Personal and Shared sections) */}
          {activeTab === 'all' && (
            <div className="stack" style={{ gap: 16, padding: '12px 0' }}>
              {/* Personal Section */}
              <div>
                <div
                  className="row"
                  style={{
                    padding: '4px 20px 8px',
                    justifyContent: 'space-between',
                    borderBottom: '1px solid var(--border)',
                  }}
                >
                  <span className="xsmall muted" style={{ textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>
                    Personal Projects ({ownedRepos.length})
                  </span>
                </div>
                {ownedRepos.length === 0 ? (
                  <div style={{ padding: '16px 20px', color: 'var(--muted)', fontSize: 'var(--text-xs)' }}>
                    No personal projects created yet.
                  </div>
                ) : (
                  <ul className="repo-list">
                    {ownedRepos.map((repo) => renderRepoItem(repo, false))}
                  </ul>
                )}
              </div>

              {/* Shared Section */}
              <div>
                <div
                  className="row"
                  style={{
                    padding: '8px 20px',
                    justifyContent: 'space-between',
                    borderBottom: '1px solid var(--border)',
                  }}
                >
                  <span className="xsmall muted" style={{ textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>
                    Shared with You ({sharedRepos.length})
                  </span>
                </div>
                {sharedRepos.length === 0 ? (
                  <div style={{ padding: '16px 20px', color: 'var(--muted)', fontSize: 'var(--text-xs)' }}>
                    No projects shared with you yet.
                  </div>
                ) : (
                  <ul className="repo-list">
                    {sharedRepos.map((repo) => renderRepoItem(repo, true))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {error && repos && <div style={{ padding: '0 20px 16px' }} className="field-error">{error}</div>}
    </section>
  )
}
