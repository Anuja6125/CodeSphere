// Single place for the backend URL. Set NEXT_PUBLIC_API_URL in .env.local to override.
export const API_BASE_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000').replace(/\/$/, '')
const API = `${API_BASE_URL}/api`

// ---- Types (mirror backend/src/controllers) ----

export type RepoStatus = 'PENDING' | 'CLONING' | 'PARSING' | 'INDEXED' | 'INDEXING' | 'ANALYZING' | 'ANALYZED' | 'FAILED'

export type RepositorySummary = {
  id: string
  name: string
  owner: string
  url: string | null
  sourceType: 'GITHUB' | 'ZIP'
  defaultBranch: string
  status: RepoStatus
  errorMessage: string | null
  totalFiles: number
  totalLines: number
  techStack: { languages?: string[]; frameworks?: string[]; [key: string]: unknown } | null
  createdAt: string
  updatedAt: string
}

export type RepositoryDetail = RepositorySummary & {
  analysis: {
    languages: Record<string, number> | unknown
    frameworks: unknown
    entryPoints: unknown
    importantModules: unknown
    apiFiles: unknown
    databaseFiles: unknown
    importantDirectories: unknown
    sourceFileCount: number
    testFileCount: number
    documentationFileCount: number
    configFileCount: number
    chunkCount: number
    dependencyCount: number
  } | null
  graph: { generatedAt: string; stats: GraphStats; whereToStart: WhereToStart } | null
  documentation: { status: DocStatus; updatedAt: string; error: string | null } | null
  _count: { chats: number; chunks: number }
  embeddedChunks: number
  isProcessing: boolean
}

export type GraphRole = 'entry' | 'shared' | 'leaf' | 'isolated' | 'module'
export type GraphNode = { id: string; label: string; folder: string; role: GraphRole; dependsOn: number; dependedBy: number }
export type GraphEdge = { id: string; source: string; target: string }
export type GraphStats = {
  fileCount: number
  dependencyCount: number
  unresolvedCount: number
  entryFiles: string[]
  leafFiles: string[]
  isolatedFiles: string[]
  mostImported: { file: string; importedByCount: number }[]
}
export type WhereToStart = { suggestions: { file: string; role: 'entry' | 'shared'; reason: string }[]; notes: string[] }
export type GraphData = { nodes: GraphNode[]; edges: GraphEdge[]; stats: GraphStats; unresolved: { source: string; specifier: string }[]; whereToStart: WhereToStart; generatedAt: string }

export type FlowNode = { id: string; label: string; type: string; desc: string; explanation: string }
export type FileFlow = { path: string; truncated: boolean; nodes: FlowNode[]; edges: { source: string; target: string; label?: string }[] }

export type DocStatus = 'PENDING' | 'GENERATING' | 'READY' | 'FAILED'
export type Documentation = { id: string; status: DocStatus; content: string | null; model: string | null; error: string | null; updatedAt: string }

export type Source = { file: string; startLine: number; endLine: number; score?: number; symbolName?: string | null }
export type ChatMessage = { id: string; role: 'user' | 'assistant'; content: string; fileRefs: Source[] | null; createdAt: string }
export type ChatAnswer = { answer: string; sources: Source[]; isLowConfidence: boolean }

// ---- Errors ----

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

/** Make server errors short and readable (Gemini SDK errors are long). */
export function cleanError(message: string): string {
  const gemini = message.match(/GoogleGenerativeAI Error\]:[\s\S]*?\[(\d{3})[^\]]*\]\s*([\s\S]*)/)
  if (gemini) {
    const code = gemini[1]
    if (code === '429') return 'The AI service is busy or out of quota. Wait a minute and try again.'
    return `The AI service returned an error (${code}). ${gemini[2].split('\n')[0].slice(0, 160)}`
  }
  return message
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${API}${path}`, init)
  } catch {
    throw new ApiError(0, `Can't reach the backend at ${API_BASE_URL}. Is it running?`)
  }
  if (response.status === 204) return undefined as T
  const text = await response.text()
  let data: unknown = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    // not JSON
  }
  if (!response.ok) {
    const body = data as { error?: string; message?: string } | null
    throw new ApiError(response.status, cleanError(body?.error || body?.message || `Request failed (${response.status}).`))
  }
  return data as T
}

const json = (method: string, body?: unknown): RequestInit => ({
  method,
  headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
  body: body === undefined ? undefined : JSON.stringify(body),
})

// ---- Calls ----

export const api = {
  listRepositories: () => request<{ repositories: RepositorySummary[] }>('/repositories').then((d) => d.repositories),
  getRepository: (id: string) => request<{ repository: RepositoryDetail }>(`/repositories/${id}`).then((d) => d.repository),
  uploadZip: (file: File) => {
    const form = new FormData()
    form.append('project', file)
    return request<{ repository: RepositorySummary }>('/repositories', { method: 'POST', body: form }).then((d) => d.repository)
  },
  addGithub: (url: string) => request<{ repository: RepositorySummary }>('/repositories', json('POST', { url })).then((d) => d.repository),
  reanalyze: (id: string) => request<{ repository: RepositorySummary }>(`/repositories/${id}/reanalyze`, json('POST')).then((d) => d.repository),
  remove: (id: string) => request<void>(`/repositories/${id}`, { method: 'DELETE' }),

  getGraph: (id: string) => request<GraphData>(`/repositories/${id}/graph`),
  getFile: (id: string, path: string) =>
    request<{ file: { path: string; content: string | null; language: string | null; linesCount: number } }>(
      `/repositories/${id}/files/content?path=${encodeURIComponent(path)}`
    ).then((d) => d.file),
  getFileFlow: (id: string, path: string) => request<FileFlow>(`/repositories/${id}/files/flow`, json('POST', { path })),

  getDocs: (id: string) => request<{ documentation: Documentation | null }>(`/repositories/${id}/documentation`).then((d) => d.documentation),
  generateDocs: (id: string) => request<{ documentation: Documentation }>(`/repositories/${id}/documentation`, json('POST')).then((d) => d.documentation),
  docsDownloadUrl: (id: string) => `${API}/repositories/${id}/documentation/download`,

  getChat: (id: string) => request<{ messages: ChatMessage[] }>(`/repositories/${id}/chat`).then((d) => d.messages),
  sendChat: (id: string, message: string) => request<ChatAnswer>(`/repositories/${id}/chat`, json('POST', { message })),
  clearChat: (id: string) => request<{ success: boolean }>(`/repositories/${id}/chat`, { method: 'DELETE' }),
}
