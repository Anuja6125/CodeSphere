import type { ReactNode } from 'react'
import { AlertCircle, Loader2 } from 'lucide-react'

export function EmptyState({ icon, title, children, action }: { icon: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="state">
      <div className="state-icon">{icon}</div>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  )
}

export function ErrorState({ title = 'Something went wrong', message, onRetry }: { title?: string; message: string; onRetry?: () => void }) {
  return (
    <div className="state" role="alert">
      <div className="state-icon error"><AlertCircle /></div>
      <h3>{title}</h3>
      <p>{message}</p>
      {onRetry && <button className="btn" onClick={onRetry}>Try again</button>}
    </div>
  )
}

export function LoadingState({ label }: { label: string }) {
  return (
    <div className="state" aria-live="polite">
      <Loader2 className="spin" width={22} height={22} />
      <p>{label}</p>
    </div>
  )
}

export function Alert({ tone = 'error', children }: { tone?: 'error' | 'warn'; children: ReactNode }) {
  return (
    <div className={`alert alert-${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      <AlertCircle />
      <div>{children}</div>
    </div>
  )
}
