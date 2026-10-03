import dagre from '@dagrejs/dagre'
import type { Dependency, FileGraphNode } from '@/lib/api'

export type NodeType = 'entry' | 'component' | 'utility' | 'config'

export type GraphNode = {
  id: string // file path, as returned by the backend
  label: string
  type: NodeType
  x: number
  y: number
  width: number
  dependsOn: number
  dependedBy: number
}

export type GraphEdge = { from: string; to: string }

export type GraphLayout = {
  nodes: GraphNode[]
  edges: GraphEdge[]
  width: number
  height: number
}

export const NODE_HEIGHT = 44
const MIN_NODE_WIDTH = 152
const CHAR_WIDTH = 5.6 // approx. for the 10px Arial label
const LABEL_PADDING = 40 // dot + inner spacing
const CANVAS_PADDING = 40
const INSPECTOR_RESERVE = 240

export const nodeColors: Record<NodeType, string> = {
  entry: '#5d6bff',
  component: '#16b89a',
  utility: '#f3a93b',
  config: '#8c96a8',
}

const configPattern = /(^|\/)([\w.-]*\.config\.[cm]?[jt]sx?|\.?eslintrc[\w.]*|tailwind[\w.]*|postcss[\w.]*|babel[\w.]*|vite[\w.]*|next[\w.]*|jest[\w.]*|webpack[\w.]*|rollup[\w.]*|setupTests\.[jt]sx?)$/i

/** Simple, deterministic type from the file path. Entry comes from the real graph, not the name. */
export function deriveNodeType(file: string, node?: FileGraphNode): NodeType {
  if (configPattern.test(file)) return 'config'
  if (node && node.dependedBy.length === 0 && node.dependsOn.length > 0) return 'entry'
  if (/\.(jsx|tsx)$/i.test(file) || /(^|\/)components?\//i.test(file)) return 'component'
  return 'utility'
}

/**
 * Builds nodes + edges from the backend response and lays them out with dagre.
 * Every unique source/target becomes a node; every dependency becomes an edge.
 */
export function buildGraphLayout(dependencies: Dependency[], fileGraph: Record<string, FileGraphNode>): GraphLayout {
  const ids = new Set<string>()
  const edges: GraphEdge[] = []
  const seenEdges = new Set<string>()

  for (const { source, target } of dependencies) {
    ids.add(source)
    ids.add(target)
    const key = `${source}→${target}`
    if (!seenEdges.has(key)) {
      seenEdges.add(key)
      edges.push({ from: source, to: target })
    }
  }

  if (ids.size === 0) return { nodes: [], edges: [], width: 820, height: 560 }

  const g = new dagre.graphlib.Graph()
  g.setGraph({ rankdir: 'LR', nodesep: 28, ranksep: 90, marginx: CANVAS_PADDING, marginy: CANVAS_PADDING })
  g.setDefaultEdgeLabel(() => ({}))

  const widths = new Map<string, number>()
  for (const id of ids) {
    const width = Math.max(MIN_NODE_WIDTH, Math.ceil(id.length * CHAR_WIDTH) + LABEL_PADDING)
    widths.set(id, width)
    g.setNode(id, { width, height: NODE_HEIGHT })
  }
  for (const edge of edges) g.setEdge(edge.from, edge.to)

  dagre.layout(g)

  const nodes: GraphNode[] = Array.from(ids)
    .sort()
    .map((id) => {
      const pos = g.node(id)
      const width = widths.get(id)!
      const info = fileGraph[id]
      return {
        id,
        label: id,
        type: deriveNodeType(id, info),
        // dagre gives centre coordinates; convert to top-left like the original SVG used
        x: Math.round(pos.x - width / 2),
        y: Math.round(pos.y - NODE_HEIGHT / 2),
        width,
        dependsOn: info?.dependsOn.length ?? 0,
        dependedBy: info?.dependedBy.length ?? 0,
      }
    })

  const graphInfo = g.graph()
  return {
    nodes,
    edges,
    // Extra room on the right so the floating inspector panel does not cover the last column of nodes.
    width: Math.max(820, Math.ceil((graphInfo.width ?? 820) + INSPECTOR_RESERVE)),
    height: Math.max(560, Math.ceil(graphInfo.height ?? 560)),
  }
}
