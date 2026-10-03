export type HealthCategory =
  | "maintainability"
  | "architecture"
  | "documentation"
  | "testing"
  | "dependency"
  | "security";

export type SignalSeverity = "info" | "good" | "caution" | "warning";

export interface HealthSignalEvidence {
  file?: string;
  metricName?: string;
  metricValue?: string | number;
  repoMedian?: string | number;
  details?: string[];
}

export interface HealthSignal {
  id: string;
  category: HealthCategory;
  severity: SignalSeverity;
  title: string;
  description: string;
  evidence: HealthSignalEvidence;
  isRedacted?: boolean;
}

export interface FileHealthMetric {
  fileId: string;
  path: string;
  lineCount: number;
  fileSize: number;
  functionCount: number;
  classCount: number;
  importCount: number;
  exportCount: number;
  dependencyCount: number; // Out-degree
  dependentCount: number;  // In-degree
  todoCount: number;
  fixmeCount: number;
  isTest: boolean;
  isDoc: boolean;
  riskLevel: "low" | "medium" | "high";
  riskReasons: string[];
}

export interface HotspotItem {
  path: string;
  signalType:
    | "High dependency concentration"
    | "Large file"
    | "High connectivity"
    | "Potential maintenance hotspot"
    | "Circular dependency involvement"
    | "High TODO concentration";
  evidence: string;
  metrics: {
    lines?: number;
    inDegree?: number;
    outDegree?: number;
    todos?: number;
    symbols?: number;
  };
}

export interface HealthReportSummary {
  totalFilesScanned: number;
  medianLinesPerFile: number;
  medianImportsPerFile: number;
  totalTodos: number;
  totalFixmes: number;
  testFilesDetected: number;
  hasReadme: boolean;
  readmeSizeBytes: number;
  securityFindingsCount: number;
}

export interface RepositoryHealthReport {
  maintainabilitySignals: HealthSignal[];
  architectureSignals: HealthSignal[];
  documentationSignals: HealthSignal[];
  testingSignals: HealthSignal[];
  dependencySignals: HealthSignal[];
  securitySignals: HealthSignal[];
  hotspots: HotspotItem[];
  fileMetrics: FileHealthMetric[];
  summary: HealthReportSummary;
}
