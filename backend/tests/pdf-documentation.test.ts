import { describe, it, expect, vi, beforeEach } from "vitest";
import { generateDocumentationPdf } from "../src/services/pdf";
import { downloadDocumentation } from "../src/controllers/documentation";
import { db } from "../src/lib/db";
import type { Request, Response } from "express";

describe("Documentation PDF Generation & Download Tests", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("1. generates a valid PDF buffer from markdown text", async () => {
    const markdown = `# Sample Project

## Overview
This is a test project overview with **bold** text and \`code\`.

## Tech Stack
| Category | Details |
| :--- | :--- |
| Framework | Express |
| Database | PostgreSQL |

## Code
\`\`\`typescript
console.log("Hello from PDF");
\`\`\`

- Bullet item 1
- Bullet item 2
`;

    const pdfBuffer = await generateDocumentationPdf(markdown, {
      repoName: "test-repo",
      title: "Test Repo Documentation",
      updatedAt: new Date().toISOString(),
    });

    expect(pdfBuffer).toBeInstanceOf(Buffer);
    expect(pdfBuffer.length).toBeGreaterThan(1000);
    // PDF magic bytes header check
    const header = pdfBuffer.slice(0, 5).toString("utf-8");
    expect(header).toBe("%PDF-");
  });

  it("2. downloadDocumentation controller returns PDF by default with correct headers", async () => {
    vi.spyOn(db.documentation, "findUnique").mockResolvedValue({
      id: "doc-1",
      repositoryId: "repo-123",
      status: "READY",
      content: "# My Repo\n\n## Overview\nTest content",
      model: "test-model",
      error: null,
      updatedAt: new Date(),
      repository: { name: "my-repo" },
    } as any);

    const req = {
      params: { id: "repo-123" },
      query: {},
    } as unknown as Request;

    const headers: Record<string, string> = {};
    let sentContentType = "";
    let sentBody: any = null;

    const res = {
      setHeader: vi.fn((k: string, v: string) => {
        headers[k] = v;
      }),
      type: vi.fn((t: string) => {
        sentContentType = t;
        return res;
      }),
      send: vi.fn((body: any) => {
        sentBody = body;
        return res;
      }),
    } as unknown as Response;

    await downloadDocumentation(req, res);

    expect(headers["Content-Disposition"]).toBe('attachment; filename="my-repo-documentation.pdf"');
    expect(sentContentType).toBe("application/pdf");
    expect(sentBody).toBeInstanceOf(Buffer);
    expect(sentBody.slice(0, 5).toString("utf-8")).toBe("%PDF-");
  });

  it("3. downloadDocumentation controller supports format=md fallback", async () => {
    vi.spyOn(db.documentation, "findUnique").mockResolvedValue({
      id: "doc-1",
      repositoryId: "repo-123",
      status: "READY",
      content: "# My Repo\n\n## Overview\nTest content",
      model: "test-model",
      error: null,
      updatedAt: new Date(),
      repository: { name: "my-repo" },
    } as any);

    const req = {
      params: { id: "repo-123" },
      query: { format: "md" },
    } as unknown as Request;

    const headers: Record<string, string> = {};
    let sentContentType = "";
    let sentBody: any = null;

    const res = {
      setHeader: vi.fn((k: string, v: string) => {
        headers[k] = v;
      }),
      type: vi.fn((t: string) => {
        sentContentType = t;
        return res;
      }),
      send: vi.fn((body: any) => {
        sentBody = body;
        return res;
      }),
    } as unknown as Response;

    await downloadDocumentation(req, res);

    expect(headers["Content-Disposition"]).toBe('attachment; filename="my-repo-documentation.md"');
    expect(sentContentType).toBe("text/markdown; charset=utf-8");
    expect(sentBody).toBe("# My Repo\n\n## Overview\nTest content");
  });

  it("4. generates exactly 1 page for short documentation without blank overflow pages", async () => {
    const markdown = `# Single Page Repo

## Overview
A concise overview that comfortably fits on a single page.

## Tech Stack
| Item | Value |
| :--- | :--- |
| Framework | Express |

- Bullet item A
- Bullet item B
`;

    const pdfBuffer = await generateDocumentationPdf(markdown, {
      repoName: "single-page-repo",
      title: "Single Page Repo Documentation",
    });

    const pdfStr = pdfBuffer.toString("latin1");
    const pageMatches = pdfStr.match(/\/Type\s*\/Page[^s]/g);
    expect(pageMatches).not.toBeNull();
    expect(pageMatches!.length).toBe(1);
  });

  it("5. generates multiple pages without any blank or orphaned overflow pages for long docs", async () => {
    const zlib = await import("zlib");
    const sections: string[] = [
      "# CodeSphere Intelligence Engine",
      "## Overview",
      "CodeSphere is an automated architectural documentation generation and codebase visualization platform.",
      "## Tech Stack",
      "| Category | Detected Technologies |",
      "| :--- | :--- |",
      "| Languages | TypeScript, JavaScript, Python, Go |",
      "| Frameworks | React, Next.js, Express, TailwindCSS |",
      "| Databases | PostgreSQL, Prisma, Redis |",
      "| Build Tools | Docker, Vite, Turborepo |",
      "## Getting Started",
      "```bash\n# Install all workspace dependencies\nnpm install\n\n# Run the database migration\nnpm run db:migrate\n\n# Start development servers\nnpm run dev\n```",
      "## Large Code Block Test",
      "```typescript\n" + Array.from({ length: 30 }, (_, i) => `export const workerTask${i} = () => console.log("Task ${i}");`).join("\n") + "\n```",
      "## Project Structure",
      "| Directory | Files | Primary Role |",
      "| :--- | :--- | :--- |",
      "| `backend/` | 45 | Backend API, analysis engine, LLM pipeline |",
      "| `frontend/` | 68 | Next.js UI, graph canvas, state management |",
      "| `scripts/` | 8 | Utility migration and provisioning scripts |",
      "## Architecture & Data Flow",
      "The dependency graph maps **1,250 inter-file dependencies** across the codebase.\n\n- `backend/src/lib/db.ts` (imported by 42 files)\n- `backend/src/services/auth.ts` (imported by 28 files)\n- `frontend/lib/api.ts` (imported by 35 files)",
      "## Key Modules",
      "| File | Role | Architectural Significance |",
      "| :--- | :--- | :--- |",
      "| `backend/src/services/pdf.ts` | PDF ENGINE | Generates publication-ready PDF documentation |",
      "| `backend/src/services/documentation.ts` | DOCS GENERATOR | Coordinates AI and deterministic doc generation |",
      "| `backend/src/lib/git/ingest.ts` | REPO INGESTION | Clones and indexes repositories |",
      "## API Endpoints & Routes",
      "- `GET /api/repositories`\n- `POST /api/repositories`\n- `GET /api/repositories/:id/documentation/download.pdf`\n- `POST /api/repositories/:id/analyze`",
      "## Configuration",
      "- `DATABASE_URL`\n- `JWT_SECRET`\n- `GEMINI_API_KEY`\n- `PORT`",
      "## Notes & Code Insights",
      "- **Total Analyzed Files**: 121\n- **Total Code Lines**: 18,450\n- **Test Files Detected**: 14",
    ];

    const markdown = sections.join("\n\n");
    const pdfBuffer = await generateDocumentationPdf(markdown, {
      repoName: "codesphere-full",
      title: "CodeSphere Full Documentation",
      updatedAt: new Date().toISOString(),
    });

    const pdfStr = pdfBuffer.toString("latin1");
    const pageMatches = pdfStr.match(/\/Type\s*\/Page[^s]/g);
    expect(pageMatches).not.toBeNull();
    // Must be more than 1 page
    expect(pageMatches!.length).toBeGreaterThanOrEqual(2);

    // Verify each page contains actual decompressed stream content (not a blank/stray footer page)
    const pageObjRegex = /(\d+)\s+0\s+obj[\s\S]*?\/Type\s*\/Page[^s][\s\S]*?\/Contents\s+(\d+)\s+0\s+R[\s\S]*?endobj/g;
    let match;
    let verifiedPages = 0;
    while ((match = pageObjRegex.exec(pdfStr)) !== null) {
      const contentId = match[2];
      const streamRegex = new RegExp(contentId + " 0 obj[\\s\\S]*?stream\\r?\\n([\\s\\S]*?)\\r?\\nendstream");
      const streamMatch = streamRegex.exec(pdfStr);
      expect(streamMatch).not.toBeNull();
      const decomp = zlib.inflateSync(Buffer.from(streamMatch![1], "latin1")).toString("latin1");
      // A truly blank page with only stray footer text is ~200 bytes. Real pages have thousands of bytes.
      expect(decomp.length).toBeGreaterThan(1500);
      verifiedPages++;
    }

    expect(verifiedPages).toBe(pageMatches!.length);
  });
});
