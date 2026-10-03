"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  MessageSquare,
  Send,
  Sparkles,
  FileText,
  AlertCircle,
  RefreshCw,
  X,
  Trash2,
  Loader2,
  CheckCircle2,
  Bot,
  User,
  ChevronRight,
  Copy,
  Check
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { clsx } from "clsx";

export interface SourceCitation {
  file: string;
  startLine: number;
  endLine: number;
  chunkId: string;
  score: number;
  symbolName?: string | null;
  chunkType?: string;
}

export interface ChatMessageItem {
  id?: string;
  role: "user" | "assistant";
  content: string;
  fileRefs?: SourceCitation[];
  createdAt?: string;
  isError?: boolean;
}

const SUGGESTED_QUESTIONS = [
  { text: "What does this project do?", icon: "🔍" },
  { text: "Explain the project architecture.", icon: "🏗️" },
  { text: "Where is the main entry point?", icon: "📍" },
  { text: "Show important files.", icon: "📂" },
  { text: "What technologies are used?", icon: "⚡" },
  { text: "How is the application initialized?", icon: "🚀" },
];

const LOADING_STATES = [
  "Searching repository...",
  "Analyzing relevant code...",
  "Generating response...",
];

export function ChatWorkspace({ repositoryId }: { repositoryId: string }) {
  const [messages, setMessages] = useState<ChatMessageItem[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingTextIndex, setLoadingTextIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [inspectSource, setInspectSource] = useState<SourceCitation | null>(null);
  const [sourceContent, setSourceContent] = useState<string | null>(null);
  const [repoStatus, setRepoStatus] = useState<string | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [copiedId, setCopiedId] = useState<number | null>(null);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const loadHistory = useCallback(async () => {
    try {
      const res = await fetch(`/api/repos/${repositoryId}/chat`);
      const data = await res.json();
      if (res.ok && Array.isArray(data.messages)) {
        setMessages(
          data.messages.map((m: any) => ({
            id: m.id,
            role: m.role as "user" | "assistant",
            content: m.content,
            fileRefs: (m.fileRefs as SourceCitation[]) || [],
            createdAt: m.createdAt,
          }))
        );
      }
    } catch {
      // Ignore initial load history error
    }
  }, [repositoryId]);

  const loadRepoStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/repos/${repositoryId}`);
      if (res.ok) {
        const data = await res.json();
        setRepoStatus(data.status);
      }
    } catch {
      // Ignore
    }
  }, [repositoryId]);

  useEffect(() => {
    loadHistory();
    loadRepoStatus();
  }, [loadHistory, loadRepoStatus]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (loading) {
      interval = setInterval(() => {
        setLoadingTextIndex((prev) => (prev + 1) % LOADING_STATES.length);
      }, 2500);
    } else {
      setLoadingTextIndex(0);
    }
    return () => clearInterval(interval);
  }, [loading]);

  const handleSend = async (textToSend?: string) => {
    const query = (textToSend || input).trim();
    if (!query || loading) return;

    setInput("");
    setError(null);

    const userMsg: ChatMessageItem = { role: "user", content: query };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    try {
      const res = await fetch(`/api/repos/${repositoryId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: query }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 503 || res.status === 429) {
          setMessages((prev) => [...prev, {
            role: "assistant",
            content: "Repository search is temporarily unavailable. Please wait a moment and try again.",
            isError: true,
          }]);
          return;
        }
        throw new Error(data.error || "Failed to generate response.");
      }

      const assistantMsg: ChatMessageItem = {
        role: "assistant",
        content: data.answer,
        fileRefs: data.sources || [],
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err: any) {
      setMessages((prev) => [...prev, {
        role: "assistant",
        content: err.message || "An error occurred while communicating with the assistant.",
        isError: true,
      }]);
    } finally {
      setLoading(false);
      // Focus back on input
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  const handleClearHistory = async () => {
    try {
      const res = await fetch(`/api/repos/${repositoryId}/chat`, { method: "DELETE" });
      if (res.ok) {
        setMessages([]);
        setShowClearConfirm(false);
      }
    } catch {
      setError("Failed to clear conversation.");
    }
  };

  const handleInspectChunk = async (source: SourceCitation) => {
    setInspectSource(source);
    setSourceContent("Loading chunk content...");
    try {
      const res = await fetch(`/api/repos/${repositoryId}/chunks`);
      const data = await res.json();
      if (res.ok && Array.isArray(data.chunks)) {
        const found = data.chunks.find((c: any) => c.id === source.chunkId || (c.path === source.file && c.startLine === source.startLine));
        if (found) {
          setSourceContent(found.content);
        } else {
          setSourceContent(`Source file: ${source.file}\nLines: ${source.startLine}–${source.endLine}\n(Content chunk not cached directly)`);
        }
      }
    } catch {
      setSourceContent("Failed to load chunk content.");
    }
  };

  const handleCopyMessage = (content: string, idx: number) => {
    navigator.clipboard.writeText(content);
    setCopiedId(idx);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const autoResizeTextarea = (el: HTMLTextAreaElement) => {
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 160) + 'px';
  };

  return (
    <div className="flex flex-col h-full rounded-2xl overflow-hidden border border-slate-800/60 bg-[#0a0f1e] shadow-sm">

      {/* ─── Header ─── */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-800/60 bg-[#0c1222]/80 backdrop-blur-md flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-600 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/10">
            <Bot className="w-4 h-4 text-white" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-100 text-sm leading-tight">Repository Assistant</h3>
            <div className="flex items-center gap-2 mt-0.5">
              {repoStatus === "ANALYZED" ? (
                <span className="flex items-center gap-1 text-[10px] text-emerald-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse-subtle" />
                  Ready
                </span>
              ) : repoStatus === "ANALYZING" ? (
                <span className="flex items-center gap-1 text-[10px] text-amber-400">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Analyzing
                </span>
              ) : repoStatus === "INDEXING" ? (
                <span className="flex items-center gap-1 text-[10px] text-amber-400">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Generating embeddings
                </span>
              ) : repoStatus === "FAILED" ? (
                <span className="flex items-center gap-1 text-[10px] text-red-400">
                  Error
                </span>
              ) : (
                <span className="flex items-center gap-1 text-[10px] text-slate-400">
                  Indexed · embeddings pending
                </span>
              )}
              <span className="text-[10px] text-slate-500">·</span>
              <span className="text-[10px] text-slate-500">Powered by Gemini + RAG</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {showClearConfirm ? (
            <div className="flex items-center gap-1.5 bg-red-500/10 px-3 py-1.5 rounded-lg border border-red-500/20 animate-slide-in">
              <span className="text-xs text-red-400">Clear chat?</span>
              <button onClick={handleClearHistory} className="text-xs text-white bg-red-600 hover:bg-red-500 px-2 py-1 rounded-md transition-colors">Yes</button>
              <button onClick={() => setShowClearConfirm(false)} className="text-xs text-slate-400 hover:text-white px-2 py-1 transition-colors">No</button>
            </div>
          ) : (
            <>
              <button
                onClick={loadHistory}
                title="Reload History"
                className="p-2 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-slate-800/60 transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setShowClearConfirm(true)}
                title="Clear Conversation"
                className="p-2 rounded-lg text-slate-500 hover:text-red-400 hover:bg-slate-800/60 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* ─── Messages ─── */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {messages.length === 0 ? (
          /* Empty State */
          <div className="flex flex-col items-center justify-center h-full max-w-lg mx-auto text-center px-6 py-12 space-y-8">
            <div className="relative">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-violet-500/20 border border-indigo-500/20 flex items-center justify-center">
                <Sparkles className="w-7 h-7 text-indigo-400" />
              </div>
              <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-emerald-500 rounded-full flex items-center justify-center border-2 border-[#0a0f1e]">
                <CheckCircle2 className="w-3 h-3 text-white" />
              </div>
            </div>

            <div className="space-y-2">
              <h2 className="text-lg font-semibold text-slate-100">How can I help you understand this repository?</h2>
              <p className="text-sm text-slate-400 leading-relaxed max-w-md">
                Ask about architecture, implementation, files, dependencies, or any code in this repository.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 w-full max-w-md">
              {SUGGESTED_QUESTIONS.map((q) => (
                <button
                  key={q.text}
                  onClick={() => handleSend(q.text)}
                  className="flex items-start gap-2.5 px-3.5 py-3 rounded-xl text-left text-[13px] font-medium bg-slate-900/60 hover:bg-slate-800/80 border border-slate-800/60 hover:border-slate-700/80 text-slate-300 hover:text-slate-100 transition-all group"
                >
                  <span className="text-base flex-shrink-0 mt-0.5">{q.icon}</span>
                  <span className="leading-snug">{q.text}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          /* Message List */
          <div className="px-4 sm:px-6 py-6 space-y-1">
            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={clsx(
                  "flex w-full animate-slide-in",
                  msg.role === "user" ? "justify-end" : "justify-start"
                )}
              >
                <div className={clsx(
                  "flex gap-3 max-w-[88%] sm:max-w-[80%]",
                  msg.role === "user" ? "flex-row-reverse" : "flex-row"
                )}>
                  {/* Avatar */}
                  <div className={clsx(
                    "w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-1",
                    msg.role === "user"
                      ? "bg-indigo-600"
                      : msg.isError
                        ? "bg-red-500/20 border border-red-500/30"
                        : "bg-slate-800 border border-slate-700"
                  )}>
                    {msg.role === "user" ? (
                      <User className="w-3.5 h-3.5 text-white" />
                    ) : msg.isError ? (
                      <AlertCircle className="w-3.5 h-3.5 text-red-400" />
                    ) : (
                      <Bot className="w-3.5 h-3.5 text-indigo-400" />
                    )}
                  </div>

                  {/* Message Content */}
                  <div className={clsx(
                    "flex flex-col min-w-0",
                    msg.role === "user" ? "items-end" : "items-start"
                  )}>
                    <div className={clsx(
                      "rounded-2xl px-4 py-3 text-[13px] leading-relaxed relative group",
                      msg.role === "user"
                        ? "bg-indigo-600 text-white rounded-tr-sm"
                        : msg.isError
                          ? "bg-red-500/8 border border-red-500/15 text-red-300 rounded-tl-sm"
                          : "bg-slate-900/80 border border-slate-800/60 text-slate-200 rounded-tl-sm"
                    )}>
                      {msg.role === "assistant" && !msg.isError ? (
                        <div className="prose-chat">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {msg.content}
                          </ReactMarkdown>
                        </div>
                      ) : (
                        <p className="whitespace-pre-wrap">{msg.content}</p>
                      )}

                      {/* Copy button */}
                      {msg.role === "assistant" && !msg.isError && (
                        <button
                          onClick={() => handleCopyMessage(msg.content, idx)}
                          className="absolute -bottom-3 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-800 border border-slate-700 rounded-md px-2 py-1 flex items-center gap-1 text-[10px] text-slate-400 hover:text-slate-200"
                        >
                          {copiedId === idx ? (
                            <><Check className="w-3 h-3 text-emerald-400" /> Copied</>
                          ) : (
                            <><Copy className="w-3 h-3" /> Copy</>
                          )}
                        </button>
                      )}
                    </div>

                    {/* Source Citations */}
                    {msg.role === "assistant" && msg.fileRefs && msg.fileRefs.length > 0 && (
                      <div className="mt-3 w-full">
                        <div className="flex items-center gap-2 mb-2 px-1">
                          <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">Sources</span>
                          <div className="h-px bg-slate-800/60 flex-1" />
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {msg.fileRefs.map((src, i) => (
                            <button
                              key={i}
                              onClick={() => handleInspectChunk(src)}
                              className="group/src flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-900/50 hover:bg-indigo-500/8 border border-slate-800/50 hover:border-indigo-500/25 transition-all text-left"
                            >
                              <FileText className="w-3.5 h-3.5 text-slate-500 group-hover/src:text-indigo-400 transition-colors flex-shrink-0" />
                              <div className="flex flex-col min-w-0">
                                <span className="text-[11px] font-medium text-slate-300 group-hover/src:text-indigo-300 truncate transition-colors">
                                  {src.file.split("/").pop()}
                                </span>
                                <span className="text-[9px] text-slate-500 font-mono">
                                  L{src.startLine}–{src.endLine}
                                </span>
                              </div>
                              <ChevronRight className="w-3 h-3 text-slate-600 group-hover/src:text-indigo-400 transition-colors flex-shrink-0" />
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}

            {/* Loading Indicator */}
            {loading && (
              <div className="flex w-full justify-start animate-slide-in">
                <div className="flex gap-3">
                  <div className="w-7 h-7 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center flex-shrink-0 mt-1">
                    <Bot className="w-3.5 h-3.5 text-indigo-400" />
                  </div>
                  <div className="flex items-center gap-3 bg-slate-900/80 border border-slate-800/60 px-4 py-3 rounded-2xl rounded-tl-sm text-[13px]">
                    <div className="flex gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: "300ms" }} />
                    </div>
                    <span className="text-slate-400">{LOADING_STATES[loadingTextIndex]}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="flex items-center gap-2 p-3 mt-2 bg-red-500/8 border border-red-500/15 rounded-xl text-red-400 text-xs mx-auto max-w-fit animate-slide-in">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div ref={messagesEndRef} className="h-2" />
          </div>
        )}
      </div>

      {/* ─── Input ─── */}
      <div className="flex-shrink-0 border-t border-slate-800/60 bg-[#0c1222]/80 backdrop-blur-md p-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="relative max-w-3xl mx-auto"
        >
          <div className="flex items-end gap-2">
            <div className="relative flex-1 bg-[#0f1729] border border-slate-800/80 focus-within:border-indigo-500/50 focus-within:ring-1 focus-within:ring-indigo-500/20 rounded-xl transition-all">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  autoResizeTextarea(e.target);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="Ask anything about this repository..."
                disabled={loading}
                rows={1}
                className="w-full bg-transparent px-4 py-3 text-[13px] text-slate-100 placeholder-slate-500 outline-none resize-none max-h-40 min-h-[44px] custom-scrollbar"
              />
            </div>
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className={clsx(
                "h-[44px] w-[44px] rounded-xl flex items-center justify-center transition-all flex-shrink-0",
                input.trim() && !loading
                  ? "bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/15 cursor-pointer"
                  : "bg-slate-800 text-slate-500 cursor-not-allowed"
              )}
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
          <p className="text-[10px] text-slate-600 mt-2 text-center">
            Press Enter to send · Shift+Enter for new line
          </p>
        </form>
      </div>

      {/* ─── Source Inspector Modal ─── */}
      {inspectSource && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 sm:p-6" onClick={() => setInspectSource(null)}>
          <div
            className="bg-[#0c1222] border border-slate-700/60 rounded-2xl max-w-4xl w-full flex flex-col shadow-2xl max-h-[85vh] overflow-hidden animate-slide-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 flex items-center justify-between border-b border-slate-800/60 bg-[#0f1729]/80 flex-shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center flex-shrink-0">
                  <FileText className="w-4 h-4 text-indigo-400" />
                </div>
                <div className="min-w-0">
                  <h4 className="font-semibold text-sm text-slate-200 truncate font-mono">{inspectSource.file}</h4>
                  <p className="text-[11px] text-slate-500 mt-0.5 font-mono">
                    Lines {inspectSource.startLine}–{inspectSource.endLine}
                    {inspectSource.symbolName && <> · <span className="text-indigo-400">{inspectSource.symbolName}</span></>}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setInspectSource(null)}
                className="p-2 rounded-lg bg-slate-800/60 text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto bg-[#0d1117] custom-scrollbar">
              <div className="flex text-[13px] leading-[1.6]">
                <div className="flex-shrink-0 text-slate-600 font-mono select-none py-4 px-4 text-right border-r border-slate-800/30 min-w-[3.5rem]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                  {sourceContent?.split("\n").map((_, i) => (
                    <div key={i} className="opacity-40">{(inspectSource.startLine || 1) + i}</div>
                  ))}
                </div>
                <pre className="flex-1 p-4 overflow-x-auto text-slate-300 custom-scrollbar" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '13px' }}>
                  {sourceContent}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
