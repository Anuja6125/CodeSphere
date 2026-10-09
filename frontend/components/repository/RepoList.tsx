'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { FileArchive, GitBranch, Trash2, Share2, Shield, User } from 'lucide-react'
import { api, type RepositorySummary } from '@/lib/api'
import { isBusy, sourceLabel } from '@/lib/status'
import { StatusBadge } from './StatusBadge'
import { EmptyState, ErrorState } from '@/components/common/States'
import { useAuth } from '@/lib/auth'
import { ProjectShareModal } from './ProjectShareModal'

function timeAgo(iso: string) {
  const seconds = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 1000))
  if (seconds < 60) return 'just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  return new Date(iso).toLocaleDateString()
}

export function RepoList({ filter = 'all' }: { filter?: 'all' | 'owned' | 'shared' }) {
  const { user } = useAuth()
  const [repos, setRepos] = useState<RepositorySummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sharingRepo, setSharingRepo] = useState<RepositorySummary | null>(null)

  const load = useCallback(async () => {
    try {
      setRepos(await api.listRepositories())
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load projects.')
    }
  }, [])

  useEffect(() => { load() }, [load])

  // Refresh while any project is still being analyzed.
  const anyBusy = repos?.some((r) => isBusy(r.status))
  useEffect(() => {
    if (!anyBusy) return
    const timer = setInterval(load, 3000)
    return () => clearInterval(timer)
  }, [anyBusy, load])

  async function remove(repo: RepositorySummary) {
    if (!window.confirm(`Delete "${repo.name}"? Its graph, docs, and chat history are removed too.`)) return
    try {
      await api.remove(repo.id)
      setRepos((list) => list?.filter((r) => r.id !== repo.id) ?? null)
    } catch (e: any) {
      setError(e instanceof Error ? e.message : 'Could not delete the project.')
    }
  }

  // Filter repos based on tab
  const displayedRepos = repos?.filter((r) => {
    if (filter === 'owned') {
      return r.userId === user?.id || (!r.userId && user?.role === 'MANAGER')
    }
    if (filter === 'shared') {
      return r.userId !== user?.id && r.userId !== null
    }
    return true
  })

  return (
    <>
      <section className="panel" aria-labelledby="list-title">
        <div className="panel-head">
          <h2 id="list-title" className="title-md">
            {filter === 'owned' ? 'My Projects' : filter === 'shared' ? 'Shared with Me' : 'Your projects'}
          </h2>
          {displayedRepos && displayedRepos.length > 0 && (
            <span className="muted small">{displayedRepos.length}</span>
          )}
        </div>

        {error && !repos && <ErrorState title="Can't load projects" message={error} onRetry={load} />}
        {!repos && !error && (
          <div className="stack" style={{ padding: 20 }}>
            {[0, 1, 2].map((i) => <div key={i} className="skeleton" style={{ height: 40 }} />)}
          </div>
        )}
        {displayedRepos && displayedRepos.length === 0 && (
          <EmptyState icon={<FileArchive />} title="No projects found">
            {filter === 'shared'
              ? 'No projects have been shared with you yet.'
              : 'Add a ZIP or a GitHub URL to see its graph, docs, and chat.'}
          </EmptyState>
        )}
        {displayedRepos && displayedRepos.length > 0 && (
          <ul className="repo-list">
            {displayedRepos.map((repo) => {
              const isOwner = repo.userId === user?.id || !repo.userId
              const sharedAccess = repo.access?.find((a) => a.userId === user?.id)

              return (
                <li key={repo.id} className="repo-item">
                  <span className="repo-icon" aria-hidden>
                    {repo.sourceType === 'GITHUB' ? <GitBranch /> : <FileArchive />}
                  </span>
                  <Link href={`/repositories/${repo.id}`} className="repo-link">
                    <div className="row" style={{ gap: 8 }}>
                      <span className="repo-name">{repo.name}</span>
                      {isOwner ? (
                        <span className="badge badge-lav" style={{ fontSize: 10, padding: '1px 6px' }}>
                          Owner
                        </span>
                      ) : sharedAccess ? (
                        <span className="badge badge-ready" style={{ fontSize: 10, padding: '1px 6px' }}>
                          Shared ({sharedAccess.role.toLowerCase()})
                        </span>
                      ) : null}
                    </div>
                    <span className="muted xsmall">
                      {sourceLabel(repo)}
                      {repo.totalFiles > 0 && `, ${repo.totalFiles.toLocaleString()} files`}
                      {`, updated ${timeAgo(repo.updatedAt)}`}
                    </span>
                  </Link>

                  <StatusBadge status={repo.status} />

                  {/* Share button */}
                  <button
                    type="button"
                    className="btn btn-ghost btn-icon"
                    aria-label={`Share ${repo.name}`}
                    title="Share project access"
                    onClick={() => setSharingRepo(repo)}
                  >
                    <Share2 size={15} />
                  </button>

                  {/* Delete button (owner or project manager) */}
                  <button
                    className="btn btn-ghost btn-icon btn-danger"
                    aria-label={`Delete ${repo.name}`}
                    title="Delete project"
                    disabled={isBusy(repo.status)}
                    onClick={() => remove(repo)}
                  >
                    <Trash2 size={15} />
                  </button>
                </li>
              )
            })}
          </ul>
        )}
        {error && repos && <div style={{ padding: '0 20px 16px' }} className="field-error">{error}</div>}
      </section>

      {/* Share Modal */}
      {sharingRepo && (
        <ProjectShareModal
          repo={sharingRepo}
          onClose={() => {
            setSharingRepo(null)
            load()
          }}
        />
      )}
    </>
  )
}
