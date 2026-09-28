import React from "react";
import { Code2, Sparkles, Terminal } from "lucide-react";

export function Header() {
  return (
    <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur px-6 py-4 flex items-center justify-between sticky top-0 z-50">
      <div className="flex items-center space-x-3">
        <div className="p-2 bg-indigo-600/20 text-indigo-400 rounded-lg border border-indigo-500/30">
          <Code2 className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-xl font-bold bg-gradient-to-r from-indigo-400 via-sky-400 to-emerald-400 bg-clip-text text-transparent">
            Codesphere
          </h1>
          <p className="text-xs text-slate-400">AI-Powered Repository Intelligence</p>
        </div>
      </div>
      <div className="flex items-center space-x-2 text-xs text-slate-400 bg-slate-800/80 px-3 py-1.5 rounded-full border border-slate-700">
        <Sparkles className="w-3.5 h-3.5 text-amber-400" />
        <span>Phase 2 Repository Understanding</span>
      </div>
    </header>
  );
}
