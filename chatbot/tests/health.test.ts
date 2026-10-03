import { describe, it, expect } from "vitest";
import { calculateRepositoryHealth, redactSecretString } from "@/lib/health/calculator";

describe("Code Health & Risk Intelligence Unit Tests", () => {
  const mockFiles = [
    {
      id: "f1",
      path: "src/services/auth.ts",
      name: "auth.ts",
      extension: "ts",
      size: 15000,
      linesCount: 650, // Large file > 500
      content: `
        // TODO: refactor token verification
        // FIXME: fix race condition in session refresh
        // TODO: add rate limiting
        // TODO: implement audit logging
        // TODO: add biometric auth
        export function authenticate() {}
      `,
      category: "SOURCE_CODE",
      isSensitive: false,
    },
    {
      id: "f2",
      path: "src/utils/helpers.ts",
      name: "helpers.ts",
      extension: "ts",
      size: 2000,
      linesCount: 50,
      content: "export function format() {}",
      category: "SOURCE_CODE",
      isSensitive: false,
    },
    {
      id: "f3",
      path: "tests/auth.test.ts",
      name: "auth.test.ts",
      extension: "ts",
      size: 3000,
      linesCount: 120,
      content: "describe('auth', () => {})",
      category: "TEST",
      isSensitive: false,
    },
    {
      id: "f4",
      path: ".env.production",
      name: ".env.production",
      extension: "production",
      size: 500,
      linesCount: 10,
      content: "DATABASE_URL=postgres://user:secret@localhost:5432/db",
      category: "CONFIG",
      isSensitive: true,
    },
    {
      id: "f5",
      path: "src/config/aws.ts",
      name: "aws.ts",
      extension: "ts",
      size: 800,
      linesCount: 20,
      content: 'const key = "AKIA1234567890ABCDEF";',
      category: "CONFIG",
      isSensitive: false,
    },
    {
      id: "f6",
      path: "README.md",
      name: "README.md",
      extension: "md",
      size: 4500,
      linesCount: 150,
      content: "# Codesphere\nProject documentation.",
      category: "DOCUMENTATION",
      isSensitive: false,
    },
  ];

  const mockDeps = [
    { id: "d1", fromPath: "src/services/auth.ts", toPath: "src/utils/helpers.ts", toSpecifier: "./helpers", kind: "import" },
  ];

  it("2.1 calculates file-level metrics accurately including TODOs and FIXMEs", () => {
    const report = calculateRepositoryHealth(mockFiles, mockDeps, [], []);
    const authMetric = report.fileMetrics.find((f) => f.path === "src/services/auth.ts");

    expect(authMetric).toBeDefined();
    expect(authMetric?.lineCount).toBe(650);
    expect(authMetric?.todoCount).toBe(4);
    expect(authMetric?.fixmeCount).toBe(1);
    expect(authMetric?.isTest).toBe(false);
    expect(authMetric?.isDoc).toBe(false);
  });

  it("2.2 identifies hotspots with neutral, evidence-based wording", () => {
    const report = calculateRepositoryHealth(mockFiles, mockDeps, [], []);

    // auth.ts is large (> 500 lines) and has TODO concentration
    const largeFileHotspot = report.hotspots.find(
      (h) => h.path === "src/services/auth.ts" && h.signalType === "Large file"
    );
    expect(largeFileHotspot).toBeDefined();
    expect(largeFileHotspot?.evidence).toContain("File contains 650 lines");

    const todoHotspot = report.hotspots.find(
      (h) => h.path === "src/services/auth.ts" && h.signalType === "High TODO concentration"
    );
    expect(todoHotspot).toBeDefined();
    expect(todoHotspot?.evidence).toContain("Contains 4 TODO and 1 FIXME markers");
  });

  it("2.3 redacts sensitive secrets in security signals", () => {
    const report = calculateRepositoryHealth(mockFiles, mockDeps, [], []);

    const secretSignal = report.securitySignals.find(
      (s) => s.title.includes("Credential") || s.title.includes("Sensitive")
    );
    expect(secretSignal).toBeDefined();
    expect(secretSignal?.isRedacted).toBe(true);

    // Verify secret redaction utility
    const redacted = redactSecretString("AKIA1234567890ABCDEF");
    expect(redacted).toBe("AKIA...CDEF");
    expect(redacted).not.toBe("AKIA1234567890ABCDEF");
  });

  it("2.4 detects test files and labels them as detected test-file signals", () => {
    const report = calculateRepositoryHealth(mockFiles, mockDeps, [], []);

    const testSignal = report.testingSignals.find((s) => s.id === "test-files-detected");
    expect(testSignal).toBeDefined();
    expect(testSignal?.title).toBe("Detected Test-File Signals");
    expect(report.summary.testFilesDetected).toBe(1);
  });

  it("2.5 evaluates documentation presence deterministically", () => {
    const report = calculateRepositoryHealth(mockFiles, mockDeps, [], []);

    const docSignal = report.documentationSignals.find((s) => s.id === "doc-readme-present");
    expect(docSignal).toBeDefined();
    expect(report.summary.hasReadme).toBe(true);
    expect(report.summary.readmeSizeBytes).toBe(4500);
  });

  it("2.6 produces deterministic results on identical input", () => {
    const reportA = calculateRepositoryHealth(mockFiles, mockDeps, [], []);
    const reportB = calculateRepositoryHealth(mockFiles, mockDeps, [], []);

    expect(reportA.summary).toEqual(reportB.summary);
    expect(reportA.hotspots.length).toBe(reportB.hotspots.length);
    expect(reportA.maintainabilitySignals.length).toBe(reportB.maintainabilitySignals.length);
  });
});
