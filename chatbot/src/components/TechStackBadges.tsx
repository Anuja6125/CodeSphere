import React from "react";
import { TechStackInfo } from "@/lib/git/stack-detector";
import { Cpu, Database, Layers, Wrench, ShieldAlert } from "lucide-react";

export function TechStackBadges({ stack }: { stack: TechStackInfo }) {
  if (!stack) return null;

  return (
    <div className="flex flex-wrap gap-2.5 text-[13px]">
      {stack.languages.map((lang) => (
        <span key={lang} className="px-3 py-1.5 rounded-full bg-slate-900 border border-slate-700 shadow-sm font-medium text-slate-200 flex items-center gap-1.5 hover:border-slate-500 transition-colors cursor-default">
          <Cpu className="w-3.5 h-3.5 text-indigo-400" />
          {lang}
        </span>
      ))}
      {stack.frameworks.map((fw) => (
        <span key={fw} className="px-3 py-1.5 rounded-full bg-slate-900 border border-slate-700 shadow-sm font-medium text-slate-200 flex items-center gap-1.5 hover:border-slate-500 transition-colors cursor-default">
          <Layers className="w-3.5 h-3.5 text-sky-400" />
          {fw}
        </span>
      ))}
      {stack.databases.map((db) => (
        <span key={db} className="px-3 py-1.5 rounded-full bg-slate-900 border border-slate-700 shadow-sm font-medium text-slate-200 flex items-center gap-1.5 hover:border-slate-500 transition-colors cursor-default">
          <Database className="w-3.5 h-3.5 text-emerald-400" />
          {db}
        </span>
      ))}
      {stack.packageManagers.map((pm) => (
        <span key={pm} className="px-3 py-1.5 rounded-full bg-slate-900 border border-slate-700 shadow-sm font-medium text-slate-200 flex items-center gap-1.5 hover:border-slate-500 transition-colors cursor-default">
          <Wrench className="w-3.5 h-3.5 text-amber-400" />
          {pm}
        </span>
      ))}
      {stack.hasDocker && (
        <span className="px-3 py-1.5 rounded-full bg-slate-900 border border-slate-700 shadow-sm font-medium text-slate-200 flex items-center gap-1.5 hover:border-slate-500 transition-colors cursor-default">
          <Layers className="w-3.5 h-3.5 text-cyan-400" />
          Docker
        </span>
      )}
      {stack.hasCI && (
        <span className="px-3 py-1.5 rounded-full bg-slate-900 border border-slate-700 shadow-sm font-medium text-slate-200 flex items-center gap-1.5 hover:border-slate-500 transition-colors cursor-default">
          <ShieldAlert className="w-3.5 h-3.5 text-purple-400" />
          CI/CD Pipeline
        </span>
      )}
    </div>
  );
}
