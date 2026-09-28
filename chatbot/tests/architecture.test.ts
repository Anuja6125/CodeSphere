import { describe, it, expect } from "vitest";
import { buildArchitectureGraph, detectCircularDependencies } from "@/lib/architecture/graph-builder";
import { classifyArchitectureGroup } from "@/lib/architecture/classifier";

describe("Architecture Intelligence Unit Tests", () => {
  const mockFiles = [
    {
      id: "f1",
      path: "src/app/page.tsx",
      name: "page.tsx",
      extension: "tsx",
      size: 1200,
      linesCount: 85,
      language: "TypeScript",
      category: "SOURCE_CODE",
      isDirectory: false,
    },
    {
      id: "f2",
      path: "src/components/Button.tsx",
      name: "Button.tsx",
      extension: "tsx",
      size: 800,
      linesCount: 45,
      language: "TypeScript",
      category: "SOURCE_CODE",
      isDirectory: false,
    },
    {
      id: "f3",
      path: "src/lib/auth.ts",
      name: "auth.ts",
      extension: "ts",
      size: 2500,
      linesCount: 150,
      language: "TypeScript",
      category: "SOURCE_CODE",
      isDirectory: false,
    },
    {
      id: "f4",
      path: "src/lib/db.ts",
      name: "db.ts",
      extension: "ts",
      size: 900,
      linesCount: 40,
      language: "TypeScript",
      category: "DATABASE",
      isDirectory: false,
    },
    {
      id: "f5",
      path: "tests/auth.test.ts",
      name: "auth.test.ts",
      extension: "ts",
      size: 1500,
      linesCount: 75,
      language: "TypeScript",
      category: "TEST",
      isDirectory: false,
    },
    {
      id: "f6",
      path: "README.md",
      name: "README.md",
      extension: "md",
      size: 3000,
      linesCount: 100,
      language: "Markdown",
      category: "DOCUMENTATION",
      isDirectory: false,
    },
  ];

  const mockDependencies = [
    { id: "d1", fromPath: "src/app/page.tsx", toPath: "src/components/Button.tsx", toSpecifier: "@/components/Button", kind: "import" },
    { id: "d2", fromPath: "src/app/page.tsx", toPath: "src/lib/auth.ts", toSpecifier: "@/lib/auth", kind: "import" },
    { id: "d3", fromPath: "src/lib/auth.ts", toPath: "src/lib/db.ts", toSpecifier: "./db", kind: "import" },
    { id: "d4", fromPath: "tests/auth.test.ts", toPath: "src/lib/auth.ts", toSpecifier: "@/lib/auth", kind: "import" },
  ];

  const mockChunks = [
    { id: "c1", fileId: "f1", symbolName: "HomePage", chunkType: "component", isExported: true },
    { id: "c2", fileId: "f2", symbolName: "Button", chunkType: "component", isExported: true },
    { id: "c3", fileId: "f3", symbolName: "loginUser", chunkType: "function", isExported: true },
    { id: "c4", fileId: "f3", symbolName: "validateSession", chunkType: "function", isExported: true },
  ];

  const mockEntryPoints = [
    { path: "src/app/page.tsx", reason: "Next.js page route", confidence: 0.9 },
  ];

  it("1.1 classifies files into accurate architecture groups", () => {
    expect(classifyArchitectureGroup("src/app/page.tsx")).toBe("application");
    expect(classifyArchitectureGroup("src/components/Button.tsx")).toBe("components");
    expect(classifyArchitectureGroup("src/lib/auth.ts")).toBe("services");
    expect(classifyArchitectureGroup("src/lib/db.ts", "DATABASE")).toBe("database");
    expect(classifyArchitectureGroup("tests/auth.test.ts", "TEST")).toBe("tests");
    expect(classifyArchitectureGroup("README.md", "DOCUMENTATION")).toBe("documentation");
    expect(classifyArchitectureGroup("tsconfig.json", "BUILD_CONFIG")).toBe("configuration");
    expect(classifyArchitectureGroup("scripts/deploy.sh", "SCRIPT")).toBe("scripts");
  });

  it("1.2 generates hierarchical module graph with inter-module aggregation", () => {
    const graph = buildArchitectureGraph(
      mockFiles,
      mockDependencies,
      mockChunks,
      mockEntryPoints,
      { view: "modules" }
    );

    expect(graph.nodes.length).toBeGreaterThanOrEqual(3);
    const appModule = graph.nodes.find((n) => n.id === "src/app");
    expect(appModule).toBeDefined();
    expect(appModule?.isEntryPoint).toBe(true);

    const libModule = graph.nodes.find((n) => n.id === "src/lib");
    expect(libModule).toBeDefined();

    // Verify inter-module edges exist
    expect(graph.edges.length).toBeGreaterThan(0);
    const edge = graph.edges.find((e) => e.source === "src/app" && e.target === "src/lib");
    expect(edge).toBeDefined();
  });

  it("1.3 generates detailed file-level graph with attached symbols", () => {
    const graph = buildArchitectureGraph(
      mockFiles,
      mockDependencies,
      mockChunks,
      mockEntryPoints,
      { view: "files" }
    );

    expect(graph.nodes.length).toBe(mockFiles.length);
    const authNode = graph.nodes.find((n) => n.path === "src/lib/auth.ts");
    expect(authNode).toBeDefined();
    expect(authNode?.symbols.length).toBe(2);
    expect(authNode?.symbols.map((s) => s.name)).toContain("loginUser");
    expect(authNode?.symbols.map((s) => s.name)).toContain("validateSession");
    expect(authNode?.inDegree).toBe(2); // imported by page.tsx and auth.test.ts
    expect(authNode?.outDegree).toBe(1); // imports db.ts
  });

  it("1.4 detects circular dependencies accurately", () => {
    const cyclicAdjacency = new Map<string, string[]>([
      ["a.ts", ["b.ts"]],
      ["b.ts", ["c.ts"]],
      ["c.ts", ["a.ts"]], // cycle: a -> b -> c -> a
      ["d.ts", ["e.ts"]],
      ["e.ts", []],
    ]);

    const cycles = detectCircularDependencies(cyclicAdjacency);
    expect(cycles.length).toBe(1);
    expect(cycles[0]).toEqual(["a.ts", "b.ts", "c.ts", "a.ts"]);
  });

  it("1.5 returns 0 circular dependencies for acyclic graphs", () => {
    const acyclicAdjacency = new Map<string, string[]>([
      ["a.ts", ["b.ts", "c.ts"]],
      ["b.ts", ["d.ts"]],
      ["c.ts", ["d.ts"]],
      ["d.ts", []],
    ]);

    const cycles = detectCircularDependencies(acyclicAdjacency);
    expect(cycles.length).toBe(0);
  });

  it("1.6 calculates comprehensive architecture statistics", () => {
    const graph = buildArchitectureGraph(
      mockFiles,
      mockDependencies,
      mockChunks,
      mockEntryPoints,
      { view: "files" }
    );

    expect(graph.stats.totalFiles).toBe(6);
    expect(graph.stats.analyzedFiles).toBe(6);
    expect(graph.stats.dependencyEdges).toBe(4);
    expect(graph.stats.entryPoints).toBe(1);
    expect(graph.stats.highlyConnectedFiles.length).toBeGreaterThan(0);
    expect(graph.stats.highlyConnectedFiles[0].path).toBe("src/lib/auth.ts");
    expect(graph.stats.isolatedFiles).toContain("README.md");
  });

  it("1.7 handles empty repository gracefully without throwing", () => {
    const graph = buildArchitectureGraph([], [], [], [], { view: "modules" });
    expect(graph.nodes).toEqual([]);
    expect(graph.edges).toEqual([]);
    expect(graph.groups).toEqual([]);
    expect(graph.stats.totalFiles).toBe(0);
    expect(graph.stats.dependencyEdges).toBe(0);
  });
});
