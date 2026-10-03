import type { RepoStatus, RepositorySummary } from '@/lib/api'

export type StatusView = { label: string; tone: 'busy' | 'ready' | 'failed' | 'idle'; step: number }

// Steps shown while a repo is processed. Order matches the backend pipeline.
export const PIPELINE_STEPS = ['Downloading', 'Reading files', 'Building graph', 'Indexing for chat', 'Ready'] as const

export function statusView(status: RepoStatus): StatusView {
  switch (status) {
    case 'PENDING': return { label: 'Queued', tone: 'busy', step: 0 }
    case 'CLONING': return { label: 'Downloading', tone: 'busy', step: 0 }
    case 'PARSING': return { label: 'Reading files', tone: 'busy', step: 1 }
    case 'ANALYZING': return { label: 'Building graph', tone: 'busy', step: 2 }
    case 'INDEXED':
    case 'INDEXING': return { label: 'Indexing for chat', tone: 'busy', step: 3 }
    case 'ANALYZED': return { label: 'Ready', tone: 'ready', step: 4 }
    case 'FAILED': return { label: 'Failed', tone: 'failed', step: -1 }
  }
}

export const isBusy = (status: RepoStatus) => statusView(status).tone === 'busy'

/** Graph and docs work once analysis is done, even while chat indexing continues. */
export const hasAnalysis = (status: RepoStatus) => ['INDEXED', 'INDEXING', 'ANALYZED'].includes(status)

export function sourceLabel(repo: Pick<RepositorySummary, 'sourceType' | 'owner' | 'name'>) {
  return repo.sourceType === 'GITHUB' ? `github.com/${repo.owner}/${repo.name}` : 'Uploaded ZIP'
}
