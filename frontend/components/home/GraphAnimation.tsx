'use client'

import { useEffect, useId, useRef, useState } from 'react'

/**
 * Decorative, lightweight SVG of connected source files.
 * Edges carry a slow "import" pulse; nodes use the existing graph role colors.
 * Animations pause while the graph is off-screen to save CPU/battery.
 */

type Role = 'entry' | 'shared' | 'leaf' | 'module'
type GNode = { id: string; label: string; x: number; y: number; role: Role }

const NODES: GNode[] = [
  { id: 'app', label: 'app.tsx', x: 90, y: 70, role: 'entry' },
  { id: 'routes', label: 'routes/index.ts', x: 300, y: 50, role: 'module' },
  { id: 'auth', label: 'auth.ts', x: 70, y: 210, role: 'module' },
  { id: 'api', label: 'lib/api.ts', x: 270, y: 190, role: 'shared' },
  { id: 'graph', label: 'graph.ts', x: 440, y: 160, role: 'module' },
  { id: 'db', label: 'db/client.ts', x: 170, y: 330, role: 'leaf' },
  { id: 'utils', label: 'utils.ts', x: 380, y: 310, role: 'leaf' },
]

const EDGES: [string, string][] = [
  ['app', 'routes'],
  ['app', 'auth'],
  ['routes', 'api'],
  ['auth', 'api'],
  ['routes', 'graph'],
  ['api', 'db'],
  ['api', 'utils'],
  ['graph', 'utils'],
]

const byId = Object.fromEntries(NODES.map((n) => [n.id, n]))

export function GraphAnimation() {
  const patternId = `lp-dots-${useId().replace(/:/g, '')}`
  const ref = useRef<HTMLDivElement>(null)
  const [onScreen, setOnScreen] = useState(true)

  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(([e]) => setOnScreen(e.isIntersecting))
    io.observe(el)
    return () => io.disconnect()
  }, [])

  return (
    <div ref={ref} className={`lp-graph ${onScreen ? '' : 'is-paused'}`} aria-hidden="true">
      <svg viewBox="0 0 520 390" role="presentation" focusable="false">
        <defs>
          <pattern id={patternId} width="18" height="18" patternUnits="userSpaceOnUse">
            <circle cx="1.5" cy="1.5" r="1.2" fill="var(--border-strong)" />
          </pattern>
        </defs>
        <rect width="520" height="390" fill={`url(#${patternId})`} opacity="0.6" />

        {EDGES.map(([a, b], i) => {
          const s = byId[a]
          const t = byId[b]
          const mx = (s.x + t.x) / 2
          const d = `M${s.x},${s.y} C${mx},${s.y} ${mx},${t.y} ${t.x},${t.y}`
          return (
            <g key={`${a}-${b}`}>
              <path d={d} className="lp-edge" />
              <path d={d} className="lp-edge-flow" pathLength={100} style={{ animationDelay: `${i * 0.7}s` }} />
            </g>
          )
        })}

        {NODES.map((n, i) => {
          const w = n.label.length * 7.4 + 34
          return (
            <g key={n.id} transform={`translate(${n.x - w / 2}, ${n.y - 15})`}>
              <g className="lp-node" style={{ animationDelay: `${0.15 + i * 0.09}s, ${i * 0.6}s` }}>
                <rect width={w} height="30" rx="8" className="lp-node-box" />
                <circle cx="14" cy="15" r="4" fill={`var(--role-${n.role})`} />
                <text x="25" y="19.5" className="lp-node-label">{n.label}</text>
              </g>
            </g>
          )
        })}
      </svg>
    </div>
  )
}
