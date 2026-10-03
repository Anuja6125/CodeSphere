'use client'

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { api, ApiError, type RepositoryDetail } from '@/lib/api'
import { isBusy } from '@/lib/status'

type RepoState = {
  id: string
  repo: RepositoryDetail | null
  error: string | null
  notFound: boolean
  refresh: () => Promise<void>
}

const RepoContext = createContext<RepoState | null>(null)

/** One place that loads the repository and keeps polling while it is processing. */
export function RepoProvider({ id, children }: { id: string; children: ReactNode }) {
  const [repo, setRepo] = useState<RepositoryDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notFound, setNotFound] = useState(false)

  const refresh = useCallback(async () => {
    try {
      setRepo(await api.getRepository(id))
      setError(null)
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) setNotFound(true)
      setError(e instanceof Error ? e.message : 'Could not load the repository.')
    }
  }, [id])

  // Switching repositories: clear the old one first so no stale data shows.
  useEffect(() => {
    setRepo(null)
    setNotFound(false)
    setError(null)
    refresh()
  }, [refresh])

  const polling = !!repo && (isBusy(repo.status) || repo.isProcessing || repo.documentation?.status === 'GENERATING')
  useEffect(() => {
    if (!polling) return
    const timer = setInterval(refresh, 2500)
    return () => clearInterval(timer)
  }, [polling, refresh])

  return <RepoContext.Provider value={{ id, repo, error, notFound, refresh }}>{children}</RepoContext.Provider>
}

export function useRepo() {
  const value = useContext(RepoContext)
  if (!value) throw new Error('useRepo must be used inside RepoProvider')
  return value
}
