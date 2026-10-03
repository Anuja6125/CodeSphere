"use client";

import React, { useState } from "react";
import { Search, Database, AlertCircle, ArrowRight, FileCode2, Sparkles, CheckCircle2 } from "lucide-react";
import { clsx } from "clsx";

export function SemanticSearch({ repositoryId }: { repositoryId: string }) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [embedding, setEmbedding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<any[]>([]);
  const [selected, setSelected] = useState<any | null>(null);
  const [embeddingStats, setEmbeddingStats] = useState<any | null>(null);

  const generateEmbeddings = async () => {
    setEmbedding(true);
    setError(null);
    try {
      const res = await fetch(`/api/repos/${repositoryId}/embed`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 429) {
          throw new Error("Embedding service is rate-limited. Please wait 1-2 minutes and try again.");
        }
        throw new Error(data.error || "Embedding generation failed.");
      }
      setEmbeddingStats(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setEmbedding(false);
    }
  };

  const search = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/repos/${repositoryId}/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, limit: 8 }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 429) {
          throw new Error("Search is temporarily rate-limited. Please wait 20-30 seconds and try again.");
        }
        throw new Error(data.error || "Search failed.");
      }
      setResults(data.results || []);
      setSelected(data.results?.[0] || null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header and Embedding Control */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-violet-400" /> AI Semantic Search
          </h2>
          <p className="text-sm text-slate-400 max-w-lg">
            Find relevant code using natural language. The AI understands intent and context, not just keywords.
          </p>
        </div>
        
        <button
          onClick={generateEmbeddings}
          disabled={embedding}
          className="px-4 py-2 bg-slate-900 border border-slate-700 hover:border-violet-500/50 hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed text-slate-200 text-sm font-medium rounded-lg flex items-center gap-2 transition-all shadow-sm"
        >
          {embedding ? (
            <>
              <span className="w-4 h-4 border-2 border-slate-500 border-t-slate-200 rounded-full animate-spin" />
              Generating Embeddings...
            </>
          ) : (
            <>
              <Database className="w-4 h-4 text-violet-400" />
              Prepare Knowledge Base
            </>
          )}
        </button>
      </div>

      {embeddingStats && (
        <div className={clsx(
          "flex items-center gap-3 p-3 border rounded-xl text-sm animate-fade-in-up",
          embeddingStats.failed > 0
            ? "bg-amber-500/10 border-amber-500/20 text-amber-400"
            : "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
        )}>
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          <p>
            <span className={clsx("font-semibold", embeddingStats.failed > 0 ? "text-amber-300" : "text-emerald-300")}>
              {embeddingStats.failed > 0 ? "Partially complete:" : "Database prepared:"}
            </span>{" "}
            {embeddingStats.message || `Embedded ${embeddingStats.embedded} chunks, skipped ${embeddingStats.skipped}, failed ${embeddingStats.failed}.`}
          </p>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-3 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm animate-fade-in-up">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Premium Search Bar */}
      <form onSubmit={search} className="relative group">
        <div className="absolute inset-0 bg-violet-500/20 blur-xl rounded-2xl opacity-0 group-focus-within:opacity-100 transition-opacity duration-500" />
        <div className="relative flex items-center bg-slate-900/80 border border-slate-700 group-focus-within:border-violet-500/50 rounded-2xl overflow-hidden transition-all shadow-lg backdrop-blur-sm">
          <div className="pl-5 pr-3 py-4">
            <Search className={clsx("w-6 h-6 transition-colors", query.trim() ? "text-violet-400" : "text-slate-500")} />
          </div>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="e.g. How is the application authentication initialized?"
            maxLength={4000}
            className="flex-1 bg-transparent border-none text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-0 text-base py-4"
          />
          <div className="pr-2">
            <button 
              disabled={loading || !query.trim()} 
              className="px-5 py-2.5 bg-violet-600 hover:bg-violet-500 disabled:bg-slate-800 disabled:text-slate-500 text-white font-medium rounded-xl text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer shadow-sm"
            >
              {loading ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                  Searching...
                </>
              ) : (
                <>
                  Search <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </div>
      </form>

      {/* Search Results */}
      {results.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 h-[500px] animate-fade-in-up">
          {/* Results List */}
          <div className="flex flex-col border border-slate-800 bg-slate-900/50 rounded-2xl overflow-hidden">
            <div className="p-3 border-b border-slate-800 bg-slate-900 flex-shrink-0">
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider pl-1">Found {results.length} relevant snippets</h3>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-2 custom-scrollbar">
              {results.map((result, index) => (
                <button 
                  key={result.id} 
                  onClick={() => setSelected(result)} 
                  className={clsx(
                    "w-full text-left p-4 rounded-xl border transition-all relative overflow-hidden group",
                    selected?.id === result.id 
                      ? "border-violet-500/50 bg-violet-500/10 shadow-sm" 
                      : "border-slate-800 bg-slate-950 hover:border-slate-700 hover:bg-slate-900"
                  )}
                >
                  {/* Subtle relevance indicator line */}
                  <div className={clsx(
                    "absolute left-0 top-0 bottom-0 w-1 transition-colors",
                    selected?.id === result.id ? "bg-violet-500" : "bg-transparent group-hover:bg-slate-700"
                  )} />
                  
                  <div className="pl-1">
                    <div className="flex items-center gap-2 mb-2 truncate">
                      <FileCode2 className="w-4 h-4 text-slate-500 flex-shrink-0" />
                      <span className="text-sm font-semibold text-slate-200 truncate">{result.filePath}</span>
                    </div>
                    <div className="flex items-center gap-2 text-[11px] font-mono text-slate-500 mt-1">
                      <span className="bg-slate-800/80 px-2 py-0.5 rounded text-slate-300">L{result.startLine}–{result.endLine}</span>
                      <span>·</span>
                      <span className="uppercase text-slate-400">{result.chunkType}</span>
                    </div>
                    
                    {/* Small snippet preview for unselected items */}
                    {selected?.id !== result.id && (
                      <div className="mt-3 text-[11px] text-slate-400 font-mono line-clamp-2 leading-relaxed opacity-60">
                        {result.content}
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Snippet Viewer */}
          <div className="flex flex-col border border-slate-800 bg-slate-950 rounded-2xl overflow-hidden relative shadow-inner">
            {selected ? (
              <>
                <div className="p-4 border-b border-slate-800 bg-slate-900/80 flex items-center justify-between sticky top-0 z-10 backdrop-blur-md flex-shrink-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <FileCode2 className="w-4 h-4 text-violet-400 flex-shrink-0" />
                    <span className="font-semibold text-slate-200 text-sm truncate">{selected.filePath}</span>
                  </div>
                  <span className="text-[11px] bg-slate-800 px-2 py-1 rounded text-slate-300 font-mono flex-shrink-0">
                    Lines {selected.startLine}–{selected.endLine}
                  </span>
                </div>
                
                <div className="flex-1 overflow-y-auto bg-[#0d1117] custom-scrollbar">
                  <div className="flex text-[13px] leading-[1.6]">
                    <div className="flex-shrink-0 bg-[#0d1117] text-slate-600 font-mono select-none py-4 px-4 text-right border-r border-slate-800/50 min-w-[3rem]">
                      {selected.content.split("\n").map((_: any, i: number) => (
                        <div key={i} className={clsx(
                          "opacity-50",
                          // Optional highlight matching lines
                        )}>{selected.startLine + i}</div>
                      ))}
                    </div>
                    <pre className="flex-1 p-4 overflow-x-auto text-slate-300 font-mono custom-scrollbar">
                      {selected.content}
                    </pre>
                  </div>
                </div>
              </>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-slate-500 space-y-4 p-6 text-center">
                <Search className="w-8 h-8 opacity-20" />
                <p className="text-sm">Select a search result to view the source code snippet.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
