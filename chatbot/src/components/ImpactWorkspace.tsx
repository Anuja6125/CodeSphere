"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  GitFork,
  AlertTriangle,
  ArrowRight,
  ShieldCheck,
  FileCode2,
  CheckCircle2,
  FileText,
  Search,
  Sparkles,
  ExternalLink,
  Layers,
  ChevronRight,
  RefreshCw,
  X,
  Loader2,
  HelpCircle,
  CornerDownRight,
  Compass
} from "lucide-react";
import { clsx } from "clsx";
import { safeFetchJson } from "@/lib/api-client";
import { ChangeImpactResult, ImpactNode, SemanticImpactItem } from "@/lib/impact/types";

interface ImpactWorkspaceProps {
  repositoryId: string;
  files: Array<{ path: string; name: string }>;
  onInspectFile?: (filePath: string) => void;
}

export function ImpactWorkspace({
  repositoryId,
  files,
  onInspectFile,
}: ImpactWorkspaceProps) {
  const [selectedFile, setSelectedFile] = useState<string>("");
  const [naturalQuery, setNaturalQuery] = useState<string>("");
  const [depth, setDepth] = useState<number>(2);

  const [impactResult, setImpactResult] = useState<ChangeImpactResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [explanation, setExplanation] = useState<string | null>(null);
  const [explanationLoading, setExplanationLoading] = useState(false);

  // File options for dropdown
  const fileOptions = useMemo(() => {
    return files
      .map((f) => f.path)
      .sort((a, b) => a.localeCompare(b));
  }, [files]);

  // Run Change Impact Analysis
  const runAnalysis = async (targetFile?: string, query?: string) => {
    const fileToUse = targetFile !== undefined ? targetFile : selectedFile;
    const queryToUse = query !== undefined ? query : naturalQuery;

    if (!fileToUse && !queryToUse.trim()) return;

    setLoading(true);
    setError(null);
    setExplanation(null);

    try {
      const params = new URLSearchParams();
      if (fileToUse) params.set("file", fileToUse);
      if (queryToUse.trim()) params.set("query", queryToUse.trim());
      params.set("depth", depth.toString());

      const res = await fetch(`/api/repos/${repositoryId}/impact?${params.toString()}`);
      const data = await safeFetchJson(res, "Failed to calculate change impact");
      setImpactResult(data.result);
    } catch (err: any) {
      setError(err.message || "Failed to analyze change impact.");
    } finally {
      setLoading(false);
    }
  };

  // Run AI Impact Explanation
  const runAiExplanation = async () => {
    if (!impactResult) return;
    setExplanationLoading(true);
    try {
      const res = await fetch(`/api/repos/${repositoryId}/impact/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          file: impactResult.target.path,
          query: naturalQuery || undefined,
          depth,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setExplanation(data.explanation);
      }
    } catch (err: any) {
      setExplanation("⚠️ AI explanation is temporarily unavailable. The deterministic impact analysis above is still accurate. Please try again later.");
    } finally {
      setExplanationLoading(false);
    }
  };

  // Preset example queries
  const exampleQueries = [
    "What breaks if I modify the database client or schema?",
    "Where is the authentication or session logic used?",
    "What depends on the main application entry point?",
  ];

  return (
    <div className="flex flex-col h-full bg-[#090e1a] text-slate-100 overflow-y-auto custom-scrollbar">
      {/* ─── Header ─── */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-b border-slate-800/80 bg-[#0c1222]/90 backdrop-blur-md sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shadow-sm">
            <GitFork className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
              Change Impact Analyzer
            </h3>
            <p className="text-[11px] text-slate-500">
              Deterministic dependency cascade, blast radius, and blast-radius risk signals
            </p>
          </div>
        </div>

        {/* Depth Selector */}
        <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-lg p-1 text-xs">
          <span className="text-slate-500 px-2 font-medium">Traversal Depth:</span>
          {[1, 2, 3].map((d) => (
            <button
              key={d}
              onClick={() => {
                setDepth(d);
                if (selectedFile || naturalQuery) {
                  // Re-run with new depth
                  setTimeout(() => runAnalysis(selectedFile, naturalQuery), 50);
                }
              }}
              className={clsx(
                "px-2.5 py-1 rounded font-mono font-semibold transition-all",
                depth === d
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              )}
            >
              {d}
            </button>
          ))}
        </div>
      </div>

      {/* ─── Input Selection Bar ─── */}
      <div className="p-6 pb-2 space-y-4">
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* File Dropdown / Select */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <FileCode2 className="w-3.5 h-3.5 text-indigo-400" /> Target File
              </label>
              <select
                value={selectedFile}
                onChange={(e) => {
                  setSelectedFile(e.target.value);
                  setNaturalQuery("");
                  if (e.target.value) {
                    runAnalysis(e.target.value, "");
                  }
                }}
                className="w-full bg-slate-950 border border-slate-700/80 rounded-xl text-xs px-3.5 py-2.5 text-slate-200 focus:outline-none focus:border-indigo-500 font-mono transition-all"
              >
                <option value="">Select a repository file to analyze...</option>
                {fileOptions.map((path) => (
                  <option key={path} value={path}>
                    {path}
                  </option>
                ))}
              </select>
            </div>

            {/* Natural Language Input */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <Compass className="w-3.5 h-3.5 text-sky-400" /> Or Natural Language Query
              </label>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (naturalQuery.trim()) {
                    setSelectedFile("");
                    runAnalysis("", naturalQuery);
                  }
                }}
                className="flex items-center gap-2"
              >
                <input
                  type="text"
                  placeholder='e.g., "What happens if I change validateSession?"'
                  value={naturalQuery}
                  onChange={(e) => setNaturalQuery(e.target.value)}
                  className="flex-1 bg-slate-950 border border-slate-700/80 rounded-xl text-xs px-3.5 py-2.5 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-all"
                />
                <button
                  type="submit"
                  disabled={loading || !naturalQuery.trim()}
                  className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-600 text-white rounded-xl text-xs font-medium transition-colors flex-shrink-0 cursor-pointer shadow-sm"
                >
                  Analyze
                </button>
              </form>
            </div>
          </div>

          {/* Preset Prompts */}
          <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-800/60 text-xs">
            <span className="text-[11px] text-slate-500">Quick prompts:</span>
            {exampleQueries.map((q, idx) => (
              <button
                key={idx}
                onClick={() => {
                  setNaturalQuery(q);
                  setSelectedFile("");
                  runAnalysis("", q);
                }}
                className="px-2.5 py-1 rounded-lg bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 text-slate-300 hover:text-slate-100 text-[11px] transition-colors"
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ─── AI Explanation Banner ─── */}
      {explanation && (
        <div className="mx-6 mb-4 p-4 rounded-xl bg-indigo-950/20 border border-indigo-500/20 flex items-start gap-3 relative animate-slide-in">
          <Sparkles className="w-4 h-4 text-indigo-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1 text-xs text-slate-300 leading-relaxed max-h-40 overflow-y-auto custom-scrollbar">
            <div className="prose prose-invert prose-xs max-w-none">
              {explanation.split("\n").map((para, i) => (
                <p key={i} className="mb-1">{para}</p>
              ))}
            </div>
          </div>
          <button onClick={() => setExplanation(null)} className="text-slate-500 hover:text-slate-300 p-1">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* ─── Results Area ─── */}
      <div className="p-6 pt-2 space-y-6 flex-1">
        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center text-slate-400 space-y-3">
            <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
            <p className="text-sm font-medium">Tracing dependency graph and calculating impact cascade...</p>
          </div>
        ) : error ? (
          <div className="py-16 flex flex-col items-center justify-center text-center">
            <div className="w-12 h-12 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400 mb-3">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h4 className="text-sm font-semibold text-slate-200">Unable to analyze impact</h4>
            <p className="text-xs text-slate-400 max-w-sm mt-1">{error}</p>
          </div>
        ) : impactResult ? (
          <>
            {/* Target Overview & Risk Ribbon */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] uppercase font-semibold text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20">
                      Target {impactResult.target.type}
                    </span>
                    {impactResult.target.symbolName && (
                      <span className="text-xs font-mono text-slate-300 bg-slate-800 px-2 py-0.5 rounded">
                        Symbol: {impactResult.target.symbolName}
                      </span>
                    )}
                  </div>
                  <h4 className="text-sm font-bold font-mono text-slate-100 break-all">
                    {impactResult.target.path}
                  </h4>
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex flex-col items-end">
                    <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
                      Risk Level
                    </span>
                    <span
                      className={clsx(
                        "text-xs px-3 py-1 rounded-full font-bold uppercase tracking-wider border mt-0.5",
                        impactResult.riskLevel === "high"
                          ? "bg-rose-500/10 text-rose-400 border-rose-500/20"
                          : impactResult.riskLevel === "medium"
                          ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                          : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                      )}
                    >
                      {impactResult.riskLevel} Risk
                    </span>
                  </div>

                  <button
                    onClick={runAiExplanation}
                    disabled={explanationLoading}
                    className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    {explanationLoading ? "Generating..." : "AI Explanation"}
                  </button>
                </div>
              </div>

              {/* Risk Reasons */}
              <div className="pt-3 border-t border-slate-800/80 space-y-1.5 text-xs text-slate-400">
                <span className="text-[10px] uppercase font-semibold text-slate-500 block">
                  Risk Assessment Rationale:
                </span>
                <ul className="list-disc list-inside space-y-1">
                  {impactResult.riskReasons.map((reason, idx) => (
                    <li key={idx} className="text-slate-300">{reason}</li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Impact Metrics Count */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {[
                { label: "Direct Dependents", value: impactResult.summary.directDependentsCount, color: "text-indigo-400" },
                { label: "Transitive Dependents", value: impactResult.summary.transitiveDependentsCount, color: "text-purple-400" },
                { label: "Affected Entry Points", value: impactResult.summary.affectedEntryPointsCount, color: "text-rose-400" },
                { label: "Related Tests", value: impactResult.summary.relatedTestsCount, color: "text-emerald-400" },
                { label: "Direct Dependencies", value: impactResult.summary.directDependenciesCount, color: "text-slate-300" },
              ].map((stat, i) => (
                <div
                  key={i}
                  className="bg-slate-900/60 border border-slate-800 rounded-xl p-3 flex flex-col items-center justify-center text-center"
                >
                  <span className={clsx("text-lg font-bold font-mono", stat.color)}>{stat.value}</span>
                  <span className="text-[10px] uppercase tracking-wider text-slate-500 font-medium mt-0.5">
                    {stat.label}
                  </span>
                </div>
              ))}
            </div>

            {/* ─── Impact Visualization Cascade ─── */}
            <div className="space-y-6">
              <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <Layers className="w-4 h-4 text-indigo-400" /> Impact Propagation Cascade
              </h4>

              {/* 1. DIRECT DEPENDENTS */}
              <div className="bg-slate-900/50 border border-slate-800/80 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-indigo-400" />
                    <h5 className="text-xs font-semibold text-slate-200">
                      Direct Dependents ({impactResult.directDependents.length})
                    </h5>
                    <span className="text-[11px] text-slate-500">
                      — Files that directly import or require this target
                    </span>
                  </div>
                </div>

                {impactResult.directDependents.length === 0 ? (
                  <p className="text-xs text-slate-500 italic pl-4">
                    No files directly import this target.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pl-4">
                    {impactResult.directDependents.map((dep) => (
                      <div
                        key={dep.path}
                        className="flex items-center justify-between p-2.5 rounded-lg bg-slate-900/80 border border-slate-800/80 hover:border-slate-700 transition-colors"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <FileCode2 className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                          <span className="text-xs font-mono text-slate-200 truncate">
                            {dep.path}
                          </span>
                          {dep.isEntryPoint && (
                            <span className="text-[9px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-1.5 py-0.5 rounded font-semibold">
                              Entry
                            </span>
                          )}
                          {dep.isTest && (
                            <span className="text-[9px] bg-sky-500/10 text-sky-400 border border-sky-500/20 px-1.5 py-0.5 rounded font-semibold">
                              Test
                            </span>
                          )}
                        </div>
                        {onInspectFile && (
                          <button
                            onClick={() => onInspectFile(dep.path)}
                            className="text-slate-500 hover:text-slate-200 p-1"
                            title="Inspect file"
                          >
                            <ExternalLink className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 2. TRANSITIVE DEPENDENTS */}
              <div className="bg-slate-900/50 border border-slate-800/80 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-purple-400" />
                    <h5 className="text-xs font-semibold text-slate-200">
                      Transitive Dependents ({impactResult.transitiveDependents.length})
                    </h5>
                    <span className="text-[11px] text-slate-500">
                      — Second and third-order files indirectly affected
                    </span>
                  </div>
                </div>

                {impactResult.transitiveDependents.length === 0 ? (
                  <p className="text-xs text-slate-500 italic pl-4">
                    No transitive dependents detected within depth {depth}.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pl-4">
                    {impactResult.transitiveDependents.map((dep) => (
                      <div
                        key={dep.path}
                        className="flex flex-col p-2.5 rounded-lg bg-slate-900/80 border border-slate-800/80 hover:border-slate-700 transition-colors space-y-1"
                      >
                        <div className="flex items-center justify-between gap-2 min-w-0">
                          <div className="flex items-center gap-2 min-w-0">
                            <CornerDownRight className="w-3.5 h-3.5 text-purple-400 flex-shrink-0" />
                            <span className="text-xs font-mono text-slate-200 truncate">
                              {dep.path}
                            </span>
                            {dep.isEntryPoint && (
                              <span className="text-[9px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-1.5 py-0.5 rounded font-semibold">
                                Entry
                              </span>
                            )}
                          </div>
                          {onInspectFile && (
                            <button
                              onClick={() => onInspectFile(dep.path)}
                              className="text-slate-500 hover:text-slate-200 p-1"
                              title="Inspect file"
                            >
                              <ExternalLink className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                        <span className="text-[10px] text-slate-500 font-mono truncate">
                          Via: {dep.via.join(" → ")}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 3. RELATED TESTS */}
              <div className="bg-slate-900/50 border border-slate-800/80 rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  <h5 className="text-xs font-semibold text-slate-200">
                    Related Tests ({impactResult.relatedTests.length})
                  </h5>
                  <span className="text-[11px] text-slate-500">
                    — Test suites that exercise or import code in this dependency chain
                  </span>
                </div>

                {impactResult.relatedTests.length === 0 ? (
                  <p className="text-xs text-amber-400/80 italic pl-4">
                    ⚠️ No automated test files detected in this dependency branch.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pl-4">
                    {impactResult.relatedTests.map((t) => (
                      <div
                        key={t.path}
                        className="flex items-center justify-between p-2.5 rounded-lg bg-slate-900/80 border border-slate-800/80"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                          <span className="text-xs font-mono text-slate-200 truncate">{t.path}</span>
                        </div>
                        {onInspectFile && (
                          <button
                            onClick={() => onInspectFile(t.path)}
                            className="text-slate-500 hover:text-slate-200 p-1"
                          >
                            <ExternalLink className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 4. SEMANTICALLY RELATED FILES (Clearly distinguished) */}
              {impactResult.semanticRelatedFiles.length > 0 && (
                <div className="bg-slate-900/50 border border-slate-800/80 rounded-xl p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-sky-400" />
                    <h5 className="text-xs font-semibold text-slate-200">
                      Semantically Related Code ({impactResult.semanticRelatedFiles.length})
                    </h5>
                    <span className="text-[11px] text-slate-500">
                      — Discovered via semantic vector similarity (not direct graph imports)
                    </span>
                  </div>

                  <div className="space-y-2 pl-4">
                    {impactResult.semanticRelatedFiles.map((item, idx) => (
                      <div
                        key={idx}
                        className="p-3 rounded-lg bg-slate-900/80 border border-slate-800/80 space-y-1.5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-xs font-mono font-medium text-slate-200 truncate">
                              {item.path}
                            </span>
                            <span className="text-[10px] text-slate-500 font-mono">
                              L{item.startLine}–{item.endLine}
                            </span>
                            {item.symbolName && (
                              <span className="text-[10px] text-sky-400 font-mono bg-sky-500/10 px-1.5 py-0.5 rounded">
                                {item.symbolName}
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] font-semibold text-sky-400 font-mono">
                            {Math.round(item.similarity * 100)}% match
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 font-mono bg-slate-950 p-2 rounded border border-slate-850 truncate">
                          {item.contentSnippet}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="py-20 flex flex-col items-center justify-center text-slate-500 space-y-2 text-center">
            <GitFork className="w-10 h-10 text-slate-600 stroke-[1.5]" />
            <h4 className="text-sm font-semibold text-slate-300">No Target Selected</h4>
            <p className="text-xs text-slate-500 max-w-sm">
              Select a file from the dropdown above or enter a natural-language query to evaluate dependency blast radius.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
