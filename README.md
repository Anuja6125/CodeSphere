# Major Project — Trace (Project Inspector)

Upload a project ZIP, or paste a GitHub repository URL. The backend scans the JS/JSX/TS/TSX files, resolves relative imports, and returns a dependency graph. The frontend shows it as an interactive graph with stats.

```
Major Project/
├── backend/    Express API (port 5000)  — unchanged analysis logic
└── frontend/   Next.js dashboard (port 3000)
```

## Run the backend

```bash
cd backend
npm install
npm run dev        # nodemon, or: npm start
```

Runs on `http://localhost:5000`. Endpoints:

- `POST /upload` — multipart form, field name `project`, a `.zip` file
- `POST /analyze-repo` — JSON `{ "url": "https://github.com/owner/repo" }`. Downloads the repo's ZIP from GitHub and runs the same analysis. Also accepts `owner/repo` and `.../tree/<branch>`.
- `GET /projects/:projectId` — re-read a previous analysis

### Backend environment variables (all optional)

| Variable | Default | Purpose |
| --- | --- | --- |
| `GITHUB_TOKEN` | — | Personal access token. Needed for private repos. Also lifts GitHub's anonymous rate limit. |
| `GITHUB_BASE_URL` | `https://github.com` | Change for GitHub Enterprise, or point at a local mock for tests. |
| `MAX_REPO_ZIP_MB` | `100` | Refuse archives bigger than this. |
| `REPO_DOWNLOAD_TIMEOUT_MS` | `60000` | Give up on the download after this long. |

Set them in the shell before `npm run dev`, e.g. `GITHUB_TOKEN=ghp_xxx npm run dev`.

## Run the frontend

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:3000`.

### Environment variable

The frontend reads the backend URL from one place (`frontend/lib/api.ts`):

```
NEXT_PUBLIC_API_URL=http://localhost:5000
```

It defaults to `http://localhost:5000`. To change it, copy `frontend/.env.example` to `frontend/.env.local` and edit. Restart `npm run dev` after changing it.

## How it works

1. You drop or pick a `.zip` in the dashboard, **or** paste a GitHub URL and click "Analyze repo".
2. `lib/api.ts` → `uploadProject(file)` sends the ZIP as `FormData` (`project` field) to `POST /upload`.
   For a URL, `analyzeGithubRepo(url)` posts JSON to `POST /analyze-repo`. The backend (`utils/githubRepo.js`) parses the URL, downloads `https://github.com/owner/repo/archive/<ref>.zip`, and saves it under `uploads/<projectId>/` exactly like an uploaded file. No `git` install is needed.
3. From here both paths are identical. The backend extracts the ZIP, scans files, resolves relative imports, builds `stats` and `whereToStart`, and returns JSON. (GitHub archives have a single top folder like `repo-main/`; the existing `resolveProjectRoot` already strips it.)
4. `app/page.tsx` stores the response in React state. The stat cards read `stats.fileCount`, `stats.dependencyCount`, `stats.entryFiles`, and the ZIP's real size.
5. `lib/graph.ts` turns `dependencies` (`{ source, target }`) into nodes and edges. Every unique path is a node; every dependency is an edge. Positions come from `@dagrejs/dagre` (left-to-right layers), so any project size works.
6. `components/dependency-graph.tsx` renders that as SVG with zoom, pan (drag), label toggle, node selection, reset, and the inspector panel.

### Node types

Derived from the backend data and the file path, in this order:

- `config` — file name looks like a config (`*.config.*`, `vite.*`, `next.*`, `tailwind.*`, `eslint*`, …)
- `entry` — nothing imports it, but it imports others (from the real `fileGraph`)
- `component` — `.jsx` / `.tsx`, or lives under a `components/` folder
- `utility` — everything else
