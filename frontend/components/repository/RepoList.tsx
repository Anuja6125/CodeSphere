'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { FileArchive, GitBranch, Trash2 } from 'lucide-react'
import { api, type RepositorySummary } from '@/lib/api'
import { isBusy, sourceLabel } from '@/lib/status'
import { StatusBadge } from './StatusBadge'
import { EmptyState, ErrorState } from '@/components/common/States'

function timeAgo(iso: string) {
  const seconds = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 1000))
  if (seconds < 60) return 'just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  return new Date(iso).toLocaleDateString()
}

export function RepoList() {
  const [repos, setRepos] = useState<RepositorySummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)

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
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete the project.')
    }
  }

  return (
    <section className="panel" aria-labelledby="list-title">
      <div className="panel-head">
        <h2 id="list-title" className="title-md">Your projects</h2>
        {repos && repos.length > 0 && <span className="muted small">{repos.length}</span>}
      </div>

      {error && !repos && <ErrorState title="Can't load projects" message={error} onRetry={load} />}
      {!repos && !error && (
        <div className="stack" style={{ padding: 20 }}>
          {[0, 1, 2].map((i) => <div key={i} className="skeleton" style={{ height: 40 }} />)}
        </div>
      )}
      {repos && repos.length === 0 && (
        <EmptyState icon={<FileArchive />} title="No projects yet">
          Add a ZIP or a GitHub URL to see its graph, docs, and chat.
        </EmptyState>
      )}
      {repos && repos.length > 0 && (
        <ul className="repo-list">
          {repos.map((repo) => (
            <li key={repo.id} className="repo-item">
              <span className="repo-icon" aria-hidden>{repo.sourceType === 'GITHUB' ? <GitBranch /> : <FileArchive />}</span>
              <Link href={`/repositories/${repo.id}`} className="repo-link">
                <span className="repo-name">{repo.name}</span>
                <span className="muted xsmall">
                  {sourceLabel(repo)}
                  {repo.totalFiles > 0 && `, ${repo.totalFiles.toLocaleString()} files`}
                  {`, updated ${timeAgo(repo.updatedAt)}`}
                </span>
              </Link>
              <StatusBadge status={repo.status} />
              <button
                className="btn btn-ghost btn-icon btn-danger"
                aria-label={`Delete ${repo.name}`}
                title="Delete"
                disabled={isBusy(repo.status)}
                onClick={() => remove(repo)}
              >
                <Trash2 />
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && repos && <div style={{ padding: '0 20px 16px' }} className="field-error">{error}</div>}
    </section>
  )
}
