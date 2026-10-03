export type DisplayStatus = {
  text: string;
  colorClass: string;
  icon: "ready" | "spinner" | "error" | "none";
};

export function getDisplayStatus(repoStatus: string | null): DisplayStatus {
  if (repoStatus === "ANALYZED") {
    return { text: "Ready", colorClass: "text-emerald-400", icon: "ready" };
  }
  if (repoStatus === "ANALYZING") {
    return { text: "Analyzing", colorClass: "text-amber-400", icon: "spinner" };
  }
  if (repoStatus === "INDEXING") {
    return { text: "Generating embeddings", colorClass: "text-amber-400", icon: "spinner" };
  }
  if (repoStatus === "INDEXED") {
    return { text: "Indexed; embeddings pending", colorClass: "text-slate-400", icon: "none" };
  }
  if (repoStatus === "FAILED") {
    return { text: "Error", colorClass: "text-red-400", icon: "error" };
  }
  return { text: "Not indexed", colorClass: "text-slate-400", icon: "none" };
}
