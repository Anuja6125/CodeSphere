export type FileCategory =
  | "SOURCE_CODE"
  | "TEST"
  | "CONFIG"
  | "DOCUMENTATION"
  | "MARKUP"
  | "STYLESHEET"
  | "DATABASE"
  | "SCRIPT"
  | "API_SCHEMA"
  | "BUILD_CONFIG"
  | "DEPENDENCY_MANIFEST"
  | "OTHER";

export type ChunkType =
  | "function"
  | "class"
  | "method"
  | "interface"
  | "type"
  | "component"
  | "module"
  | "section"
  | "config_block"
  | "fallback";

export interface FileRef {
  id?: string;
  path: string;
  name: string;
  extension: string;
  size: number;
  isDirectory: boolean;
  content?: string | null;
  linesCount: number;
}

export interface GeneratedChunk {
  chunkIndex: number;
  startLine: number;
  endLine: number;
  content: string;
  language: string | null;
  chunkType: ChunkType;
  symbolName: string | null;
  isExported: boolean;
  parentSymbol: string | null;
}

export interface ExtractedDependency {
  fromPath: string;
  toSpecifier: string;
  kind: "import" | "require" | "include";
}

export interface EntryPoint {
  path: string;
  reason: string;
  confidence: number;
}

export interface ArchitectureAnalysis {
  languages: string[];
  frameworks: string[];
  packageManagers: string[];
  importantDirectories: string[];
  sourceFileCount: number;
  testFileCount: number;
  documentationFileCount: number;
  configFileCount: number;
  entryPoints: EntryPoint[];
  importantModules: string[];
  databaseFiles: string[];
  apiFiles: string[];
  fileStats: Record<string, number>;
}
