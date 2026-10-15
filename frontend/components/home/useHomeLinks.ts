'use client'

import { useEffect, useState } from 'react'
import { api, type RepositorySummary } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { hasAnalysis } from '@/lib/status'

export type FeatureKey = 'graph' | 'docs' | 'chat' | 'share'
export type FeatureLink = { href: string; hint?: string }

/**
 * Resolves homepage CTAs to real, existing routes.
 *
 * - Signed out: everything goes through the existing sign-in flow (`/login`).
 * - Signed in: feature pages live under `/repositories/[id]/...`, so we pick the
 *   user's most recently updated analyzed project (via the existing API).
 *   Without one, we send the user to `/dashboard` to add a project first.
 */
export function useHomeLinks() {
  const { isAuthenticated, isLoading, user } = useAuth()
  const [repos, setRepos] = useState<RepositorySummary[] | null>(null)

  useEffect(() => {
    if (!isAuthenticated) { setRepos(null); return }
    let alive = true
    api.listRepositories()
      .then((r) => { if (alive) setRepos(r) })
      .catch(() => { if (alive) setRepos([]) })
    return () => { alive = false }
  }, [isAuthenticated])

  const byRecent = [...(repos ?? [])].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  const ready = byRecent.find((r) => hasAnalysis(r.status))
  // Inviting is done from the project header; prefer a project the user owns.
  const owned = byRecent.find((r) => !r.userId || r.userId === user?.id) ?? byRecent[0]

  const primary = isAuthenticated
    ? { href: '/dashboard', label: 'Go to dashboard' }
    : { href: '/login?mode=signup', label: 'Get started' }

  function feature(key: FeatureKey): FeatureLink {
    if (!isAuthenticated) return { href: '/login', hint: 'Sign in to continue' }
    if (key === 'share') {
      return owned
        ? { href: `/repositories/${owned.id}`, hint: `Use “Invite Collaborator” on ${owned.name}` }
        : { href: '/dashboard', hint: 'Add a project first, then invite collaborators' }
    }
    if (!ready) return { href: '/dashboard', hint: 'Add a project to unlock this' }
    const sub = key === 'graph' ? 'graph' : key === 'docs' ? 'documentation' : 'chat'
    return { href: `/repositories/${ready.id}/${sub}`, hint: `Opens ${ready.name}` }
  }

  return { isAuthenticated, isLoading, primary, feature }
}
