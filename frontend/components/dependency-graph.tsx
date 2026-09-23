'use client'

import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { Focus, Minus, Plus, RotateCcw } from 'lucide-react'
import type { Dependency, FileGraphNode } from '@/lib/api'
import { buildGraphLayout, NODE_HEIGHT, nodeColors } from '@/lib/graph'

type Props = {
  dependencies: Dependency[]
  fileGraph: Record<string, FileGraphNode>
  /** File to select on load / focus. Usually the first "where to start" suggestion. */
  focusFile?: string
}

const MIN_SCALE = 0.5
const MAX_SCALE = 3
const ZOOM_STEP = 0.12

export function DependencyGraph({ dependencies, fileGraph, focusFile }: Props) {
  const layout = useMemo(() => buildGraphLayout(dependencies, fileGraph), [dependencies, fileGraph])
  const { nodes, edges } = layout
  const nodeById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes])

  const defaultSelected = focusFile && nodeById.has(focusFile) ? focusFile : nodes[0]?.id ?? null

  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [selected, setSelected] = useState<string | null>(defaultSelected)
  const [showLabels, setShowLabels] = useState(true)

  // New analysis → reset view.
  useEffect(() => {
    setScale(1)
    setOffset({ x: 0, y: 0 })
  }, [layout])

  // New analysis or new focus file → update selection.
  useEffect(() => {
    setSelected(defaultSelected)
  }, [layout, defaultSelected])

  const selectedNode = selected ? nodeById.get(selected) : undefined

  // Drag to pan (needed once a big graph is zoomed in).
  const drag = useRef<{ startX: number; startY: number; originX: number; originY: number; moved: boolean } | null>(null)
  const lastDragMoved = useRef(false)
  function onMouseDown(event: ReactMouseEvent) {
    drag.current = { startX: event.clientX, startY: event.clientY, originX: offset.x, originY: offset.y, moved: false }
  }
  function onMouseMove(event: ReactMouseEvent) {
    const d = drag.current
    if (!d) return
    const dx = event.clientX - d.startX
    const dy = event.clientY - d.startY
    if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true
    if (d.moved) setOffset({ x: d.originX + dx, y: d.originY + dy })
  }
  function onMouseUp(event: ReactMouseEvent) {
    const d = drag.current
    drag.current = null
    lastDragMoved.current = Boolean(d?.moved)
    // Plain click on the empty canvas (not on a node) clears the selection.
    if (d && !d.moved && !(event.target as Element).closest('.graph-node')) setSelected(null)
  }

  function reset() {
    setScale(1)
    setOffset({ x: 0, y: 0 })
    setSelected(defaultSelected)
  }

  const isEmpty = nodes.length === 0

  return (
    <div className="graph-shell">
      <div className="graph-toolbar">
        <div className="graph-toolbar-copy"><span className="live-dot" /> <span>Dependency graph</span><span className="toolbar-muted">·</span><span className="toolbar-muted">{nodes.length} nodes, {edges.length} edges</span></div>
        <div className="graph-actions">
          <button className={showLabels ? 'tool-button active' : 'tool-button'} onClick={() => setShowLabels((value) => !value)} aria-label="Toggle labels">Aa</button>
          <button className="tool-button" onClick={() => setScale((value) => Math.min(value + ZOOM_STEP, MAX_SCALE))} aria-label="Zoom in" disabled={isEmpty}><Plus /></button>
          <button className="tool-button" onClick={() => setScale((value) => Math.max(value - ZOOM_STEP, MIN_SCALE))} aria-label="Zoom out" disabled={isEmpty}><Minus /></button>
          <button className="tool-button" onClick={reset} aria-label="Reset graph" disabled={isEmpty}><RotateCcw /></button>
          <button className="tool-button" onClick={() => setSelected(defaultSelected)} aria-label="Center graph" disabled={isEmpty}><Focus /></button>
        </div>
      </div>
      <div
        className="graph-canvas"
        role="img"
        aria-label="Interactive project dependency graph"
        onMouseDown={isEmpty ? undefined : onMouseDown}
        onMouseMove={isEmpty ? undefined : onMouseMove}
        onMouseUp={isEmpty ? undefined : onMouseUp}
        onMouseLeave={() => { drag.current = null }}
      >
        {isEmpty ? (
          <div className="graph-empty">
            <strong>No dependencies to show</strong>
            <span>{dependencies.length === 0 && Object.keys(fileGraph).length > 0 ? 'The project has source files, but no relative imports between them were found.' : 'Upload a project ZIP to generate its dependency graph.'}</span>
          </div>
        ) : (
          <svg viewBox={`0 0 ${layout.width} ${layout.height}`} style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})` }}>
            <defs>
              <pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M 24 0 L 0 0 0 24" fill="none" stroke="currentColor" strokeWidth="1" opacity=".08" /></pattern>
              <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#cbd2de" /></marker>
            </defs>
            <rect width={layout.width} height={layout.height} fill="url(#grid)" />
            <g className="graph-edges">
              {edges.map((edge) => {
                const from = nodeById.get(edge.from)
                const to = nodeById.get(edge.to)
                if (!from || !to) return null
                const active = selected === edge.from || selected === edge.to
                // Layout is left → right, so leave from the source's right edge and enter the target's left edge.
                return <line key={`${edge.from}→${edge.to}`} className={active ? 'active' : undefined} x1={from.x + from.width} y1={from.y + NODE_HEIGHT / 2} x2={to.x} y2={to.y + NODE_HEIGHT / 2} markerEnd="url(#arrow)" />
              })}
            </g>
            {nodes.map((node) => (
              <g key={node.id} className="graph-node" onClick={() => { if (!lastDragMoved.current) setSelected(node.id) }}>
                <title>{node.label}</title>
                <rect x={node.x} y={node.y} width={node.width} height={NODE_HEIGHT} rx="8" className={selected === node.id ? 'node-card selected' : 'node-card'} style={{ stroke: nodeColors[node.type] }} />
                <circle cx={node.x + 16} cy={node.y + NODE_HEIGHT / 2} r="5" fill={nodeColors[node.type]} />
                {showLabels && <text x={node.x + 29} y={node.y + 26}>{node.label}</text>}
              </g>
            ))}
          </svg>
        )}
        {selectedNode && (
          <div className="node-inspector">
            <div className="inspector-kicker">Selected file</div>
            <strong title={selectedNode.label}>{selectedNode.label}</strong>
            <span>{selectedNode.type} · {selectedNode.dependsOn + selectedNode.dependedBy} connections</span>
            <span>imports {selectedNode.dependsOn} · imported by {selectedNode.dependedBy}</span>
          </div>
        )}
        {!isEmpty && <div className="graph-legend">{Object.entries(nodeColors).map(([key, color]) => <span key={key}><i style={{ backgroundColor: color }} />{key}</span>)}</div>}
      </div>
    </div>
  )
}
