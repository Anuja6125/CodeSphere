import { describe, it, expect } from "vitest";
import { analyzeChangeImpact } from "@/lib/impact/analyzer";
import { ImpactTarget } from "@/lib/impact/types";

describe("Change Impact Analyzer Unit Tests", () => {
  const mockFiles = [
    { id: "f1", path: "src/auth/session.ts", name: "session.ts", extension: "ts", size: 1000, linesCount: 60, language: "TypeScript", category: "SOURCE_CODE" },
    { id: "f2", path: "src/middleware/auth.ts", name: "auth.ts", extension: "ts", size: 1500, linesCount: 90, language: "TypeScript", category: "SOURCE_CODE" },
    { id: "f3", path: "src/api/users.ts", name: "users.ts", extension: "ts", size: 2000, linesCount: 120, language: "TypeScript", category: "API_SCHEMA" },
    { id: "f4", path: "src/app/dashboard/page.tsx", name: "page.tsx", extension: "tsx", size: 3000, linesCount: 180, language: "TypeScript", category: "SOURCE_CODE" },
    { id: "f5", path: "tests/session.test.ts", name: "session.test.ts", extension: "ts", size: 1200, linesCount: 70, language: "TypeScript", category: "TEST" },
    { id: "f6", path: "src/utils/crypto.ts", name: "crypto.ts", extension: "ts", size: 800, linesCount: 40, language: "TypeScript", category: "SOURCE_CODE" },
    { id: "f7", path: "docs/auth.md", name: "auth.md", extension: "md", size: 2500, linesCount: 80, language: "Markdown", category: "DOCUMENTATION" },
  ];

  // Dependency graph:
  // session.ts -> crypto.ts (session imports crypto)
  // middleware/auth.ts -> session.ts (middleware imports session)
  // api/users.ts -> middleware/auth.ts (api imports middleware)
  // app/dashboard/page.tsx -> api/users.ts (page imports api)
  // tests/session.test.ts -> session.ts (test imports session)
  const mockDependencies = [
    { id: "d1", fromPath: "src/auth/session.ts", toPath: "src/utils/crypto.ts", toSpecifier: "../utils/crypto", kind: "import" },
    { id: "d2", fromPath: "src/middleware/auth.ts", toPath: "src/auth/session.ts", toSpecifier: "@/auth/session", kind: "import" },
    { id: "d3", fromPath: "src/api/users.ts", toPath: "src/middleware/auth.ts", toSpecifier: "@/middleware/auth", kind: "import" },
    { id: "d4", fromPath: "src/app/dashboard/page.tsx", toPath: "src/api/users.ts", toSpecifier: "@/api/users", kind: "import" },
    { id: "d5", fromPath: "tests/session.test.ts", toPath: "src/auth/session.ts", toSpecifier: "@/auth/session", kind: "import" },
  ];

  const mockEntryPoints = [
    { path: "src/app/dashboard/page.tsx", reason: "Next.js page route" },
  ];

  it("3.1 identifies direct dependencies and direct dependents", () => {
    const target: ImpactTarget = { type: "file", path: "src/auth/session.ts" };
    const result = analyzeChangeImpact(target, mockFiles, mockDependencies, mockEntryPoints, { depth: 1 });

    // session imports crypto.ts
    expect(result.directDependencies.map((d) => d.path)).toContain("src/utils/crypto.ts");

    // middleware and test import session.ts directly
    const directDepPaths = result.directDependents.map((d) => d.path);
    expect(directDepPaths).toContain("src/middleware/auth.ts");
    expect(directDepPaths).toContain("tests/session.test.ts");
    expect(result.summary.directDependentsCount).toBe(2);
  });

  it("3.2 calculates multi-order transitive dependents with configurable depth", () => {
    const target: ImpactTarget = { type: "file", path: "src/auth/session.ts" };

    // At depth 1: only direct dependents (middleware, test)
    const resDepth1 = analyzeChangeImpact(target, mockFiles, mockDependencies, mockEntryPoints, { depth: 1 });
    expect(resDepth1.transitiveDependents.length).toBe(0);

    // At depth 2: includes 2nd order (api/users.ts)
    const resDepth2 = analyzeChangeImpact(target, mockFiles, mockDependencies, mockEntryPoints, { depth: 2 });
    expect(resDepth2.transitiveDependents.map((d) => d.path)).toContain("src/api/users.ts");

    // At depth 3: includes 3rd order (app/dashboard/page.tsx)
    const resDepth3 = analyzeChangeImpact(target, mockFiles, mockDependencies, mockEntryPoints, { depth: 3 });
    expect(resDepth3.transitiveDependents.map((d) => d.path)).toContain("src/app/dashboard/page.tsx");
  });

  it("3.3 prevents infinite recursion on cyclic dependency graphs", () => {
    const cyclicDeps = [
      ...mockDependencies,
      { id: "d-cycle", fromPath: "src/utils/crypto.ts", toPath: "src/auth/session.ts", toSpecifier: "../auth/session", kind: "import" },
    ];

    const target: ImpactTarget = { type: "file", path: "src/auth/session.ts" };
    // Should terminate cleanly without stack overflow
    const result = analyzeChangeImpact(target, mockFiles, cyclicDeps, mockEntryPoints, { depth: 3 });
    expect(result).toBeDefined();
    expect(result.directDependents.length).toBeGreaterThan(0);
  });

  it("3.4 detects affected entry points and related tests", () => {
    const target: ImpactTarget = { type: "file", path: "src/auth/session.ts" };
    const result = analyzeChangeImpact(target, mockFiles, mockDependencies, mockEntryPoints, { depth: 3 });

    expect(result.relatedTests.map((t) => t.path)).toContain("tests/session.test.ts");
    expect(result.affectedEntryPoints.map((e) => e.path)).toContain("src/app/dashboard/page.tsx");
  });

  it("3.5 clearly incorporates semantically related files without conflating with graph dependents", () => {
    const target: ImpactTarget = { type: "file", path: "src/auth/session.ts" };
    const semanticMatches = [
      {
        path: "docs/auth.md",
        chunkId: "c-doc",
        contentSnippet: "Authentication session handling documentation",
        similarity: 0.88,
        hybridScore: 0.90,
        reason: "Semantic match (88% similarity)",
        startLine: 1,
        endLine: 40,
      },
    ];

    const result = analyzeChangeImpact(target, mockFiles, mockDependencies, mockEntryPoints, {
      depth: 2,
      semanticResults: semanticMatches,
    });

    expect(result.semanticRelatedFiles.length).toBe(1);
    expect(result.semanticRelatedFiles[0].path).toBe("docs/auth.md");
    // Verify it is NOT listed as a direct graph dependent
    expect(result.directDependents.map((d) => d.path)).not.toContain("docs/auth.md");
  });

  it("3.6 calculates deterministic risk levels backed by explicit reasons", () => {
    const target: ImpactTarget = { type: "file", path: "src/auth/session.ts" };
    const result = analyzeChangeImpact(target, mockFiles, mockDependencies, mockEntryPoints, { depth: 3 });

    // Because it affects an entry point (dashboard/page.tsx) and has multiple dependents, it should be high risk
    expect(result.riskLevel).toBe("high");
    expect(result.riskReasons.some((r) => r.includes("Affects") || r.includes("entry point"))).toBe(true);
  });

  it("3.7 handles isolated files with low risk assessment", () => {
    const target: ImpactTarget = { type: "file", path: "docs/auth.md" };
    const result = analyzeChangeImpact(target, mockFiles, mockDependencies, mockEntryPoints, { depth: 2 });

    expect(result.directDependents.length).toBe(0);
    expect(result.transitiveDependents.length).toBe(0);
    expect(result.riskLevel).toBe("low");
  });
});
