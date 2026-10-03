'use client'

import { useEffect, useMemo, useState } from 'react'
import { Background, Controls, ReactFlow, ReactFlowProvider, type Edge, type Node, type NodeProps } from '@xyflow/react'
import { X } from 'lucide-react'
import { api, type FileFlow, type FlowNode } from '@/lib/api'
import { layoutGraph } from './layout'
import { ErrorState, LoadingState } from '@/components/common/States'

type FlowCard = Node<FlowNode, 'flow'>

function FlowCardView({ data }: NodeProps<FlowCard>) {
  return (
    <div className="flow-node" data-type={data.type}>
      <div className="name">{data.label}</div>
      <div className="muted">{data.desc}</div>
    </div>
  )
}
const nodeTypes = { flow: FlowCardView }

/** Mindmap's "visualize code" feature, now run on a real repo file. */
export function FlowModal({ repoId, path, onClose }: { repoId: string; path: string; onClose: () => void }) {
  const [flow, setFlow] = useState<FileFlow | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<FlowNode | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let alive = true
    setFlow(null); setError(null); setSelected(null)
    api.getFileFlow(repoId, path).then((f) => alive && setFlow(f)).catch((e) => alive && setError(e.message))
    return () => { alive = false }
  }, [repoId, path, attempt])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const { nodes, edges } = useMemo(() => {
    if (!flow) return { nodes: [] as FlowCard[], edges: [] as Edge[] }
    const edges: Edge[] = flow.edges.map((e, i) => ({ id: `e${i}`, source: e.source, target: e.target, label: e.label, labelStyle: { fontSize: 11 } }))
    const nodes: FlowCard[] = flow.nodes.map((n) => ({ id: n.id, type: 'flow', data: n, position: { x: 0, y: 0 }, width: 230, height: 70 }))
    return { nodes: layoutGraph(nodes, edges, { width: 230, height: 70, direction: 'TB' }), edges }
  }, [flow])

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={`Logic flow of ${path}`} onClick={(e) => e.stopPropagation()}>
        <div className="panel-head">
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 600 }}>Logic flow</div>
            <div className="file-path muted">{path}{flow?.truncated && ' (first 20,000 characters)'}</div>
          </div>
          <button className="btn btn-ghost btn-icon" aria-label="Close" onClick={onClose}><X /></button>
        </div>
        {!flow && !error && <LoadingState label="Reading the file and drawing its logic…" />}
        {error && <ErrorState title="Could not explain this file" message={error} onRetry={() => setAttempt((n) => n + 1)} />}
        {flow && (
          <div className="modal-body">
            <ReactFlowProvider>
              <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} fitView nodesConnectable={false} onNodeClick={(_, n) => setSelected(n.data)}>
                <Background gap={22} color="#e6e2f0" />
                <Controls showInteractive={false} />
              </ReactFlow>
            </ReactFlowProvider>
            <aside className="side-panel">
              <div className="side-section">
                {selected ? (
                  <>
                    <h4>{selected.label}</h4>
                    <p className="small" style={{ margin: '0 0 8px' }}>{selected.desc}</p>
                    <p className="muted small" style={{ margin: 0 }}>{selected.explanation}</p>
                  </>
                ) : (
                  <p className="muted small" style={{ margin: 0 }}>Click a step to read a plain explanation.</p>
                )}
              </div>
            </aside>
          </div>
        )}
      </div>
    </div>
  )
}
