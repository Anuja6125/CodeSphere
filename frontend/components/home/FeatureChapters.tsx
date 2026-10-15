'use client'

import Link from 'next/link'
import { ArrowRight, Network, FileText, MessageSquareCode, Users, Bot, Send, Check, GitCommit } from 'lucide-react'
import { GraphAnimation } from '@/components/home/GraphAnimation'
import { Reveal } from '@/components/home/Reveal'
import type { FeatureKey, FeatureLink } from '@/components/home/useHomeLinks'
import { RailProgress } from '@/components/home/RailProgress'

type Chapter = {
  id: string
  feature: FeatureKey
  num: string
  label: string
  icon: React.ElementType
  title: string
  body: string
  points: string[]
  cta: string
  visual: React.ReactNode
}

/* ---------- Mock visuals (static previews styled like the real product) ---------- */

function DocsPreview() {
  return (
    <div className="lp-mock lp-docs">
      <aside className="lp-docs-toc xsmall">
        <strong className="muted">Contents</strong>
        <span className="is-active">Overview</span>
        <span>Architecture</span>
        <span>lib/api.ts</span>
        <span>auth.ts</span>
        <span>Data flow</span>
      </aside>
      <article className="lp-docs-body">
        <span className="badge badge-ready">Generated</span>
        <h4>lib/api.ts</h4>
        <p className="small muted">Central HTTP client. Wraps <code>fetch</code>, attaches the session token and normalises errors into <code>ApiError</code>.</p>
        <div className="lp-docs-label xsmall">Used by</div>
        <div className="row-wrap">
          <span className="chip mono">routes/index.ts</span>
          <span className="chip mono">auth.ts</span>
        </div>
        <pre className="lp-code"><code>{`export async function request<T>(path: string) {
  const res = await fetch(BASE + path, opts)
  if (!res.ok) throw new ApiError(res)
  return res.json() as Promise<T>
}`}</code></pre>
        <div className="lp-skeleton" style={{ width: '92%' }} />
        <div className="lp-skeleton" style={{ width: '70%' }} />
      </article>
    </div>
  )
}

function ChatPreview() {
  return (
    <div className="lp-mock lp-chat">
      <div className="lp-chat-msg is-user lp-seq" style={{ ['--i' as string]: 0 }}>
        Which files depend on <code>lib/api.ts</code>?
      </div>
      <div className="lp-chat-msg is-bot lp-seq" style={{ ['--i' as string]: 1 }}>
        <span className="lp-chat-avatar"><Bot /></span>
        <div>
          Two modules import it directly: <code>routes/index.ts</code> and <code>auth.ts</code>. Through
          <code>routes</code>, it is reached from the entry point <code>app.tsx</code>.
          <div className="row-wrap" style={{ marginTop: 8 }}>
            <span className="chip mono">routes/index.ts</span>
            <span className="chip mono">auth.ts</span>
          </div>
        </div>
      </div>
      <div className="lp-chat-msg is-user lp-seq" style={{ ['--i' as string]: 2 }}>
        Where is authentication handled?
      </div>
      <div className="lp-chat-msg is-bot lp-seq" style={{ ['--i' as string]: 3 }}>
        <span className="lp-chat-avatar"><Bot /></span>
        <div className="lp-typing" aria-label="Assistant is typing"><i /><i /><i /></div>
      </div>
      <div className="lp-chat-input">
        <span className="muted small">Ask about this codebase…</span>
        <span className="btn btn-primary btn-icon btn-sm"><Send /></span>
      </div>
    </div>
  )
}

function CollabPreview() {
  return (
    <div className="lp-mock lp-collab">
      <div className="lp-collab-head">
        <div>
          <strong className="small">payments-service</strong>
          <div className="xsmall muted">Shared project</div>
        </div>
        <div className="lp-avatars">
          <span style={{ background: 'var(--primary)' }}>AR</span>
          <span style={{ background: 'var(--role-shared)' }}>JK</span>
        </div>
      </div>
      <ul className="lp-collab-list">
        <li className="lp-seq" style={{ ['--i' as string]: 0 }}>
          <span className="lp-dot" style={{ background: 'var(--primary)' }}>AR</span>
          <div className="small"><strong>Anuja</strong> invited <strong>Jay</strong> as collaborator
            <div className="xsmall muted">2 min ago</div></div>
        </li>
        <li className="lp-seq" style={{ ['--i' as string]: 1 }}>
          <span className="lp-dot" style={{ background: 'var(--role-shared)' }}>JK</span>
          <div className="small"><strong>Jay</strong> accepted the invitation <Check className="lp-ok" />
            <div className="xsmall muted">1 min ago</div></div>
        </li>
        <li className="lp-seq" style={{ ['--i' as string]: 2 }}>
          <span className="lp-dot lp-dot-icon"><GitCommit /></span>
          <div className="small">Graph &amp; docs refreshed after new commit
            <div className="row-wrap" style={{ marginTop: 4 }}><span className="badge badge-ready">Ready</span><span className="chip mono">a3f9c21</span></div></div>
        </li>
      </ul>
    </div>
  )
}

function GraphPreview() {
  return (
    <div className="lp-mock lp-mock-flush">
      <GraphAnimation />
    </div>
  )
}

const CHAPTERS: Chapter[] = [
  {
    id: 'understand', feature: 'graph', num: '01', label: 'Dependency graph', icon: Network,
    title: 'Understand your code',
    body: 'CodeSphere parses your repository and draws every import as a connection. Entry points, shared modules and leaves stand out, so the structure of a project is visible at a glance.',
    points: ['Explore file dependencies interactively', 'Trace flows from entry points', 'Spot heavily shared modules'],
    cta: 'Build a graph', visual: <GraphPreview />,
  },
  {
    id: 'docs', feature: 'docs', num: '02', label: 'Documentation', icon: FileText,
    title: 'Documentation, simplified',
    body: 'Once the structure is known, CodeSphere writes it down. Each module gets a clear explanation of what it does and who depends on it — ready to read or export.',
    points: ['Generated from the source itself', 'Organised by module and architecture', 'Downloadable for your team'],
    cta: 'Read your docs', visual: <DocsPreview />,
  },
  {
    id: 'assistant', feature: 'chat', num: '03', label: 'AI assistant', icon: MessageSquareCode,
    title: 'Your AI code assistant',
    body: 'With the graph and docs as context, ask questions in plain language. Answers point to the exact files involved, so you can verify instead of guess.',
    points: ['Questions about code, dependencies and structure', 'Answers grounded in your repository', 'File references you can follow'],
    cta: 'Ask the assistant', visual: <ChatPreview />,
  },
  {
    id: 'together', feature: 'share', num: '04', label: 'Collaboration', icon: Users,
    title: 'Build together',
    body: 'Understanding is better shared. Invite collaborators to a project so everyone works from the same graph, the same docs and the same up-to-date picture.',
    points: ['Invite teammates by email', 'Shared access to graph, docs and chat', 'Stay in sync as the project changes'],
    cta: 'Share a project', visual: <CollabPreview />,
  },
]

export function FeatureChapters({ feature }: { feature: (key: FeatureKey) => FeatureLink }) {
  return (
    <div className="lp-journey" id="features">
      <Reveal className="lp-section-head lp-journey-head">
        <span className="lp-eyebrow mono">The journey</span>
        <h2 className="lp-h2">From a folder of files to a codebase your team understands.</h2>
        <p className="lead">Four steps, each building on the last.</p>
      </Reveal>

      <RailProgress />

      {CHAPTERS.map((c, i) => {
        const Icon = c.icon
        const link = feature(c.feature)
        return (
          <section key={c.id} id={c.id} className={`lp-chapter ${i % 2 ? 'is-flipped' : ''}`} aria-labelledby={`${c.id}-title`}>
            <span className="lp-rail-node" aria-hidden="true"><Icon /></span>
            <Reveal className="lp-chapter-copy">
              <span className="lp-eyebrow mono">{c.num} — {c.label}</span>
              <h2 id={`${c.id}-title`} className="lp-h2">{c.title}</h2>
              <p className="lp-chapter-body">{c.body}</p>
              <ul className="lp-points">
                {c.points.map((p) => <li key={p}><Check />{p}</li>)}
              </ul>
              <Link id={`cta-${c.id}`} href={link.href} className="lp-link">
                {c.cta} <ArrowRight />
              </Link>
              {link.hint && <span className="xsmall muted">{link.hint}</span>}
            </Reveal>
            <Reveal className="lp-chapter-visual" delay={120}>
              <div className="panel lp-frame">
                <div className="lp-window-bar">
                  <span /><span /><span />
                  <code className="xsmall muted">{c.label.toLowerCase()}</code>
                </div>
                {c.visual}
              </div>
            </Reveal>
          </section>
        )
      })}
    </div>
  )
}
