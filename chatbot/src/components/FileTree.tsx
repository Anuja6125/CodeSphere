"use client";

import React, { useState } from "react";
import { Folder, FileText, ChevronRight, ChevronDown, FileCode2, Info } from "lucide-react";
import { clsx } from "clsx";

export interface FileTreeNode {
  path: string;
  name: string;
  isDirectory: boolean;
  size?: number;
  linesCount?: number;
  content?: string;
  children?: FileTreeNode[];
}

export function buildTree(files: { path: string; name: string; isDirectory: boolean; size: number; linesCount: number; content?: string }[]): FileTreeNode[] {
  const root: FileTreeNode[] = [];
  const map = new Map<string, FileTreeNode>();

  const sortedFiles = [...files].sort((a, b) => {
    if (a.isDirectory && !b.isDirectory) return -1;
    if (!a.isDirectory && b.isDirectory) return 1;
    return a.path.localeCompare(b.path);
  });

  for (const file of sortedFiles) {
    const parts = file.path.split("/");
    const node: FileTreeNode = {
      path: file.path,
      name: file.name,
      isDirectory: file.isDirectory,
      size: file.size,
      linesCount: file.linesCount,
      content: file.content,
      children: file.isDirectory ? [] : undefined,
    };
    map.set(file.path, node);

    if (parts.length === 1) {
      root.push(node);
    } else {
      const parentPath = parts.slice(0, -1).join("/");
      const parent = map.get(parentPath);
      if (parent && parent.children) {
        parent.children.push(node);
      } else {
        root.push(node);
      }
    }
  }

  return root;
}

function TreeNodeItem({
  node,
  onSelectFile,
  selectedPath,
}: {
  node: FileTreeNode;
  onSelectFile: (node: FileTreeNode) => void;
  selectedPath?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);

  if (node.isDirectory) {
    return (
      <div className="select-none text-xs">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-1.5 py-1.5 px-2 hover:bg-slate-800/80 rounded-md text-slate-300 w-full text-left transition-colors group"
        >
          <ChevronRight className={clsx("w-3.5 h-3.5 text-slate-500 transition-transform duration-200", isOpen && "rotate-90")} />
          <Folder className={clsx("w-4 h-4 transition-colors", isOpen ? "text-indigo-400 fill-indigo-400/20" : "text-slate-400 group-hover:text-indigo-300")} />
          <span className={clsx("font-medium", isOpen ? "text-slate-100" : "text-slate-300")}>{node.name}</span>
        </button>
        {isOpen && node.children && (
          <div className="pl-4 border-l border-slate-800/80 ml-2 space-y-0.5 mt-0.5 animate-fade-in">
            {node.children.map((child) => (
              <TreeNodeItem key={child.path} node={child} onSelectFile={onSelectFile} selectedPath={selectedPath} />
            ))}
          </div>
        )}
      </div>
    );
  }

  const isSelected = selectedPath === node.path;

  return (
    <button
      onClick={() => onSelectFile(node)}
      className={clsx(
        "flex items-center justify-between py-1.5 px-2 rounded-md text-xs w-full text-left transition-colors group ml-2",
        isSelected ? "bg-indigo-600/20 text-indigo-300" : "hover:bg-slate-800/50 text-slate-400 hover:text-slate-200"
      )}
    >
      <div className="flex items-center gap-2 truncate">
        <FileCode2 className={clsx("w-3.5 h-3.5 flex-shrink-0", isSelected ? "text-indigo-400" : "text-slate-500 group-hover:text-slate-400")} />
        <span className="truncate">{node.name}</span>
      </div>
    </button>
  );
}

export function FileExplorer({ files }: { files: any[] }) {
  const tree = buildTree(files);
  const [selectedFile, setSelectedFile] = useState<FileTreeNode | null>(null);

  return (
    <div className="flex h-full min-h-[500px]">
      <div className="w-64 border-r border-slate-800/80 bg-slate-900/50 flex flex-col">
        <div className="p-3 border-b border-slate-800/80 bg-slate-900 flex-shrink-0">
          <input
            type="text"
            placeholder="Search files..."
            className="w-full bg-slate-950 border border-slate-700/50 rounded-md text-xs px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 transition-all placeholder:text-slate-500"
          />
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-0.5 custom-scrollbar">
          {tree.map((node) => (
            <TreeNodeItem key={node.path} node={node} onSelectFile={setSelectedFile} selectedPath={selectedFile?.path} />
          ))}
        </div>
      </div>

      <div className="flex-1 bg-slate-950 flex flex-col relative min-w-0">
        {selectedFile ? (
          <>
            <div className="h-12 border-b border-slate-800 bg-slate-900/80 flex items-center justify-between px-4 flex-shrink-0 sticky top-0 z-10 backdrop-blur-sm">
              <div className="flex items-center gap-2 min-w-0">
                <FileCode2 className="w-4 h-4 text-indigo-400 flex-shrink-0" />
                <span className="font-semibold text-slate-200 text-sm truncate">{selectedFile.path}</span>
              </div>
              <div className="flex items-center gap-3 text-xs text-slate-500 font-mono flex-shrink-0">
                <span>{selectedFile.linesCount} lines</span>
                <span>{(selectedFile.size! / 1024).toFixed(1)} KB</span>
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto custom-scrollbar bg-[#0d1117]">
              {selectedFile.content ? (
                <div className="flex text-[13px] leading-[1.6]">
                  <div className="flex-shrink-0 bg-[#0d1117] text-slate-600 font-mono select-none py-4 px-4 text-right border-r border-slate-800/50 min-w-[3rem]">
                    {selectedFile.content.split("\n").map((_, i) => (
                      <div key={i} className="opacity-50">{i + 1}</div>
                    ))}
                  </div>
                  <pre className="flex-1 p-4 overflow-x-auto text-slate-300 font-mono custom-scrollbar">
                    {selectedFile.content}
                  </pre>
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-slate-500 space-y-3">
                  <Info className="w-8 h-8 opacity-50" />
                  <p className="text-sm">Binary or empty file content not previewed.</p>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-slate-500 space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-slate-900 flex items-center justify-center border border-slate-800 shadow-sm">
              <FileCode2 className="w-8 h-8 text-slate-600" />
            </div>
            <p className="text-sm font-medium">Select a file from the explorer to preview</p>
          </div>
        )}
      </div>
    </div>
  );
}
