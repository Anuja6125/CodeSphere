'use client'

import { useParams } from 'next/navigation'
import Link from 'next/link'
import { SearchX } from 'lucide-react'
import { TopBar } from '@/components/common/TopBar'
import { EmptyState } from '@/components/common/States'
import { RepoProvider, useRepo } from '@/components/repository/RepoContext'
import { RepoHeader } from '@/components/repository/RepoHeader'

function Frame({ children }: { children: React.ReactNode }) {
  const { repo, notFound } = useRepo()
  if (notFound) {
    return (
      <>
        <TopBar />
        <EmptyState icon={<SearchX />} title="Repository not found" action={<Link className="btn btn-primary" href="/">Back to projects</Link>}>
          It may have been deleted.
        </EmptyState>
      </>
    )
  }
  return (
    <>
      <TopBar crumb={repo?.name} />
      <RepoHeader />
      <div className="tab-body">{children}</div>
    </>
  )
}

export default function RepositoryLayout({ children }: { children: React.ReactNode }) {
  const { id } = useParams<{ id: string }>()
  return (
    <RepoProvider id={id}>
      <Frame>{children}</Frame>
    </RepoProvider>
  )
}
