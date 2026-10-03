import { generateGeminiResponse } from "@/lib/ai/gemini-service";
import { ArchitectureGraphData } from "./types";

export function formatArchitectureEvidence(
  repoName: string,
  techStack: any,
  graphData: ArchitectureGraphData
): string {
  const { stats, groups, nodes } = graphData;
  const lines: string[] = [];

  lines.push(`Repository: ${repoName}`);
  if (techStack) {
    lines.push(`Technologies: ${JSON.stringify(techStack)}`);
  }
  lines.push(`Total Files: ${stats.totalFiles}`);
  lines.push(`Analyzed Files: ${stats.analyzedFiles}`);
  lines.push(`Dependency Edges: ${stats.dependencyEdges}`);
  lines.push(`Entry Points Count: ${stats.entryPoints}`);
  lines.push(`Module Count: ${stats.modulesCount}`);

  lines.push("\nArchitecture Groups:");
  for (const g of groups) {
    lines.push(`- ${g.name}: ${g.nodeCount} nodes`);
  }

  lines.push("\nKey Entry Points:");
  const entryNodes = nodes.filter((n) => n.isEntryPoint).slice(0, 10);
  if (entryNodes.length === 0) {
    lines.push("- None explicitly identified");
  } else {
    for (const ep of entryNodes) {
      lines.push(`- ${ep.path} (${ep.entryPointReason || "Primary Entry"})`);
    }
  }

  lines.push("\nHighly Connected Modules / Files (High Fan-in / Fan-out):");
  if (stats.highlyConnectedFiles.length === 0) {
    lines.push("- None");
  } else {
    for (const hc of stats.highlyConnectedFiles.slice(0, 8)) {
      lines.push(`- ${hc.path}: ${hc.inDegree} incoming, ${hc.outDegree} outgoing connections`);
    }
  }

  if (stats.circularDependencies.length > 0) {
    lines.push("\nCircular Dependency Paths Detected:");
    for (const cycle of stats.circularDependencies.slice(0, 5)) {
      lines.push(`- ${cycle.join(" -> ")}`);
    }
  } else {
    lines.push("\nCircular Dependency Paths: None detected");
  }

  return lines.join("\n");
}

export function generateDeterministicArchitectureSummary(
  repoName: string,
  graphData: ArchitectureGraphData
): string {
  const { stats, groups, nodes } = graphData;
  const parts: string[] = [];

  parts.push(
    `### Architecture Overview for ${repoName}\n\n` +
      `The repository contains **${stats.totalFiles} files** across **${stats.modulesCount} structural modules**, with **${stats.dependencyEdges} mapped dependency relationships**.`
  );

  if (groups.length > 0) {
    const groupSummary = groups
      .map((g) => `**${g.name}** (${g.nodeCount})`)
      .join(", ");
    parts.push(`**Key Functional Layers**: ${groupSummary}.`);
  }

  const entryNodes = nodes.filter((n) => n.isEntryPoint);
  if (entryNodes.length > 0) {
    const epList = entryNodes
      .slice(0, 5)
      .map((e) => `\`${e.path}\``)
      .join(", ");
    parts.push(`**Primary Entry Points**: ${epList}.`);
  }

  if (stats.highlyConnectedFiles.length > 0) {
    const top = stats.highlyConnectedFiles[0];
    parts.push(
      `**Central Dependency Hub**: \`${top.path}\` with ${top.inDegree} dependents and ${top.outDegree} dependencies.`
    );
  }

  if (stats.circularDependencies.length > 0) {
    parts.push(
      `⚠️ **Circular Dependencies**: ${stats.circularDependencies.length} cycle candidate(s) detected (e.g., \`${stats.circularDependencies[0].slice(0, 3).join(" → ")}\`).`
    );
  }

  return parts.join("\n\n");
}

export async function generateArchitectureSummary(
  repoName: string,
  techStack: any,
  graphData: ArchitectureGraphData
): Promise<string> {
  const evidence = formatArchitectureEvidence(repoName, techStack, graphData);

  const prompt = `Summarize the repository architecture concisely in 2-3 structured paragraphs based ONLY on the provided evidence.
Highlight:
1. Core architectural structure and primary entry points
2. Key functional layers and module organization
3. Notable dependency patterns (central hubs or circular dependencies if any)

DO NOT hallucinate or assume files or frameworks that are not in the evidence. If evidence is missing, state what is known.`;

  try {
    return await generateGeminiResponse(prompt, evidence);
  } catch {
    // Graceful fallback to deterministic evidence-based summary
    return generateDeterministicArchitectureSummary(repoName, graphData);
  }
}
