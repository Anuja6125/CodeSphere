import {
  FileHealthMetric,
  HealthReportSummary,
  HealthSignal,
  HotspotItem,
  RepositoryHealthReport,
} from "./types";
import { detectCircularDependencies } from "@/lib/architecture/graph-builder";

export function countMatches(text: string, regex: RegExp): number {
  const matches = text.match(regex);
  return matches ? matches.length : 0;
}

export function computeMedian(numbers: number[]): number {
  if (numbers.length === 0) return 0;
  const sorted = [...numbers].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

// Redact secret patterns for security compliance
export function redactSecretString(secret: string): string {
  if (secret.length <= 8) return "********";
  return secret.slice(0, 4) + "..." + secret.slice(-4);
}

export const SECRET_PATTERNS = [
  { name: "Private Key Header", regex: /-----BEGIN (RSA |OPENSSH |EC )?PRIVATE KEY-----/ },
  { name: "AWS Access Key", regex: /AKIA[0-9A-Z]{16}/ },
  { name: "GitHub Token", regex: /gh[pousr]_[A-Za-z0-9_]{20,}/ },
  { name: "Slack Token", regex: /xox[baprs]-[0-9a-zA-Z]{10,}/ },
  { name: "Generic API Key / Token Assignment", regex: /(api[_-]?key|secret|token|password)\s*[:=]\s*['"][a-zA-Z0-9_\-.~!@#$%^&*]{16,}['"]/i },
];

export function calculateRepositoryHealth(
  files: Array<{
    id: string;
    path: string;
    name: string;
    extension: string;
    size: number;
    linesCount: number;
    content: string | null;
    category: string | null;
    isSensitive?: boolean;
    isExcluded?: boolean;
  }>,
  dependencies: Array<{
    id: string;
    fromPath: string;
    toPath: string | null;
    toSpecifier: string;
    kind: string;
  }>,
  chunks: Array<{
    id: string;
    fileId: string;
    symbolName: string | null;
    chunkType: string;
    isExported: boolean;
  }> = [],
  entryPoints: Array<{ path: string }> = []
): RepositoryHealthReport {
  const activeFiles = files.filter((f) => !f.isExcluded);
  const fileMap = new Map(activeFiles.map((f) => [f.path, f]));
  const entrySet = new Set(entryPoints.map((e) => e.path));

  // Build degree maps and adjacency list
  const inDegreeMap = new Map<string, number>();
  const outDegreeMap = new Map<string, number>();
  const adjacencyList = new Map<string, string[]>();

  for (const f of activeFiles) {
    inDegreeMap.set(f.path, 0);
    outDegreeMap.set(f.path, 0);
    adjacencyList.set(f.path, []);
  }

  const validDeps = dependencies.filter(
    (d) => d.toPath && fileMap.has(d.fromPath) && fileMap.has(d.toPath)
  );

  for (const dep of validDeps) {
    outDegreeMap.set(dep.fromPath, (outDegreeMap.get(dep.fromPath) || 0) + 1);
    inDegreeMap.set(dep.toPath!, (inDegreeMap.get(dep.toPath!) || 0) + 1);
    adjacencyList.get(dep.fromPath)?.push(dep.toPath!);
  }

  // Detect circular dependencies
  const circularCycles = detectCircularDependencies(adjacencyList);
  const circularFiles = new Set(circularCycles.flat());

  // Aggregate symbols per file
  const symbolsPerFile = new Map<string, { functions: number; classes: number; exports: number }>();
  for (const chunk of chunks) {
    if (!symbolsPerFile.has(chunk.fileId)) {
      symbolsPerFile.set(chunk.fileId, { functions: 0, classes: 0, exports: 0 });
    }
    const stat = symbolsPerFile.get(chunk.fileId)!;
    if (chunk.chunkType === "function") stat.functions++;
    if (chunk.chunkType === "class") stat.classes++;
    if (chunk.isExported) stat.exports++;
  }

  // Calculate file-level metrics
  let totalTodos = 0;
  let totalFixmes = 0;
  const lineCounts: number[] = [];
  const importCounts: number[] = [];

  const fileMetrics: FileHealthMetric[] = activeFiles.map((file) => {
    const content = file.content || "";
    const todoCount = countMatches(content, /\bTODO\b[:\s]/gi);
    const fixmeCount = countMatches(content, /\bFIXME\b[:\s]/gi);
    totalTodos += todoCount;
    totalFixmes += fixmeCount;

    const inDeg = inDegreeMap.get(file.path) || 0;
    const outDeg = outDegreeMap.get(file.path) || 0;

    lineCounts.push(file.linesCount || 0);
    importCounts.push(outDeg);

    const sym = symbolsPerFile.get(file.id) || { functions: 0, classes: 0, exports: 0 };
    const isTest =
      file.category === "TEST" ||
      /\.(test|spec)\.[a-z0-9]+$/i.test(file.name) ||
      file.path.toLowerCase().includes("__tests__");
    const isDoc =
      file.category === "DOCUMENTATION" ||
      ["md", "mdx", "rst", "txt"].includes(file.extension.toLowerCase());

    // Deterministic Risk Assessment
    const riskReasons: string[] = [];
    if (file.linesCount > 500) {
      riskReasons.push(`Large file size (${file.linesCount} lines)`);
    }
    if (outDeg > 15) {
      riskReasons.push(`High dependency fan-out (${outDeg} imports)`);
    }
    if (inDeg > 10) {
      riskReasons.push(`High dependent fan-in (${inDeg} dependents)`);
    }
    if (todoCount + fixmeCount >= 5) {
      riskReasons.push(`Concentration of TODO/FIXME markers (${todoCount + fixmeCount})`);
    }
    if (circularFiles.has(file.path)) {
      riskReasons.push("Involved in circular dependency cycle");
    }

    let riskLevel: "low" | "medium" | "high" = "low";
    if (riskReasons.length >= 2 || file.linesCount > 800 || outDeg > 20) {
      riskLevel = "high";
    } else if (riskReasons.length === 1) {
      riskLevel = "medium";
    }

    return {
      fileId: file.id,
      path: file.path,
      lineCount: file.linesCount || 0,
      fileSize: file.size || 0,
      functionCount: sym.functions,
      classCount: sym.classes,
      importCount: outDeg,
      exportCount: sym.exports,
      dependencyCount: outDeg,
      dependentCount: inDeg,
      todoCount,
      fixmeCount,
      isTest,
      isDoc,
      riskLevel,
      riskReasons,
    };
  });

  const medianLinesPerFile = computeMedian(lineCounts);
  const medianImportsPerFile = computeMedian(importCounts);

  // Hotspots Identification (Neutral wording backed by evidence)
  const hotspots: HotspotItem[] = [];

  for (const m of fileMetrics) {
    if (m.isTest || m.isDoc) continue;

    if (m.lineCount > 500 && m.lineCount > medianLinesPerFile * 2.5) {
      hotspots.push({
        path: m.path,
        signalType: "Large file",
        evidence: `File contains ${m.lineCount} lines (repository median is ${medianLinesPerFile} lines).`,
        metrics: { lines: m.lineCount },
      });
    }

    if (m.dependencyCount > 12 && m.dependencyCount > medianImportsPerFile * 2.5) {
      hotspots.push({
        path: m.path,
        signalType: "High dependency concentration",
        evidence: `File imports ${m.dependencyCount} modules (repository median is ${medianImportsPerFile} imports).`,
        metrics: { outDegree: m.dependencyCount },
      });
    }

    if (m.dependentCount + m.dependencyCount > 18) {
      hotspots.push({
        path: m.path,
        signalType: "High connectivity",
        evidence: `File has ${m.dependentCount} incoming and ${m.dependencyCount} outgoing connections (${m.dependentCount + m.dependencyCount} total).`,
        metrics: { inDegree: m.dependentCount, outDegree: m.dependencyCount },
      });
    }

    if (m.dependentCount > 8 && m.lineCount > 250) {
      hotspots.push({
        path: m.path,
        signalType: "Potential maintenance hotspot",
        evidence: `Heavily relied upon by ${m.dependentCount} files while containing ${m.lineCount} lines.`,
        metrics: { inDegree: m.dependentCount, lines: m.lineCount },
      });
    }

    if (m.todoCount + m.fixmeCount >= 5) {
      hotspots.push({
        path: m.path,
        signalType: "High TODO concentration",
        evidence: `Contains ${m.todoCount} TODO and ${m.fixmeCount} FIXME markers.`,
        metrics: { todos: m.todoCount + m.fixmeCount },
      });
    }

    if (circularFiles.has(m.path)) {
      hotspots.push({
        path: m.path,
        signalType: "Circular dependency involvement",
        evidence: "Part of a detected circular import cycle in the dependency graph.",
        metrics: {},
      });
    }
  }

  // Deduplicate hotspots per file by prioritizing strongest signal
  const uniqueHotspots = Array.from(
    new Map(hotspots.map((h) => [h.path + h.signalType, h])).values()
  ).slice(0, 25);

  // Categorized Signals
  const maintainabilitySignals: HealthSignal[] = [];
  const architectureSignals: HealthSignal[] = [];
  const documentationSignals: HealthSignal[] = [];
  const testingSignals: HealthSignal[] = [];
  const dependencySignals: HealthSignal[] = [];
  const securitySignals: HealthSignal[] = [];

  // 1. Maintainability Signals
  const largeFilesCount = fileMetrics.filter((f) => f.lineCount > 500).length;
  if (largeFilesCount > 0) {
    maintainabilitySignals.push({
      id: "maint-large-files",
      category: "maintainability",
      severity: largeFilesCount > 5 ? "warning" : "caution",
      title: "Large File Concentration",
      description: `Detected ${largeFilesCount} file(s) exceeding 500 lines of code.`,
      evidence: {
        metricName: "Large Files (>500 lines)",
        metricValue: largeFilesCount,
        repoMedian: medianLinesPerFile,
        details: fileMetrics
          .filter((f) => f.lineCount > 500)
          .map((f) => `${f.path} (${f.lineCount} lines)`)
          .slice(0, 5),
      },
    });
  } else {
    maintainabilitySignals.push({
      id: "maint-sizes-balanced",
      category: "maintainability",
      severity: "good",
      title: "Balanced File Sizes",
      description: "All source files are under 500 lines of code.",
      evidence: {
        metricName: "Median File Lines",
        metricValue: medianLinesPerFile,
      },
    });
  }

  if (totalTodos + totalFixmes > 0) {
    maintainabilitySignals.push({
      id: "maint-todo-markers",
      category: "maintainability",
      severity: totalTodos + totalFixmes > 20 ? "caution" : "info",
      title: "Pending Work Markers",
      description: `Found ${totalTodos} TODO and ${totalFixmes} FIXME comments across repository files.`,
      evidence: {
        metricName: "TODO/FIXME Comments",
        metricValue: totalTodos + totalFixmes,
      },
    });
  }

  // 2. Architecture Signals
  if (circularCycles.length > 0) {
    architectureSignals.push({
      id: "arch-circular-deps",
      category: "architecture",
      severity: "warning",
      title: "Circular Dependency Cycles Detected",
      description: `Found ${circularCycles.length} circular import cycle(s) in repository modules.`,
      evidence: {
        metricName: "Circular Cycles",
        metricValue: circularCycles.length,
        details: circularCycles.slice(0, 3).map((c) => c.join(" → ")),
      },
    });
  } else {
    architectureSignals.push({
      id: "arch-acyclic",
      category: "architecture",
      severity: "good",
      title: "Acyclic Dependency Flow",
      description: "No circular dependencies detected among imported files.",
      evidence: {
        metricName: "Circular Cycles",
        metricValue: 0,
      },
    });
  }

  // 3. Documentation Signals
  const readme = activeFiles.find((f) =>
    ["readme.md", "readme", "readme.txt"].includes(f.name.toLowerCase())
  );
  const docFiles = activeFiles.filter((f) => f.category === "DOCUMENTATION");

  if (readme) {
    documentationSignals.push({
      id: "doc-readme-present",
      category: "documentation",
      severity: "good",
      title: "Project README Present",
      description: `README documentation exists (${Math.round((readme.size || 0) / 1024)} KB).`,
      evidence: {
        file: readme.path,
        metricName: "README Size",
        metricValue: `${readme.size || 0} bytes`,
      },
    });
  } else {
    documentationSignals.push({
      id: "doc-readme-missing",
      category: "documentation",
      severity: "warning",
      title: "Missing Primary README",
      description: "No README.md file detected in the repository root.",
      evidence: {
        metricName: "README Status",
        metricValue: "Not found",
      },
    });
  }

  documentationSignals.push({
    id: "doc-files-count",
    category: "documentation",
    severity: docFiles.length > 0 ? "info" : "caution",
    title: "Documentation Files",
    description: `Detected ${docFiles.length} documentation file(s) across the project.`,
    evidence: {
      metricName: "Documentation Files",
      metricValue: docFiles.length,
      details: docFiles.map((d) => d.path).slice(0, 5),
    },
  });

  // 4. Testing Signals (Strictly labeled as detected test-file signals)
  const testFiles = fileMetrics.filter((f) => f.isTest);
  const sourceFiles = fileMetrics.filter((f) => !f.isTest && !f.isDoc);

  if (testFiles.length > 0) {
    testingSignals.push({
      id: "test-files-detected",
      category: "testing",
      severity: "good",
      title: "Detected Test-File Signals",
      description: `Identified ${testFiles.length} test file(s) matching standard test naming conventions.`,
      evidence: {
        metricName: "Test Files Detected",
        metricValue: testFiles.length,
        details: testFiles.map((t) => t.path).slice(0, 5),
      },
    });
  } else {
    testingSignals.push({
      id: "test-files-none",
      category: "testing",
      severity: "caution",
      title: "No Detected Test-File Signals",
      description: "No files matching standard test naming patterns (*.test.*, *.spec.*, __tests__) were detected.",
      evidence: {
        metricName: "Test Files Detected",
        metricValue: 0,
      },
    });
  }

  // 5. Dependency Signals
  const highFanOutFiles = fileMetrics.filter((f) => f.dependencyCount > 15);
  if (highFanOutFiles.length > 0) {
    dependencySignals.push({
      id: "dep-high-fanout",
      category: "dependency",
      severity: "caution",
      title: "High Dependency Fan-Out",
      description: `${highFanOutFiles.length} file(s) import more than 15 modules.`,
      evidence: {
        metricName: "High Fan-Out Files",
        metricValue: highFanOutFiles.length,
        repoMedian: medianImportsPerFile,
        details: highFanOutFiles.map((f) => `${f.path} (${f.dependencyCount} imports)`).slice(0, 5),
      },
    });
  } else {
    dependencySignals.push({
      id: "dep-fanout-normal",
      category: "dependency",
      severity: "good",
      title: "Balanced Module Coupling",
      description: `Modules maintain manageable dependency counts (median: ${medianImportsPerFile} imports).`,
      evidence: {
        metricName: "Median Imports",
        metricValue: medianImportsPerFile,
      },
    });
  }

  // 6. Security Signals (Safe detection & secret redaction)
  let securityFindingsCount = 0;
  for (const file of files) {
    // Sensitive files
    if (file.isSensitive) {
      securityFindingsCount++;
      securitySignals.push({
        id: `sec-sensitive-${file.id}`,
        category: "security",
        severity: "warning",
        title: "Sensitive File Pattern Detected",
        description: `File matches sensitive pattern and is excluded from public retrieval.`,
        evidence: {
          file: file.path,
          metricName: "Sensitive Pattern",
          metricValue: "Credentials/Key/Environment",
        },
        isRedacted: true,
      });
    }

    // Secret pattern in content
    if (file.content) {
      for (const pat of SECRET_PATTERNS) {
        if (pat.regex.test(file.content)) {
          securityFindingsCount++;
          securitySignals.push({
            id: `sec-pattern-${file.id}-${pat.name}`,
            category: "security",
            severity: "warning",
            title: `Potential Credential Pattern Detected`,
            description: `Potential ${pat.name} detected in configuration or source file. Content is redacted.`,
            evidence: {
              file: file.path,
              metricName: "Matched Rule",
              metricValue: pat.name,
            },
            isRedacted: true,
          });
          break; // One finding per file is sufficient
        }
      }
    }
  }

  if (securitySignals.length === 0) {
    securitySignals.push({
      id: "sec-no-secrets",
      category: "security",
      severity: "good",
      title: "No Exposed Secrets Detected",
      description: "No obvious hardcoded private keys or access tokens detected in scanned files.",
      evidence: {
        metricName: "Scanned Files",
        metricValue: activeFiles.length,
      },
    });
  }

  const summary: HealthReportSummary = {
    totalFilesScanned: activeFiles.length,
    medianLinesPerFile,
    medianImportsPerFile,
    totalTodos,
    totalFixmes,
    testFilesDetected: testFiles.length,
    hasReadme: Boolean(readme),
    readmeSizeBytes: readme?.size || 0,
    securityFindingsCount,
  };

  return {
    maintainabilitySignals,
    architectureSignals,
    documentationSignals,
    testingSignals,
    dependencySignals,
    securitySignals,
    hotspots: uniqueHotspots,
    fileMetrics: fileMetrics.slice(0, 500),
    summary,
  };
}
