import { Suspense } from 'react'
import { RepoGraph } from '@/components/graph/RepoGraph'
import { LoadingState } from '@/components/common/States'

export default function GraphPage() {
  return (
    <Suspense fallback={<LoadingState label="Loading graph…" />}>
      <RepoGraph />
    </Suspense>
  )
}
