# Codesphere

> **AI-Powered Repository Intelligence for Understanding, Searching, and Analyzing Codebases**

Codesphere is a full-stack repository intelligence platform that ingests public GitHub repositories and equips developers to explore, analyze, search, and understand complex codebases. By unifying deterministic static analysis, dependency graph extraction, hybrid vector search (`pgvector` + lexical ranking), and a grounded Google Gemini RAG assistant, Codesphere transforms raw source repositories into structured, interactive developer intelligence.

---

## 1. Overview

Understanding an unfamiliar codebase is one of the most time-consuming challenges in software engineering. When onboarding to a new team, evaluating open-source libraries, or conducting architectural reviews, developers routinely face:

- **Cognitive Overload:** Navigating thousands of lines of code scattered across dozens of nested directories.
- **Hidden Dependencies:** Tracing import paths, indirect relationships, and architectural boundaries manually.
- **Search Limitations:** Keyword-only searching (`grep`/`Ctrl+F`) fails when queries are conceptual (e.g., *"Where is session validation handled?"*).
- **Change Risk Uncertainty:** Difficulty predicting what downstream modules, entry points, or test suites will break if a specific file or symbol is modified.
- **AI Hallucinations:** Generic AI tools often invent nonexistent files, hallucinate imports, or make claims unsupported by actual repository code.

Codesphere addresses these challenges by combining **deterministic repository evidence as the source of truth** with an **AI explanation and semantic retrieval layer**. Static analysis extracts verified dependency edges, metrics, and entry points, while Google Gemini and Voyage AI provide natural-language reasoning, semantic discovery, and grounded explanations with strict source citations.

---

## 2. Key Features

### Repository Ingestion & Persistence
- **Public GitHub Ingestion:** Clones public repositories via `simple-git` into isolated temporary storage, indexes file contents, and extracts core metadata.
- **File Classification:** Automatically categorizes files into functional roles: `SOURCE_CODE`, `TEST`, `CONFIG`, `DOCUMENTATION`, `MARKUP`, `STYLESHEET`, `DATABASE`, `SCRIPT`, `API_SCHEMA`, `BUILD_CONFIG`, and `DEPENDENCY_MANIFEST`.
- **Language Detection:** Identifies languages including TypeScript, JavaScript, Python, Java, C, C++, Go, Rust, PHP, HTML, CSS, and SQL.
- **Sensitive File Protection:** Detects private keys, certificates, environment configurations (`.env`, `.env.local`), and sensitive paths, automatically flagging and excluding them from dependency graphs and public views.
- **PostgreSQL Persistence:** Stores repositories, file trees, code chunks, dependencies, analysis reports, and chat histories in PostgreSQL via Prisma ORM.

### Deterministic Repository Analysis
- **AST & Heuristic Chunking:** Parses source files into logical chunks (functions, classes, interfaces, export declarations) with line-number boundaries (`startLine`, `endLine`).
- **Dependency Extraction:** Statically extracts `import`, `require`, `from ... import`, and `#include` statements for JavaScript, TypeScript, Python, Java, and C/C++, resolving module specifiers to real file paths.
- **Entry-Point Detection:** Detects framework and runtime entry points (e.g., Next.js pages/routes, `index.ts`, `main.py`, `public static void main`) with confidence scores.
- **Repository Architecture Metadata:** Computes file distributions, tech stacks, framework identifications, and module hierarchies without requiring an LLM.

### Semantic & Hybrid Code Search
- **Voyage AI Embeddings:** Generates 1024-dimensional code embeddings using `voyage-code-4` with exponential backoff and rate-limit handling.
- **pgvector Integration:** Stores embeddings in PostgreSQL using the `pgvector` extension with repository-scoped vector indexing.
- **Hybrid Retrieval:** Combines cosine vector similarity with lexical identifier scoring for precise retrieval of both conceptual queries and exact symbol names.

### AI Repository Chat (Grounded RAG)
- **Grounded Gemini Assistant:** Powered by Google Gemini (`gemini-3.5-flash-lite`), answering technical questions using strictly bounded repository context.
- **Inline Source Citations:** Cites exact file paths and line ranges (e.g., `[Source 1] src/auth/session.ts lines 12–45`).
- **Hallucination Mitigation:** Configured with strict refusal behavior: if repository context is insufficient, the model explicitly replies with *"I analyzed the repository context, but could not find sufficient implementation evidence to answer your question."*
- **Prompt-Injection Defense:** Untrusted repository code chunks and user queries are isolated within structured XML-delimited boundaries.
- **Chat History Persistence:** Retains full conversation threads linked to specific repositories across sessions.

### Interactive Architecture Intelligence
- **Architecture Graph:** Interactive SVG-based dependency graph supporting pan, zoom, drag, fit-to-screen, and node selection.
- **Sensible Aggregation:** Toggles between high-level **Module/Directory View** and granular **File-Level View** (capped at 300 visible nodes for optimal rendering performance).
- **12 Evidence-Based Groups:** Classifies modules into `application`, `components`, `services`, `api`, `database`, `configuration`, `utilities`, `tests`, `documentation`, `assets`, `scripts`, and `other`.
- **Cycle Detection:** Identifies circular dependency candidates using depth-first search (DFS) with recursion stack tracking.
- **Centrality Metrics:** Calculates total files, analyzed files, dependency edges, entry points, highly connected files, and isolated files.
- **Node & Edge Inspection:** Detailed side drawer displaying in-degree, out-degree, imports, dependents, symbols, and direct relationship explanations.
- **AI Architecture Summary:** Provides an evidence-grounded architectural summary derived from structural metrics.

### Code Health & Risk Intelligence
- **Measurable Static Metrics:** Calculates real, file-level metrics including line counts, file size, import/export counts, function/class declarations, and TODO/FIXME concentrations.
- **No Fake Percentages:** Displays factual counts and repository medians; does not generate arbitrary "quality scores" or fake coverage numbers.
- **Hotspot Detection:** Flags maintenance hotspots using neutral, evidence-backed terminology: *"High dependency concentration"*, *"Large file"*, *"High connectivity"*, and *"Potential maintenance hotspot"*.
- **Detected Test-File Signals:** Identifies test files by path and naming patterns (`*.test.*`, `*.spec.*`, `__tests__/`), explicitly labeled as signals rather than runtime test coverage.
- **Documentation Signals:** Evaluates README presence, documentation file counts, and README byte size.
- **Sanitized Security Checks:** Flags obvious hardcoded credentials or sensitive files while redacting secret values in UI views (`AKIA...CDEF`, `ghp_...XXXX`).

### Change Impact Analyzer
- **Target Selection:** Analyzes impact by selecting a target file path, symbol name, or natural-language change query.
- **Configurable BFS Traversal:** Traverses upstream dependents with configurable depth (Depth 1, 2, or 3) and cycle guards to prevent infinite loops.
- **Dependency vs. Semantic Impact:** Distinctly separates **structural graph impact** (direct dependents, transitive dependents, affected entry points) from **semantically related code** (documentation, UI components, tests retrieved via vector similarity).
- **Related Test Detection:** Identifies test files directly importing or associated with the target module.
- **Deterministic Risk Scoring:** Computes risk levels (`low`, `medium`, `high`) using rule-based metrics (fan-in, fan-out, transitive count, entry-point involvement).
- **AI Change Analysis:** Explains implementation consequences using only structured graph and semantic evidence.

---

## 3. How It Works

```mermaid
flowchart TD
    A[Public GitHub Repository] --> B[Repository Ingestion / simple-git]
    B --> C[File Classification & Sensitive File Filtering]
    C --> D[AST Chunking & Dependency Extraction]
    D --> E[PostgreSQL Persistence / Prisma]
    
    E --> F[Voyage AI Embeddings voyage-code-4]
    F --> G[(pgvector Vector Store)]
    
    E --> H[Architecture Intelligence]
    E --> I[Code Health & Risk Engine]
    E --> J[Change Impact Analyzer]
    
    H --> K[Interactive Architecture Graph]
    I --> L[Code Health Dashboard]
    J --> M[Change Cascade Visualizer]
    
    G & E --> N[Hybrid Semantic + Lexical Retrieval]
    N --> O[Bounded Context Assembly]
    O --> P[Google Gemini RAG Pipeline]
    P --> Q[Grounded AI Chat with Citations]
```

---

## 4. System Architecture

Codesphere is built as a unified Next.js full-stack application:

- **Frontend Layer:** Built with Next.js 14 (App Router), React 18, TypeScript, and Tailwind CSS. Employs Lucide React icons, custom SVG graph visualization, and responsive tabbed navigation.
- **Backend API Layer:** Next.js Route Handlers (`src/app/api/repos/*`) providing repository-scoped, validated REST endpoints for ingestion, architecture, health, impact, search, and chat.
- **Data & Persistence Layer:** PostgreSQL with the `pgvector` extension, managed via Prisma ORM (`prisma/schema.prisma`) with connection pooling (pgBouncer) and direct migration connections.
- **Static Analysis Engine:** Custom TypeScript analysis modules utilizing regular expressions, AST heuristics, and path-resolution logic for dependency extraction, entry-point detection, and metric calculation.
- **Embeddings & Vector Search:** Voyage AI client with exponential-backoff retry logic and SQL cosine similarity queries (`<=>`) via pgvector.
- **AI Explanation Layer:** Google Generative AI SDK interfacing with `gemini-3.5-flash-lite`, using structured system instructions that enforce strict grounding and source attribution.

---

## 5. Tech Stack Table

| Layer | Technology | Version | Purpose |
| :--- | :--- | :--- | :--- |
| **Framework** | [Next.js](https://nextjs.org/) | `^14.2.18` | Full-stack React framework, routing, and API route handlers |
| **UI Library** | [React](https://react.dev/) | `^18.3.1` | Component-based user interface |
| **Language** | [TypeScript](https://www.typescriptlang.org/) | `^5.6.3` | End-to-end type safety and static checking |
| **Styling** | [Tailwind CSS](https://tailwindcss.com/) | `^3.4.15` | Utility-first CSS framework for modern dark-mode UI |
| **ORM** | [Prisma](https://www.prisma.io/) | `^5.22.0` | Type-safe database schema modeling, queries, and migrations |
| **Database** | [PostgreSQL](https://www.postgresql.org/) / [Supabase](https://supabase.com/) | `17.x` | Relational storage for repos, files, chunks, analysis, and chats |
| **Vector Extension** | [pgvector](https://github.com/pgvector/pgvector) | `vector(1024)` | High-performance vector similarity search in PostgreSQL |
| **Embeddings** | [Voyage AI](https://www.voyageai.com/) | `voyage-code-4` | 1024-dimensional code embeddings with retrieval optimization |
| **LLM Provider** | [Google Gemini](https://ai.google.dev/) | `gemini-3.5-flash-lite` | Grounded RAG reasoning, summaries, and impact explanations |
| **Repository Ingestion** | [simple-git](https://github.com/steveukx/simple-git) | `^3.27.0` | Git cloning and shallow repository operations |
| **Markdown Rendering** | [react-markdown](https://github.com/remarkjs/react-markdown) | `^10.1.0` | Rendering AI responses with GitHub-flavored markdown |
| **Testing** | [Vitest](https://vitest.dev/) | `^4.1.11` | Unit, integration, and end-to-end test runner |

---

## 6. Project Structure

```
Codesphere/
├── prisma/
│   ├── schema.prisma              # Database schema (Repository, RepoFile, CodeChunk, etc.)
│   └── migrations/                # Versioned PostgreSQL migrations
├── src/
│   ├── app/
│   │   ├── api/repos/             # Next.js API route handlers
│   │   │   ├── route.ts           # POST /api/repos (Ingest), GET /api/repos (List)
│   │   │   └── [id]/
│   │   │       ├── route.ts       # GET /api/repos/[id] (Repository details)
│   │   │       ├── analysis/      # GET /api/repos/[id]/analysis
│   │   │       ├── architecture/  # GET /api/repos/[id]/architecture & /summary
│   │   │       ├── chat/          # POST /api/repos/[id]/chat (RAG chat endpoint)
│   │   │       ├── health/        # GET /api/repos/[id]/health & /summary
│   │   │       ├── impact/        # GET /api/repos/[id]/impact & /analyze
│   │   │       └── search/        # GET /api/repos/[id]/search (Hybrid vector search)
│   │   ├── layout.tsx             # Root application layout
│   │   ├── page.tsx               # Main workspace entry point & tab orchestrator
│   │   └── globals.css            # Tailwind & custom scrollbar styles
│   ├── components/
│   │   ├── AnalysisPanel.tsx      # High-level repo summary & file category stats
│   │   ├── ArchitectureWorkspace.tsx # Interactive SVG dependency graph & group inspector
│   │   ├── ChatWorkspace.tsx      # RAG chatbot with citations and confidence flags
│   │   ├── FileTree.tsx           # Interactive file explorer and code viewer
│   │   ├── Header.tsx             # Global application header
│   │   ├── HealthWorkspace.tsx    # Code health dashboard, hotspots, and metrics table
│   │   ├── ImpactWorkspace.tsx    # Change impact analyzer & cascade visualizer
│   │   ├── SemanticSearch.tsx     # Hybrid vector/lexical search interface
│   │   ├── Sidebar.tsx            # Navigation sidebar (8 workspaces)
│   │   └── TechStackBadges.tsx    # Detected framework and language badges
│   └── lib/
│       ├── ai/                    # Gemini configuration, RAG pipeline, and prompts
│       ├── analysis/              # File classifier, language detector, chunker, entrypoints
│       ├── architecture/          # Graph builder, cycle detector, 12-group classifier
│       ├── embeddings/            # Voyage AI client, pgvector queries, lexical scorer
│       ├── git/                   # simple-git ingestion and stack detection
│       ├── health/                # Code health calculator, hotspot detection, secret redactor
│       ├── impact/                # BFS traversal, transitive dependency analyzer, risk scorer
│       └── db.ts                  # Global PrismaClient singleton
├── tests/                         # Comprehensive Vitest test suite (13 test files, 82 tests)
├── .env.example                   # Template for required environment variables
├── package.json                   # Dependencies and npm scripts
├── tailwind.config.ts             # Tailwind CSS design system tokens
├── tsconfig.json                  # TypeScript compiler configuration
└── vitest.config.ts               # Vitest configuration with alias resolution
```

---

## 7. Installation & Setup

### Prerequisites
- **Node.js:** `v20.x` or `v22.x` (LTS recommended)
- **npm:** `v10.x` or higher
- **Git:** Installed and available on system `PATH`
- **PostgreSQL Database:** A PostgreSQL 15+ instance with the `vector` extension enabled (e.g., [Supabase](https://supabase.com/)).

### 1. Clone the Repository
```bash
git clone <repository-url>
cd Codesphere
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Configure Environment Variables
Copy the example environment file:
```bash
cp .env.example .env
```

Edit `.env` and provide your credentials:
```env
# PostgreSQL connection string with pooling (e.g. Supabase port 6543)
DATABASE_URL="postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres?pgbouncer=true"

# Direct PostgreSQL connection string for migrations (e.g. Supabase port 5432)
DIRECT_URL="postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres"

# Voyage AI API Key for code embeddings
VOYAGE_API_KEY="pa-..."
VOYAGE_EMBEDDING_MODEL="voyage-code-4"

# Google Gemini API Key for grounded chat and analysis
GEMINI_API_KEY="AIzaSy..."
GEMINI_MODEL="gemini-3.5-flash-lite"
```

### 4. Setup the Database
Generate the Prisma client and apply database migrations:
```bash
npx prisma generate
npx prisma migrate deploy
```

*(Optional: To inspect database records visually, run `npx prisma studio`)*

### 5. Run the Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

### 6. Build for Production
To validate types and compile the optimized production bundle:
```bash
npx tsc --noEmit
npm run build
```

---

## 8. Usage Guide

1. **Ingest a Repository:**
   - On the landing page, paste any public GitHub repository URL (e.g., `https://github.com/facebook/react` or `https://github.com/pallets/click`).
   - Click **Analyze**. Codesphere will clone the repository, classify all files, detect languages, extract dependencies, and persist the records.
2. **Overview & Analysis:**
   - Inspect detected technologies, total files, lines of code, and file category distributions.
   - Trigger embedding generation for semantic search if not automatically started.
3. **Browse Files:**
   - Navigate the interactive file explorer to inspect file contents, line numbers, and file metadata.
4. **Semantic Search:**
   - Search by concept (e.g., *"error boundary handling"* or *"database connection pool"*).
   - View similarity scores and jump directly to relevant code lines.
5. **Explore Architecture:**
   - Switch between **Module View** and **File View**.
   - Filter by architecture group (e.g., `services`, `api`, `components`).
   - Click any node to inspect imports, dependents, and entry-point status.
   - Click any edge to review the import specifier.
   - Click **Generate Summary** for an evidence-grounded AI architectural overview.
6. **Inspect Code Health & Risks:**
   - Review repository-wide maintainability, documentation, testing, and security signals.
   - Check the **Hotspots** grid for files with high dependency concentration or large line counts.
   - Sort and search the file metrics table by lines, imports, or dependents.
7. **Analyze Change Impact:**
   - Select a target file, symbol, or type a natural-language query (e.g., *"What happens if I change the auth session handler?"*).
   - Choose traversal depth (1, 2, or 3).
   - Inspect the cascade: **Target $\to$ Direct Dependents $\to$ Transitive Dependents $\to$ Related Tests $\to$ Semantic Matches**.
   - Review the deterministic risk level (`low`, `medium`, `high`) and AI implementation explanation.
8. **AI Repository Chat:**
   - Ask technical questions (e.g., *"How does routing work in this project?"*).
   - Inspect inline source citations and review confidence indicators.

---

## 9. AI & RAG Architecture

Codesphere’s RAG (Retrieval-Augmented Generation) pipeline ensures that natural-language explanations remain strictly faithful to actual repository code:

1. **Query Processing:** When a user submits a question in the AI Chat, the query is embedded using Voyage AI's `voyage-code-4` (`input_type="query"`).
2. **Repository-Scoped Search:** Vector similarity (`<=>` cosine distance) is queried via `pgvector`, strictly scoped by `repositoryId`.
3. **Lexical Re-Ranking:** Retrieved chunks are scored against query tokens for exact identifier matches, producing a combined hybrid score.
4. **Context Assembly:** If the user query indicates an architectural, health, or impact question, structured evidence blocks (e.g., detected entry points, high-connectivity hotspots, or dependent cascades) are injected alongside retrieved code chunks.
5. **Strict Grounding Instructions:** The assembled prompt is passed to Google Gemini with instructions to ignore prompt injections, cite file paths and line ranges, and refuse to answer if evidence is insufficient.
6. **Confidence & Citations:** If similarity scores fall below threshold (`0.35`), the response is flagged as low confidence. Every cited source includes start and end line ranges.

---

## 10. Security & Repository Isolation

Codesphere implements multi-layered security controls designed for repository analysis:

- **Strict Repository Scoping:** All database queries across all API endpoints enforce `where: { repositoryId: params.id }`, guaranteeing complete isolation between different indexed repositories.
- **Sensitive File Filtering:** Files matching sensitive patterns (`.env*`, `*.pem`, `*.key`, `id_rsa*`, credentials) are marked `isSensitive: true` and excluded from public dependency graphs and embeddings.
- **Credential Redaction:** Detected credential patterns (e.g., AWS access keys, GitHub personal access tokens, OpenAI/Voyage/Gemini API keys) are masked in UI tables and reports (e.g., `AKIA...CDEF`, `ghp_...XXXX`).
- **Prompt-Injection Defense:** Repository file contents are treated as untrusted data and wrapped in bounded XML tags (`<chunk>...</chunk>`) with explicit instructions forbidding the LLM from executing commands found within source files.
- **Environment Isolation:** API keys and database credentials reside exclusively in server-side environment variables and are never bundled into client-facing JavaScript.

---

## 11. Testing & Validation

Codesphere is thoroughly tested with automated unit, integration, and real-repository end-to-end tests:

### Automated Test Suite (Vitest)
```
Test Files: 13 passed (13 total)
Tests:      82 passed (82 total)
Duration:   ~40s
```

### Verified Test Suites:
- `tests/architecture.test.ts` (7 tests): Module aggregation, file drilldown, 12-group classification, cycle detection, isolated nodes.
- `tests/health.test.ts` (6 tests): Line/symbol metrics, median calculations, hotspot detection, secret redaction, test-file detection.
- `tests/impact.test.ts` (7 tests): Direct dependents, transitive BFS traversal, depth limits, cycle handling, risk scoring.
- `tests/ai-features.test.ts` (5 tests): Architecture summaries, health summaries, change impact explanations, refusal behavior.
- `tests/api-features.test.ts` (6 tests): Route handlers, parameter validation, repository scoping, 404/500 error handling.
- `tests/real-repos.test.ts` (3 tests): End-to-end validation on real GitHub repositories:
  - Small JavaScript: `dcousens/is-sorted`
  - Medium TypeScript: `sindresorhus/p-limit`
  - Multi-language: `octocat/Spoon-Knife`
- `tests/db-persistence.test.ts` (3 tests): Repository & file persistence, duplicate ingestion handling, ID retrieval.
- `tests/phase2-persistence.test.ts` (2 tests): Chunk & analysis persistence, re-indexing replacement, missing analysis handling.
- `tests/phase3-embeddings.test.ts` (9 tests): Voyage AI embeddings, dimension checks, rate-limit retries, pgvector formatting.
- `tests/phase4-rag-chat.test.ts` (8 tests): Context formatting, grounded refusal, chat history persistence, fallback handling.
- `tests/phase2-analysis.test.ts` (12 tests): Language detection, AST chunking, import extraction, entry-point detection.
- `tests/ingest.test.ts` (4 tests): Repository cloning, file tree walking, temp directory cleanup.
- `test/rag.test.ts` (10 tests): RAG query mocking, Voyage 503 handling, Gemini safety blocks, status mappings.

### Running Tests
```bash
# Run all tests
npm test

# Run feature-specific tests
npx vitest run tests/architecture.test.ts tests/health.test.ts tests/impact.test.ts
```

---

## 12. Known Limitations

- **Static-Only Import Resolution:** Dynamic imports (e.g., `import(variable)` or dynamic reflection in Java/Python) cannot be fully resolved statically and are omitted from dependency edges.
- **Language AST Scope:** Deep symbol extraction (functions, classes, interfaces) is currently implemented for TypeScript, JavaScript, Python, Java, and C/C++. Other languages utilize fallback regex and directory chunking.
- **No Runtime Code Execution:** Codesphere does not execute repository code or run test suites. Testing signals are derived purely from static file analysis (`*.test.*`, `__tests__/`), not runtime code coverage tools like Istanbul or JaCoCo.
- **Graph Node Cap:** In file-level architecture views, graph rendering is capped at 300 visible nodes to preserve smooth 60fps SVG rendering in browser viewports.
- **Single-User Workspace:** Codesphere is designed as a developer intelligence platform without multi-tenant authentication or team role-based access control.

---

## 13. Future Work

- **Expanded Language Support:** Native AST parsers for Go, Rust, Ruby, and C#.
- **Git History & Churn Analysis:** Incorporating commit velocity, author heatmaps, and historical defect density into Code Health.
- **Pull Request Impact Preview:** GitHub Action / Webhook integration to analyze change impact on incoming pull requests.
- **Canvas / WebGL Graph Rendering:** Utilizing WebGL (e.g., Sigma.js / Pixi.js) to render large-scale graphs with 10,000+ nodes.

---

## 14. Contributing

Contributions are welcome. To contribute:

1. Fork the repository and create a feature branch (`git checkout -b feature/your-feature`).
2. Make your changes in accordance with the existing code style.
3. Ensure all tests pass:
   ```bash
   npm test
   npx tsc --noEmit
   npm run build
   ```
4. Commit your changes with clear, conventional commit messages.
5. Push to your branch and open a Pull Request.

---

## 15. License

No license has currently been specified. All rights reserved.

---

## 16. Acknowledgements

- [Next.js](https://nextjs.org/) by Vercel for the web framework and API routes.
- [Prisma](https://www.prisma.io/) for type-safe database access.
- [Supabase](https://supabase.com/) for PostgreSQL hosting and database connection pooling.
- [pgvector](https://github.com/pgvector/pgvector) for vector similarity search.
- [Voyage AI](https://www.voyageai.com/) for specialized code embeddings (`voyage-code-4`).
- [Google Gemini](https://ai.google.dev/) for grounded language model reasoning and RAG.
- [Lucide Icons](https://lucide.dev/) for UI iconography.
