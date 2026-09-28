import { describe, it, expect, vi, afterEach } from "vitest";
import { generateArchitectureSummary, generateDeterministicArchitectureSummary } from "@/lib/architecture/summary";
import { generateHealthSummary, generateDeterministicHealthSummary } from "@/lib/health/summary";
import { generateImpactSummary, generateDeterministicImpactSummary } from "@/lib/impact/summary";
import * as geminiService from "@/lib/ai/gemini-service";

describe("AI Grounding, Summaries & Fallback Tests", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const mockGraphData = {
    nodes: [
      { id: "src/app", label: "App", path: "src/app", type: "module" as const, group: "application" as const, language: "TS", lines: 100, size: 2000, inDegree: 0, outDegree: 2, isEntryPoint: true, symbols: [], hasChildren: true },
      { id: "src/lib", label: "Lib", path: "src/lib", type: "module" as const, group: "services" as const, language: "TS", lines: 300, size: 6000, inDegree: 1, outDegree: 0, isEntryPoint: false, symbols: [], hasChildren: true },
    ],
    edges: [
      { id: "e1", source: "src/app", target: "src/lib", kind: "dependency" as const, specifier: "1 connection" },
    ],
    groups: [
      { id: "application" as const, name: "Application", nodeCount: 1, color: "#6366f1" },
      { id: "services" as const, name: "Services", nodeCount: 1, color: "#a855f7" },
    ],
    stats: {
      totalFiles: 10,
      analyzedFiles: 10,
      dependencyEdges: 1,
      entryPoints: 1,
      modulesCount: 2,
      highlyConnectedFiles: [{ path: "src/lib", inDegree: 1, outDegree: 0, total: 1 }],
      isolatedFiles: [],
      circularDependencies: [],
    },
  };

  const mockHealthReport = {
    maintainabilitySignals: [],
    architectureSignals: [],
    documentationSignals: [],
    testingSignals: [],
    dependencySignals: [],
    securitySignals: [],
    hotspots: [
      {
        path: "src/lib/heavy.ts",
        signalType: "Large file" as const,
        evidence: "File contains 700 lines.",
        metrics: { lines: 700 },
      },
    ],
    fileMetrics: [],
    summary: {
      totalFilesScanned: 10,
      medianLinesPerFile: 50,
      medianImportsPerFile: 4,
      totalTodos: 2,
      totalFixmes: 0,
      testFilesDetected: 2,
      hasReadme: true,
      readmeSizeBytes: 3000,
      securityFindingsCount: 0,
    },
  };

  const mockImpactResult = {
    target: { type: "file" as const, path: "src/auth/session.ts" },
    directDependencies: [{ path: "src/utils/crypto.ts", fileId: "f6", depth: 1, relationship: "imports" as const, via: ["src/auth/session.ts", "src/utils/crypto.ts"], isEntryPoint: false, isTest: false, isDoc: false }],
    directDependents: [{ path: "src/middleware/auth.ts", fileId: "f2", depth: 1, relationship: "imported_by" as const, via: ["src/middleware/auth.ts", "src/auth/session.ts"], isEntryPoint: false, isTest: false, isDoc: false }],
    transitiveDependents: [{ path: "src/app/page.tsx", fileId: "f4", depth: 2, relationship: "transitive_dependent" as const, via: ["src/app/page.tsx", "src/middleware/auth.ts"], isEntryPoint: true, isTest: false, isDoc: false }],
    transitiveDependencies: [],
    relatedTests: [{ path: "tests/session.test.ts", fileId: "f5", depth: 1, relationship: "imported_by" as const, via: ["tests/session.test.ts"], isEntryPoint: false, isTest: true, isDoc: false }],
    relatedDocumentation: [],
    semanticRelatedFiles: [],
    affectedEntryPoints: [{ path: "src/app/page.tsx", reason: "Invoked via dependent path" }],
    riskLevel: "high" as const,
    riskReasons: ["Affects primary entry point src/app/page.tsx"],
    summary: {
      directDependenciesCount: 1,
      directDependentsCount: 1,
      transitiveDependentsCount: 1,
      affectedEntryPointsCount: 1,
      relatedTestsCount: 1,
      semanticMatchesCount: 0,
    },
  };

  it("4.1 generates deterministic architecture summary based purely on evidence", () => {
    const summary = generateDeterministicArchitectureSummary("test-repo", mockGraphData);
    expect(summary).toContain("Architecture Overview for test-repo");
    expect(summary).toContain("10 files");
    expect(summary).toContain("2 structural modules");
    expect(summary).toContain("Application");
    expect(summary).toContain("src/app");
  });

  it("4.2 generates deterministic health summary based purely on evidence", () => {
    const summary = generateDeterministicHealthSummary("test-repo", mockHealthReport);
    expect(summary).toContain("Code Health Assessment for test-repo");
    expect(summary).toContain("10 files");
    expect(summary).toContain("median of **50 lines**");
    expect(summary).toContain("src/lib/heavy.ts");
  });

  it("4.3 generates deterministic impact summary based purely on evidence", () => {
    const summary = generateDeterministicImpactSummary("test-repo", mockImpactResult);
    expect(summary).toContain("Change Impact Assessment for `src/auth/session.ts`");
    expect(summary).toContain("HIGH");
    expect(summary).toContain("src/middleware/auth.ts");
    expect(summary).toContain("src/app/page.tsx");
  });

  it("4.4 falls back gracefully to deterministic summary when Gemini provider fails", async () => {
    vi.spyOn(geminiService, "generateGeminiResponse").mockRejectedValue(new Error("Gemini quota exceeded"));

    const archSummary = await generateArchitectureSummary("test-repo", null, mockGraphData);
    expect(archSummary).toContain("Architecture Overview for test-repo");

    const healthSummary = await generateHealthSummary("test-repo", mockHealthReport);
    expect(healthSummary).toContain("Code Health Assessment for test-repo");

    const impactSummary = await generateImpactSummary("test-repo", mockImpactResult);
    expect(impactSummary).toContain("Change Impact Assessment for `src/auth/session.ts`");
  });

  it("4.5 passes structured bounded evidence to Gemini when provider succeeds", async () => {
    const geminiSpy = vi.spyOn(geminiService, "generateGeminiResponse").mockResolvedValue("Grounded AI analysis result.");

    const res = await generateArchitectureSummary("test-repo", { frameworks: ["Next.js"] }, mockGraphData);
    expect(res).toBe("Grounded AI analysis result.");
    expect(geminiSpy).toHaveBeenCalled();
    const contextPassed = geminiSpy.mock.calls[0][1];
    expect(contextPassed).toContain("Repository: test-repo");
    expect(contextPassed).toContain("Total Files: 10");
  });
});
