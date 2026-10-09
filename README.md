# CodeSphere

CodeSphere is an intelligent codebase analysis and exploration platform. Upload any software project (ZIP archive or GitHub repository URL) to automatically generate:

- **Interactive Architecture Graph**: Visual dependency graphs showing import relationships, entry points, shared components, and impact analysis.
- **Automated AI Documentation**: Comprehensive architectural documentation synthesized from your actual codebase. Exportable as Markdown.
- **Context-Aware AI Chatbot**: High-precision RAG chatbot answering queries using chunked code embeddings with file citations.
- **Role-Based Access Control (RBAC)**: Backend-enforced authorization with two strict roles: `MANAGER` and `EMPLOYEE`.
- **Project-Level Access Control & Sharing**: Fine-grained project permissions (`VIEWER`, `EDITOR`, `MANAGER`) with zero-trust data isolation.
- **User-Specific Project Storage & History**: Full audit trail of repository lifecycle events, analysis status, and user-scoped private conversations.

---

## Architecture Overview

```text
frontend/  Next.js 16 app (port 3000)
    │  REST: /api/auth/*, /api/users/*, /api/repositories/*
backend/   Express + TypeScript API (port 5000)
    ├─ auth: Email OTP passwordless login with HMAC-SHA256 & HTTP-only JWT cookies
    ├─ rbac: Centralized requireRole & requireProjectAccess authorization middleware
    ├─ ingest: ZIP archive extraction or GitHub clone with automated disk cleanup
    ├─ graph: AST dependency analyzer with module graph construction
    ├─ analysis + RAG: Code chunking, Voyage AI embeddings, and Google Gemini
    └─ PostgreSQL + pgvector via Prisma ORM
```

---

## Roles and Access Control (RBAC)

CodeSphere implements backend-enforced RBAC with two roles:

### 1. `EMPLOYEE` (Default Role)
- Automatically assigned to all newly registered users.
- Access own account, profile, and projects.
- Create and manage own projects.
- View project history, graph, docs, and chat for own projects.
- Access projects explicitly shared with them (subject to project permissions).
- **Restrictions**: Cannot view the global user directory, change roles, or access other users' private projects. Cannot promote own role through any API.

### 2. `MANAGER`
- View team user directory (`GET /api/users`) and system analytics (`GET /api/users/stats`).
- Promote or demote employee roles with authorization checks (`PATCH /api/users/:id/role`).
- Access dedicated Manager Dashboard views and administrative metrics.
- **Strict Data Isolation**: Managers do **not** automatically bypass private project boundaries. A manager can only access a project if they created it or if the owner explicitly shared it with them.
- **Self-Modification Lockout**: Managers can never alter their own role via public APIs.

---

## Project Permissions & Collaboration

Projects are linked to their creator via `ownerId` in PostgreSQL. Projects can be explicitly shared with team members using the database model `ProjectAccess`:

| Project Role | Permissions |
|---|---|
| **VIEWER** | View project overview, architecture graph, documentation, history, and chat. |
| **EDITOR** | All Viewer permissions + re-analyze repository, generate documentation. |
| **MANAGER** | All Editor permissions + manage project sharing / permissions, delete project. |
| **OWNER** | Creator of the project. Full management, sharing, and deletion rights. |

---

## Setup & Installation

### Prerequisites
- Node.js 20+
- PostgreSQL database with `vector` extension enabled (e.g. Supabase, AWS RDS, Neon)
- Google Gemini API key
- Voyage AI API key

### 1. Database Configuration (Supabase)
1. In your Supabase project, go to **Database → Extensions** and enable `vector`.
2. Retrieve connection strings from **Project Settings → Database**:
   - Pooled connection (port 6543): set as `DATABASE_URL` (append `?pgbouncer=true`).
   - Direct connection (port 5432): set as `DIRECT_URL`.

### 2. Backend Setup
```bash
cd backend
npm install --legacy-peer-deps
cp .env.example .env        # Configure your environment variables
npx prisma migrate deploy   # Apply migrations
npx prisma generate         # Generate Prisma client
npm run dev                 # Starts on http://localhost:5000
```

Verify backend health:
```bash
curl http://localhost:5000/api/health
# {"status":"ok","database":"ok"}
```

### 3. Frontend Setup
```bash
cd frontend
npm install --legacy-peer-deps
npm run dev                 # Starts on http://localhost:3000
```

---

## Environment Variables (`backend/.env`)

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL pooled connection string (`?pgbouncer=true`) |
| `DIRECT_URL` | Yes | PostgreSQL direct connection string for migrations |
| `GEMINI_API_KEY` | Yes | Google Gemini API key for documentation, chat, and flowcharts |
| `GEMINI_MODEL` | No | Default `gemini-2.5-flash` |
| `VOYAGE_API_KEY` | Yes | Voyage AI key for semantic embeddings |
| `VOYAGE_EMBEDDING_MODEL` | No | Default `voyage-code-4` |
| `PORT` | No | Backend port (default `5000`) |
| `CORS_ORIGIN` | No | Allowed frontend origin (default `http://localhost:3000`) |
| `JWT_SECRET` | Yes | Secret key used to sign session JWTs (min 32 characters) |
| `OTP_SECRET` | Yes | Salt secret used to generate HMAC-SHA256 OTP hashes |
| `SOURCE_EMAIL` | Yes | Sender email address (`codesphere.analytics@gmail.com`) |
| `EMAIL_FROM` | No | Formatted sender name (`"CodeSphere <codesphere.analytics@gmail.com>"`) |
| `SMTP_HOST` | No | SMTP host (`smtp.gmail.com`) |
| `SMTP_PORT` | No | SMTP port (`587`) |
| `SMTP_SECURE` | No | Set to `true` for port 465, `false` for port 587 |
| `SMTP_USER` | No | SMTP username (`codesphere.analytics@gmail.com`) |
| `SMTP_PASS` | No | 16-character Google App Password or SMTP password |
| `BOOTSTRAP_MANAGER_EMAIL` | No | Email address automatically promoted to `MANAGER` on deployment boot |

---

## Email Provider Setup (Gmail SMTP)

To enable live OTP delivery through Gmail:
1. Enable **2-Step Verification** on your Google Account (`codesphere.analytics@gmail.com`).
2. Go to [Google App Passwords](https://myaccount.google.com/apppasswords).
3. Create a new App Password named `CodeSphere`.
4. Copy the generated 16-character string into `backend/.env`:
   ```env
   SOURCE_EMAIL=codesphere.analytics@gmail.com
   EMAIL_FROM="CodeSphere <codesphere.analytics@gmail.com>"
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_SECURE=false
   SMTP_USER=codesphere.analytics@gmail.com
   SMTP_PASS=abcdefghijklmnop
   ```
> [!NOTE]
> If `SMTP_PASS` is omitted in development, OTP codes are logged to the console for testing.

---

## Initial Manager Account Setup

CodeSphere never auto-promotes the first user to register. Use either of these server-side methods to bootstrap the first `MANAGER`:

### Method 1: CLI Bootstrap Command
```bash
cd backend
npm run bootstrap:manager -- --email=admin@yourdomain.com
```

### Method 2: Deployment Configuration
Set `BOOTSTRAP_MANAGER_EMAIL` in `backend/.env`:
```env
BOOTSTRAP_MANAGER_EMAIL=admin@yourdomain.com
```
When the backend starts, this user is promoted to `MANAGER`.

---

## Database Migrations

Apply migrations to PostgreSQL using Prisma:
```bash
cd backend
npx prisma migrate deploy
npx prisma generate
```

### Migration History:
1. `20261009200000_add_rbac_and_project_access`:
   - Adds `UserRole` enum (`MANAGER`, `EMPLOYEE`).
   - Adds `ProjectRole` enum (`VIEWER`, `EDITOR`, `MANAGER`).
   - Adds `ProjectAccess` model.
2. `20261009210000_project_storage_and_history`:
   - Adds `ownerId` to `Repository` linking project creator.
   - Adds `ProjectActivity` table for lifecycle timeline logging.
   - Scopes `ChatMessage` table by `userId`.
   - Backfills initial creation records for existing projects.

---

## API Reference

### Authentication
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/auth/send-otp` | Request a 6-digit OTP code to email. Single-use, rate-limited. |
| POST | `/api/auth/verify-otp` | Verify OTP, authenticate, and set HTTP-only JWT cookie. |
| GET | `/api/auth/me` | Retrieve authenticated user profile and role. |
| POST | `/api/auth/logout` | Clear session cookie and invalidate session. |

### User Management (Manager Only)
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/users` | List team members, roles, and repository counts. |
| GET | `/api/users/stats` | System overview stats (total users, managers, employees, projects). |
| PATCH | `/api/users/:id/role` | Promote/demote employee role. Cannot modify own role. |

### Repository & Project Management
| Method | Endpoint | Required Role | Description |
|---|---|---|---|
| POST | `/api/repositories` | Authenticated | Create repository from ZIP upload or GitHub URL. Sets `ownerId`. |
| GET | `/api/repositories` | Authenticated | List accessible projects (owned, shared, and demo repos). |
| GET | `/api/repositories/:id` | VIEWER | Project details, status, and analysis summary. |
| GET | `/api/repositories/:id/history` | VIEWER | Comprehensive project history and activity timeline. |
| POST | `/api/repositories/:id/reanalyze` | EDITOR | Re-run repository analysis. |
| DELETE | `/api/repositories/:id` | MANAGER | Delete repository and cascade all data and disk files. |
| GET | `/api/repositories/:id/access` | VIEWER | List team members with access to the project. |
| POST | `/api/repositories/:id/access` | MANAGER | Share project with a team member by email. |
| DELETE | `/api/repositories/:id/access/:userId` | MANAGER | Revoke project access from a user. |

### Graph, Documentation & AI Chat
| Method | Endpoint | Required Role | Description |
|---|---|---|---|
| GET | `/api/repositories/:id/graph` | VIEWER | Dependency graph nodes, edges, entry points. |
| GET | `/api/repositories/:id/files/content` | VIEWER | File content viewer. |
| POST | `/api/repositories/:id/files/flow` | VIEWER | Generate file flowchart. |
| POST | `/api/repositories/:id/documentation` | EDITOR | Trigger automated AI documentation generation. |
| GET | `/api/repositories/:id/documentation` | VIEWER | Retrieve documentation content and status. |
| GET | `/api/repositories/:id/documentation/download` | VIEWER | Download documentation as Markdown. |
| GET | `/api/repositories/:id/chat` | VIEWER | Retrieve user-scoped chat history. |
| POST | `/api/repositories/:id/chat` | VIEWER | Ask code questions via RAG with citations. |
| DELETE | `/api/repositories/:id/chat` | EDITOR | Clear chat history. |

---

## Security Protections

1. **Passwordless Security**: Single-use 6-digit OTP codes stored strictly as HMAC-SHA256 hashes. Raw OTPs are never exposed in API responses or logs.
2. **Brute-Force & Rate Limiting**: 
   - 60-second cooldown between OTP requests.
   - Max 5 requests per 15-minute window.
   - Max 5 verification attempts per code before automatic invalidation.
   - 5-minute code expiration.
3. **Session Hardening**: Sessions use signed JWTs with `httpOnly`, `sameSite`, and `secure` (production) cookie flags.
4. **Self-Promotion Guard**: API strictly blocks users from modifying their own role (`403 CANNOT_MODIFY_OWN_ROLE`).
5. **Zero-Trust Project Isolation**: Changing IDs in API requests fails with `403 Forbidden` unless the user is the project owner or has explicit `ProjectAccess`. Managers cannot bypass unshared private projects.
6. **Cascading Purges**: Repository deletion purges all database records across 9 tables with `onDelete: Cascade` and cleans extraction folders on disk to prevent orphaned files.

---

## Testing

Run unit, integration, and security verification suites:

```bash
cd backend

# Run Auth, RBAC, and Project History test suites
npx vitest run tests/project-storage-history.test.ts tests/rbac.test.ts tests/auth.test.ts

# Run Core Ingestion & Analysis test suites
npx vitest run tests/real-repos.test.ts tests/db-persistence.test.ts tests/architecture.test.ts tests/health.test.ts tests/impact.test.ts

# Run End-to-End Security & Workflow Audit
npx tsx scripts/run-security-and-workflow-audit.ts
```

Frontend production build check:
```bash
cd frontend
npm run build
```
