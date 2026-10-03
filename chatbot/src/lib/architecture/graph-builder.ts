import {
  ArchitectureEdge,
  ArchitectureGraphData,
  ArchitectureGroup,
  ArchitectureNode,
  ArchitectureStats,
} from "./types";
import { classifyArchitectureGroup, ARCHITECTURE_GROUP_METADATA } from "./classifier";

export interface BuildGraphOptions {
  view?: "modules" | "files";
  moduleFilter?: string;
  groupFilter?: ArchitectureGroup;
  maxFilesLimit?: number;
}

export function detectCircularDependencies(
  adjacencyList: Map<string, string[]>
): string[][] {
  const visited = new Set<string>();
  const recStack = new Set<string>();
  const cycles: string[][] = [];
  const path: string[] = [];

  function dfs(node: string) {
    visited.add(node);
    recStack.add(node);
    path.push(node);

    const neighbors = adjacencyList.get(node) || [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        dfs(neighbor);
      } else if (recStack.has(neighbor)) {
        // Cycle detected
        const cycleStartIndex = path.indexOf(neighbor);
        if (cycleStartIndex !== -1) {
          const cycle = path.slice(cycleStartIndex).concat(neighbor);
          // Avoid duplicate cycles with same set of nodes
          const sortedKey = [...cycle.slice(0, -1)].sort().join("|");
          if (!knownCycles.has(sortedKey)) {
            knownCycles.add(sortedKey);
            cycles.push(cycle);
          }
        }
      }
    }

    path.pop();
    recStack.delete(node);
  }

  const knownCycles = new Set<string>();
  for (const node of adjacencyList.keys()) {
    if (!visited.has(node)) {
      dfs(node);
    }
  }

  return cycles.slice(0, 20); // Cap at 20 detected cycles
}

export function buildArchitectureGraph(
  files: Array<{
    id: string;
    path: string;
    name: string;
    extension: string;
    size: number;
    linesCount: number;
    language: string | null;
    category: string | null;
    isDirectory: boolean;
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
  entryPoints: Array<{ path: string; reason?: string; confidence?: number }> = [],
  options: BuildGraphOptions = {}
): ArchitectureGraphData {
  const view = options.view || "modules";
  const { moduleFilter, groupFilter, maxFilesLimit = 300 } = options;

  // Filter out directories, sensitive, and excluded files
  const activeFiles = files.filter(
    (f) => !f.isDirectory && !f.isSensitive && !f.isExcluded
  );

  const fileMap = new Map(activeFiles.map((f) => [f.path, f]));
  const entryPointMap = new Map(entryPoints.map((e) => [e.path, e]));

  // Group symbols by fileId
  const symbolsByFileId = new Map<
    string,
    Array<{ name: string; kind: string; isExported: boolean }>
  >();
  for (const chunk of chunks) {
    if (chunk.symbolName) {
      if (!symbolsByFileId.has(chunk.fileId)) {
        symbolsByFileId.set(chunk.fileId, []);
      }
      symbolsByFileId.get(chunk.fileId)!.push({
        name: chunk.symbolName,
        kind: chunk.chunkType,
        isExported: chunk.isExported,
      });
    }
  }

  // Calculate file-level degrees and adjacency
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
    const from = dep.fromPath;
    const to = dep.toPath!;
    outDegreeMap.set(from, (outDegreeMap.get(from) || 0) + 1);
    inDegreeMap.set(to, (inDegreeMap.get(to) || 0) + 1);
    adjacencyList.get(from)?.push(to);
  }

  // Detect circular dependencies at file level
  const circularDependencies = detectCircularDependencies(adjacencyList);

  // Calculate statistics
  const totalFiles = activeFiles.length;
  const analyzedFiles = activeFiles.filter((f) => f.linesCount > 0).length;
  const dependencyEdges = validDeps.length;
  const detectedEntryPointsCount = entryPoints.filter((e) => fileMap.has(e.path)).length;

  const connectedList = activeFiles.map((f) => {
    const inDeg = inDegreeMap.get(f.path) || 0;
    const outDeg = outDegreeMap.get(f.path) || 0;
    return {
      path: f.path,
      inDegree: inDeg,
      outDegree: outDeg,
      total: inDeg + outDeg,
    };
  });

  const highlyConnectedFiles = [...connectedList]
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);

  const isolatedFiles = connectedList
    .filter((f) => f.total === 0)
    .map((f) => f.path)
    .slice(0, 50);

  // Group directory modules
  const moduleMap = new Map<
    string,
    {
      path: string;
      files: typeof activeFiles;
      lines: number;
      size: number;
      group: ArchitectureGroup;
      languages: Set<string>;
    }
  >();

  for (const file of activeFiles) {
    const parts = file.path.replace(/\\/g, "/").split("/");
    const modulePath = parts.length > 1 ? parts.slice(0, -1).join("/") : "root";
    const group = classifyArchitectureGroup(file.path, file.category);

    if (!moduleMap.has(modulePath)) {
      moduleMap.set(modulePath, {
        path: modulePath,
        files: [],
        lines: 0,
        size: 0,
        group,
        languages: new Set(),
      });
    }

    const mod = moduleMap.get(modulePath)!;
    mod.files.push(file);
    mod.lines += file.linesCount || 0;
    mod.size += file.size || 0;
    if (file.language) mod.languages.add(file.language);
  }

  const modulesCount = moduleMap.size;

  let nodes: ArchitectureNode[] = [];
  let edges: ArchitectureEdge[] = [];

  if (view === "modules") {
    // MODULE LEVEL GRAPH
    const moduleInDegree = new Map<string, number>();
    const moduleOutDegree = new Map<string, number>();

    for (const modPath of moduleMap.keys()) {
      moduleInDegree.set(modPath, 0);
      moduleOutDegree.set(modPath, 0);
    }

    // Build inter-module edges
    const moduleEdgeMap = new Map<string, { source: string; target: string; weight: number }>();

    for (const dep of validDeps) {
      const fromParts = dep.fromPath.replace(/\\/g, "/").split("/");
      const toParts = dep.toPath!.replace(/\\/g, "/").split("/");
      const fromMod = fromParts.length > 1 ? fromParts.slice(0, -1).join("/") : "root";
      const toMod = toParts.length > 1 ? toParts.slice(0, -1).join("/") : "root";

      if (fromMod !== toMod) {
        const edgeKey = `${fromMod}-->${toMod}`;
        if (!moduleEdgeMap.has(edgeKey)) {
          moduleEdgeMap.set(edgeKey, { source: fromMod, target: toMod, weight: 0 });
        }
        moduleEdgeMap.get(edgeKey)!.weight += 1;
        moduleOutDegree.set(fromMod, (moduleOutDegree.get(fromMod) || 0) + 1);
        moduleInDegree.set(toMod, (moduleInDegree.get(toMod) || 0) + 1);
      }
    }

    nodes = Array.from(moduleMap.entries()).map(([modPath, mod]) => {
      const isEntry = mod.files.some((f) => entryPointMap.has(f.path));
      const entryReason = isEntry
        ? mod.files.find((f) => entryPointMap.has(f.path))?.path
        : undefined;

      return {
        id: modPath,
        label: modPath === "root" ? "Root Files" : modPath,
        path: modPath,
        type: "module",
        group: mod.group,
        language: Array.from(mod.languages).join(", ") || null,
        lines: mod.lines,
        size: mod.size,
        inDegree: moduleInDegree.get(modPath) || 0,
        outDegree: moduleOutDegree.get(modPath) || 0,
        isEntryPoint: isEntry,
        entryPointReason: entryReason ? `Contains entry point: ${entryReason}` : undefined,
        symbols: [],
        hasChildren: true,
        childCount: mod.files.length,
      };
    });

    edges = Array.from(moduleEdgeMap.values()).map((e) => ({
      id: `${e.source}-->${e.target}`,
      source: e.source,
      target: e.target,
      kind: "dependency",
      specifier: `${e.weight} connection${e.weight > 1 ? "s" : ""}`,
      weight: e.weight,
    }));
  } else {
    // FILE LEVEL GRAPH
    let candidateFiles = activeFiles;

    if (moduleFilter) {
      candidateFiles = candidateFiles.filter((f) => {
        const p = f.path.replace(/\\/g, "/");
        return p.startsWith(moduleFilter + "/") || p === moduleFilter;
      });
    }

    if (groupFilter) {
      candidateFiles = candidateFiles.filter(
        (f) => classifyArchitectureGroup(f.path, f.category) === groupFilter
      );
    }

    // Limit to prevent browser freeze on massive repositories
    candidateFiles = candidateFiles.slice(0, maxFilesLimit);
    const candidatePathSet = new Set(candidateFiles.map((f) => f.path));

    nodes = candidateFiles.map((f) => {
      const ep = entryPointMap.get(f.path);
      const group = classifyArchitectureGroup(f.path, f.category);
      const syms = symbolsByFileId.get(f.id) || [];

      return {
        id: f.path,
        label: f.path.split("/").pop() || f.path,
        path: f.path,
        type: "file",
        group,
        language: f.language,
        lines: f.linesCount || 0,
        size: f.size || 0,
        inDegree: inDegreeMap.get(f.path) || 0,
        outDegree: outDegreeMap.get(f.path) || 0,
        isEntryPoint: Boolean(ep),
        entryPointReason: ep?.reason,
        symbols: syms.slice(0, 15),
        hasChildren: syms.length > 0,
      };
    });

    edges = validDeps
      .filter((d) => candidatePathSet.has(d.fromPath) && candidatePathSet.has(d.toPath!))
      .map((d) => ({
        id: d.id,
        source: d.fromPath,
        target: d.toPath!,
        kind: d.kind as any,
        specifier: d.toSpecifier,
        weight: 1,
      }));
  }

  // Generate Group Metadata summary
  const groupCounts = new Map<ArchitectureGroup, number>();
  for (const n of nodes) {
    groupCounts.set(n.group, (groupCounts.get(n.group) || 0) + 1);
  }

  const groups = Array.from(groupCounts.entries()).map(([groupId, count]) => ({
    id: groupId,
    name: ARCHITECTURE_GROUP_METADATA[groupId]?.name || groupId,
    nodeCount: count,
    color: ARCHITECTURE_GROUP_METADATA[groupId]?.color || "#94a3b8",
  }));

  const stats: ArchitectureStats = {
    totalFiles,
    analyzedFiles,
    dependencyEdges,
    entryPoints: detectedEntryPointsCount,
    modulesCount,
    highlyConnectedFiles,
    isolatedFiles,
    circularDependencies,
  };

  return { nodes, edges, groups, stats };
}
