"use client";

import React, { useState, useEffect } from "react";
import { Sidebar, TabType } from "@/components/Sidebar";
import { TechStackBadges } from "@/components/TechStackBadges";
import { FileExplorer } from "@/components/FileTree";
import { AnalysisPanel } from "@/components/AnalysisPanel";
import { SemanticSearch } from "@/components/SemanticSearch";
import { ChatWorkspace } from "@/components/ChatWorkspace";
import { ArchitectureWorkspace } from "@/components/ArchitectureWorkspace";
import { HealthWorkspace } from "@/components/HealthWorkspace";
import { ImpactWorkspace } from "@/components/ImpactWorkspace";
import {
  GitBranch,
  Search,
  ArrowRight,
  AlertCircle,
  Github,
  Cpu,
  MessageSquare,
  Layers,
  FileCode2,
  Box,
  Sparkles,
  RotateCcw,
  Clock,
  FolderGit2,
} from "lucide-react";

export default function Home() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [repoData, setRepoData] = useState<any | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>("overview");
  const [recentRepos, setRecentRepos] = useState<any[]>([]);
  const [loadingRecent, setLoadingRecent] = useState(false);

  const fetchRecentRepos = async () => {
    setLoadingRecent(true);
    try {
      const res = await fetch("/api/repos");
      const data = await res.json();
      if (res.ok && Array.isArray(data.repositories)) {
        setRecentRepos(data.repositories);
      }
    } catch {
      // ignore
    } finally {
      setLoadingRecent(false);
    }
  };

  useEffect(() => {
    fetchRecentRepos();
  }, []);

  const handleSelectRepo = async (repoId: string) => {
    setLoading(true);
    setError(null);
    try {
      const detailRes = await fetch(`/api/repos/${repoId}`);
      const detailData = await detailRes.json();
      if (!detailRes.ok) {
        throw new Error(detailData.error || "Failed to load repository.");
      }
      setRepoData(detailData.repository);
      setActiveTab("overview");
    } catch (err: any) {
      setError(err.message || "Failed to load repository.");
    } finally {
      setLoading(false);
    }
  };

  const handleIngest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;

    setLoading(true);
    setError(null);
    setRepoData(null);
    setActiveTab("overview");

    try {
      const res = await fetch("/api/repos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to analyze repository.");
      }

      const detailRes = await fetch(`/api/repos/${data.repository.id}`);
      const detailData = await detailRes.json();
      setRepoData(detailData.repository);
      fetchRecentRepos();
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-screen w-full bg-[#0B1120] overflow-hidden">
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        isRepoSelected={!!repoData}
      />

      <main className="flex-1 flex flex-col h-screen overflow-hidden relative">
        {!repoData ? (
          /* ═══ Landing View ═══ */
          <div className="flex-1 flex items-center justify-center p-6 animate-fade-in">
            <div className="max-w-2xl w-full text-center space-y-10">
              {/* Hero */}
              <div className="space-y-5">
                <div className="inline-flex items-center gap-2 text-xs font-medium text-indigo-400 bg-indigo-500/8 border border-indigo-500/15 px-3.5 py-1.5 rounded-full mb-2">
                  <Sparkles className="w-3.5 h-3.5" />
                  AI-Powered Repository Intelligence
                </div>

                <h1 className="text-4xl md:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-b from-white via-slate-200 to-slate-400 tracking-tight leading-[1.15]">
                  Understand Any
                  <br />
                  Codebase with AI
                </h1>

                <p className="text-slate-400 text-base md:text-lg max-w-lg mx-auto leading-relaxed">
                  Connect a GitHub repository and explore its architecture,
                  code, dependencies, and implementation through intelligent
                  analysis.
                </p>
              </div>

              {/* Search */}
              <form onSubmit={handleIngest} className="space-y-4">
                <div className="relative max-w-xl mx-auto group">
                  <div className="absolute inset-0 bg-indigo-500/10 blur-2xl rounded-2xl opacity-0 group-focus-within:opacity-100 transition-opacity duration-700" />
                  <div className="relative flex items-center bg-[#0f1729] border border-slate-700/40 group-focus-within:border-indigo-500/40 rounded-xl overflow-hidden transition-all shadow-2xl shadow-black/20">
                    <div className="pl-4 pr-2 py-3.5">
                      <Github className="w-5 h-5 text-slate-500" />
                    </div>
                    <input
                      type="text"
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      placeholder="Paste a public GitHub repository URL..."
                      className="flex-1 bg-transparent border-none text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-0 text-[15px] py-3.5"
                    />
                    <div className="pr-2">
                      <button
                        type="submit"
                        disabled={loading || !url.trim()}
                        className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-600 text-white font-semibold rounded-lg text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
                      >
                        {loading ? (
                          <>
                            <span className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                            <span className="hidden sm:inline">Analyzing...</span>
                          </>
                        ) : (
                          <>
                            <span className="hidden sm:inline">Analyze</span>
                            <ArrowRight className="w-4 h-4" />
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                {error && (
                  <div className="max-w-xl mx-auto flex items-center gap-2 p-3 bg-red-500/8 border border-red-500/15 rounded-xl text-red-400 text-sm text-left animate-slide-in">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <span>{error}</span>
                  </div>
                )}
              </form>

              {/* Recently Analyzed Repositories */}
              {recentRepos.length > 0 && (
                <div className="pt-4 max-w-xl mx-auto text-left space-y-3">
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-400 px-1">
                    <span className="flex items-center gap-1.5">
                      <FolderGit2 className="w-4 h-4 text-indigo-400" />
                      Recently Analyzed Repositories
                    </span>
                    <span className="text-[11px] text-slate-500 font-normal">
                      Click to open
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {recentRepos.slice(0, 4).map((repo) => (
                      <button
                        key={repo.id}
                        type="button"
                        onClick={() => handleSelectRepo(repo.id)}
                        disabled={loading}
                        className="flex flex-col p-3 rounded-xl bg-slate-900/70 hover:bg-slate-800/80 border border-slate-800 hover:border-indigo-500/40 transition-all text-left group cursor-pointer disabled:opacity-50 shadow-md shadow-black/20"
                      >
                        <div className="flex items-center justify-between w-full mb-1">
                          <span className="text-xs font-bold text-slate-200 group-hover:text-white truncate">
                            {repo.name}
                          </span>
                          <span className="text-[10px] text-emerald-400 font-medium flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            Ready
                          </span>
                        </div>
                        <span className="text-[11px] text-slate-500 truncate mb-2">
                          {repo.owner}
                        </span>
                        <div className="flex items-center justify-between text-[10px] text-slate-500 mt-auto pt-1.5 border-t border-slate-800/60">
                          <span>{repo.totalFiles} files</span>
                          <span>{repo.totalLines?.toLocaleString()} lines</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Capabilities */}
              <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3 text-xs font-medium text-slate-500 pt-6">
                <span className="flex items-center gap-1.5 hover:text-slate-300 transition-colors">
                  <Layers className="w-3.5 h-3.5" /> Repository Analysis
                </span>
                <span className="flex items-center gap-1.5 hover:text-slate-300 transition-colors">
                  <Search className="w-3.5 h-3.5" /> Semantic Search
                </span>
                <span className="flex items-center gap-1.5 hover:text-slate-300 transition-colors">
                  <MessageSquare className="w-3.5 h-3.5" /> AI Code Chat
                </span>
                <span className="flex items-center gap-1.5 hover:text-slate-300 transition-colors">
                  <Cpu className="w-3.5 h-3.5" /> Architecture Insights
                </span>
              </div>
            </div>
          </div>
        ) : (
          /* ═══ Workspace View ═══ */
          <div className="flex flex-col h-full animate-fade-in">
            {/* Repository Context Header */}
            <header className="h-14 flex-shrink-0 border-b border-slate-800/60 bg-[#0c1222]/80 backdrop-blur-md px-5 flex items-center justify-between sticky top-0 z-10">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-slate-700 to-slate-800 border border-slate-600/50 flex items-center justify-center overflow-hidden">
                  <Github className="w-4 h-4 text-slate-300" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-slate-200 leading-tight">
                    <span className="text-slate-400">{repoData.owner}</span>
                    <span className="text-slate-600 mx-1">/</span>
                    <span className="text-white">{repoData.name}</span>
                  </h2>
                  <div className="flex items-center gap-2.5 text-[10px] text-slate-500 mt-0.5">
                    <span className="flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse-subtle" />
                      <span className="text-emerald-400">Indexed</span>
                    </span>
                    <span className="flex items-center gap-1">
                      <GitBranch className="w-3 h-3" /> {repoData.defaultBranch}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="hidden sm:flex items-center gap-4">
                  <div className="flex flex-col items-end">
                    <span className="text-xs font-bold text-slate-200 tabular-nums">
                      {repoData.totalFiles}
                    </span>
                    <span className="text-[9px] uppercase tracking-wider text-slate-500 font-medium">
                      Files
                    </span>
                  </div>
                  <div className="w-px h-5 bg-slate-800" />
                  <div className="flex flex-col items-end">
                    <span className="text-xs font-bold text-slate-200 tabular-nums">
                      {repoData.totalLines?.toLocaleString()}
                    </span>
                    <span className="text-[9px] uppercase tracking-wider text-slate-500 font-medium">
                      Lines
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setRepoData(null);
                    setUrl("");
                    fetchRecentRepos();
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700/60 rounded-lg transition-colors cursor-pointer"
                  title="Switch or analyze another repository"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Switch Repo</span>
                </button>
              </div>
            </header>

            {/* Tab Content Area */}
            <div className="flex-1 overflow-hidden">
              {activeTab === "overview" && (
                <div className="h-full overflow-y-auto custom-scrollbar">
                  <div className="max-w-5xl mx-auto p-6 space-y-8 animate-fade-in-up">
                    <div className="space-y-3">
                      <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                        <Layers className="w-4 h-4 text-indigo-400" />
                        Technology Stack
                      </h3>
                      {repoData.techStack && (
                        <TechStackBadges stack={repoData.techStack} />
                      )}
                    </div>

                    {/* Feature Quick Launch Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div
                        onClick={() => setActiveTab("architecture")}
                        className="p-5 rounded-2xl bg-gradient-to-b from-indigo-950/40 to-slate-900/60 border border-indigo-500/20 hover:border-indigo-500/40 cursor-pointer transition-all group"
                      >
                        <div className="w-9 h-9 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 mb-3 group-hover:scale-105 transition-transform">
                          <Cpu className="w-5 h-5" />
                        </div>
                        <h4 className="text-sm font-bold text-slate-100 flex items-center justify-between">
                          Architecture Intelligence
                          <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-indigo-400 group-hover:translate-x-1 transition-all" />
                        </h4>
                        <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                          Explore structural modules, entry points, circular cycles, and dependency graphs.
                        </p>
                      </div>

                      <div
                        onClick={() => setActiveTab("health")}
                        className="p-5 rounded-2xl bg-gradient-to-b from-emerald-950/30 to-slate-900/60 border border-emerald-500/20 hover:border-emerald-500/40 cursor-pointer transition-all group"
                      >
                        <div className="w-9 h-9 rounded-xl bg-emerald-600/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mb-3 group-hover:scale-105 transition-transform">
                          <Sparkles className="w-5 h-5" />
                        </div>
                        <h4 className="text-sm font-bold text-slate-100 flex items-center justify-between">
                          Code Health & Risks
                          <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-emerald-400 group-hover:translate-x-1 transition-all" />
                        </h4>
                        <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                          Measurable signals, maintainability hotspots, and sanitized security checks.
                        </p>
                      </div>

                      <div
                        onClick={() => setActiveTab("impact")}
                        className="p-5 rounded-2xl bg-gradient-to-b from-purple-950/30 to-slate-900/60 border border-purple-500/20 hover:border-purple-500/40 cursor-pointer transition-all group"
                      >
                        <div className="w-9 h-9 rounded-xl bg-purple-600/20 border border-purple-500/30 flex items-center justify-center text-purple-400 mb-3 group-hover:scale-105 transition-transform">
                          <Box className="w-5 h-5" />
                        </div>
                        <h4 className="text-sm font-bold text-slate-100 flex items-center justify-between">
                          Change Impact Analyzer
                          <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-purple-400 group-hover:translate-x-1 transition-all" />
                        </h4>
                        <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                          Evaluate direct and transitive dependents, affected entry points, and test gaps.
                        </p>
                      </div>
                    </div>

                    <AnalysisPanel
                      repositoryId={repoData.id}
                      initialStatus={repoData.status}
                    />
                  </div>
                </div>
              )}

              {activeTab === "analysis" && (
                <div className="h-full overflow-y-auto custom-scrollbar p-6">
                  <div className="max-w-5xl mx-auto">
                    <AnalysisPanel
                      repositoryId={repoData.id}
                      initialStatus={repoData.status}
                    />
                  </div>
                </div>
              )}

              {activeTab === "files" && (
                <div className="h-full animate-fade-in-up">
                  <FileExplorer files={repoData.files} />
                </div>
              )}

              {activeTab === "search" && (
                <div className="h-full overflow-y-auto custom-scrollbar">
                  <div className="max-w-4xl mx-auto p-6 animate-fade-in-up">
                    <SemanticSearch repositoryId={repoData.id} />
                  </div>
                </div>
              )}

              {activeTab === "architecture" && (
                <div className="h-full animate-fade-in-up">
                  <ArchitectureWorkspace
                    repositoryId={repoData.id}
                    onInspectFile={(path) => {
                      setActiveTab("files");
                    }}
                  />
                </div>
              )}

              {activeTab === "health" && (
                <div className="h-full animate-fade-in-up">
                  <HealthWorkspace
                    repositoryId={repoData.id}
                    onInspectFile={(path) => {
                      setActiveTab("files");
                    }}
                  />
                </div>
              )}

              {activeTab === "impact" && (
                <div className="h-full animate-fade-in-up">
                  <ImpactWorkspace
                    repositoryId={repoData.id}
                    files={repoData.files || []}
                    onInspectFile={(path) => {
                      setActiveTab("files");
                    }}
                  />
                </div>
              )}

              {activeTab === "chat" && (
                <div className="h-full p-3 sm:p-4 animate-fade-in-up">
                  <ChatWorkspace repositoryId={repoData.id} />
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
