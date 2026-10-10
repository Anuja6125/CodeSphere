'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Background, Controls, MiniMap, ReactFlow, ReactFlowProvider, useReactFlow, type Edge } from '@xyflow/react'
import { Network, Search } from 'lucide-react'
import { api, ApiError, type GraphData } from '@/lib/api'
import { useRepo } from '@/components/repository/RepoContext'
import { EmptyState, ErrorState, LoadingState } from '@/components/common/States'
import { FileNode, type FileFlowNode } from './FileNode'
import { SidePanel } from './SidePanel'
import { FlowModal } from './FlowModal'
import { impactOf, layoutGraph, ROLE_COLORS, ROLE_HEX, ROLE_LABELS } from './layout'

const MAX_NODES = 300 // above this, dagre and the browser slow down a lot
const nodeTypes = { file: FileNode }
const topFolder = (folder: string) => (folder === '.' ? '(root)' : folder.split('/')[0])

function GraphCanvas({ data, repoId }: { data: GraphData; repoId: string }) {
  const params = useSearchParams()
  const flow = useReactFlow()
  const [folder, setFolder] = useState('all')
  const [query, setQuery] = useState('')
  const [hideIsolated, setHideIsolated] = useState(data.nodes.length > 40)
  const [selectedId, setSelectedId] = useState<string | null>(params.get('file'))
  const [showImpact, setShowImpact] = useState(false)
  const [flowFor, setFlowFor] = useState<string | null>(null)

  const byId = useMemo(() => new Map(data.nodes.map((n) => [n.id, n])), [data])
  const folders = useMemo(() => [...new Set(data.nodes.map((n) => topFolder(n.folder)))].sort(), [data])

  // 1. Which files are visible.
  const { visible, capped } = useMemo(() => {
    let list = data.nodes
    if (folder !== 'all') list = list.filter((n) => topFolder(n.folder) === folder)
    if (hideIsolated) list = list.filter((n) => n.role !== 'isolated')
    const capped = list.length > MAX_NODES
    if (capped) list = [...list].sort((a, b) => b.dependsOn + b.dependedBy - (a.dependsOn + a.dependedBy)).slice(0, MAX_NODES)
    // Keep the selected file visible even if filters would hide it.
    if (selectedId && byId.has(selectedId) && !list.some((n) => n.id === selectedId)) list = [...list, byId.get(selectedId)!]
    return { visible: list, capped }
  }, [data, folder, hideIsolated, selectedId, byId])

  // 2. Layout only when the visible set changes (not on every click).
  const visibleKey = visible.map((n) => n.id).join('|')
  const { laidOut, edges } = useMemo(() => {
    const ids = new Set(visible.map((n) => n.id))
    const edges = data.edges.filter((e) => ids.has(e.source) && ids.has(e.target))
    const nodes: FileFlowNode[] = visible.map((n) => ({ id: n.id, type: 'file', data: n, position: { x: 0, y: 0 }, width: 200, height: 76 }))
    return { laidOut: layoutGraph(nodes, edges as Edge[], { width: 200, height: 76 }), edges }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleKey, data])

  // Big graphs: start zoomed on the most connected files so labels are readable.
  // The minimap still shows everything.
  const fitTargets = useMemo(() => {
    if (visible.length <= 40) return undefined
    return [...visible]
      .sort((a, b) => b.dependsOn + b.dependedBy - (a.dependsOn + a.dependedBy))
      .slice(0, 25)
      .map((n) => ({ id: n.id }))
  }, [visible])

  // 3. Decoration: selection, neighbors, impact.
  const impact = useMemo(() => (showImpact && selectedId ? impactOf(selectedId, data.edges) : null), [showImpact, selectedId, data])
  const neighbors = useMemo(() => {
    const set = new Set<string>()
    if (!selectedId) return set
    for (const e of data.edges) {
      if (e.source === selectedId) set.add(e.target)
      if (e.target === selectedId) set.add(e.source)
    }
    return set
  }, [selectedId, data])

  const nodes = useMemo(
    () =>
      laidOut.map((n) => {
        const isSel = n.id === selectedId
        const dim = impact ? !isSel && !impact.has(n.id) : !!selectedId && !isSel && !neighbors.has(n.id)
        return { ...n, data: { ...n.data, selected: isSel, dim, impact: impact?.get(n.id) } }
      }),
    [laidOut, selectedId, neighbors, impact]
  )
  const styledEdges: Edge[] = useMemo(
    () =>
      edges.map((e) => {
        const touches = e.source === selectedId || e.target === selectedId
        const inImpact = impact && (impact.has(e.source) || e.source === selectedId) && (impact.has(e.target) || e.target === selectedId)
        const highlight = impact ? !!inImpact : touches
        return { ...e, className: selectedId ? (highlight ? 'highlight' : 'dim') : undefined, animated: highlight && !!selectedId }
      }),
    [edges, selectedId, impact]
  )

  const select = useCallback(
    (id: string | null) => {
      setSelectedId(id)
      setShowImpact(false)
      if (!id) return
      setQuery('')
      // Wait for the node to render, then move to it.
      setTimeout(() => {
        const node = flow.getNode(id)
        if (node) flow.setCenter(node.position.x + 100, node.position.y + 38, { zoom: Math.max(flow.getZoom(), 0.9), duration: 400 })
      }, 60)
    },
    [flow]
  )

  // Focus the file passed in ?file= once the layout exists.
  useEffect(() => {
    const file = params.get('file')
    if (file && byId.has(file)) select(file)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const matches = query.trim()
    ? data.nodes.filter((n) => n.id.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 8)
    : []
  const selected = selectedId ? byId.get(selectedId) : undefined

  return (
    <div className="graph-shell" data-panel={selected ? 'open' : 'closed'}>
      <div className="graph-canvas">
        <div className="graph-toolbar">
          <div style={{ position: 'relative' }}>
            <Search width={15} height={15} style={{ position: 'absolute', left: 10, top: 10, color: 'var(--faint)' }} aria-hidden />
            <input
              className="input"
              style={{ paddingLeft: 32 }}
              placeholder="Find a file"
              aria-label="Find a file"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && matches[0] && select(matches[0].id)}
            />
            {matches.length > 0 && (
              <div className="panel" role="listbox" style={{ position: 'absolute', top: 40, left: 0, width: 360, maxWidth: '80vw', padding: 6, boxShadow: 'var(--shadow-pop)' }}>
                {matches.map((m) => (
                  <button key={m.id} role="option" aria-selected={false} className="dep-link file-path" style={{ padding: '6px 8px' }} onClick={() => select(m.id)}>{m.id}</button>
                ))}
              </div>
            )}
          </div>
          <select className="input" aria-label="Folder" value={folder} onChange={(e) => setFolder(e.target.value)}>
            <option value="all">All folders</option>
            {folders.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
          <label className="btn" style={{ background: 'var(--panel)' }}>
            <input type="checkbox" checked={hideIsolated} onChange={(e) => setHideIsolated(e.target.checked)} />
            Hide unconnected
          </label>
          {capped && <span className="graph-note">Showing the {MAX_NODES} most connected files. Pick a folder or search to see others.</span>}
        </div>

        {nodes.length === 0 ? (
          <EmptyState icon={<Network />} title="Nothing to show">No files match these filters.</EmptyState>
        ) : (
          <ReactFlow
            nodes={nodes}
            edges={styledEdges}
            nodeTypes={nodeTypes}
            onNodeClick={(_, n) => select(n.id)}
            onPaneClick={() => select(null)}
            nodesConnectable={false}
            minZoom={0.1}
            fitView
            fitViewOptions={{ padding: 0.1, nodes: fitTargets, minZoom: fitTargets ? 0.7 : 0.2 }}
          >
            <Background gap={22} color="#e6e2f0" />
            <Controls showInteractive={false} position="bottom-right" />
            <MiniMap pannable zoomable position="top-right" style={{ marginTop: 56 }} nodeColor={(n) => ROLE_HEX[(n.data as { role: string }).role]} maskColor="rgba(239, 235, 250, 0.6)" />
          </ReactFlow>
        )}

        <div className="legend" aria-label="Legend">
          {Object.entries(ROLE_LABELS).map(([role, label]) => (
            <span key={role}><i style={{ background: ROLE_COLORS[role] }} />{label}</span>
          ))}
        </div>
      </div>

      {selected && (
        <SidePanel
          repoId={repoId}
          node={selected}
          dependsOn={data.edges.filter((e) => e.source === selected.id).map((e) => e.target)}
          dependedBy={data.edges.filter((e) => e.target === selected.id).map((e) => e.source)}
          impactCount={impact ? impact.size : null}
          onSelect={select}
          onToggleImpact={() => setShowImpact((v) => !v)}
          onShowFlow={() => setFlowFor(selected.id)}
          onClose={() => select(null)}
        />
      )}
      {flowFor && <FlowModal repoId={repoId} path={flowFor} onClose={() => setFlowFor(null)} />}
    </div>
  )
}

export function RepoGraph() {
  const { id, repo } = useRepo()
  const [data, setData] = useState<GraphData | null>(null)
  const [error, setError] = useState<{ status: number; message: string } | null>(null)
  const generatedAt = repo?.graph?.generatedAt

  const load = useCallback(async () => {
    setError(null)
    try {
      setData(await api.getGraph(id))
    } catch (e) {
      setError({ status: e instanceof ApiError ? e.status : 0, message: e instanceof Error ? e.message : 'Could not load the graph.' })
    }
  }, [id])

  // Reload when the repo changes or a re-analysis produced a new graph.
  useEffect(() => { setData(null); load() }, [load, generatedAt])

  if (error?.status === 409) return <LoadingState label="The graph is still being built. It appears here when ready." />
  if (error) return <ErrorState title="Could not load the graph" message={error.message} onRetry={load} />
  if (!data) return <LoadingState label="Loading graph…" />
  if (data.nodes.length === 0) {
    return (
      <EmptyState icon={<Network />} title="No source files to map">
        No supported source or project-config files were found after excluding folders such as node_modules and build output. Docs and chat still work.
      </EmptyState>
    )
  }
  return (
    <ReactFlowProvider>
      <GraphCanvas key={id + (data.generatedAt ?? '')} data={data} repoId={id} />
    </ReactFlowProvider>
  )
}
