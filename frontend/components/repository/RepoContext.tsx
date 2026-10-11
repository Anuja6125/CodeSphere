'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { api, ApiError, type RepositoryDetail } from '@/lib/api'
import { isBusy } from '@/lib/status'

type RepoState = {
  id: string
  repo: RepositoryDetail | null
  error: string | null
  notFound: boolean
  forbidden: boolean
  refresh: () => Promise<void>
}

const RepoContext = createContext<RepoState | null>(null)

/** One place that loads the repository, keeps collaborators synchronized, and prevents stale data overwrites. */
export function RepoProvider({ id, children }: { id: string; children: ReactNode }) {
  const [repo, setRepo] = useState<RepositoryDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [forbidden, setForbidden] = useState(false)

  // Track latest request ID and timestamp to strictly prevent stale data from overwriting newer saved data
  const requestIdRef = useRef<number>(0)
  const latestUpdatedAtRef = useRef<number>(0)

  const refresh = useCallback(async () => {
    const currentReqId = ++requestIdRef.current
    try {
      const fetched = await api.getRepository(id)
      // Discard out-of-order network responses
      if (currentReqId < requestIdRef.current) return

      const fetchedUpdatedAt = new Date(fetched.updatedAt).getTime()
      // Guard against stale responses overwriting newer saved data
      if (fetchedUpdatedAt >= latestUpdatedAtRef.current || !latestUpdatedAtRef.current) {
        latestUpdatedAtRef.current = Math.max(latestUpdatedAtRef.current, fetchedUpdatedAt)
        setRepo(fetched)
      }
      setError(null)
      setForbidden(false)
      setNotFound(false)
    } catch (e) {
      if (currentReqId < requestIdRef.current) return
      if (e instanceof ApiError) {
        if (e.status === 404) setNotFound(true)
        if (e.status === 403) setForbidden(true)
      }
      setError(e instanceof Error ? e.message : 'Could not load the repository.')
    }
  }, [id])

  // Switching repositories: clear the old one first so no stale data shows.
  useEffect(() => {
    requestIdRef.current++
    latestUpdatedAtRef.current = 0
    setRepo(null)
    setNotFound(false)
    setForbidden(false)
    setError(null)
    refresh()
  }, [id, refresh])

  // Automatic synchronization:
  // - Fast polling (2.5s) when a pipeline step is active
  // - Background polling (6s) to automatically sync collaborator operations & invitations
  useEffect(() => {
    const isProcessing = !!repo && (isBusy(repo.status) || repo.isProcessing || repo.documentation?.status === 'GENERATING')
    const intervalMs = isProcessing ? 2500 : 6000

    const timer = setInterval(() => {
      // Only poll when the tab is visible to conserve bandwidth & battery
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        refresh()
      }
    }, intervalMs)

    return () => clearInterval(timer)
  }, [repo, refresh])

  return (
    <RepoContext.Provider value={{ id, repo, error, notFound, forbidden, refresh }}>
      {children}
    </RepoContext.Provider>
  )
}

export function useRepo() {
  const value = useContext(RepoContext)
  if (!value) throw new Error('useRepo must be used inside RepoProvider')
  return value
}
