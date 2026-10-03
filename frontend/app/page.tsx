import { TopBar } from '@/components/common/TopBar'
import { AddProject } from '@/components/repository/AddProject'
import { RepoList } from '@/components/repository/RepoList'

export default function DashboardPage() {
  return (
    <>
      <TopBar />
      <main className="page stack" style={{ gap: 28 }}>
        <div>
          <h1 className="title-xl">Understand any codebase</h1>
          <p className="lead">
            Add a project to see how its files connect, read generated docs, and ask questions about the code.
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
