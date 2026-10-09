'use client'

import React, { useState } from 'react'
import { TopBar } from '@/components/common/TopBar'
import { AddProject } from '@/components/repository/AddProject'
import { RepoList } from '@/components/repository/RepoList'
import { AuthGuard } from '@/components/auth/AuthGuard'
import { useAuth } from '@/lib/auth'
import { UserManagerPanel } from '@/components/manager/UserManagerPanel'
import { ShieldCheck, Briefcase, FolderGit2, Users, Layers, Share2 } from 'lucide-react'

function DashboardContent() {
  const { user } = useAuth()
  const isManager = user?.role === 'MANAGER'

  // Manager views: 'projects' or 'team'
  const [managerView, setManagerView] = useState<'projects' | 'team'>('projects')
  // Project filter: 'all' | 'owned' | 'shared'
  const [projectFilter, setProjectFilter] = useState<'all' | 'owned' | 'shared'>('all')

  return (
    <>
      <TopBar />
      <main className="page stack" style={{ gap: 28 }}>
        {/* Workspace Banner & Role Identity */}
        <div>
          <div className="row" style={{ gap: 10, marginBottom: 8 }}>
            <span
              className={`badge ${isManager ? 'badge-lav' : 'badge-ready'}`}
              style={{ padding: '4px 10px', fontSize: 'var(--text-xs)', fontWeight: 600 }}
            >
              {isManager ? <ShieldCheck size={14} /> : <Briefcase size={14} />}
              {isManager ? 'Manager Workspace' : 'Employee Workspace'}
            </span>
          </div>

          <h1 className="title-xl">
            {isManager ? 'Organization & Codebase Intelligence' : 'Understand any codebase'}
          </h1>
          <p className="lead">
            {isManager
              ? 'Manage organizational member roles, audit system activity, and inspect authorized codebases.'
              : 'Add your projects to generate dependency graphs, read automated docs, and query context-aware AI.'}
          </p>
        </div>

        {/* Manager Top View Switcher */}
        {isManager && (
          <div className="tabs" style={{ borderBottom: '1px solid var(--border)', paddingBottom: 0 }}>
            <button
              type="button"
              className="tab"
              aria-current={managerView === 'projects' ? 'page' : undefined}
              onClick={() => setManagerView('projects')}
            >
              <FolderGit2 size={16} />
              <span>Projects & Repositories</span>
            </button>
            <button
              id="manager-team-tab"
              type="button"
              className="tab"
              aria-current={managerView === 'team' ? 'page' : undefined}
              onClick={() => setManagerView('team')}
            >
              <Users size={16} />
              <span>Team & Role Management</span>
            </button>
          </div>
        )}

        {/* View Content */}
        {isManager && managerView === 'team' ? (
          /* Manager-Specific Team Management View */
          <UserManagerPanel />
        ) : (
          /* Project Views (For both Employees and Managers, respecting project-level access) */
          <div className="stack" style={{ gap: 16 }}>
            {/* Project Filter Pills */}
            <div className="row" style={{ gap: 8 }}>
              <button
                type="button"
                className={`btn btn-sm ${projectFilter === 'all' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setProjectFilter('all')}
              >
                <Layers size={13} />
                All Accessible
              </button>
              <button
                type="button"
                className={`btn btn-sm ${projectFilter === 'owned' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setProjectFilter('owned')}
              >
                <Briefcase size={13} />
                My Projects
              </button>
              <button
                type="button"
                className={`btn btn-sm ${projectFilter === 'shared' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setProjectFilter('shared')}
              >
                <Share2 size={13} />
                Shared with Me
              </button>
            </div>

            <div className="dash-grid">
              <AddProject />
              <RepoList filter={projectFilter} />
            </div>
          </div>
        )}
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
