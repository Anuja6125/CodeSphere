'use client'

import Link from 'next/link'
import { BookOpen, MessageSquare, Network } from 'lucide-react'
import { useRepo } from './RepoContext'
import { hasAnalysis, isBusy } from '@/lib/status'
import { Alert, ErrorState, LoadingState } from '@/components/common/States'

/** Analysis fields are stored as JSON in a few shapes. Show them as short text items. */
function asItems(value: unknown, limit = 12): string[] {
  if (!value) return []
  if (Array.isArray(value)) {
    return value.slice(0, limit).map((v) => (typeof v === 'string' ? v : v?.path ?? v?.name ?? v?.file ?? JSON.stringify(v)))
  }
  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .sort((a, b) => (Number(b[1]) || 0) - (Number(a[1]) || 0))
      .slice(0, limit)
      .map(([k, v]) => (typeof v === 'number' ? `${k} (${v})` : k))
  }
  return [String(value)]
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="panel stat">
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  )
}

export function Overview() {
  const { id, repo, error, refresh } = useRepo()
  if (!repo && error) return <ErrorState message={error} onRetry={refresh} />
  if (!repo) return <LoadingState label="Loading repository…" />

  const a = repo.analysis
  const stats = repo.graph?.stats
  const ready = hasAnalysis(repo.status)
  const stack = [...asItems(repo.techStack?.frameworks), ...asItems(repo.techStack?.languages)]
  const languages = asItems(a?.languages)
  const chunksTotal = repo._count.chunks

  const features = [
    { href: `/repositories/${id}/graph`, icon: Network, title: 'Graph', text: 'See how files import each other. Click a file to trace what it affects.' },
    { href: `/repositories/${id}/documentation`, icon: BookOpen, title: 'Documentation', text: 'Generate a readable guide to this project from its actual code.' },
    { href: `/repositories/${id}/chat`, icon: MessageSquare, title: 'Chat', text: 'Ask how something works. Answers cite the files they come from.' },
  ]

  return (
    <div className="page stack" style={{ maxWidth: 'none', gap: 20 }}>
      {repo.status === 'FAILED' && (
        <Alert>
          <strong>The analysis failed.</strong> {repo.errorMessage ?? 'Unknown error.'} Fix the cause, then click Re-analyze.
        </Alert>
      )}
      {repo.status !== 'FAILED' && repo.errorMessage && <Alert tone="warn">{repo.errorMessage}</Alert>}
      {isBusy(repo.status) && !ready && (
        <Alert tone="warn">Analysis is running. Graph, docs, and chat open as soon as it finishes. This page updates by itself.</Alert>
      )}

      <div className="grid-4">
        <Stat value={repo.totalFiles.toLocaleString()} label="Files" />
        <Stat value={repo.totalLines.toLocaleString()} label="Lines of code" />
        <Stat value={stats ? stats.dependencyCount.toLocaleString() : '—'} label="File dependencies" />
        <Stat
          value={chunksTotal ? `${Math.round((repo.embeddedChunks / chunksTotal) * 100)}%` : '—'}
          label={chunksTotal ? `Indexed for chat (${repo.embeddedChunks}/${chunksTotal})` : 'Indexed for chat'}
        />
      </div>

      <div className="grid-2">
        <section className="panel panel-pad stack">
          <h2 className="title-md">Project facts</h2>
          <dl className="kv">
            <dt>Stack</dt>
            <dd>{stack.length ? stack.map((s) => <span key={s} className="chip">{s}</span>) : <span className="muted">Not detected</span>}</dd>
            <dt>Languages</dt>
            <dd>{languages.length ? languages.map((s) => <span key={s} className="chip">{s}</span>) : <span className="muted">—</span>}</dd>
            {a && (
              <>
                <dt>File types</dt>
                <dd>{a.sourceFileCount} source, {a.testFileCount} test, {a.configFileCount} config, {a.documentationFileCount} docs</dd>
                <dt>Entry points</dt>
                <dd>{asItems(a.entryPoints, 6).map((p) => <div key={p} className="file-path">{p}</div>)}</dd>
                <dt>API files</dt>
                <dd>{asItems(a.apiFiles, 6).length ? asItems(a.apiFiles, 6).map((p) => <div key={p} className="file-path">{p}</div>) : <span className="muted">None found</span>}</dd>
              </>
            )}
          </dl>
        </section>

        <section className="panel panel-pad stack">
          <h2 className="title-md">Where to start reading</h2>
          {repo.graph?.whereToStart.suggestions.length ? (
            <ul className="link-list">
              {repo.graph.whereToStart.suggestions.slice(0, 6).map((s) => (
                <li key={s.file}>
                  <Link className="file-path" style={{ color: 'var(--primary)' }} href={`/repositories/${id}/graph?file=${encodeURIComponent(s.file)}`}>{s.file}</Link>
                  <span className="muted small">{s.reason}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted small" style={{ margin: 0 }}>{ready ? 'No clear starting files were found.' : 'Shown after analysis.'}</p>
          )}
          {stats && stats.mostImported.length > 0 && (
            <>
              <h3 className="small" style={{ fontWeight: 600, marginTop: 8 }}>Most imported files</h3>
              <ul className="link-list">
                {stats.mostImported.slice(0, 5).map((m) => (
                  <li key={m.file}><span className="file-path">{m.file}</span><span className="muted xsmall">Used by {m.importedByCount} files</span></li>
                ))}
              </ul>
            </>
          )}
        </section>
      </div>

      <div className="grid-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
        {features.map(({ href, icon: Icon, title, text }) => (
          <Link key={href} href={ready ? href : '#'} aria-disabled={!ready} className="panel panel-pad stack-sm" style={{ opacity: ready ? 1 : 0.5, pointerEvents: ready ? undefined : 'none' }}>
            <span className="row" style={{ gap: 8, fontWeight: 600 }}><Icon width={18} height={18} color="var(--primary)" />{title}</span>
            <span className="muted small">{text}</span>
          </Link>
        ))}
      </div>
    </div>
  )
}
