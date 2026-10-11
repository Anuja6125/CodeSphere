'use client'

import React, { useState } from 'react'
import { TopBar } from '@/components/common/TopBar'
import { AddProject } from '@/components/repository/AddProject'
import { RepoList } from '@/components/repository/RepoList'
import { PendingInvitations } from '@/components/repository/PendingInvitations'
import { AuthGuard } from '@/components/auth/AuthGuard'

function DashboardContent() {
  const [refreshKey, setRefreshKey] = useState(0)

  return (
    <>
      <TopBar />
      <main className="page stack" style={{ gap: 28 }}>
        <div>
          <h1 className="title-xl">Understand any codebase</h1>
          <p className="lead">
            Add your projects to generate dependency graphs, read automated docs, and query context-aware AI.
          </p>
        </div>

        <PendingInvitations onChanged={() => setRefreshKey((k) => k + 1)} />

        <div className="dash-grid">
          <AddProject />
          <RepoList key={refreshKey} />
        </div>
      </main>
    </>
  )
}

export default function DashboardPage() {
  return (
    <AuthGuard>
      <DashboardContent />
    </AuthGuard>
  )
}
