'use client'

import { useEffect, useRef } from 'react'

/**
 * Fills the vertical journey rail as the user scrolls through the chapters.
 * Writes a single CSS variable inside rAF — no React re-renders on scroll.
 */
export function RailProgress() {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    let frame = 0
    const update = () => {
      frame = 0
      const r = el.getBoundingClientRect()
      const mid = window.innerHeight * 0.55
      const p = r.height > 0 ? Math.min(1, Math.max(0, (mid - r.top) / r.height)) : 0
      el.style.setProperty('--p', p.toFixed(3))
    }
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update) }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [])

  return (
    <div ref={ref} className="lp-rail" aria-hidden="true">
      <div className="lp-rail-fill" />
    </div>
  )
}
