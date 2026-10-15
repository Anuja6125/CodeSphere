'use client'

import React, { useEffect, useRef, useState } from 'react'

/** Fades/slides children in once when they scroll into view. */
export function Reveal({
  children,
  delay = 0,
  as: Tag = 'div',
  className = '',
}: {
  children: React.ReactNode
  delay?: number
  as?: 'div' | 'section' | 'article' | 'li'
  className?: string
}) {
  const ref = useRef<HTMLElement | null>(null)
  const [shown, setShown] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (typeof IntersectionObserver === 'undefined') { setShown(true); return }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) { setShown(true); io.disconnect() }
      },
      { threshold: 0.15, rootMargin: '0px 0px -40px 0px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  return React.createElement(
    Tag,
    {
      ref,
      className: `lp-reveal ${shown ? 'is-visible' : ''} ${className}`.trim(),
      style: { transitionDelay: `${delay}ms` },
    },
    children,
  )
}
