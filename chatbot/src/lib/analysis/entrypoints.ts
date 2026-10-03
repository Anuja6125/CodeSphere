import { EntryPoint, FileRef } from "./types";

function score(path: string, reason: string, confidence: number): EntryPoint {
  return { path, reason, confidence: Math.min(1, Math.max(0, confidence)) };
}

export function detectEntryPoints(
  files: Array<Pick<FileRef, "path" | "name" | "extension" | "isDirectory" | "content">>,
  techHints?: { frameworks?: string[] }
): EntryPoint[] {
  const results: EntryPoint[] = [];
  const paths = files.filter((f) => !f.isDirectory).map((f) => f.path.replace(/\\/g, "/"));
  const byName = new Map(files.filter((f) => !f.isDirectory).map((f) => [f.path.replace(/\\/g, "/"), f]));
  const frameworks = techHints?.frameworks || [];

  const packageJson = files.find((f) => f.name === "package.json" && f.content);
  if (packageJson?.content) {
    try {
      const pkg = JSON.parse(packageJson.content);
      if (typeof pkg.main === "string") {
        const mainPath = pkg.main.replace(/^\.\//, "");
        const match = paths.find((p) => p === mainPath || p.endsWith("/" + mainPath) || p === mainPath.replace(/\.[^.]+$/, "") + ".ts");
        if (match) results.push(score(match, "package.json main", 0.9));
      }
      if (pkg.scripts?.start && typeof pkg.scripts.start === "string") {
        const startMatch = pkg.scripts.start.match(/(?:node|tsx?|next)\s+([^\s]+)/);
        if (startMatch) {
          const candidate = startMatch[1].replace(/^\.\//, "");
          const match = paths.find((p) => p === candidate || p.endsWith("/" + candidate));
          if (match) results.push(score(match, "package.json start script", 0.75));
        }
      }
    } catch {
      // ignore malformed package.json
    }
  }

  const nextAppFiles = paths.filter((p) =>
    /(^|\/)app\/(page|layout|route)\.(t|j)sx?$/.test(p) ||
    /(^|\/)pages\/(index|_app|_document)\.(t|j)sx?$/.test(p)
  );
  for (const p of nextAppFiles) {
    const conf = p.includes("/app/page.") ? 0.85 : p.includes("/pages/index.") ? 0.8 : 0.7;
    results.push(score(p, "Next.js app/pages route", conf));
  }

  const nodeMains = ["server.ts", "server.js", "app.ts", "app.js", "main.ts", "main.js", "index.ts", "index.js"];
  for (const file of files) {
    if (file.isDirectory) continue;
    if (nodeMains.includes(file.name) && !file.path.includes("node_modules")) {
      const depth = file.path.split("/").length;
      const conf = depth === 1 ? 0.8 : depth === 2 ? 0.65 : 0.45;
      results.push(score(file.path, `Node-style ${file.name}`, conf));
    }
  }

  for (const file of files) {
    if (file.isDirectory) continue;
    if (["main.py", "app.py", "manage.py", "wsgi.py", "asgi.py"].includes(file.name)) {
      results.push(score(file.path, `Python ${file.name}`, file.name === "manage.py" ? 0.85 : 0.8));
    }
  }

  for (const file of files) {
    if (file.isDirectory || file.extension !== "java" || !file.content) continue;
    if (/\bpublic\s+static\s+void\s+main\s*\(/.test(file.content)) {
      results.push(score(file.path, "Java main()", 0.85));
    }
  }

  if (frameworks.includes("Next.js") && nextAppFiles.length === 0) {
    const layout = paths.find((p) => /layout\.(t|j)sx?$/.test(p));
    if (layout) results.push(score(layout, "Next.js layout heuristic", 0.55));
  }

  const unique = new Map<string, EntryPoint>();
  for (const ep of results) {
    const existing = unique.get(ep.path);
    if (!existing || ep.confidence > existing.confidence) unique.set(ep.path, ep);
  }

  return Array.from(unique.values()).sort((a, b) => b.confidence - a.confidence);
}
