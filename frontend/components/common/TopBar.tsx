import Link from 'next/link'
import { ChevronRight, Orbit } from 'lucide-react'

export function TopBar({ crumb }: { crumb?: string }) {
  return (
    <header className="topbar">
      <Link href="/" className="brand" aria-label="CodeSphere home">
        <span className="brand-mark"><Orbit /></span>
        CodeSphere
      </Link>
      {crumb && (
        <span className="topbar-crumb">
          <ChevronRight aria-hidden />
          <strong>{crumb}</strong>
        </span>
      )}
    </header>
  )
}
