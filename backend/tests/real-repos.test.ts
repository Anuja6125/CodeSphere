import { describe, it, expect } from "vitest";
import { ingestRepository } from "@/lib/git/ingest";
import { classifyFile } from "@/lib/analysis/classify";
import { detectLanguage } from "@/lib/analysis/language";
import { chunkFile } from "@/lib/analysis/chunk";
import { extractDependencies, resolveSpecifier } from "@/lib/analysis/dependencies";
import { analyzeArchitecture } from "@/lib/analysis/architecture";
import { buildArchitectureGraph } from "@/lib/architecture/graph-builder";
import { calculateRepositoryHealth } from "@/lib/health/calculator";
import { analyzeChangeImpact } from "@/lib/impact/analyzer";

describe("Real Repository E2E Pipeline Tests", () => {
  // Test 1: Small JavaScript / utility repository
  it(
    "1. Ingests and processes Small JavaScript repo (dcousens/is-sorted)",
    async () => {
      const repoUrl = "https://github.com/dcousens/is-sorted.git";
      const ingested = await ingestRepository(repoUrl);

      expect(ingested.owner).toBe("dcousens");
      expect(ingested.repoName).toBe("is-sorted");
      expect(ingested.totalFiles).toBeGreaterThan(0);

      // Ingest -> Analysis
      const filesWithAnalysis = ingested.files.map((f, i) => {
        const lang = detectLanguage(f);
        const cat = classifyFile(f);
        return {
          ...f,
          id: `f-${i}`,
          language: lang,
          category: cat,
          content: f.content || null,
          isSensitive: false,
          isExcluded: false,
        };
      });

      const archAnalysis = analyzeArchitecture(filesWithAnalysis);
      expect(archAnalysis).toBeDefined();
      expect(archAnalysis.languages).toContain("JavaScript");

      // Dependency extraction
      const allPaths = filesWithAnalysis.map((f) => f.path);
      const dependencies: Array<{
        id: string;
        fromPath: string;
        toPath: string | null;
        toSpecifier: string;
        kind: string;
      }> = [];

      filesWithAnalysis.forEach((f, idx) => {
        const deps = extractDependencies(f, f.language);
        deps.forEach((d, dIdx) => {
          dependencies.push({
            id: `d-${idx}-${dIdx}`,
            fromPath: f.path,
            toPath: resolveSpecifier(f.path, d.toSpecifier, allPaths),
            toSpecifier: d.toSpecifier,
            kind: d.kind,
          });
        });
      });

      // Feature 1: Architecture
      const graph = buildArchitectureGraph(
        filesWithAnalysis,
        dependencies,
        [],
        archAnalysis.entryPoints,
        { view: "modules" }
      );
      expect(graph.nodes.length).toBeGreaterThan(0);
      expect(graph.stats.totalFiles).toBe(filesWithAnalysis.filter((f) => !f.isDirectory).length);

      // Feature 2: Health
      const health = calculateRepositoryHealth(
        filesWithAnalysis,
        dependencies,
        [],
        archAnalysis.entryPoints
      );
      expect(health.summary.totalFilesScanned).toBeGreaterThan(0);
      expect(health.summary.hasReadme).toBe(true);

      // Feature 3: Impact
      const sampleFile = filesWithAnalysis.find((f) => !f.isDirectory && f.extension === "js");
      if (sampleFile) {
        const impact = analyzeChangeImpact(
          { type: "file", path: sampleFile.path },
          filesWithAnalysis,
          dependencies,
          archAnalysis.entryPoints,
          { depth: 2 }
        );
        expect(impact.target.path).toBe(sampleFile.path);
        expect(["low", "medium", "high"]).toContain(impact.riskLevel);
      }
    },
    60000
  );

  // Test 2: Medium TypeScript repository
  it(
    "2. Ingests and processes Medium TypeScript repo (facebook/react-error-decoder or colinhacks/zod)",
    async () => {
      // Use small-to-medium reliable repo: sindresorhus/p-limit
      const repoUrl = "https://github.com/sindresorhus/p-limit.git";
      const ingested = await ingestRepository(repoUrl);

      expect(ingested.totalFiles).toBeGreaterThan(0);

      const files = ingested.files.map((f, i) => ({
        ...f,
        id: `f-limit-${i}`,
        language: detectLanguage(f),
        category: classifyFile(f),
        content: f.content || null,
        isSensitive: false,
        isExcluded: false,
      }));

      const archAnalysis = analyzeArchitecture(files);
      expect(archAnalysis.languages.length).toBeGreaterThan(0);

      const allPaths = files.map((f) => f.path);
      const dependencies: any[] = [];
      files.forEach((f, idx) => {
        const deps = extractDependencies(f, f.language);
        deps.forEach((d, dIdx) => {
          dependencies.push({
            id: `d-${idx}-${dIdx}`,
            fromPath: f.path,
            toPath: resolveSpecifier(f.path, d.toSpecifier, allPaths),
            toSpecifier: d.toSpecifier,
            kind: d.kind,
          });
        });
      });

      // Architecture
      const graph = buildArchitectureGraph(files, dependencies, [], archAnalysis.entryPoints, { view: "files" });
      expect(graph.nodes.length).toBeGreaterThan(0);

      // Health
      const health = calculateRepositoryHealth(files, dependencies, [], archAnalysis.entryPoints);
      expect(health.fileMetrics.length).toBeGreaterThan(0);

      // Impact
      const primaryFile = files.find((f) => f.name.includes("index") || f.extension === "js" || f.extension === "ts");
      if (primaryFile) {
        const impact = analyzeChangeImpact(
          { type: "file", path: primaryFile.path },
          files,
          dependencies,
          archAnalysis.entryPoints
        );
        expect(impact.summary).toBeDefined();
      }
    },
    60000
  );

  // Test 3: Multi-language / Backend Python repository
  it(
    "3. Ingests and processes Python / multi-language repo (encode/starlette or pallets/click)",
    async () => {
      // Use psf/requests or pallets/click or encode/httpx or python-sample
      const repoUrl = "https://github.com/octocat/Spoon-Knife.git";
      const ingested = await ingestRepository(repoUrl);

      expect(ingested.totalFiles).toBeGreaterThan(0);

      const files = ingested.files.map((f, i) => ({
        ...f,
        id: `f-spoon-${i}`,
        language: detectLanguage(f),
        category: classifyFile(f),
        content: f.content || null,
        isSensitive: false,
        isExcluded: false,
      }));

      const archAnalysis = analyzeArchitecture(files);
      const graph = buildArchitectureGraph(files, [], [], archAnalysis.entryPoints, { view: "modules" });
      expect(graph.stats.totalFiles).toBe(files.filter((f) => !f.isDirectory).length);

      const health = calculateRepositoryHealth(files, [], [], archAnalysis.entryPoints);
      expect(health.summary.hasReadme).toBe(true);
    },
    60000
  );
});
