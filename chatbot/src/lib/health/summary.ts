import { generateGeminiResponse } from "@/lib/ai/gemini-service";
import { RepositoryHealthReport } from "./types";

export function formatHealthEvidence(
  repoName: string,
  report: RepositoryHealthReport
): string {
  const lines: string[] = [];
  const { summary, hotspots } = report;

  lines.push(`Repository: ${repoName}`);
  lines.push(`Total Files Scanned: ${summary.totalFilesScanned}`);
  lines.push(`Median Lines Per File: ${summary.medianLinesPerFile}`);
  lines.push(`Median Imports Per File: ${summary.medianImportsPerFile}`);
  lines.push(`Total TODO Comments: ${summary.totalTodos}`);
  lines.push(`Total FIXME Comments: ${summary.totalFixmes}`);
  lines.push(`Detected Test Files: ${summary.testFilesDetected}`);
  lines.push(`README Present: ${summary.hasReadme ? `Yes (${summary.readmeSizeBytes} bytes)` : "No"}`);
  lines.push(`Security Findings: ${summary.securityFindingsCount}`);

  lines.push("\nKey Health Signals:");
  const allSignals = [
    ...report.maintainabilitySignals,
    ...report.architectureSignals,
    ...report.documentationSignals,
    ...report.testingSignals,
    ...report.dependencySignals,
    ...report.securitySignals,
  ];

  for (const sig of allSignals) {
    lines.push(`- [${sig.category.toUpperCase()} / ${sig.severity.toUpperCase()}] ${sig.title}: ${sig.description}`);
  }

  lines.push("\nDetected Hotspots:");
  if (hotspots.length === 0) {
    lines.push("- None detected");
  } else {
    for (const h of hotspots.slice(0, 10)) {
      lines.push(`- ${h.path} (${h.signalType}): ${h.evidence}`);
    }
  }

  return lines.join("\n");
}

export function generateDeterministicHealthSummary(
  repoName: string,
  report: RepositoryHealthReport
): string {
  const { summary, hotspots } = report;
  const parts: string[] = [];

  parts.push(
    `### Code Health Assessment for ${repoName}\n\n` +
      `Codesphere analyzed **${summary.totalFilesScanned} files** with a repository median of **${summary.medianLinesPerFile} lines** and **${summary.medianImportsPerFile} imports** per file.`
  );

  if (hotspots.length > 0) {
    const topHotspots = hotspots.slice(0, 4).map((h) => `\`${h.path}\` (${h.signalType})`).join(", ");
    parts.push(`**Identified Hotspots (${hotspots.length})**: ${topHotspots}. These areas represent potential maintenance concentrations.`);
  } else {
    parts.push("**Hotspots**: No significant file size or dependency concentration hotspots were detected.");
  }

  const testStatus = summary.testFilesDetected > 0
    ? `Detected **${summary.testFilesDetected} test file(s)** matching standard testing conventions.`
    : "No standard test files were detected in the repository structure.";
  parts.push(`**Testing & Documentation**: ${testStatus} ${summary.hasReadme ? "A primary README is present." : "A primary README is missing."}`);

  if (summary.securityFindingsCount > 0) {
    parts.push(`⚠️ **Security Signals**: ${summary.securityFindingsCount} potential sensitive file or credential pattern(s) identified (redacted).`);
  }

  return parts.join("\n\n");
}

export async function generateHealthSummary(
  repoName: string,
  report: RepositoryHealthReport
): Promise<string> {
  const evidence = formatHealthEvidence(repoName, report);

  const prompt = `Summarize the repository code health and risk signals concisely in 2-3 structured paragraphs based ONLY on the provided evidence.
Highlight:
1. Overall maintainability and file sizing balance
2. Detected hotspots and dependency concentrations (neutral wording)
3. Testing, documentation, and security signals

DO NOT hallucinate or assume metrics that are not in the evidence. If a metric is not available, do not invent it.`;

  try {
    return await generateGeminiResponse(prompt, evidence);
  } catch {
    return generateDeterministicHealthSummary(repoName, report);
  }
}
