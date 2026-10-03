export interface ImpactTarget {
  type: "file" | "symbol" | "query";
  path: string;
  symbolName?: string | null;
  chunkId?: string | null;
}

export interface ImpactNode {
  path: string;
  fileId: string;
  depth: number; // 1 = direct, 2 = second-order, 3 = third-order
  relationship: "imports" | "imported_by" | "transitive_dependent" | "transitive_dependency";
  via: string[]; // Path chain
  isEntryPoint: boolean;
  isTest: boolean;
  isDoc: boolean;
  language?: string | null;
  linesCount?: number;
}

export interface SemanticImpactItem {
  path: string;
  chunkId: string;
  contentSnippet: string;
  similarity: number;
  hybridScore: number;
  reason: string;
  symbolName?: string | null;
  chunkType?: string;
  startLine: number;
  endLine: number;
}

export interface ChangeImpactResult {
  target: ImpactTarget;
  directDependencies: ImpactNode[]; // What target imports
  directDependents: ImpactNode[];   // What imports target
  transitiveDependents: ImpactNode[]; // Second & third order dependents
  transitiveDependencies: ImpactNode[];
  relatedTests: ImpactNode[];       // Test files importing or referencing target
  relatedDocumentation: ImpactNode[];
  semanticRelatedFiles: SemanticImpactItem[];
  affectedEntryPoints: Array<{ path: string; reason?: string }>;
  riskLevel: "low" | "medium" | "high";
  riskReasons: string[];
  summary: {
    directDependenciesCount: number;
    directDependentsCount: number;
    transitiveDependentsCount: number;
    affectedEntryPointsCount: number;
    relatedTestsCount: number;
    semanticMatchesCount: number;
  };
}
