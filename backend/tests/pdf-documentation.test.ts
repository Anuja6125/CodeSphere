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
});
