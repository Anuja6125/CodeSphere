# CodeSphere

Upload a project (ZIP or GitHub URL). CodeSphere then gives you:

- **Graph**: how the files import each other. Zoom, pan, search, and see what a file affects.
- **Documentation**: a readable guide, written by AI from the real code. Download as Markdown.
- **Chat**: ask questions about the code. Answers cite the files they use.

All three use the same repository ID and the same Supabase database.

## How it fits together

```text
frontend/  Next.js app (port 3000)
    │  REST: /api/repositories/...
backend/   Express API (port 5000)
    ├─ ingest: ZIP upload or GitHub archive download
    ├─ graph: utils/dependencyAnalyzer.js (JS/TS imports, tsconfig aliases)
    ├─ analysis + RAG: src/lib (chunking, Voyage embeddings, Gemini)
    └─ Supabase Postgres + pgvector (Prisma)
```

When you add a project, the backend runs these steps in the background:

1. Download or unzip the project.
2. Save every text file to the database.
3. Build the dependency graph.
4. Split code into chunks and find file dependencies.
5. Create embeddings for chat search.

Graph, docs, and chat open after step 4. Chat gets better when step 5 finishes.

## Setup

You need Node.js 20+ and a Supabase project.

### 1. Supabase

1. Create a project.
2. Open **Database → Extensions**. Turn on `vector`.
3. Copy two connection strings from **Connect**:
   - Pooled (port 6543): this is `DATABASE_URL`. Add `?pgbouncer=true` at the end.
   - Direct (port 5432): this is `DIRECT_URL`.

### 2. Backend

```bash
cd backend
npm install --legacy-peer-deps
cp .env.example .env        # then fill in the values
npx prisma migrate deploy   # creates or updates the tables
npx prisma generate
npm run dev                 # http://localhost:5000
```

`--legacy-peer-deps` works around an npm bug with vitest's optional packages.

Check it works:

```bash
curl http://localhost:5000/api/health
# {"status":"ok","database":"ok"}
```

### 3. Frontend

```bash
cd frontend
npm install --legacy-peer-deps
npm run dev                 # http://localhost:3000
```

Set `NEXT_PUBLIC_API_URL` in `frontend/.env.local` if the backend is not on `localhost:5000`.

## Environment variables (backend/.env)

| Name | Required | What it is |
|---|---|---|
| `DATABASE_URL` | yes | Supabase pooled connection |
| `DIRECT_URL` | yes | Supabase direct connection, used by migrations |
| `GEMINI_API_KEY` | yes | Google AI key, used for docs, chat, and file flowcharts |
| `GEMINI_MODEL` | no | Gemini model name |
| `VOYAGE_API_KEY` | yes | Voyage AI key, used for embeddings |
| `VOYAGE_EMBEDDING_MODEL` | no | Default `voyage-code-4` |
| `VOYAGE_BATCH_SIZE`, `VOYAGE_BATCH_DELAY_MS` | no | Embedding speed. See below. |
| `PORT` | no | Default `5000` |
| `CORS_ORIGIN` | no | Frontend URL(s), comma-separated. Default `http://localhost:3000` |
| `GITHUB_TOKEN` | no | Raises GitHub download limits, and allows private repos |
| `MAX_REPO_ZIP_MB` | no | Upload size limit. Default `100` |

The server refuses to start if a required value is missing. It prints which ones.

**Embedding speed:** the defaults fit Voyage's free tier, which allows 3 requests per minute. A medium repo then takes about an hour to embed. If your Voyage account has billing enabled, set `VOYAGE_BATCH_SIZE=64` and `VOYAGE_BATCH_DELAY_MS=0`.

## API

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/repositories` | Add a project: multipart field `project` (.zip), or JSON `{ "url": "https://github.com/owner/repo" }`. Returns `202` and the repo. |
| GET | `/api/repositories` | List projects |
| GET | `/api/repositories/:id` | Status, analysis summary, graph and docs status |
| POST | `/api/repositories/:id/reanalyze` | Run the analysis again |
| DELETE | `/api/repositories/:id` | Delete the project and everything linked to it |
| GET | `/api/repositories/:id/graph` | `{ nodes, edges, stats, whereToStart }` |
| GET | `/api/repositories/:id/files/content?path=` | One file's content |
| POST | `/api/repositories/:id/files/flow` | AI flowchart of one file: `{ "path": "src/a.ts" }` |
| POST | `/api/repositories/:id/documentation` | Start generating docs (`202`) |
| GET | `/api/repositories/:id/documentation` | Docs status and Markdown |
| GET | `/api/repositories/:id/documentation/download` | Download the docs as `.md` |
| GET / POST / DELETE | `/api/repositories/:id/chat` | Chat history, ask (`{ "message": "..." }`), clear |
| GET | `/api/health` | Server and database check |

There are also insight endpoints, carried over from the old chatbot: `analysis`, `architecture`, `health`, `impact`, `search`, `entrypoints`, `dependencies`, and `chunks`.

Errors always look like `{ "error": "message" }`.

## Database

The tables come from Prisma (`backend/prisma/schema.prisma`). Everything hangs off `Repository`. Deleting a repository deletes all of these too:

- `RepoFile`: the project's files and their content
- `CodeChunk`: code pieces, with a `vector(1024)` embedding
- `FileDependency`: file-to-file imports, used by chat and insights
- `RepositoryAnalysis` and `AnalysisReport`: the analysis summary
- `RepositoryGraph`: the graph shown in the UI
- `Documentation`: the generated docs
- `ChatMessage`: the chat history

## Tests

```bash
cd backend
npm test        # vitest
npm run typecheck
```

⚠️ `phase2-persistence`, `phase4-rag-chat`, and `db-persistence` **write real rows** to `DATABASE_URL`. Point it at a test database first. One chat test calls Gemini for real, so it needs a working key.

## Known limits

- The graph covers `.js`, `.jsx`, `.ts`, and `.tsx` files. Other languages still get docs and chat.
- Graphs with more than 300 files show the 300 most connected ones. Use the folder filter or search to see the rest.
- Analysis runs inside the API process, so one server handles one analysis queue. Restarting the server marks unfinished runs as failed. Click Re-analyze to run them again.
- Health, impact, and architecture insights have APIs, but no screens yet.
