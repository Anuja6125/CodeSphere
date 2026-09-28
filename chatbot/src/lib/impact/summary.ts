import { generateGeminiResponse } from "@/lib/ai/gemini-service";
import { ChangeImpactResult } from "./types";

export function formatImpactEvidence(
  repoName: string,
  result: ChangeImpactResult
): string {
  const lines: string[] = [];
  const { target, summary, directDependents, transitiveDependents, directDependencies, relatedTests, affectedEntryPoints, semanticRelatedFiles, riskLevel, riskReasons } = result;

  lines.push(`Repository: ${repoName}`);
  lines.push(`Target: ${target.path}${target.symbolName ? ` (Symbol: ${target.symbolName})` : ""}`);
  lines.push(`Target Type: ${target.type}`);
  lines.push(`Assessed Risk Level: ${riskLevel.toUpperCase()}`);

  lines.push("\nRisk Reasons:");
  for (const reason of riskReasons) {
    lines.push(`- ${reason}`);
  }

  lines.push("\nDirect Dependents (Files that import target):");
  if (directDependents.length === 0) {
    lines.push("- None (no modules directly import this target)");
  } else {
    for (const d of directDependents) {
      lines.push(`- ${d.path}${d.isEntryPoint ? " [ENTRY POINT]" : ""}${d.isTest ? " [TEST]" : ""}`);
    }
  }

  lines.push("\nTransitive Dependents (Indirectly affected files):");
  if (transitiveDependents.length === 0) {
    lines.push("- None");
  } else {
    for (const d of transitiveDependents.slice(0, 15)) {
      lines.push(`- ${d.path} (via: ${d.via.join(" -> ")})${d.isEntryPoint ? " [ENTRY POINT]" : ""}`);
    }
  }

  lines.push("\nDirect Dependencies (What target imports):");
  if (directDependencies.length === 0) {
    lines.push("- None");
  } else {
    for (const d of directDependencies) {
      lines.push(`- ${d.path}`);
    }
  }

  lines.push("\nAffected Entry Points:");
  if (affectedEntryPoints.length === 0) {
    lines.push("- None");
  } else {
    for (const ep of affectedEntryPoints) {
      lines.push(`- ${ep.path}: ${ep.reason || "Entry point"}`);
    }
  }

  lines.push("\nRelated Tests:");
  if (relatedTests.length === 0) {
    lines.push("- No test files detected among dependents");
  } else {
    for (const t of relatedTests) {
      lines.push(`- ${t.path}`);
    }
  }

  if (semanticRelatedFiles.length > 0) {
    lines.push("\nSemantically Related Files (Discovered via semantic vector retrieval):");
    for (const s of semanticRelatedFiles.slice(0, 5)) {
      lines.push(`- ${s.path} (L${s.startLine}–${s.endLine}, similarity: ${Math.round(s.similarity * 100)}%)`);
      lines.push(`  Snippet: "${s.contentSnippet.replace(/\n/g, " ").slice(0, 150)}..."`);
    }
  }

  return lines.join("\n");
}

export function generateDeterministicImpactSummary(
  repoName: string,
  result: ChangeImpactResult
): string {
  const { target, summary, directDependents, transitiveDependents, affectedEntryPoints, relatedTests, riskLevel, riskReasons } = result;
  const parts: string[] = [];

  parts.push(
    `### Change Impact Assessment for \`${target.path}\`\n\n` +
      `**Risk Level**: **${riskLevel.toUpperCase()}**\n\n` +
      `Modifying \`${target.path}\` directly affects **${summary.directDependentsCount} module(s)** and transitively cascades to **${summary.transitiveDependentsCount} downstream file(s)**.`
  );

  if (directDependents.length > 0) {
    const list = directDependents.map((d) => `\`${d.path}\``).join(", ");
    parts.push(`**Direct Dependents**: ${list}`);
  }

  if (affectedEntryPoints.length > 0) {
    const epList = affectedEntryPoints.map((e) => `\`${e.path}\``).join(", ");
    parts.push(`⚠️ **Affected Entry Points (${affectedEntryPoints.length})**: ${epList}. Changes to this target will impact primary execution flows.`);
  }

  if (relatedTests.length > 0) {
    const testList = relatedTests.map((t) => `\`${t.path}\``).join(", ");
    parts.push(`**Related Test Coverage**: ${testList}`);
  } else if (summary.directDependentsCount > 0) {
    parts.push("⚠️ **Test Gap**: No automated test files were detected among the dependents of this target.");
  }

  if (riskReasons.length > 0) {
    parts.push(`**Key Risk Factors**:\n${riskReasons.map((r) => `- ${r}`).join("\n")}`);
  }

  return parts.join("\n\n");
}

export async function generateImpactSummary(
  repoName: string,
  result: ChangeImpactResult
): Promise<string> {
  const evidence = formatImpactEvidence(repoName, result);

  const prompt = `Explain the implementation impact of modifying the target file/symbol in 2-3 concise paragraphs based ONLY on the provided evidence.
Explain:
1. Which modules directly import it and what features they represent.
2. Transitive cascade: how the change reaches downstream files and any affected entry points.
3. Test coverage and risk considerations.

Strict Instructions:
- Ground every statement in the provided evidence.
- Include explicit file citations (e.g. \`file.ts\`).
- Clearly distinguish between GRAPH-BASED DEPENDENTS and SEMANTICALLY RELATED files.
- If the repository evidence is insufficient, say: "I found related code, but the repository data is insufficient to determine the complete impact."`;

  try {
    return await generateGeminiResponse(prompt, evidence);
  } catch {
    return generateDeterministicImpactSummary(repoName, result);
  }
}
