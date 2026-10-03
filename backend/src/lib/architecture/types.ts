export type ArchitectureGroup =
  | "application"
  | "components"
  | "services"
  | "api"
  | "database"
  | "configuration"
  | "utilities"
  | "tests"
  | "documentation"
  | "assets"
  | "scripts"
  | "other";

export interface ArchitectureNodeSymbol {
  name: string;
  kind: string;
  isExported: boolean;
}

export interface ArchitectureNode {
  id: string;
  label: string;
  path: string;
  type: "file" | "directory" | "module" | "group";
  group: ArchitectureGroup;
  language: string | null;
  lines: number;
  size: number;
  inDegree: number;
  outDegree: number;
  isEntryPoint: boolean;
  entryPointReason?: string;
  symbols: ArchitectureNodeSymbol[];
  hasChildren: boolean;
  parentId?: string;
  childCount?: number;
}

export interface ArchitectureEdge {
  id: string;
  source: string;
  target: string;
  kind: "import" | "require" | "include" | "dependency";
  specifier: string;
  weight?: number;
}

export interface CircularDependencyCycle {
  cycle: string[];
}

export interface ArchitectureStats {
  totalFiles: number;
  analyzedFiles: number;
  dependencyEdges: number;
  entryPoints: number;
  modulesCount: number;
  highlyConnectedFiles: Array<{
    path: string;
    inDegree: number;
    outDegree: number;
    total: number;
  }>;
  isolatedFiles: string[];
  circularDependencies: string[][];
}

export interface ArchitectureGroupInfo {
  id: ArchitectureGroup;
  name: string;
  nodeCount: number;
  color: string;
}

export interface ArchitectureGraphData {
  nodes: ArchitectureNode[];
  edges: ArchitectureEdge[];
  groups: ArchitectureGroupInfo[];
  stats: ArchitectureStats;
}
