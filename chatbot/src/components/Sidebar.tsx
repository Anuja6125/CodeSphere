"use client";

import React, { useState } from "react";
import {
  Box,
  LayoutDashboard,
  Layers,
  Files,
  Search,
  Cpu,
  Activity,
  GitFork,
  MessageSquare,
  PanelLeftClose,
  PanelLeft,
  Menu,
  X,
} from "lucide-react";
import { clsx } from "clsx";

export type TabType =
  | "overview"
  | "analysis"
  | "files"
  | "search"
  | "architecture"
  | "health"
  | "impact"
  | "chat";

interface SidebarProps {
  activeTab: TabType;
  setActiveTab: (tab: TabType) => void;
  isRepoSelected: boolean;
}

const tabs = [
  { id: "overview" as TabType, label: "Overview", icon: LayoutDashboard },
  { id: "analysis" as TabType, label: "Analysis", icon: Layers },
  { id: "files" as TabType, label: "Files", icon: Files },
  { id: "search" as TabType, label: "Search", icon: Search },
  { id: "architecture" as TabType, label: "Architecture", icon: Cpu },
  { id: "health" as TabType, label: "Code Health", icon: Activity },
  { id: "impact" as TabType, label: "Change Impact", icon: GitFork },
  { id: "chat" as TabType, label: "AI Chat", icon: MessageSquare },
];

export function Sidebar({ activeTab, setActiveTab, isRepoSelected }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleTabClick = (tabId: TabType) => {
    setActiveTab(tabId);
    setMobileOpen(false);
  };

  const sidebarContent = (
    <>
      {/* Logo */}
      <div className={clsx(
        "h-14 flex items-center border-b border-slate-800/60 flex-shrink-0",
        collapsed ? "justify-center px-2" : "justify-between px-4"
      )}>
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-600 to-violet-600 flex items-center justify-center flex-shrink-0 shadow-lg shadow-indigo-500/15">
            <Box className="w-4.5 h-4.5 text-white" />
          </div>
          {!collapsed && (
            <span className="font-bold text-white tracking-tight text-[15px]">
              Codesphere
            </span>
          )}
        </div>
        {!collapsed && (
          <button
            onClick={() => setCollapsed(true)}
            className="p-1.5 rounded-md text-slate-500 hover:text-slate-300 hover:bg-slate-800/60 transition-colors hidden lg:flex"
          >
            <PanelLeftClose className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Navigation */}
      <div className="flex-1 overflow-y-auto py-4 px-2 space-y-0.5">
        {collapsed && (
          <button
            onClick={() => setCollapsed(false)}
            className="w-full flex items-center justify-center p-2 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-slate-800/60 transition-colors mb-3"
            title="Expand sidebar"
          >
            <PanelLeft className="w-4 h-4" />
          </button>
        )}

        {!collapsed && (
          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest px-3 pb-2">
            Workspace
          </p>
        )}

        {tabs.map((tab) => (
          <button
            key={tab.id}
            disabled={!isRepoSelected}
            onClick={() => handleTabClick(tab.id)}
            className={clsx(
              "w-full flex items-center gap-3 rounded-lg text-sm font-medium transition-all relative group",
              collapsed ? "justify-center px-2 py-2.5" : "px-3 py-2",
              !isRepoSelected && "opacity-40 cursor-not-allowed",
              activeTab === tab.id
                ? "bg-indigo-500/10 text-indigo-300"
                : "text-slate-400 hover:bg-slate-800/50 hover:text-slate-200"
            )}
            title={collapsed ? tab.label : undefined}
          >
            <tab.icon
              className={clsx(
                "w-[18px] h-[18px] flex-shrink-0 transition-colors",
                activeTab === tab.id
                  ? "text-indigo-400"
                  : "text-slate-500 group-hover:text-slate-300"
              )}
            />
            {!collapsed && <span>{tab.label}</span>}

            {/* Active indicator */}
            {activeTab === tab.id && !collapsed && (
              <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-indigo-500 rounded-r-full" />
            )}

            {/* Tooltip for collapsed state */}
            {collapsed && (
              <div className="absolute left-full ml-2 px-2.5 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-200 font-medium whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity shadow-xl z-50">
                {tab.label}
              </div>
            )}
          </button>
        ))}
      </div>

      {/* Footer */}
      <div className={clsx(
        "border-t border-slate-800/60 flex-shrink-0",
        collapsed ? "p-2" : "p-3"
      )}>
        <div className={clsx(
          "flex items-center gap-2 px-3 py-2 rounded-lg",
          collapsed ? "justify-center" : ""
        )}>
          <div className="w-6 h-6 rounded-full bg-gradient-to-br from-slate-600 to-slate-700 flex items-center justify-center flex-shrink-0">
            <span className="text-[10px] font-bold text-white">C</span>
          </div>
          {!collapsed && (
            <div className="flex flex-col min-w-0">
              <span className="text-[11px] font-medium text-slate-300 truncate">Codesphere</span>
              <span className="text-[10px] text-slate-500">v1.0</span>
            </div>
          )}
        </div>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile toggle */}
      <button
        onClick={() => setMobileOpen(!mobileOpen)}
        className="fixed top-3 left-3 z-50 p-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-white lg:hidden shadow-lg"
      >
        {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={clsx(
          "flex-shrink-0 border-r border-slate-800/60 bg-[#080e1c] flex flex-col h-screen transition-all duration-300 z-40",
          // Desktop
          collapsed ? "w-[60px] hidden lg:flex" : "w-60 hidden lg:flex",
          // Mobile
          mobileOpen && "!flex fixed left-0 top-0 w-64 shadow-2xl"
        )}
      >
        {sidebarContent}
      </aside>
    </>
  );
}
