'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import {
  Activity,
  BookOpen,
  Calendar,
  CheckCircle2,
  Clock,
  FileArchive,
  FileCode,
  GitBranch,
  History,
  MessageSquare,
  Network,
  RefreshCw,
  Share2,
  Shield,
  User,
} from 'lucide-react'
import { api, type ProjectActivityItem, type ProjectHistoryData } from '@/lib/api'
import { StatusBadge } from '@/components/repository/StatusBadge'
import { EmptyState, ErrorState } from '@/components/common/States'

function timeAgo(iso: string) {
  const seconds = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 1000))
  if (seconds < 60) return 'just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 30) return `${days}d ago`
  return new Date(iso).toLocaleDateString()
}

function getActivityBadge(type: string) {
  switch (type) {
    case 'PROJECT_CREATED':
      return { icon: GitBranch, color: '#10b981', label: 'Project Created' }
    case 'REPO_REANALYZED':
      return { icon: RefreshCw, color: '#06b6d4', label: 'Re-analyzed' }
    case 'INDEXING_COMPLETED':
      return { icon: FileCode, color: '#6366f1', label: 'Files Indexed' }
    case 'GRAPH_GENERATED':
      return { icon: Network, color: '#3b82f6', label: 'Graph Generated' }
    case 'DOCS_GENERATION_STARTED':
    case 'DOCS_GENERATED':
      return { icon: BookOpen, color: '#a855f7', label: 'Documentation' }
    case 'CHAT_MESSAGE_SENT':
      return { icon: MessageSquare, color: '#f59e0b', label: 'AI Chat Query' }
    case 'PROJECT_SHARED':
    case 'ACCESS_REVOKED':
      return { icon: Share2, color: '#ec4899', label: 'Access Control' }
    default:
      return { icon: Activity, color: '#64748b', label: type }
  }
}

export default function ProjectHistoryPage() {
  const { id } = useParams<{ id: string }>()
  const [data, setData] = useState<ProjectHistoryData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<string>('ALL')

  useEffect(() => {
    let mounted = true
    setLoading(true)
    api
      .getProjectHistory(id)
      .then((res) => {
        if (mounted) {
          setData(res)
          setError(null)
        }
      })
      .catch((err) => {
        if (mounted) {
          setError(err instanceof Error ? err.message : 'Failed to load project history.')
        }
      })
      .finally(() => {
        if (mounted) setLoading(false)
      })

    return () => {
      mounted = false
    }
  }, [id])

  if (loading) {
    return (
      <div style={{ padding: '2rem 1.5rem', maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="panel" style={{ height: 100, opacity: 0.6 }} />
          ))}
        </div>
        <div className="panel" style={{ height: 350, opacity: 0.5 }} />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div style={{ padding: '2rem 1.5rem', maxWidth: 900, margin: '0 auto' }}>
        <ErrorState message={error || 'Could not load project history.'} onRetry={() => window.location.reload()} />
      </div>
    )
  }

  const { project, history } = data
  const activities = history.activities || []

  const filteredActivities = activities.filter((act) => {
    if (filter === 'ALL') return true
    if (filter === 'CORE') return ['PROJECT_CREATED', 'REPO_REANALYZED', 'INDEXING_COMPLETED'].includes(act.activityType)
    if (filter === 'ANALYSIS') return ['GRAPH_GENERATED', 'DOCS_GENERATED', 'DOCS_GENERATION_STARTED'].includes(act.activityType)
    if (filter === 'COLLAB') return ['PROJECT_SHARED', 'ACCESS_REVOKED', 'CHAT_MESSAGE_SENT'].includes(act.activityType)
    return true
  })

  return (
    <div style={{ padding: '2rem 1.5rem', maxWidth: 1100, margin: '0 auto' }}>
      {/* Top Overview Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: '1rem',
          marginBottom: '2rem',
        }}
      >
        {/* Creator & Origin */}
        <div
          className="panel"
          style={{
            padding: '1.25rem',
            background: 'var(--panel-bg, #111827)',
            border: '1px solid var(--border-color, #1f2937)',
            borderRadius: '0.75rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem', color: '#94a3b8' }}>
            <User size={18} />
            <span style={{ fontSize: '0.85rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Creator & Owner
            </span>
          </div>
          <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#f8fafc', overflowWrap: 'anywhere' }}>
            {project.user?.email || 'Unassigned / Demo'}
          </div>
          <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <Calendar size={13} />
            Created {new Date(project.createdAt).toLocaleDateString()}
          </div>
        </div>

        {/* Source Reference */}
        <div
          className="panel"
          style={{
            padding: '1.25rem',
            background: 'var(--panel-bg, #111827)',
            border: '1px solid var(--border-color, #1f2937)',
            borderRadius: '0.75rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem', color: '#94a3b8' }}>
            {project.sourceType === 'GITHUB' ? <GitBranch size={18} /> : <FileArchive size={18} />}
            <span style={{ fontSize: '0.85rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Source Reference
            </span>
          </div>
          <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#38bdf8', overflowWrap: 'anywhere' }}>
            {project.sourceType === 'GITHUB' ? (
              <a
                href={project.url?.replace(/\.git$/, '')}
                target="_blank"
                rel="noreferrer noopener"
                style={{ color: '#38bdf8', textDecoration: 'none' }}
              >
                {project.owner}/{project.name}
              </a>
            ) : (
              `${project.name}.zip`
            )}
          </div>
          <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.35rem' }}>
            {project.totalFiles.toLocaleString()} files ({project.totalLines.toLocaleString()} lines)
          </div>
        </div>

        {/* Graph & Analysis */}
        <div
          className="panel"
          style={{
            padding: '1.25rem',
            background: 'var(--panel-bg, #111827)',
            border: '1px solid var(--border-color, #1f2937)',
            borderRadius: '0.75rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem', color: '#94a3b8' }}>
            <Network size={18} />
            <span style={{ fontSize: '0.85rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Graph & Intelligence
            </span>
          </div>
          <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#f8fafc' }}>
            {history.graph?.stats?.fileCount ?? project.totalFiles} Nodes Linked
          </div>
          <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.35rem' }}>
            {history.graph ? `Generated ${timeAgo(history.graph.generatedAt)}` : 'Analysis in progress'}
          </div>
        </div>

        {/* Documentation & Chat */}
        <div
          className="panel"
          style={{
            padding: '1.25rem',
            background: 'var(--panel-bg, #111827)',
            border: '1px solid var(--border-color, #1f2937)',
            borderRadius: '0.75rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem', color: '#94a3b8' }}>
            <BookOpen size={18} />
            <span style={{ fontSize: '0.85rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Docs & Chat History
            </span>
          </div>
          <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#f8fafc' }}>
            {history.documentation?.status === 'READY' ? 'Documentation Ready' : 'Pending'}
          </div>
          <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.35rem' }}>
            {history.chatCount} private chat {history.chatCount === 1 ? 'interaction' : 'interactions'} recorded
          </div>
        </div>
      </div>

      {/* Activity Timeline Section */}
      <div
        className="panel"
        style={{
          padding: '1.75rem',
          background: 'var(--panel-bg, #111827)',
          border: '1px solid var(--border-color, #1f2937)',
          borderRadius: '0.75rem',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '1rem',
            marginBottom: '1.5rem',
            paddingBottom: '1rem',
            borderBottom: '1px solid #1f2937',
          }}
        >
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <History size={20} color="#38bdf8" />
              Project Activity & Audit Timeline
            </h2>
            <p style={{ fontSize: '0.875rem', color: '#64748b', marginTop: '0.25rem' }}>
              Chronological log of project lifecycle events, analysis runs, documentation, and user actions.
            </p>
          </div>

          {/* Activity Filters */}
          <div style={{ display: 'flex', gap: '0.35rem', background: '#0f172a', padding: '0.25rem', borderRadius: '0.5rem', border: '1px solid #1e293b' }}>
            {[
              { id: 'ALL', label: 'All Events' },
              { id: 'CORE', label: 'Creation & Indexing' },
              { id: 'ANALYSIS', label: 'Graph & Docs' },
              { id: 'COLLAB', label: 'Sharing & Chat' },
            ].map((f) => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                style={{
                  padding: '0.35rem 0.75rem',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  borderRadius: '0.35rem',
                  border: 'none',
                  background: filter === f.id ? '#1e293b' : 'transparent',
                  color: filter === f.id ? '#38bdf8' : '#94a3b8',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Timeline Items */}
        {filteredActivities.length === 0 ? (
          <div style={{ padding: '3rem 1rem', textAlign: 'center', color: '#64748b' }}>
            No activity events recorded under this filter.
          </div>
        ) : (
          <div style={{ position: 'relative', paddingLeft: '2rem' }}>
            {/* Vertical timeline connector line */}
            <div
              style={{
                position: 'absolute',
                top: '1rem',
                bottom: '1rem',
                left: '11px',
                width: '2px',
                background: '#1e293b',
              }}
            />

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {filteredActivities.map((act) => {
                const badge = getActivityBadge(act.activityType)
                const IconComponent = badge.icon

                return (
                  <div key={act.id} style={{ position: 'relative' }}>
                    {/* Circle icon marker */}
                    <div
                      style={{
                        position: 'absolute',
                        left: '-2rem',
                        top: '0.25rem',
                        width: '24px',
                        height: '24px',
                        borderRadius: '50%',
                        background: '#0f172a',
                        border: `2px solid ${badge.color}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 1,
                      }}
                    >
                      <IconComponent size={12} color={badge.color} />
                    </div>

                    {/* Event Content Card */}
                    <div
                      style={{
                        padding: '1rem',
                        background: '#0b0f17',
                        border: '1px solid #1e293b',
                        borderRadius: '0.5rem',
                        transition: 'border-color 0.2s',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          justifyContent: 'space-between',
                          gap: '1rem',
                          flexWrap: 'wrap',
                        }}
                      >
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <span
                              style={{
                                fontSize: '0.725rem',
                                fontWeight: 700,
                                textTransform: 'uppercase',
                                padding: '0.15rem 0.5rem',
                                borderRadius: '9999px',
                                background: `${badge.color}20`,
                                color: badge.color,
                                border: `1px solid ${badge.color}40`,
                              }}
                            >
                              {badge.label}
                            </span>
                            <span style={{ fontSize: '0.95rem', fontWeight: 600, color: '#f1f5f9' }}>
                              {act.title}
                            </span>
                          </div>

                          {act.description && (
                            <p style={{ fontSize: '0.875rem', color: '#94a3b8', marginTop: '0.35rem', lineHeight: 1.5 }}>
                              {act.description}
                            </p>
                          )}
                        </div>

                        {/* Event Time and Actor */}
                        <div style={{ textAlign: 'right', minWidth: 120 }}>
                          <span
                            style={{
                              fontSize: '0.775rem',
                              color: '#64748b',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.25rem',
                            }}
                            title={new Date(act.createdAt).toLocaleString()}
                          >
                            <Clock size={12} />
                            {timeAgo(act.createdAt)}
                          </span>
                          {act.user && (
                            <div style={{ fontSize: '0.75rem', color: '#475569', marginTop: '0.15rem' }}>
                              by {act.user.email}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Optional Event Metadata Details */}
                      {act.metadata && Object.keys(act.metadata).length > 0 && (
                        <div
                          style={{
                            marginTop: '0.65rem',
                            paddingTop: '0.5rem',
                            borderTop: '1px solid #131d2e',
                            display: 'flex',
                            gap: '0.5rem',
                            flexWrap: 'wrap',
                          }}
                        >
                          {Object.entries(act.metadata).map(([key, val]) => (
                            <span
                              key={key}
                              style={{
                                fontSize: '0.725rem',
                                padding: '0.15rem 0.45rem',
                                background: '#131b2e',
                                borderRadius: '0.25rem',
                                color: '#93c5fd',
                                fontFamily: 'monospace',
                              }}
                            >
                              {key}: {typeof val === 'object' ? JSON.stringify(val) : String(val)}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
