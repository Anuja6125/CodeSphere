'use client'

import { ChangeEvent, FormEvent, useRef, useState } from 'react'
import { AlertCircle, Archive, CheckCircle2, ChevronDown, FileCode2, FolderOpen, GitBranch, Globe, Link2, Package, UploadCloud, User } from 'lucide-react'
import { DependencyGraph } from '@/components/dependency-graph'
import { API_BASE_URL, analyzeGithubRepo, uploadProject, type ProjectAnalysis } from '@/lib/api'

type RecentProject = {
  analysis: ProjectAnalysis
  kind: 'zip' | 'github'
  /** Display name: ZIP file name, or owner/repo. */
  name: string
  /** Bytes of the ZIP (uploaded file, or archive downloaded by the backend). */
  sizeBytes: number
  uploadedAt: Date
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatTime(date: Date) {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export default function Page() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendingName, setPendingName] = useState<string | null>(null)
  const [pendingKind, setPendingKind] = useState<'zip' | 'github'>('zip')
  const [repoUrl, setRepoUrl] = useState('')
  const [recent, setRecent] = useState<RecentProject[]>([])
  const [current, setCurrent] = useState<RecentProject | null>(null)
  const [focusFile, setFocusFile] = useState<string | undefined>(undefined)

  const analysis = current?.analysis ?? null
  const stats = analysis?.stats

  /** Shared by both inputs: run the request, then store the result the same way. */
  async function runAnalysis(kind: 'zip' | 'github', pending: string, request: () => Promise<ProjectAnalysis>, toProject: (result: ProjectAnalysis) => RecentProject) {
    setError(null)
    setPendingKind(kind)
    setPendingName(pending)
    setLoading(true)
    try {
      const result = await request()
      const project = toProject(result)
      setRecent((list) => [project, ...list].slice(0, 8))
      setCurrent(project)
      setFocusFile(result.whereToStart?.suggestions?.[0]?.file)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed.')
    } finally {
      setLoading(false)
      setPendingName(null)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  function handleFile(file?: File) {
    if (!file) return
    if (!file.name.toLowerCase().endsWith('.zip')) {
      setError('Only .zip files are allowed.')
      return
    }
    void runAnalysis('zip', file.name, () => uploadProject(file), (result) => ({ analysis: result, kind: 'zip', name: file.name, sizeBytes: file.size, uploadedAt: new Date() }))
  }

  function handleRepoSubmit(event: FormEvent) {
    event.preventDefault()
    const url = repoUrl.trim()
    if (!url) {
      setError('Paste a GitHub repository URL first.')
      return
    }
    void runAnalysis('github', url, () => analyzeGithubRepo(url), (result) => {
      const src = result.source
      const name = src ? `${src.owner}/${src.repo}${src.ref && src.ref !== 'HEAD' ? `@${src.ref}` : ''}` : url
      return { analysis: result, kind: 'github', name, sizeBytes: src?.bytes ?? 0, uploadedAt: new Date() }
    })
  }

  function onInput(event: ChangeEvent<HTMLInputElement>) { handleFile(event.target.files?.[0]) }

  function openProject(project: RecentProject) {
    setError(null)
    setCurrent(project)
    setFocusFile(project.analysis.whereToStart?.suggestions?.[0]?.file)
  }

  const projectName = current ? (current.kind === 'zip' ? current.name.replace(/\.zip$/i, '') : current.name) : null
  const uploadState = loading ? 'loading' : error ? 'error' : current ? 'ready' : 'idle'

  const statCards = [
    { label: 'Total files', value: stats ? String(stats.fileCount) : '—', detail: stats ? `${stats.isolatedFiles.length} isolated · ${stats.leafFiles.length} leaf` : 'JS / JSX / TS / TSX files', icon: FileCode2 },
    { label: 'Dependencies', value: stats ? String(stats.dependencyCount) : '—', detail: stats ? `${stats.unresolvedCount} unresolved import${stats.unresolvedCount === 1 ? '' : 's'}` : 'Relative imports between files', icon: Package },
    { label: 'Entry points', value: stats ? String(stats.entryFiles.length) : '—', detail: stats ? (stats.entryFiles[0] ? `${stats.entryFiles[0]} is primary` : 'No entry file detected') : 'Files nothing else imports', icon: GitBranch },
    { label: 'Project size', value: current ? formatBytes(current.sizeBytes) : '—', detail: current?.kind === 'github' ? 'GitHub archive' : 'Compressed archive', icon: Archive },
  ]

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand"><div className="brand-mark"><GitBranch /></div><div><strong>Trace</strong><span>PROJECT INSPECTOR</span></div></div>
        <div className="topbar-actions"><button className="quiet-button" title={API_BASE_URL}><span className="status-dot" /> Local workspace <ChevronDown /></button><button className="avatar" aria-label="Account"><User size={14} /></button></div>
      </header>
      <div className="app-body">
        <aside className="sidebar">
          <div className="sidebar-section"><div className="eyebrow">Workspace</div><button className="nav-item active"><FolderOpen /> Overview</button><button className="nav-item" onClick={() => document.getElementById('graph')?.scrollIntoView({ behavior: 'smooth' })}><GitBranch /> Dependency graph</button></div>
          <div className="sidebar-section">
            <div className="eyebrow">Recent projects</div>
            {recent.length === 0 && <span className="version">No projects yet</span>}
            {recent.map((project) => (
              <button key={project.analysis.projectId} className={project === current ? 'project-item active' : 'project-item'} onClick={() => openProject(project)}>
                <span className={project === current ? 'project-icon' : 'project-icon muted'}>{project.kind === 'github' ? <Globe size={12} /> : project.name.charAt(0).toUpperCase()}</span>
                <span><strong>{project.kind === 'zip' ? project.name.replace(/\.zip$/i, '') : project.name}</strong><small>{project.kind === 'github' ? 'GitHub · ' : ''}{formatTime(project.uploadedAt)}</small></span>
              </button>
            ))}
          </div>
          <div className="sidebar-footer"><div className="plan-card"><span>Local workspace</span><strong>{recent.length} project{recent.length === 1 ? '' : 's'} analyzed</strong><small style={{ display: 'block', marginTop: 6, color: '#9aa3b3', fontSize: 10 }}>API: {API_BASE_URL}</small></div><span className="version">Trace v0.1.0</span></div>
        </aside>
        <section className="content">
          <div className="page-heading"><div><div className="breadcrumb">Workspace <span>/</span> {projectName ?? 'No project'}</div><h1>Project overview</h1><p>Inspect your project structure and understand how files connect.</p></div><button className="secondary-button" onClick={() => inputRef.current?.click()} disabled={loading}><UploadCloud /> {current ? 'Upload new ZIP' : 'Upload ZIP'}</button></div>

          <div className="upload-card" data-dragging={isDragging} data-state={uploadState}
            onDragOver={(event) => { event.preventDefault(); if (!loading) setIsDragging(true) }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(event) => { event.preventDefault(); setIsDragging(false); if (!loading) handleFile(event.dataTransfer.files[0]) }}>
            <input ref={inputRef} type="file" accept=".zip,application/zip,application/x-zip-compressed" onChange={onInput} hidden />
            <div className="upload-icon">{loading ? <span className="spinner" /> : current?.kind === 'github' && !error ? <Globe /> : <UploadCloud />}</div>
            <div className="upload-copy">
              {loading && <><strong>{pendingName}</strong><span>{pendingKind === 'github' ? 'Downloading repository and analyzing…' : 'Uploading and analyzing…'}</span></>}
              {!loading && error && <><strong className="upload-error">Analysis failed</strong><span>{error}</span></>}
              {!loading && !error && current && <><strong>{current.name}</strong><span>{current.kind === 'github' ? 'GitHub repository' : 'ZIP archive'} · {formatBytes(current.sizeBytes)} · Analyzed {formatTime(current.uploadedAt)}</span></>}
              {!loading && !error && !current && <><strong>Drop a project ZIP here</strong><span>or click to browse · .zip only</span></>}
            </div>
            {!loading && error && <AlertCircle className="upload-check" style={{ color: '#e5484d' }} />}
            {!loading && !error && current && <CheckCircle2 className="upload-check" />}
            <button className="text-button" onClick={() => inputRef.current?.click()} disabled={loading}>{current || error ? 'Replace file' : 'Browse'}</button>
          </div>

          <form className="repo-card" onSubmit={handleRepoSubmit}>
            <div className="upload-icon"><Globe /></div>
            <div className="repo-field">
              <label htmlFor="repo-url">Or analyze a GitHub repository</label>
              <div className="repo-input"><Link2 /><input id="repo-url" type="text" placeholder="https://github.com/owner/repo  (or owner/repo, or …/tree/branch)" value={repoUrl} onChange={(event) => setRepoUrl(event.target.value)} disabled={loading} autoComplete="off" spellCheck={false} /></div>
            </div>
            <button type="submit" className="secondary-button" disabled={loading || !repoUrl.trim()}><GitBranch /> Analyze repo</button>
          </form>

          <div className="stats-grid">{statCards.map(({ label, value, detail, icon: Icon }) => <div className="stat-card" key={label}><div className="stat-icon"><Icon /></div><div><span>{label}</span><strong>{value}</strong><small>{detail}</small></div></div>)}</div>

          {analysis && analysis.whereToStart.suggestions.length > 0 && (
            <div className="start-card">
              <div className="eyebrow">Where to start</div>
              <ul className="start-list">
                {analysis.whereToStart.suggestions.map((item) => (
                  <li key={item.file}><button onClick={() => setFocusFile(item.file)}>{item.file}</button><span>{item.reason}</span></li>
                ))}
              </ul>
              {analysis.whereToStart.notes.map((note) => <p className="start-note" key={note}>{note}</p>)}
            </div>
          )}

          <div id="graph">
            <DependencyGraph dependencies={analysis?.dependencies ?? []} fileGraph={analysis?.fileGraph ?? {}} focusFile={focusFile} />
          </div>

          <div className="footer-note">
            <span>{analysis ? 'Live analysis' : 'Waiting for upload'}</span>
            <span>{analysis ? `Project ${analysis.projectId} · ${analysis.message}` : `Backend: ${API_BASE_URL}`}</span>
          </div>
        </section>
      </div>
    </main>
  )
}
