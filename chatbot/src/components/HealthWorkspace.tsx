"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  ShieldAlert,
  Activity,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  FileCode2,
  GitFork,
  FileText,
  Lock,
  Search,
  ArrowUpDown,
  Sparkles,
  RefreshCw,
  ExternalLink,
  ChevronDown,
  Info,
  X,
  Loader2,
  Layers,
  Wrench
} from "lucide-react";
import { clsx } from "clsx";
import { safeFetchJson } from "@/lib/api-client";
import {
  FileHealthMetric,
  HealthCategory,
  HealthSignal,
  HotspotItem,
  RepositoryHealthReport,
  SignalSeverity,
} from "@/lib/health/types";

interface HealthWorkspaceProps {
  repositoryId: string;
  onInspectFile?: (filePath: string) => void;
}

const CATEGORY_TABS: Array<{ id: HealthCategory | "all"; label: string; icon: any }> = [
  { id: "all", label: "All Signals", icon: Activity },
  { id: "maintainability", label: "Maintainability", icon: Wrench },
  { id: "architecture", label: "Architecture", icon: Layers },
  { id: "security", label: "Security", icon: Lock },
  { id: "dependency", label: "Dependencies", icon: GitFork },
  { id: "testing", label: "Testing", icon: CheckCircle2 },
  { id: "documentation", label: "Documentation", icon: FileText },
];

export function HealthWorkspace({
  repositoryId,
  onInspectFile,
}: HealthWorkspaceProps) {
  const [report, setReport] = useState<RepositoryHealthReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [activeCategory, setActiveCategory] = useState<HealthCategory | "all">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortField, setSortField] = useState<keyof FileHealthMetric>("lineCount");
  const [sortAsc, setSortAsc] = useState(false);

  const [summary, setSummary] = useState<string | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

  const loadHealth = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/repos/${repositoryId}/health`);
      const data = await safeFetchJson(res, "Failed to load health report");
      setReport(data.report);
    } catch (err: any) {
      setError(err.message || "Failed to calculate health metrics.");
    } finally {
      setLoading(false);
    }
  }, [repositoryId]);

  useEffect(() => {
    loadHealth();
  }, [loadHealth]);

  const loadSummary = async () => {
    setSummaryLoading(true);
    try {
      const res = await fetch(`/api/repos/${repositoryId}/health/summary`, {
        method: "POST",
      });
      const data = await safeFetchJson(res, "Failed to load summary");
      setSummary(data.summary);
    } catch {
      // Ignore
    } finally {
      setSummaryLoading(false);
    }
  };

  // Collect all signals
  const allSignals = useMemo(() => {
    if (!report) return [];
    return [
      ...report.maintainabilitySignals,
      ...report.architectureSignals,
      ...report.securitySignals,
      ...report.dependencySignals,
      ...report.testingSignals,
      ...report.documentationSignals,
    ];
  }, [report]);

  // Filter signals
  const filteredSignals = useMemo(() => {
    if (activeCategory === "all") return allSignals;
    return allSignals.filter((s) => s.category === activeCategory);
  }, [allSignals, activeCategory]);

  // Filter and sort file metrics
  const sortedFileMetrics = useMemo(() => {
    if (!report) return [];
    let list = report.fileMetrics;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((f) => f.path.toLowerCase().includes(q));
    }

    return [...list].sort((a, b) => {
      const valA = a[sortField] ?? 0;
      const valB = b[sortField] ?? 0;
      if (typeof valA === "string" && typeof valB === "string") {
        return sortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      return sortAsc ? (valA as number) - (valB as number) : (valB as number) - (valA as number);
    });
  }, [report, searchQuery, sortField, sortAsc]);

  const toggleSort = (field: keyof FileHealthMetric) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  const getSeverityBadge = (severity: SignalSeverity) => {
    switch (severity) {
      case "good":
        return {
          icon: CheckCircle2,
          color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
          label: "Healthy",
        };
      case "info":
        return {
          icon: Info,
          color: "text-sky-400 bg-sky-500/10 border-sky-500/20",
          label: "Info",
        };
      case "caution":
        return {
          icon: AlertCircle,
          color: "text-amber-400 bg-amber-500/10 border-amber-500/20",
          label: "Attention",
        };
      case "warning":
        return {
          icon: AlertTriangle,
          color: "text-rose-400 bg-rose-500/10 border-rose-500/20",
          label: "Risk Signal",
        };
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#090e1a] text-slate-100 overflow-y-auto custom-scrollbar">
      {/* ─── Header ─── */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-b border-slate-800/80 bg-[#0c1222]/90 backdrop-blur-md sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-600/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow-sm">
            <Activity className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
              Code Health & Risk Intelligence
            </h3>
            <p className="text-[11px] text-slate-500">
              Measurable repository signals, hotspots, and evidence-based risk detection
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadSummary}
            disabled={summaryLoading || !report}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-300 border border-indigo-500/20 transition-colors text-xs font-medium"
          >
            <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
            {summaryLoading ? "Analyzing Health..." : summary ? "Regenerate AI Summary" : "AI Health Summary"}
          </button>
          <button
            onClick={loadHealth}
            disabled={loading}
            className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-white transition-colors"
            title="Refresh Health Data"
          >
            <RefreshCw className={clsx("w-3.5 h-3.5", loading && "animate-spin")} />
          </button>
        </div>
      </div>

      {/* ─── AI Health Summary ─── */}
      {summary && (
        <div className="mx-6 mt-4 p-4 rounded-xl bg-indigo-950/20 border border-indigo-500/20 flex items-start gap-3 relative animate-slide-in">
          <Sparkles className="w-4 h-4 text-indigo-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1 text-xs text-slate-300 leading-relaxed max-h-36 overflow-y-auto custom-scrollbar">
            <div className="prose prose-invert prose-xs max-w-none">
              {summary.split("\n").map((para, i) => (
                <p key={i} className="mb-1">{para}</p>
              ))}
            </div>
          </div>
          <button onClick={() => setSummary(null)} className="text-slate-500 hover:text-slate-300 p-1">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* ─── Content ─── */}
      <div className="p-6 space-y-8 flex-1">
        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center text-slate-400 space-y-3">
            <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
            <p className="text-sm font-medium">Computing repository health & risk metrics...</p>
          </div>
        ) : error ? (
          <div className="py-16 flex flex-col items-center justify-center text-center">
            <div className="w-12 h-12 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400 mb-3">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h4 className="text-sm font-semibold text-slate-200">Unable to calculate health</h4>
            <p className="text-xs text-slate-400 max-w-sm mt-1">{error}</p>
            <button
              onClick={loadHealth}
              className="mt-4 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-medium"
            >
              Retry
            </button>
          </div>
        ) : report ? (
          <>
            {/* 1. Summary Metrics Ribbon */}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
              {[
                { label: "Scanned Files", value: report.summary.totalFilesScanned, color: "text-slate-200" },
                { label: "Median Lines", value: report.summary.medianLinesPerFile, color: "text-indigo-400" },
                { label: "Median Imports", value: report.summary.medianImportsPerFile, color: "text-sky-400" },
                { label: "Pending TODOs", value: report.summary.totalTodos + report.summary.totalFixmes, color: "text-amber-400" },
                { label: "Test Files", value: report.summary.testFilesDetected, color: "text-emerald-400" },
                {
                  label: "README Status",
                  value: report.summary.hasReadme ? `${Math.round(report.summary.readmeSizeBytes / 1024)} KB` : "Missing",
                  color: report.summary.hasReadme ? "text-emerald-400" : "text-rose-400",
                },
                {
                  label: "Security Signals",
                  value: report.summary.securityFindingsCount,
                  color: report.summary.securityFindingsCount > 0 ? "text-rose-400" : "text-emerald-400",
                },
              ].map((stat, i) => (
                <div
                  key={i}
                  className="bg-slate-900/80 border border-slate-800/80 rounded-xl p-3 flex flex-col items-center justify-center text-center hover:border-slate-700/80 transition-colors"
                >
                  <span className={clsx("text-lg font-bold font-mono", stat.color)}>{stat.value}</span>
                  <span className="text-[10px] uppercase tracking-wider text-slate-500 font-medium mt-0.5">
                    {stat.label}
                  </span>
                </div>
              ))}
            </div>

            {/* 2. Hotspots Section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-400" /> Maintenance Hotspots
                  </h4>
                  <p className="text-xs text-slate-500">
                    Files exhibiting high size, connectivity, or dependency concentration
                  </p>
                </div>
                <span className="text-xs text-slate-400 bg-slate-900 px-2.5 py-1 rounded-full border border-slate-800">
                  {report.hotspots.length} detected
                </span>
              </div>

              {report.hotspots.length === 0 ? (
                <div className="bg-slate-900/40 border border-slate-800/60 rounded-xl p-6 text-center text-xs text-slate-500">
                  No files meet hotspot threshold criteria. Repository dependencies and sizing appear balanced.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {report.hotspots.map((hotspot, idx) => (
                    <div
                      key={idx}
                      className="bg-slate-900/60 border border-slate-800/80 hover:border-slate-700 rounded-xl p-4 flex flex-col justify-between space-y-3 transition-colors"
                    >
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] font-semibold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                            {hotspot.signalType}
                          </span>
                          {onInspectFile && (
                            <button
                              onClick={() => onInspectFile(hotspot.path)}
                              className="text-slate-500 hover:text-slate-200"
                              title="Inspect file"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                        <p className="text-xs font-mono font-medium text-slate-200 break-all">
                          {hotspot.path}
                        </p>
                        <p className="text-[11px] text-slate-400 leading-relaxed">
                          {hotspot.evidence}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 3. Categorized Signals */}
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h4 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4 text-indigo-400" /> Evidence-Based Health Signals
                  </h4>
                  <p className="text-xs text-slate-500">
                    Calculated repository indicators across architectural and maintainability dimensions
                  </p>
                </div>

                {/* Category Pills */}
                <div className="flex flex-wrap gap-1 bg-slate-900/80 border border-slate-800 p-1 rounded-lg">
                  {CATEGORY_TABS.map((cat) => (
                    <button
                      key={cat.id}
                      onClick={() => setActiveCategory(cat.id)}
                      className={clsx(
                        "px-2.5 py-1 rounded text-xs font-medium transition-colors flex items-center gap-1.5",
                        activeCategory === cat.id
                          ? "bg-indigo-600 text-white shadow-sm"
                          : "text-slate-400 hover:text-slate-200"
                      )}
                    >
                      <cat.icon className="w-3 h-3" />
                      {cat.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {filteredSignals.map((signal) => {
                  const badge = getSeverityBadge(signal.severity);
                  return (
                    <div
                      key={signal.id}
                      className="bg-slate-900/50 border border-slate-800/80 rounded-xl p-4 space-y-2.5 hover:border-slate-700/80 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <span
                            className={clsx(
                              "inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold border",
                              badge.color
                            )}
                          >
                            <badge.icon className="w-3 h-3" />
                            {badge.label}
                          </span>
                          <span className="text-[10px] uppercase font-semibold text-slate-500 tracking-wider">
                            {signal.category}
                          </span>
                        </div>
                      </div>

                      <div>
                        <h5 className="text-xs font-semibold text-slate-200">{signal.title}</h5>
                        <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                          {signal.description}
                        </p>
                      </div>

                      {signal.evidence && (
                        <div className="pt-2 border-t border-slate-800/60 text-[11px] text-slate-500 font-mono space-y-1">
                          {signal.evidence.metricName && (
                            <div className="flex justify-between">
                              <span>Metric:</span>
                              <span className="text-slate-300 font-semibold">{signal.evidence.metricValue}</span>
                            </div>
                          )}
                          {signal.evidence.repoMedian !== undefined && (
                            <div className="flex justify-between">
                              <span>Repository Median:</span>
                              <span className="text-slate-300">{signal.evidence.repoMedian}</span>
                            </div>
                          )}
                          {signal.evidence.details && signal.evidence.details.length > 0 && (
                            <div className="pt-1">
                              <span className="block text-[10px] uppercase text-slate-600 mb-0.5">Details:</span>
                              <ul className="list-disc list-inside space-y-0.5 text-slate-400">
                                {signal.evidence.details.map((d, i) => (
                                  <li key={i} className="truncate">{d}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 4. File-Level Metrics Table */}
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h4 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                    <FileCode2 className="w-4 h-4 text-sky-400" /> File-Level Metrics
                  </h4>
                  <p className="text-xs text-slate-500">
                    Granular code metrics and risk assessments per file
                  </p>
                </div>

                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Search file path..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full sm:w-60 bg-slate-900 border border-slate-800 rounded-lg text-xs pl-8 pr-3 py-1.5 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery("")}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>

              <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-900/40">
                <div className="overflow-x-auto custom-scrollbar max-h-96">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-800 bg-slate-900/80 text-[11px] text-slate-400 font-semibold uppercase tracking-wider sticky top-0 z-10">
                        <th className="py-2.5 px-4">File Path</th>
                        <th
                          className="py-2.5 px-3 cursor-pointer hover:text-white"
                          onClick={() => toggleSort("lineCount")}
                        >
                          <div className="flex items-center gap-1">
                            <span>Lines</span>
                            <ArrowUpDown className="w-3 h-3" />
                          </div>
                        </th>
                        <th
                          className="py-2.5 px-3 cursor-pointer hover:text-white"
                          onClick={() => toggleSort("importCount")}
                        >
                          <div className="flex items-center gap-1">
                            <span>Imports</span>
                            <ArrowUpDown className="w-3 h-3" />
                          </div>
                        </th>
                        <th
                          className="py-2.5 px-3 cursor-pointer hover:text-white"
                          onClick={() => toggleSort("dependentCount")}
                        >
                          <div className="flex items-center gap-1">
                            <span>Dependents</span>
                            <ArrowUpDown className="w-3 h-3" />
                          </div>
                        </th>
                        <th className="py-2.5 px-3">Symbols</th>
                        <th className="py-2.5 px-3">TODOs</th>
                        <th className="py-2.5 px-4">Risk Level</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/50 font-mono text-[12px]">
                      {sortedFileMetrics.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="py-8 text-center text-slate-500 font-sans">
                            No files match the search criteria.
                          </td>
                        </tr>
                      ) : (
                        sortedFileMetrics.map((file) => (
                          <tr
                            key={file.fileId}
                            className="hover:bg-slate-800/40 transition-colors"
                          >
                            <td className="py-2.5 px-4 font-medium text-slate-200 max-w-xs truncate">
                              <div className="flex items-center gap-2">
                                <span className="truncate">{file.path}</span>
                                {onInspectFile && (
                                  <button
                                    onClick={() => onInspectFile(file.path)}
                                    className="text-slate-600 hover:text-slate-300 flex-shrink-0"
                                    title="Inspect file"
                                  >
                                    <ExternalLink className="w-3 h-3" />
                                  </button>
                                )}
                              </div>
                            </td>
                            <td className="py-2.5 px-3 text-slate-300">{file.lineCount}</td>
                            <td className="py-2.5 px-3 text-slate-300">{file.importCount}</td>
                            <td className="py-2.5 px-3 text-slate-300">{file.dependentCount}</td>
                            <td className="py-2.5 px-3 text-slate-400">
                              {file.functionCount + file.classCount}
                            </td>
                            <td className="py-2.5 px-3 text-slate-400">
                              {file.todoCount + file.fixmeCount > 0 ? (
                                <span className="text-amber-400 font-semibold">
                                  {file.todoCount + file.fixmeCount}
                                </span>
                              ) : (
                                "0"
                              )}
                            </td>
                            <td className="py-2.5 px-4 font-sans">
                              <span
                                className={clsx(
                                  "px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider",
                                  file.riskLevel === "high"
                                    ? "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                                    : file.riskLevel === "medium"
                                    ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                                    : "bg-slate-800 text-slate-400"
                                )}
                              >
                                {file.riskLevel}
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
