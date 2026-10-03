'use client'

import { useRef, useState, type DragEvent, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { GitBranch, Loader2, UploadCloud } from 'lucide-react'
import { api } from '@/lib/api'
import { Alert } from '@/components/common/States'

/** Upload a ZIP or paste a GitHub URL. Both create a repository and open it. */
export function AddProject() {
  const router = useRouter()
  const fileInput = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState<'zip' | 'github' | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function run(kind: 'zip' | 'github', create: () => Promise<{ id: string }>) {
    setBusy(kind)
    setError(null)
    try {
      const repo = await create()
      router.push(`/repositories/${repo.id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add the project.')
      setBusy(null)
    }
  }

  function handleFile(file?: File) {
    if (!file) return
    if (!file.name.toLowerCase().endsWith('.zip')) {
      setError('Choose a .zip file.')
      return
    }
    run('zip', () => api.uploadZip(file))
  }

  function onDrop(event: DragEvent) {
    event.preventDefault()
    setDragging(false)
    handleFile(event.dataTransfer.files?.[0])
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    const value = url.trim()
    if (!value) return setError('Paste a GitHub repository URL.')
    run('github', () => api.addGithub(value))
  }

  return (
    <section className="panel panel-pad stack" aria-labelledby="add-title">
      <div>
        <h2 id="add-title" className="title-md">Add a project</h2>
        <p className="muted small" style={{ margin: '4px 0 0' }}>
          We map its files, write docs, and index it for chat.
        </p>
      </div>

      <label
        className="dropzone"
        data-active={dragging}
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <input ref={fileInput} type="file" accept=".zip" hidden disabled={!!busy} onChange={(e) => handleFile(e.target.files?.[0])} />
        {busy === 'zip' ? <Loader2 className="spin" /> : <UploadCloud />}
        <div style={{ fontWeight: 500, marginTop: 8 }}>{busy === 'zip' ? 'Uploading…' : 'Drop a .zip here'}</div>
        <div className="muted small">or click to choose a file</div>
      </label>

      <div className="or-divider">or</div>

      <form onSubmit={onSubmit} className="stack-sm">
        <label className="label" htmlFor="repo-url">GitHub repository</label>
        <input
          id="repo-url"
          className="input"
          placeholder="https://github.com/owner/repo"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          disabled={!!busy}
        />
        <button className="btn btn-primary" type="submit" disabled={!!busy}>
          {busy === 'github' ? <Loader2 className="spin" /> : <GitBranch />}
          {busy === 'github' ? 'Starting…' : 'Analyze repository'}
        </button>
      </form>

      {error && <Alert>{error}</Alert>}
    </section>
  )
}
