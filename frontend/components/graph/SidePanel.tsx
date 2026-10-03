'use client'

import { useEffect, useState } from 'react'
import { Code2, Loader2, Workflow, X, Zap } from 'lucide-react'
import { api, type GraphNode } from '@/lib/api'
import { ROLE_COLORS, ROLE_LABELS } from './layout'

type Props = {
  repoId: string
  node: GraphNode
  dependsOn: string[]
  dependedBy: string[]
  impactCount: number | null
  onSelect: (id: string) => void
  onToggleImpact: () => void
  onShowFlow: () => void
  onClose: () => void
}

// File details. Adapted from mindmap's SidePanel.
export function SidePanel({ repoId, node, dependsOn, dependedBy, impactCount, onSelect, onToggleImpact, onShowFlow, onClose }: Props) {
  const [code, setCode] = useState<string | null>(null)
  const [codeState, setCodeState] = useState<'idle' | 'loading' | 'error'>('idle')

  useEffect(() => { setCode(null); setCodeState('idle') }, [node.id])

  async function loadCode() {
    setCodeState('loading')
    try {
      const file = await api.getFile(repoId, node.id)
      setCode(file.content ?? '(This file is too large or not text.)')
      setCodeState('idle')
    } catch {
      setCodeState('error')
    }
  }

  const list = (items: string[], empty: string) =>
    items.length === 0 ? <p className="muted small" style={{ margin: 0 }}>{empty}</p> : (
      items.map((id) => (
        <button key={id} className="dep-link file-path" onClick={() => onSelect(id)}>{id}</button>
      ))
    )

  return (
    <aside className="side-panel" aria-label="File details">
      <div className="side-section row" style={{ alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{node.label}</div>
          <div className="file-path muted">{node.id}</div>
          <span className="badge" style={{ marginTop: 8, color: ROLE_COLORS[node.role] }}>{ROLE_LABELS[node.role]}</span>
        </div>
        <button className="btn btn-ghost btn-icon" aria-label="Close details" onClick={onClose}><X /></button>
      </div>

      <div className="side-section stack-sm">
        <button className="btn" onClick={onToggleImpact} aria-pressed={impactCount !== null}>
          <Zap /> {impactCount === null ? 'Show what this affects' : `Affects ${impactCount} file${impactCount === 1 ? '' : 's'}. Hide`}
        </button>
        <button className="btn" onClick={onShowFlow}><Workflow /> Explain logic flow</button>
        <button className="btn" onClick={code ? () => setCode(null) : loadCode} disabled={codeState === 'loading'}>
          {codeState === 'loading' ? <Loader2 className="spin" /> : <Code2 />} {code ? 'Hide code' : 'View code'}
        </button>
        {codeState === 'error' && <span className="field-error">Could not load the file.</span>}
        {code && <pre className="code-view">{code}</pre>}
      </div>

      <div className="side-section">
        <h4>Imports ({dependsOn.length})</h4>
        {list(dependsOn, 'Imports no project files.')}
      </div>
      <div className="side-section">
        <h4>Used by ({dependedBy.length})</h4>
        {list(dependedBy, 'No project file imports this.')}
      </div>
    </aside>
  )
}
