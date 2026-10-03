import dagre from '@dagrejs/dagre'
import type { Edge, Node } from '@xyflow/react'

/** Position nodes with dagre (same approach as the mindmap feature). */
export function layoutGraph<N extends Node>(nodes: N[], edges: Edge[], options: { width: number; height: number; direction?: 'LR' | 'TB' }): N[] {
  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: options.direction ?? 'LR', nodesep: 24, ranksep: 70, marginx: 20, marginy: 20 })
  nodes.forEach((n) => g.setNode(n.id, { width: options.width, height: options.height }))
  edges.forEach((e) => g.setEdge(e.source, e.target))
  dagre.layout(g)
  return nodes.map((n) => {
    const p = g.node(n.id)
    return { ...n, position: { x: p.x - options.width / 2, y: p.y - options.height / 2 } }
  })
}

/**
 * "Blast radius" from mindmap, applied to files: who is affected if this file changes?
 * Walks the reverse imports (files that import it, then files that import those...).
 */
export function impactOf(fileId: string, edges: { source: string; target: string }[], maxDepth = Infinity): Map<string, number> {
  const importers = new Map<string, string[]>()
  for (const e of edges) {
    if (!importers.has(e.target)) importers.set(e.target, [])
    importers.get(e.target)!.push(e.source)
  }
  const depth = new Map<string, number>()
  const queue: [string, number][] = [[fileId, 0]]
  const seen = new Set([fileId])
  while (queue.length) {
    const [id, d] = queue.shift()!
    if (d > 0) depth.set(id, d)
    if (d >= maxDepth) continue
    for (const next of importers.get(id) ?? []) {
      if (!seen.has(next)) {
        seen.add(next)
        queue.push([next, d + 1])
      }
    }
  }
  return depth
}

export const ROLE_COLORS: Record<string, string> = {
  entry: 'var(--role-entry)',
  shared: 'var(--role-shared)',
  leaf: 'var(--role-leaf)',
  module: 'var(--role-module)',
  isolated: 'var(--role-isolated)',
}

export const ROLE_LABELS: Record<string, string> = {
  entry: 'Entry point',
  shared: 'Shared (imported by 2+)',
  leaf: 'Leaf (imports nothing)',
  module: 'Module',
  isolated: 'Not connected',
}

// Same colors as hex. The minimap draws SVG fills, which can't read CSS variables.
export const ROLE_HEX: Record<string, string> = {
  entry: '#6e5bbf',
  shared: '#c2850f',
  leaf: '#4c7fb8',
  module: '#7d7891',
  isolated: '#b9b4c8',
}
