import { memo } from 'react'
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react'
import type { GraphNode } from '@/lib/api'
import { ROLE_COLORS } from './layout'

export type FileNodeData = GraphNode & { selected?: boolean; dim?: boolean; impact?: number }
export type FileFlowNode = Node<FileNodeData, 'file'>

// Card for one file. Adapted from mindmap's CustomNode.
function FileNodeView({ data }: NodeProps<FileFlowNode>) {
  return (
    <div
      className="file-node"
      data-selected={data.selected || undefined}
      data-dim={data.dim || undefined}
      data-impact={data.impact ? Math.min(data.impact, 3) : undefined}
      style={{ ['--role-color' as string]: ROLE_COLORS[data.role] }}
      title={data.id}
    >
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      <div className="name">{data.label}</div>
      <div className="folder">{data.folder}</div>
      <div className="meta">{data.language ? `${data.language} · ` : ""}imports {data.dependsOn}, used by {data.dependedBy}</div>
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
    </div>
  )
}

export const FileNode = memo(FileNodeView)
