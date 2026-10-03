import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react'
import type { RepoStatus } from '@/lib/api'
import { PIPELINE_STEPS, statusView } from '@/lib/status'

export function StatusBadge({ status }: { status: RepoStatus }) {
  const view = statusView(status)
  const Icon = view.tone === 'busy' ? Loader2 : view.tone === 'failed' ? AlertCircle : CheckCircle2
  return (
    <span className={`badge badge-${view.tone}`}>
      <Icon className={view.tone === 'busy' ? 'spin' : undefined} aria-hidden />
      {view.label}
    </span>
  )
}

/** The pipeline as a row of steps, so users see where the analysis is. */
export function PipelineSteps({ status }: { status: RepoStatus }) {
  const current = statusView(status).step
  if (current < 0) return null
  return (
    <ol className="steps" aria-label="Analysis progress" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
      {PIPELINE_STEPS.map((label, i) => {
        const state = i < current || current === PIPELINE_STEPS.length - 1 ? 'done' : i === current ? 'now' : 'todo'
        return (
          <li key={label} className="step" data-state={state}>
            {state === 'done' ? <CheckCircle2 aria-hidden /> : state === 'now' ? <Loader2 className="spin" aria-hidden /> : null}
            {label}
          </li>
        )
      })}
    </ol>
  )
}
