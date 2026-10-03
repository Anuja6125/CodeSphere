"use client";

import React, { useState, useEffect, useCallback } from "react";
import { 
  Layers, 
  Play, 
  AlertCircle, 
  FileCode2, 
  GitFork, 
  DoorOpen,
  ChevronDown,
  Box,
  FileText,
  Settings,
  ShieldCheck,
  Search,
  Package
} from "lucide-react";
import { clsx } from "clsx";
import { safeFetchJson } from "@/lib/api-client";

interface AnalysisPanelProps {
  repositoryId: string;
  initialStatus?: string;
}

export function AnalysisPanel({ repositoryId, initialStatus }: AnalysisPanelProps) {
  const [status, setStatus] = useState(initialStatus || "INDEXED");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<any | null>(null);
  const [dependencies, setDependencies] = useState<any[]>([]);
  const [chunks, setChunks] = useState<any[]>([]);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [showDependencies, setShowDependencies] = useState(false);

  const loadExistingAnalysis = useCallback(async () => {
    try {
      const [analysisRes, depsRes, chunksRes] = await Promise.all([
        fetch(`/api/repos/${repositoryId}/analysis`),
        fetch(`/api/repos/${repositoryId}/dependencies`),
        fetch(`/api/repos/${repositoryId}/chunks`),
      ]);

      if (analysisRes.ok) {
        const analysisData = await safeFetchJson(analysisRes, "Failed to load analysis");
        if (analysisData.analysis) {
          setAnalysis(analysisData.analysis);
          setStatus("ANALYZED");
        }
      }
      if (depsRes.ok) {
        const depsData = await safeFetchJson(depsRes, "Failed to load dependencies");
        setDependencies(depsData.dependencies || []);
      }
      if (chunksRes.ok) {
        const chunksData = await safeFetchJson(chunksRes, "Failed to load chunks");
        setChunks(chunksData.chunks || []);
      }
    } catch {
      // Ignore background preload errors if analysis hasn't run yet
    }
  }, [repositoryId]);

  useEffect(() => {
    loadExistingAnalysis();
  }, [loadExistingAnalysis]);

  const runAnalysis = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/repos/${repositoryId}/analyze`, { method: "POST" });
      const data = await safeFetchJson(res, "Analysis request failed");

      const [analysisRes, depsRes, chunksRes] = await Promise.all([
        fetch(`/api/repos/${repositoryId}/analysis`),
        fetch(`/api/repos/${repositoryId}/dependencies`),
        fetch(`/api/repos/${repositoryId}/chunks`),
      ]);

      const [analysisData, depsData, chunksData] = await Promise.all([
        safeFetchJson(analysisRes, "Failed to load analysis details"),
        safeFetchJson(depsRes, "Failed to load dependencies"),
        safeFetchJson(chunksRes, "Failed to load code chunks"),
      ]);

      setAnalysis(analysisData.analysis);
      setDependencies(depsData.dependencies || []);
      setChunks(chunksData.chunks || []);
      setStatus("ANALYZED");
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred during analysis.");
    } finally {
      setLoading(false);
    }
  };

  const fileOptions = Array.from(
    new Map(chunks.map((c) => [c.fileId, { id: c.fileId, path: c.path }])).values()
  );

  const visibleChunks = selectedFileId
    ? chunks.filter((c) => c.fileId === selectedFileId)
    : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
        <div>
          <h3 className="text-base font-semibold text-slate-100 flex items-center gap-2">
            <Layers className="w-4 h-4 text-indigo-400" /> Repository Intelligence
          </h3>
          <p className="text-xs text-slate-400 mt-1">Deep analysis of architecture, dependencies, and code structure.</p>
        </div>
        
        <div className="flex items-center gap-3">
          <span className={clsx(
            "text-xs px-2.5 py-1 rounded-full font-medium border",
            status === 'ANALYZED' 
              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" 
              : "bg-slate-800 text-slate-400 border-slate-700"
          )}>
            {status}
          </span>
          <button
            onClick={runAnalysis}
            disabled={loading}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-500 text-white text-sm font-medium rounded-lg flex items-center gap-2 transition-colors cursor-pointer shadow-sm"
          >
            {loading ? (
              <>
                <span className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <Play className="w-4 h-4" />
                {status === 'INDEXED' ? 'Run Analysis' : 'Re-Analyze'}
              </>
            )}
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm animate-fade-in-up">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          {error}
        </div>
      )}

      {analysis && (
        <div className="space-y-6 animate-fade-in-up">
          {/* Metrics Grid */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              { label: "Source Files", value: analysis.sourceFileCount, icon: FileCode2, color: "text-blue-400" },
              { label: "Test Files", value: analysis.testFileCount, icon: ShieldCheck, color: "text-emerald-400" },
              { label: "Documentation", value: analysis.documentationFileCount, icon: FileText, color: "text-slate-400" },
              { label: "Config Files", value: analysis.configFileCount, icon: Settings, color: "text-slate-400" },
              { label: "Code Chunks", value: analysis.chunkCount, icon: Box, color: "text-indigo-400" },
              { label: "Dependencies", value: analysis.dependencyCount, icon: Package, color: "text-amber-400" },
            ].map((stat, i) => (
              <div key={i} className="bg-slate-900 border border-slate-800/80 rounded-xl p-4 flex flex-col items-center justify-center text-center space-y-2 hover:border-slate-700 transition-colors">
                <stat.icon className={clsx("w-5 h-5", stat.color)} />
                <p className="text-xl font-bold text-slate-100">{stat.value}</p>
                <p className="text-[10px] uppercase tracking-wider text-slate-500 font-medium">{stat.label}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Entry Points */}
            <div className="bg-slate-900 border border-slate-800/80 rounded-xl overflow-hidden flex flex-col">
              <div className="p-4 border-b border-slate-800/80 bg-slate-900/50">
                <h4 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                  <DoorOpen className="w-4 h-4 text-sky-400" /> Entry Points
                </h4>
                <p className="text-xs text-slate-500 mt-1">Heuristically detected main application entry files</p>
              </div>
              <div className="p-2 overflow-y-auto max-h-60">
                {(analysis.entryPoints || []).length === 0 ? (
                  <div className="p-4 text-xs text-slate-500 text-center">No entry points detected.</div>
                ) : (
                  <ul className="space-y-1">
                    {(analysis.entryPoints || []).map((ep: any, i: number) => (
                      <li key={i} className="flex items-start justify-between p-2.5 rounded-lg hover:bg-slate-800/50 transition-colors group">
                        <div className="flex flex-col min-w-0">
                          <span className="text-sm text-slate-200 font-medium font-mono truncate">{ep.path}</span>
                          <span className="text-xs text-slate-500 mt-0.5">{ep.reason}</span>
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0 ml-3 bg-slate-950 px-2 py-1 rounded-md border border-slate-800 group-hover:border-slate-700 transition-colors">
                          <div className={clsx("w-1.5 h-1.5 rounded-full", ep.confidence > 0.7 ? "bg-emerald-400" : "bg-amber-400")} />
                          <span className="text-[10px] text-slate-400 font-medium">{Math.round(ep.confidence * 100)}%</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {/* Architecture Context */}
            <div className="bg-slate-900 border border-slate-800/80 rounded-xl overflow-hidden flex flex-col">
              <div className="p-4 border-b border-slate-800/80 bg-slate-900/50">
                <h4 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                  <Box className="w-4 h-4 text-indigo-400" /> Architecture Context
                </h4>
                <p className="text-xs text-slate-500 mt-1">Key structural directories</p>
              </div>
              <div className="p-4">
                <div className="flex flex-wrap gap-2">
                  {(analysis.importantDirectories || []).length > 0 ? (
                    (analysis.importantDirectories || []).map((dir: string) => (
                      <span key={dir} className="text-xs px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-300 font-mono flex items-center gap-1.5">
                        <Layers className="w-3 h-3 text-slate-500" /> {dir}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs text-slate-500">None detected</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Dependencies Accordion */}
          {dependencies.length > 0 && (
            <div className="bg-slate-900 border border-slate-800/80 rounded-xl overflow-hidden">
              <button 
                onClick={() => setShowDependencies(!showDependencies)}
                className="w-full flex items-center justify-between p-4 bg-slate-900/50 hover:bg-slate-800/50 transition-colors"
              >
                <div>
                  <h4 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                    <GitFork className="w-4 h-4 text-amber-400" /> Internal Dependencies
                  </h4>
                  <p className="text-xs text-slate-500 mt-0.5 text-left">Mapped imports and references across files ({dependencies.length} connections)</p>
                </div>
                <ChevronDown className={clsx("w-5 h-5 text-slate-500 transition-transform duration-300", showDependencies && "rotate-180")} />
              </button>
              
              {showDependencies && (
                <div className="p-2 border-t border-slate-800/80">
                  <div className="max-h-60 overflow-y-auto space-y-1 p-2">
                    {dependencies.map((d) => (
                      <div key={d.id} className="flex items-center gap-2 text-xs font-mono p-1.5 hover:bg-slate-800/50 rounded-lg">
                        <span className="text-slate-300 truncate max-w-[40%]">{d.fromPath}</span>
                        <span className="text-slate-600 flex-shrink-0">→</span>
                        <span className="text-slate-400 truncate max-w-[40%]">{d.toPath || d.toSpecifier}</span>
                        <span className="text-[10px] text-slate-500 bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800 ml-auto">{d.kind}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Data Explorer */}
          {chunks.length > 0 && (
            <div className="bg-slate-900 border border-slate-800/80 rounded-xl overflow-hidden">
              <div className="p-4 border-b border-slate-800/80 bg-slate-900/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h4 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                    <Search className="w-4 h-4 text-sky-400" /> Code Intelligence Explorer
                  </h4>
                  <p className="text-xs text-slate-500 mt-0.5">Inspect raw parsed AST chunks</p>
                </div>
                <select
                  className="w-full sm:w-64 bg-slate-950 border border-slate-700 rounded-lg text-xs px-3 py-2 text-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all"
                  value={selectedFileId || ""}
                  onChange={(e) => setSelectedFileId(e.target.value || null)}
                >
                  <option value="">Select a file to inspect...</option>
                  {fileOptions.map((f) => (
                    <option key={f.id} value={f.id}>{f.path}</option>
                  ))}
                </select>
              </div>

              {selectedFileId && (
                <div className="p-4 bg-slate-925 max-h-[400px] overflow-y-auto space-y-3">
                  {visibleChunks.length === 0 ? (
                    <div className="text-center text-xs text-slate-500 py-8">No chunks available for this file.</div>
                  ) : (
                    visibleChunks.map((chunk) => (
                      <div key={chunk.id} className="border border-slate-800 rounded-lg overflow-hidden bg-slate-900">
                        <div className="flex items-center justify-between px-3 py-2 bg-slate-800/30 border-b border-slate-800 text-[11px] font-medium text-slate-400">
                          <div className="flex items-center gap-2">
                            <span className="uppercase text-indigo-400 font-bold">{chunk.chunkType}</span>
                            {chunk.symbolName && <span className="text-slate-300 bg-slate-800 px-1.5 py-0.5 rounded">{chunk.symbolName}</span>}
                            {chunk.isExported && <span className="text-emerald-400/80 border border-emerald-500/20 px-1.5 py-0.5 rounded">exported</span>}
                          </div>
                          <span className="font-mono text-slate-500">L{chunk.startLine}–{chunk.endLine}</span>
                        </div>
                        <div className="p-3 overflow-x-auto">
                          <pre className="text-[11px] leading-relaxed text-slate-300 font-mono">
                            {chunk.content}
                          </pre>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
