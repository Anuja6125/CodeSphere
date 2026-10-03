'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { BookOpen, Download, Loader2, RefreshCw, Sparkles } from 'lucide-react'
import { api, type Documentation } from '@/lib/api'
import { useRepo } from '@/components/repository/RepoContext'
import { Markdown, slugify } from '@/components/common/Markdown'
import { Alert, EmptyState, ErrorState, LoadingState } from '@/components/common/States'

export function DocsView() {
  const { id, repo, refresh } = useRepo()
  const [doc, setDoc] = useState<Documentation | null | undefined>(undefined) // undefined = loading
  const [error, setError] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)

  const load = useCallback(async () => {
    try {
      setDoc(await api.getDocs(id))
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load documentation.')
    }
  }, [id])

  useEffect(() => { setDoc(undefined); load() }, [load])

  // Poll while generating.
  useEffect(() => {
    if (doc?.status !== 'GENERATING') return
    const timer = setInterval(load, 2500)
    return () => clearInterval(timer)
  }, [doc?.status, load])

  async function generate() {
    setStarting(true)
    setError(null)
    try {
      setDoc(await api.generateDocs(id))
      refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start generation.')
    } finally {
      setStarting(false)
    }
  }

  const toc = useMemo(
    () => (doc?.content ?? '').split('\n').filter((l) => /^##\s/.test(l)).map((l) => l.replace(/^##\s+/, '').trim()),
    [doc?.content]
  )

  if (doc === undefined && error) return <ErrorState message={error} onRetry={load} />
  if (doc === undefined) return <LoadingState label="Loading documentation…" />

  const generating = doc?.status === 'GENERATING' || starting
  const hasContent = doc?.status === 'READY' && doc.content

  if (!doc || (!hasContent && !generating)) {
    return (
      <div className="page">
        {error && <Alert>{error}</Alert>}
        {doc?.status === 'FAILED' && <Alert>Generation failed: {doc.error ?? 'unknown error'}</Alert>}
        <EmptyState
          icon={<BookOpen />}
          title={doc?.status === 'FAILED' ? 'Try generating again' : 'No documentation yet'}
          action={
            <button className="btn btn-primary" onClick={generate} disabled={starting || repo?.isProcessing}>
              {starting ? <Loader2 className="spin" /> : <Sparkles />} Generate documentation
            </button>
          }
        >
          CodeSphere reads the README, manifests, entry points, and key files, then writes an overview, setup steps, structure, and APIs.
        </EmptyState>
      </div>
    )
  }

  return (
    <div className="page stack" style={{ maxWidth: 'none' }}>
      <div className="row-wrap">
        <span className="muted small">
          {generating ? 'Writing documentation from the code… this takes up to a minute.' : `Generated ${new Date(doc.updatedAt).toLocaleString()}${doc.model ? ` with ${doc.model}` : ''}`}
        </span>
        <span className="spacer" />
        {hasContent && (
          <a className="btn" href={api.docsDownloadUrl(id)} download>
            <Download /> Download .md
          </a>
        )}
        <button className="btn" onClick={generate} disabled={generating || repo?.isProcessing}>
          <RefreshCw className={generating ? 'spin' : undefined} /> {generating ? 'Generating…' : 'Regenerate'}
        </button>
      </div>
      {error && <Alert>{error}</Alert>}

      {hasContent ? (
        <div className="docs-layout">
          <nav className="toc" aria-label="Sections">
            {toc.map((t) => <a key={t} href={`#${slugify(t)}`}>{t}</a>)}
          </nav>
          <article className="panel panel-pad" style={{ padding: '28px 32px' }}>
            <Markdown content={doc.content!} />
          </article>
        </div>
      ) : (
        <div className="panel panel-pad stack">
          {[90, 60, 75, 40, 85].map((w, i) => <div key={i} className="skeleton" style={{ height: 14, width: `${w}%` }} />)}
        </div>
      )}
    </div>
  )
}
