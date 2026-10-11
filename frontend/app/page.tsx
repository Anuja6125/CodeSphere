'use client'

import React from 'react'
import { TopBar } from '@/components/common/TopBar'
import { AddProject } from '@/components/repository/AddProject'
import { RepoList } from '@/components/repository/RepoList'
import { AuthGuard } from '@/components/auth/AuthGuard'

function DashboardContent() {
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

        <div className="dash-grid">
          <AddProject />
          <RepoList />
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
