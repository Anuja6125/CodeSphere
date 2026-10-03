/* eslint-disable @typescript-eslint/no-var-requires */
// Builds the dependency graph with the original, trusted analyzer in backend/utils.
const { scanDirectory } = require("../../utils/fileScanner");
const { analyzeDependencies } = require("../../utils/dependencyAnalyzer");
const { buildProjectStats } = require("../../utils/projectStats");
const { buildWhereToStart } = require("../../utils/projectGuidance");

export type GraphRole = "entry" | "shared" | "leaf" | "isolated" | "module";

export type GraphNode = {
  id: string; // file path, unique
  label: string; // file name
  folder: string;
  role: GraphRole;
  dependsOn: number;
  dependedBy: number;
};

export type GraphEdge = { id: string; source: string; target: string };

export type RepositoryGraphData = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  stats: Record<string, unknown>;
  unresolved: { source: string; specifier: string }[];
  whereToStart: { suggestions: unknown[]; notes: string[] };
};

export function buildRepositoryGraph(projectRoot: string): RepositoryGraphData {
  const files: string[] = scanDirectory(projectRoot);
  const { dependencies, unresolved, fileGraph } = analyzeDependencies(projectRoot, files);
  const stats = buildProjectStats(files, dependencies, unresolved, fileGraph);
  const whereToStart = buildWhereToStart(stats, unresolved);

  const entry = new Set<string>(stats.entryFiles);
  const isolated = new Set<string>(stats.isolatedFiles);
  const leaf = new Set<string>(stats.leafFiles);
  const shared = new Set<string>(
    stats.mostImported.filter((m: { importedByCount: number }) => m.importedByCount >= 2).map((m: { file: string }) => m.file)
  );

  const nodes: GraphNode[] = files.map((file) => {
    const parts = file.split("/");
    const role: GraphRole = isolated.has(file)
      ? "isolated"
      : entry.has(file)
        ? "entry"
        : shared.has(file)
          ? "shared"
          : leaf.has(file)
            ? "leaf"
            : "module";
    return {
      id: file,
      label: parts[parts.length - 1],
      folder: parts.slice(0, -1).join("/") || ".",
      role,
      dependsOn: fileGraph[file]?.dependsOn.length ?? 0,
      dependedBy: fileGraph[file]?.dependedBy.length ?? 0,
    };
  });

  const edges: GraphEdge[] = dependencies.map((d: { source: string; target: string }) => ({
    id: `${d.source}->${d.target}`,
    source: d.source,
    target: d.target,
  }));

  return { nodes, edges, stats, unresolved, whereToStart };
}
