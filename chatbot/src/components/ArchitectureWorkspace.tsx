"use client";

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  Layers,
  ZoomIn,
  ZoomOut,
  Maximize2,
  RotateCcw,
  Search,
  Filter,
  DoorOpen,
  GitFork,
  FileCode2,
  Box,
  AlertTriangle,
  Sparkles,
  ChevronRight,
  RefreshCw,
  X,
  ExternalLink,
  Code,
  Info,
  Loader2,
  CheckCircle2,
  HelpCircle
} from "lucide-react";
import { clsx } from "clsx";
import { safeFetchJson } from "@/lib/api-client";
import {
  ArchitectureGraphData,
  ArchitectureGroup,
  ArchitectureNode,
  ArchitectureEdge,
} from "@/lib/architecture/types";
import { ARCHITECTURE_GROUP_METADATA } from "@/lib/architecture/classifier";

interface ArchitectureWorkspaceProps {
  repositoryId: string;
  onInspectFile?: (filePath: string) => void;
}

export function ArchitectureWorkspace({
  repositoryId,
  onInspectFile,
}: ArchitectureWorkspaceProps) {
  const [viewMode, setViewMode] = useState<"modules" | "files">("modules");
  const [selectedModule, setSelectedModule] = useState<string | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<ArchitectureGroup | "all">("all");
  const [searchQuery, setSearchQuery] = useState("");

  const [graphData, setGraphData] = useState<ArchitectureGraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedNode, setSelectedNode] = useState<ArchitectureNode | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<ArchitectureEdge | null>(null);

  const [summary, setSummary] = useState<string | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

  // SVG Pan & Zoom state
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [startPan, setStartPan] = useState({ x: 0, y: 0 });

  const svgRef = useRef<SVGSVGElement | null>(null);

  // Fetch Graph Data
  const loadGraph = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSelectedNode(null);
    setSelectedEdge(null);

    try {
      const params = new URLSearchParams();
      params.set("view", viewMode);
      if (selectedModule) params.set("module", selectedModule);
      if (selectedGroup !== "all") params.set("group", selectedGroup);

      const res = await fetch(`/api/repos/${repositoryId}/architecture?${params.toString()}`);
      const data = await safeFetchJson(res, "Failed to load architecture graph");
      setGraphData(data.graph);
    } catch (err: any) {
      setError(err.message || "Failed to load architecture data.");
    } finally {
      setLoading(false);
    }
  }, [repositoryId, viewMode, selectedModule, selectedGroup]);

  useEffect(() => {
    loadGraph();
  }, [loadGraph]);

  // Fetch Architecture Summary
  const loadSummary = async () => {
    setSummaryLoading(true);
    try {
      const res = await fetch(`/api/repos/${repositoryId}/architecture/summary`, {
        method: "POST",
      });
      const data = await res.json();
      if (res.ok) {
        setSummary(data.summary);
      } else {
        setSummary("⚠️ AI summary is temporarily unavailable. The architecture graph above is still accurate.");
      }
    } catch {
      setSummary("⚠️ AI summary is temporarily unavailable. The architecture graph above is still accurate.");
    } finally {
      setSummaryLoading(false);
    }
  };

  // Filtered nodes based on search
  const filteredNodes = useMemo(() => {
    if (!graphData) return [];
    if (!searchQuery.trim()) return graphData.nodes;
    const q = searchQuery.toLowerCase();
    return graphData.nodes.filter(
      (n) => n.label.toLowerCase().includes(q) || n.path.toLowerCase().includes(q)
    );
  }, [graphData, searchQuery]);

  // Compute node positions using an automated deterministic circular/grid layout
  const nodePositions = useMemo(() => {
    const positions = new Map<string, { x: number; y: number }>();
    const count = filteredNodes.length;
    if (count === 0) return positions;

    const width = 800;
    const height = 550;
    const centerX = width / 2;
    const centerY = height / 2;

    if (count === 1) {
      positions.set(filteredNodes[0].id, { x: centerX, y: centerY });
      return positions;
    }

    // Circular layout with groups clustering
    const radius = Math.min(width, height) * 0.38;
    filteredNodes.forEach((node, idx) => {
      const angle = (idx / count) * 2 * Math.PI - Math.PI / 2;
      const x = centerX + radius * Math.cos(angle);
      const y = centerY + radius * Math.sin(angle);
      positions.set(node.id, { x, y });
    });

    return positions;
  }, [filteredNodes]);

  // Handle Pan & Zoom
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0) {
      setIsPanning(true);
      setStartPan({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanning) {
      setPan({ x: e.clientX - startPan.x, y: e.clientY - startPan.y });
    }
  };

  const handleMouseUp = () => setIsPanning(false);

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
    setZoom((prev) => Math.min(Math.max(prev * zoomFactor, 0.4), 3.0));
  };

  const handleFitView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  return (
    <div className="flex flex-col h-full bg-[#090e1a] text-slate-100 overflow-hidden select-none">
      {/* ─── Top Control Bar ─── */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 border-b border-slate-800/80 bg-[#0c1222]/90 backdrop-blur-md flex-shrink-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shadow-sm">
            <Layers className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
              Architecture Intelligence
            </h3>
            <p className="text-[11px] text-slate-500">
              Interactive structural graph & dependency boundaries
            </p>
          </div>
        </div>

        {/* Filters & View Switches */}
        <div className="flex flex-wrap items-center gap-2">
          {/* View Mode Toggle */}
          <div className="flex items-center bg-slate-900 border border-slate-800 rounded-lg p-0.5 text-xs">
            <button
              onClick={() => {
                setViewMode("modules");
                setSelectedModule(null);
              }}
              className={clsx(
                "px-3 py-1.5 rounded-md font-medium transition-all flex items-center gap-1.5",
                viewMode === "modules"
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              )}
            >
              <Box className="w-3.5 h-3.5" /> Modules
            </button>
            <button
              onClick={() => setViewMode("files")}
              className={clsx(
                "px-3 py-1.5 rounded-md font-medium transition-all flex items-center gap-1.5",
                viewMode === "files"
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              )}
            >
              <FileCode2 className="w-3.5 h-3.5" /> Files
            </button>
          </div>

          {/* Group Filter */}
          <select
            value={selectedGroup}
            onChange={(e) => setSelectedGroup(e.target.value as any)}
            className="bg-slate-900 border border-slate-800 rounded-lg text-xs px-2.5 py-1.5 text-slate-300 focus:outline-none focus:border-indigo-500"
          >
            <option value="all">All Groups</option>
            {Object.entries(ARCHITECTURE_GROUP_METADATA).map(([key, meta]) => (
              <option key={key} value={key}>
                {meta.name}
              </option>
            ))}
          </select>

          {/* Search Input */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Filter nodes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-36 sm:w-44 bg-slate-900 border border-slate-800 rounded-lg text-xs pl-8 pr-3 py-1.5 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
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

          {/* Zoom Controls */}
          <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded-lg p-0.5">
            <button
              onClick={() => setZoom((z) => Math.max(z * 0.85, 0.4))}
              title="Zoom Out"
              className="p-1.5 text-slate-400 hover:text-white rounded hover:bg-slate-800"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleFitView}
              title="Fit View"
              className="p-1.5 text-slate-400 hover:text-white rounded hover:bg-slate-800"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setZoom((z) => Math.min(z * 1.15, 3.0))}
              title="Zoom In"
              className="p-1.5 text-slate-400 hover:text-white rounded hover:bg-slate-800"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => {
                setZoom(1);
                setPan({ x: 0, y: 0 });
                setSelectedModule(null);
                setSelectedGroup("all");
                setSearchQuery("");
                loadGraph();
              }}
              title="Reset View"
              className="p-1.5 text-slate-400 hover:text-white rounded hover:bg-slate-800"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* ─── Statistics Header Ribbon ─── */}
      {graphData?.stats && (
        <div className="flex items-center gap-6 px-5 py-2 border-b border-slate-800/60 bg-[#0a0f1d] text-xs text-slate-400 overflow-x-auto custom-scrollbar flex-shrink-0">
          <div className="flex items-center gap-1.5 font-medium whitespace-nowrap">
            <span className="text-slate-200 font-bold">{graphData.stats.totalFiles}</span>
            <span>Total Files</span>
          </div>
          <div className="h-3 w-px bg-slate-800" />
          <div className="flex items-center gap-1.5 font-medium whitespace-nowrap">
            <span className="text-slate-200 font-bold">{graphData.stats.modulesCount}</span>
            <span>Modules</span>
          </div>
          <div className="h-3 w-px bg-slate-800" />
          <div className="flex items-center gap-1.5 font-medium whitespace-nowrap">
            <span className="text-indigo-400 font-bold">{graphData.stats.dependencyEdges}</span>
            <span>Dependencies</span>
          </div>
          <div className="h-3 w-px bg-slate-800" />
          <div className="flex items-center gap-1.5 font-medium whitespace-nowrap">
            <span className="text-emerald-400 font-bold">{graphData.stats.entryPoints}</span>
            <span>Entry Points</span>
          </div>
          {graphData.stats.circularDependencies.length > 0 && (
            <>
              <div className="h-3 w-px bg-slate-800" />
              <div className="flex items-center gap-1.5 text-amber-400 font-medium whitespace-nowrap bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                <AlertTriangle className="w-3 h-3" />
                <span>{graphData.stats.circularDependencies.length} Circular Cycles</span>
              </div>
            </>
          )}

          {/* Summary Trigger */}
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={loadSummary}
              disabled={summaryLoading}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 border border-indigo-500/20 transition-colors text-[11px] font-medium"
            >
              <Sparkles className="w-3 h-3 text-indigo-400" />
              {summaryLoading ? "Analyzing..." : summary ? "Regenerate Summary" : "AI Architecture Summary"}
            </button>
          </div>
        </div>
      )}

      {/* ─── AI Summary Banner (if available) ─── */}
      {summary && (
        <div className="px-5 py-3 bg-indigo-950/30 border-b border-indigo-500/20 flex items-start gap-3 relative animate-slide-in">
          <Sparkles className="w-4 h-4 text-indigo-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1 text-xs text-slate-300 leading-relaxed max-h-28 overflow-y-auto custom-scrollbar">
            <div className="prose prose-invert prose-xs max-w-none">
              {summary.split("\n").map((para, i) => (
                <p key={i} className="mb-1">{para}</p>
              ))}
            </div>
          </div>
          <button
            onClick={() => setSummary(null)}
            className="text-slate-500 hover:text-slate-300 p-1"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* ─── Main Graph Workspace ─── */}
      <div className="flex-1 relative overflow-hidden flex">
        {loading ? (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400 space-y-3">
            <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
            <p className="text-sm font-medium">Constructing architecture graph...</p>
          </div>
        ) : error ? (
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
            <div className="w-12 h-12 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400 mb-3">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h4 className="text-sm font-semibold text-slate-200">Failed to render graph</h4>
            <p className="text-xs text-slate-400 max-w-sm mt-1">{error}</p>
            <button
              onClick={loadGraph}
              className="mt-4 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-medium transition-colors"
            >
              Try Again
            </button>
          </div>
        ) : filteredNodes.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400 space-y-2 p-6 text-center">
            <Box className="w-10 h-10 text-slate-600 stroke-[1.5]" />
            <h4 className="text-sm font-semibold text-slate-300">No architecture nodes found</h4>
            <p className="text-xs text-slate-500 max-w-xs">
              {searchQuery
                ? `No nodes match "${searchQuery}".`
                : "No files match the active filters."}
            </p>
          </div>
        ) : (
          <div
            className="flex-1 relative cursor-grab active:cursor-grabbing overflow-hidden"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onWheel={handleWheel}
          >
            {/* SVG Canvas */}
            <svg
              ref={svgRef}
              className="w-full h-full"
              viewBox="0 0 800 550"
              preserveAspectRatio="xMidYMid meet"
            >
              <defs>
                <marker
                  id="arrow"
                  viewBox="0 0 10 10"
                  refX="18"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 1 L 10 5 L 0 9 z" fill="#64748b" opacity="0.7" />
                </marker>
                <marker
                  id="arrow-active"
                  viewBox="0 0 10 10"
                  refX="18"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 1 L 10 5 L 0 9 z" fill="#818cf8" />
                </marker>
              </defs>

              <g
                transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}
                style={{ transformOrigin: "center" }}
              >
                {/* Graph Edges */}
                {graphData?.edges.map((edge) => {
                  const sourcePos = nodePositions.get(edge.source);
                  const targetPos = nodePositions.get(edge.target);
                  if (!sourcePos || !targetPos) return null;

                  const isSelected =
                    selectedEdge?.id === edge.id ||
                    selectedNode?.id === edge.source ||
                    selectedNode?.id === edge.target;

                  return (
                    <g key={edge.id}>
                      <line
                        x1={sourcePos.x}
                        y1={sourcePos.y}
                        x2={targetPos.x}
                        y2={targetPos.y}
                        stroke={isSelected ? "#818cf8" : "#334155"}
                        strokeWidth={isSelected ? 2 : 1}
                        strokeOpacity={isSelected ? 0.9 : 0.4}
                        strokeDasharray={edge.kind === "include" ? "4,4" : undefined}
                        markerEnd={isSelected ? "url(#arrow-active)" : "url(#arrow)"}
                        className="transition-all cursor-pointer hover:stroke-indigo-400"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedEdge(edge);
                          setSelectedNode(null);
                        }}
                      />
                    </g>
                  );
                })}

                {/* Graph Nodes */}
                {filteredNodes.map((node) => {
                  const pos = nodePositions.get(node.id);
                  if (!pos) return null;

                  const isSelected = selectedNode?.id === node.id;
                  const groupColor =
                    ARCHITECTURE_GROUP_METADATA[node.group]?.color || "#6366f1";

                  return (
                    <g
                      key={node.id}
                      transform={`translate(${pos.x}, ${pos.y})`}
                      className="cursor-pointer group"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedNode(node);
                        setSelectedEdge(null);
                      }}
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        if (node.type === "module") {
                          setViewMode("files");
                          setSelectedModule(node.path);
                        }
                      }}
                    >
                      {/* Halo on selection */}
                      {isSelected && (
                        <circle
                          r={node.type === "module" ? 30 : 22}
                          fill="none"
                          stroke="#818cf8"
                          strokeWidth="3"
                          strokeDasharray="4 2"
                          className="animate-pulse"
                        />
                      )}

                      {/* Node Body */}
                      <circle
                        r={node.type === "module" ? 22 : 14}
                        fill="#0f172a"
                        stroke={node.isEntryPoint ? "#10b981" : groupColor}
                        strokeWidth={node.isEntryPoint ? 2.5 : 1.8}
                        className="transition-all group-hover:scale-110"
                      />

                      {/* Entry Point Badge */}
                      {node.isEntryPoint && (
                        <circle
                          cx={node.type === "module" ? 16 : 10}
                          cy={node.type === "module" ? -16 : -10}
                          r="5"
                          fill="#10b981"
                        />
                      )}

                      {/* Node Label */}
                      <text
                        y={node.type === "module" ? 34 : 24}
                        textAnchor="middle"
                        fill={isSelected ? "#ffffff" : "#cbd5e1"}
                        fontSize={node.type === "module" ? "11px" : "9px"}
                        fontWeight={isSelected ? "600" : "400"}
                        className="pointer-events-none select-none drop-shadow"
                      >
                        {node.label.length > 20
                          ? node.label.slice(0, 18) + "…"
                          : node.label}
                      </text>

                      {/* Sub-label for modules */}
                      {node.type === "module" && node.childCount !== undefined && (
                        <text
                          y={45}
                          textAnchor="middle"
                          fill="#64748b"
                          fontSize="8px"
                          className="pointer-events-none select-none"
                        >
                          {node.childCount} files
                        </text>
                      )}
                    </g>
                  );
                })}
              </g>
            </svg>

            {/* Breadcrumb if drilled down */}
            {selectedModule && viewMode === "files" && (
              <div className="absolute top-4 left-4 bg-slate-900/90 border border-slate-800 rounded-lg px-3 py-1.5 text-xs flex items-center gap-2 backdrop-blur shadow-lg">
                <button
                  onClick={() => {
                    setViewMode("modules");
                    setSelectedModule(null);
                  }}
                  className="text-slate-400 hover:text-white"
                >
                  Modules
                </button>
                <ChevronRight className="w-3 h-3 text-slate-600" />
                <span className="text-indigo-400 font-mono font-medium">
                  {selectedModule}
                </span>
                <button
                  onClick={() => setSelectedModule(null)}
                  className="text-slate-500 hover:text-white ml-1"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>
        )}

        {/* ─── Node / Edge Inspection Drawer ─── */}
        {selectedNode && (
          <div className="w-80 border-l border-slate-800/80 bg-[#0c1222]/95 backdrop-blur-md p-5 flex flex-col justify-between overflow-y-auto custom-scrollbar flex-shrink-0 z-20 animate-slide-in">
            <div className="space-y-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{
                      backgroundColor:
                        ARCHITECTURE_GROUP_METADATA[selectedNode.group]?.color ||
                        "#6366f1",
                    }}
                  />
                  <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                    {ARCHITECTURE_GROUP_METADATA[selectedNode.group]?.name ||
                      selectedNode.group}
                  </span>
                </div>
                <button
                  onClick={() => setSelectedNode(null)}
                  className="text-slate-500 hover:text-white p-1 rounded"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div>
                <h4 className="text-sm font-semibold text-slate-100 font-mono break-all">
                  {selectedNode.path}
                </h4>
                {selectedNode.isEntryPoint && (
                  <div className="mt-2 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[11px] font-medium">
                    <DoorOpen className="w-3 h-3" />
                    Entry Point
                  </div>
                )}
                {selectedNode.entryPointReason && (
                  <p className="text-[11px] text-slate-400 mt-1">
                    {selectedNode.entryPointReason}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-slate-900/80 p-2.5 rounded-lg border border-slate-800/60">
                  <span className="text-[10px] text-slate-500 uppercase">Lines</span>
                  <p className="text-slate-200 font-semibold font-mono mt-0.5">
                    {selectedNode.lines.toLocaleString()}
                  </p>
                </div>
                <div className="bg-slate-900/80 p-2.5 rounded-lg border border-slate-800/60">
                  <span className="text-[10px] text-slate-500 uppercase">Language</span>
                  <p className="text-slate-200 font-semibold mt-0.5 truncate">
                    {selectedNode.language || "Unknown"}
                  </p>
                </div>
                <div className="bg-slate-900/80 p-2.5 rounded-lg border border-slate-800/60">
                  <span className="text-[10px] text-slate-500 uppercase">Incoming (In)</span>
                  <p className="text-slate-200 font-semibold font-mono mt-0.5">
                    {selectedNode.inDegree}
                  </p>
                </div>
                <div className="bg-slate-900/80 p-2.5 rounded-lg border border-slate-800/60">
                  <span className="text-[10px] text-slate-500 uppercase">Outgoing (Out)</span>
                  <p className="text-slate-200 font-semibold font-mono mt-0.5">
                    {selectedNode.outDegree}
                  </p>
                </div>
              </div>

              {/* Detected Symbols */}
              {selectedNode.symbols.length > 0 && (
                <div>
                  <h5 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                    Exported Symbols ({selectedNode.symbols.length})
                  </h5>
                  <div className="space-y-1 max-h-40 overflow-y-auto custom-scrollbar">
                    {selectedNode.symbols.map((sym, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between text-xs font-mono p-1.5 bg-slate-900/50 rounded border border-slate-800/50"
                      >
                        <span className="text-slate-200 truncate">{sym.name}</span>
                        <span className="text-[10px] text-indigo-400 uppercase">
                          {sym.kind}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Action buttons */}
            <div className="pt-4 border-t border-slate-800/80 space-y-2">
              {selectedNode.type === "module" ? (
                <button
                  onClick={() => {
                    setViewMode("files");
                    setSelectedModule(selectedNode.path);
                  }}
                  className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium rounded-lg flex items-center justify-center gap-1.5 transition-colors"
                >
                  <FileCode2 className="w-3.5 h-3.5" /> Drill into Files
                </button>
              ) : (
                onInspectFile && (
                  <button
                    onClick={() => onInspectFile(selectedNode.path)}
                    className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium rounded-lg flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5" /> Inspect in Files
                  </button>
                )
              )}
            </div>
          </div>
        )}

        {/* Selected Edge Inspection */}
        {selectedEdge && (
          <div className="w-80 border-l border-slate-800/80 bg-[#0c1222]/95 backdrop-blur-md p-5 flex flex-col justify-between overflow-y-auto custom-scrollbar flex-shrink-0 z-20 animate-slide-in">
            <div className="space-y-4">
              <div className="flex items-start justify-between">
                <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                  Dependency Relationship
                </span>
                <button
                  onClick={() => setSelectedEdge(null)}
                  className="text-slate-500 hover:text-white p-1 rounded"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3 bg-slate-900/80 p-3 rounded-xl border border-slate-800/80 text-xs">
                <div>
                  <span className="text-[10px] text-slate-500 uppercase">From (Source)</span>
                  <p className="text-slate-200 font-mono font-medium break-all mt-0.5">
                    {selectedEdge.source}
                  </p>
                </div>
                <div className="flex items-center justify-center text-indigo-400">
                  <GitFork className="w-4 h-4 rotate-90" />
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 uppercase">To (Target)</span>
                  <p className="text-slate-200 font-mono font-medium break-all mt-0.5">
                    {selectedEdge.target}
                  </p>
                </div>
              </div>

              <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-800/60 text-xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Relationship Kind:</span>
                  <span className="font-mono text-indigo-300 font-medium uppercase">
                    {selectedEdge.kind}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Specifier:</span>
                  <span className="font-mono text-slate-200">{selectedEdge.specifier}</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
