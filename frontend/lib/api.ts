// Single place for the backend URL. Set NEXT_PUBLIC_API_URL in .env.local to override.
export const API_BASE_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000').replace(/\/$/, '')

// ---- Backend response shape (mirrors backend/controllers/projectControllers.js) ----

export type Dependency = { source: string; target: string }

export type UnresolvedImport = { source: string; specifier: string }

export type FileGraphNode = { dependsOn: string[]; dependedBy: string[] }

export type ProjectStats = {
  fileCount: number
  dependencyCount: number
  unresolvedCount: number
  entryFiles: string[]
  leafFiles: string[]
  isolatedFiles: string[]
  mostImported: { file: string; importedByCount: number }[]
}

export type WhereToStart = {
  suggestions: { file: string; role: 'entry' | 'shared'; reason: string }[]
  notes: string[]
}

export type GithubSource = {
  type: 'github'
  url: string
  owner: string
  repo: string
  ref: string
  archiveUrl: string
  bytes: number
}

export type ProjectAnalysis = {
  message: string
  projectId: string
  /** Present only when the project came from POST /analyze-repo. */
  source?: GithubSource
  files: string[]
  dependencies: Dependency[]
  unresolved: UnresolvedImport[]
  fileGraph: Record<string, FileGraphNode>
  stats: ProjectStats
  whereToStart: WhereToStart
}

// ---- Calls ----

async function readError(response: Response): Promise<string> {
  try {
    const data = await response.json()
    if (data && typeof data.message === 'string') return data.message
  } catch {
    // body was not JSON
  }
  return `Request failed (${response.status} ${response.statusText})`
}

async function safeFetch(input: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(input, init)
  } catch {
    throw new Error(`Could not reach the backend at ${API_BASE_URL}. Is it running?`)
  }
}

/** POST /upload with FormData field "project". Throws an Error with a readable message on failure. */
export async function uploadProject(file: File): Promise<ProjectAnalysis> {
  const formData = new FormData()
  formData.append('project', file)

  const response = await safeFetch(`${API_BASE_URL}/upload`, { method: 'POST', body: formData })
  if (!response.ok) throw new Error(await readError(response))
  return (await response.json()) as ProjectAnalysis
}

/** POST /analyze-repo with { url }. The backend downloads the GitHub archive and runs the same analysis. */
export async function analyzeGithubRepo(url: string): Promise<ProjectAnalysis> {
  const response = await safeFetch(`${API_BASE_URL}/analyze-repo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  })
  if (!response.ok) throw new Error(await readError(response))
  return (await response.json()) as ProjectAnalysis
}
