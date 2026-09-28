import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET as getArchitecture } from "@/app/api/repos/[id]/architecture/route";
import { POST as postArchitectureSummary } from "@/app/api/repos/[id]/architecture/summary/route";
import { GET as getHealth } from "@/app/api/repos/[id]/health/route";
import { POST as postHealthSummary } from "@/app/api/repos/[id]/health/summary/route";
import { GET as getImpact } from "@/app/api/repos/[id]/impact/route";
import { POST as postImpactAnalyze } from "@/app/api/repos/[id]/impact/analyze/route";
import { db } from "@/lib/db";
import { NextRequest } from "next/server";

describe("API Route Handlers Tests", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const createNextRequest = (url: string, method = "GET", body?: any): NextRequest => {
    const init: any = { method };
    if (body) {
      init.body = JSON.stringify(body);
      init.headers = { "Content-Type": "application/json" };
    }
    return new NextRequest(new URL(url, "http://localhost:3000"), init);
  };

  it("5.1 GET /api/repos/[id]/architecture returns 404 for unknown repository", async () => {
    vi.spyOn(db.repository, "findUnique").mockResolvedValue(null);

    const req = createNextRequest("http://localhost:3000/api/repos/non-existent-id/architecture");
    const res = await getArchitecture(req, { params: { id: "non-existent-id" } });
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe("Repository not found.");
  });

  it("5.2 GET /api/repos/[id]/architecture returns valid graph when repository exists", async () => {
    vi.spyOn(db.repository, "findUnique").mockResolvedValue({
      id: "repo-123",
      name: "test-repo",
      owner: "test-owner",
      status: "ANALYZED",
      analysis: { entryPoints: [{ path: "src/index.ts" }] },
    } as any);

    vi.spyOn(db.repoFile, "findMany").mockResolvedValue([
      {
        id: "f1",
        path: "src/index.ts",
        name: "index.ts",
        extension: "ts",
        size: 500,
        linesCount: 25,
        language: "TypeScript",
        category: "SOURCE_CODE",
        isDirectory: false,
        isSensitive: false,
        isExcluded: false,
      } as any,
    ]);

    vi.spyOn(db.fileDependency, "findMany").mockResolvedValue([]);

    const req = createNextRequest("http://localhost:3000/api/repos/repo-123/architecture?view=modules");
    const res = await getArchitecture(req, { params: { id: "repo-123" } });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.graph).toBeDefined();
    expect(json.graph.stats.totalFiles).toBe(1);
  });

  it("5.3 GET /api/repos/[id]/health returns 404 for unknown repository", async () => {
    vi.spyOn(db.repository, "findUnique").mockResolvedValue(null);

    const req = createNextRequest("http://localhost:3000/api/repos/non-existent-id/health");
    const res = await getHealth(req, { params: { id: "non-existent-id" } });
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe("Repository not found.");
  });

  it("5.4 GET /api/repos/[id]/health returns calculated health report", async () => {
    vi.spyOn(db.repository, "findUnique").mockResolvedValue({
      id: "repo-123",
      name: "test-repo",
      owner: "test-owner",
      status: "ANALYZED",
      analysis: { entryPoints: [] },
    } as any);

    vi.spyOn(db.repoFile, "findMany").mockResolvedValue([
      {
        id: "f1",
        path: "src/index.ts",
        name: "index.ts",
        extension: "ts",
        size: 500,
        linesCount: 25,
        content: "console.log('hi');",
        category: "SOURCE_CODE",
        isSensitive: false,
        isExcluded: false,
      } as any,
    ]);

    vi.spyOn(db.fileDependency, "findMany").mockResolvedValue([]);
    vi.spyOn(db.codeChunk, "findMany").mockResolvedValue([]);

    const req = createNextRequest("http://localhost:3000/api/repos/repo-123/health");
    const res = await getHealth(req, { params: { id: "repo-123" } });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.report).toBeDefined();
    expect(json.report.summary.totalFilesScanned).toBe(1);
  });

  it("5.5 GET /api/repos/[id]/impact returns 400 when target is missing", async () => {
    vi.spyOn(db.repository, "findUnique").mockResolvedValue({
      id: "repo-123",
      name: "test-repo",
      status: "ANALYZED",
      analysis: null,
    } as any);

    vi.spyOn(db.repoFile, "findMany").mockResolvedValue([
      { id: "f1", path: "src/index.ts", name: "index.ts", extension: "ts", size: 100, linesCount: 10, language: "TS", category: "SOURCE_CODE", isSensitive: false, isExcluded: false } as any,
    ]);

    const req = createNextRequest("http://localhost:3000/api/repos/repo-123/impact");
    const res = await getImpact(req, { params: { id: "repo-123" } });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("Target file, symbol, or natural language query is required");
  });

  it("5.6 GET /api/repos/[id]/impact returns impact result for valid target", async () => {
    vi.spyOn(db.repository, "findUnique").mockResolvedValue({
      id: "repo-123",
      name: "test-repo",
      status: "ANALYZED",
      analysis: null,
    } as any);

    vi.spyOn(db.repoFile, "findMany").mockResolvedValue([
      { id: "f1", path: "src/index.ts", name: "index.ts", extension: "ts", size: 100, linesCount: 10, language: "TS", category: "SOURCE_CODE", isSensitive: false, isExcluded: false } as any,
    ]);

    vi.spyOn(db.fileDependency, "findMany").mockResolvedValue([]);

    const req = createNextRequest("http://localhost:3000/api/repos/repo-123/impact?file=src/index.ts&depth=2");
    const res = await getImpact(req, { params: { id: "repo-123" } });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.result).toBeDefined();
    expect(json.result.target.path).toBe("src/index.ts");
    expect(json.result.riskLevel).toBe("low");
  });
});
