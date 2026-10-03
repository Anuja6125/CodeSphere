import {
  ChangeImpactResult,
  ImpactNode,
  ImpactTarget,
  SemanticImpactItem,
} from "./types";

export interface AnalyzeImpactOptions {
  depth?: number; // 1, 2, 3
  semanticResults?: SemanticImpactItem[];
}

export function analyzeChangeImpact(
  target: ImpactTarget,
  files: Array<{
    id: string;
    path: string;
    name: string;
    extension: string;
    size: number;
    linesCount: number;
    language: string | null;
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
  entryPoints: Array<{ path: string; reason?: string }> = [],
  options: AnalyzeImpactOptions = {}
): ChangeImpactResult {
  const maxDepth = Math.min(Math.max(options.depth || 2, 1), 3);
  const semanticResults = options.semanticResults || [];

  const fileMap = new Map(files.map((f) => [f.path, f]));
  const entryPointMap = new Map(entryPoints.map((e) => [e.path, e]));

  // Adjacency for dependencies (what A imports: A -> B)
  const forwardAdjacency = new Map<string, Array<{ to: string; kind: string }>>();
  // Adjacency for dependents (what imports B: B <- A, so B -> A in reverse)
  const reverseAdjacency = new Map<string, Array<{ from: string; kind: string }>>();

  for (const f of files) {
    forwardAdjacency.set(f.path, []);
    reverseAdjacency.set(f.path, []);
  }

  for (const dep of dependencies) {
    if (dep.toPath && fileMap.has(dep.fromPath) && fileMap.has(dep.toPath)) {
      forwardAdjacency.get(dep.fromPath)?.push({ to: dep.toPath, kind: dep.kind });
      reverseAdjacency.get(dep.toPath)?.push({ from: dep.fromPath, kind: dep.kind });
    }
  }

  const isTestFile = (path: string) => {
    const file = fileMap.get(path);
    if (!file) return false;
    return (
      file.category === "TEST" ||
      /\.(test|spec)\.[a-z0-9]+$/i.test(file.name) ||
      path.toLowerCase().includes("__tests__")
    );
  };

  const isDocFile = (path: string) => {
    const file = fileMap.get(path);
    if (!file) return false;
    return (
      file.category === "DOCUMENTATION" ||
      ["md", "mdx", "rst", "txt"].includes(file.extension.toLowerCase())
    );
  };

  const createNode = (
    path: string,
    depth: number,
    relationship: ImpactNode["relationship"],
    via: string[]
  ): ImpactNode => {
    const f = fileMap.get(path);
    return {
      path,
      fileId: f?.id || path,
      depth,
      relationship,
      via,
      isEntryPoint: entryPointMap.has(path),
      isTest: isTestFile(path),
      isDoc: isDocFile(path),
      language: f?.language,
      linesCount: f?.linesCount,
    };
  };

  // 1. Direct Dependencies (what target imports)
  const directDepPaths = forwardAdjacency.get(target.path) || [];
  const directDependencies: ImpactNode[] = directDepPaths.map((d) =>
    createNode(d.to, 1, "imports", [target.path, d.to])
  );

  // 2. Direct Dependents (what imports target)
  const directDependentPaths = reverseAdjacency.get(target.path) || [];
  const directDependents: ImpactNode[] = directDependentPaths.map((d) =>
    createNode(d.from, 1, "imported_by", [d.from, target.path])
  );

  // 3. Transitive Dependents (BFS up to maxDepth)
  const transitiveDependents: ImpactNode[] = [];
  const visitedDependents = new Set<string>([target.path]);
  for (const d of directDependents) {
    visitedDependents.add(d.path);
  }

  // Queue holds: { currentPath, depth, via }
  let queue: Array<{ path: string; depth: number; via: string[] }> = directDependents.map((d) => ({
    path: d.path,
    depth: 1,
    via: [d.path],
  }));

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current.depth >= maxDepth) continue;

    const callers = reverseAdjacency.get(current.path) || [];
    for (const caller of callers) {
      if (!visitedDependents.has(caller.from)) {
        visitedDependents.add(caller.from);
        const nextDepth = current.depth + 1;
        const nextVia = [caller.from, ...current.via];

        const node = createNode(caller.from, nextDepth, "transitive_dependent", nextVia);
        transitiveDependents.push(node);
        queue.push({ path: caller.from, depth: nextDepth, via: nextVia });
      }
    }
  }

  // 4. Transitive Dependencies (what target imports transitively)
  const transitiveDependencies: ImpactNode[] = [];
  const visitedDependencies = new Set<string>([target.path]);
  for (const d of directDependencies) {
    visitedDependencies.add(d.path);
  }

  let depQueue: Array<{ path: string; depth: number; via: string[] }> = directDependencies.map((d) => ({
    path: d.path,
    depth: 1,
    via: [target.path, d.path],
  }));

  while (depQueue.length > 0) {
    const current = depQueue.shift()!;
    if (current.depth >= maxDepth) continue;

    const callees = forwardAdjacency.get(current.path) || [];
    for (const callee of callees) {
      if (!visitedDependencies.has(callee.to)) {
        visitedDependencies.add(callee.to);
        const nextDepth = current.depth + 1;
        const nextVia = [...current.via, callee.to];

        const node = createNode(callee.to, nextDepth, "transitive_dependency", nextVia);
        transitiveDependencies.push(node);
        depQueue.push({ path: callee.to, depth: nextDepth, via: nextVia });
      }
    }
  }

  // 5. Related Tests
  const allDependentNodes = [...directDependents, ...transitiveDependents];
  const relatedTests = allDependentNodes.filter((n) => n.isTest);

  // 6. Related Documentation
  const relatedDocumentation = allDependentNodes.filter((n) => n.isDoc);

  // 7. Affected Entry Points
  const affectedEntryPoints: Array<{ path: string; reason?: string }> = [];
  for (const node of allDependentNodes) {
    if (entryPointMap.has(node.path)) {
      const ep = entryPointMap.get(node.path)!;
      affectedEntryPoints.push({
        path: node.path,
        reason: `Invoked via dependent path: ${node.via.join(" → ")} (${ep.reason || "Entry point"})`,
      });
    }
  }
  if (entryPointMap.has(target.path)) {
    const ep = entryPointMap.get(target.path)!;
    affectedEntryPoints.unshift({
      path: target.path,
      reason: `Target is itself a primary entry point (${ep.reason || "Entry point"}).`,
    });
  }

  // 8. Deterministic Risk Signals Calculation
  const riskReasons: string[] = [];

  if (affectedEntryPoints.length > 0) {
    riskReasons.push(
      `Affects ${affectedEntryPoints.length} application entry point(s) (${affectedEntryPoints.map((e) => e.path).slice(0, 3).join(", ")}).`
    );
  }

  if (directDependents.length > 5) {
    riskReasons.push(`High direct fan-in: ${directDependents.length} modules import this target directly.`);
  }

  if (transitiveDependents.length > 5) {
    riskReasons.push(
      `Broad blast radius: ${transitiveDependents.length} transitive modules depend on this target.`
    );
  }

  if (directDependencies.length > 10) {
    riskReasons.push(`High dependency fan-out: target imports ${directDependencies.length} modules.`);
  }

  if (allDependentNodes.length > 2 && relatedTests.length === 0) {
    riskReasons.push("Absence of detected test coverage in direct or transitive dependents.");
  }

  const targetFile = fileMap.get(target.path);
  if (targetFile?.isSensitive || targetFile?.category === "CONFIG" || targetFile?.category === "BUILD_CONFIG") {
    riskReasons.push("Target is a configuration or sensitive infrastructure file.");
  }

  let riskLevel: "low" | "medium" | "high" = "low";
  if (
    affectedEntryPoints.length > 0 ||
    transitiveDependents.length > 6 ||
    directDependents.length > 5 ||
    (allDependentNodes.length > 3 && relatedTests.length === 0)
  ) {
    riskLevel = "high";
  } else if (directDependents.length >= 2 || transitiveDependents.length >= 2 || directDependencies.length > 6) {
    riskLevel = "medium";
  }

  if (riskReasons.length === 0) {
    riskReasons.push("Target has localized dependency impact with no entry point or broad transitive effects.");
  }

  return {
    target,
    directDependencies,
    directDependents,
    transitiveDependents,
    transitiveDependencies,
    relatedTests,
    relatedDocumentation,
    semanticRelatedFiles: semanticResults,
    affectedEntryPoints,
    riskLevel,
    riskReasons,
    summary: {
      directDependenciesCount: directDependencies.length,
      directDependentsCount: directDependents.length,
      transitiveDependentsCount: transitiveDependents.length,
      affectedEntryPointsCount: affectedEntryPoints.length,
      relatedTestsCount: relatedTests.length,
      semanticMatchesCount: semanticResults.length,
    },
  };
}
