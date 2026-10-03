import { ExtractedDependency, FileRef } from "./types";

function dirname(filePath: string): string {
  const parts = filePath.replace(/\\/g, "/").split("/");
  parts.pop();
  return parts.join("/");
}

function normalizeRel(fromDir: string, specifier: string): string {
  const parts = [...fromDir.split("/").filter(Boolean), ...specifier.split("/")];
  const stack: string[] = [];
  for (const part of parts) {
    if (part === "." || part === "") continue;
    if (part === "..") stack.pop();
    else stack.push(part);
  }
  return stack.join("/");
}

const SOURCE_EXTS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".py", ".java", ".h", ".hpp"];

export function resolveSpecifier(fromPath: string, specifier: string, allPaths: string[]): string | null {
  if (!specifier.startsWith(".") && !specifier.startsWith("/")) return null;
  const fromDir = dirname(fromPath);
  const base = normalizeRel(fromDir, specifier);
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.js`,
    `${base}.jsx`,
    `${base}.mjs`,
    `${base}.py`,
    `${base}.java`,
    `${base}/index.ts`,
    `${base}/index.tsx`,
    `${base}/index.js`,
    `${base}/__init__.py`,
  ];
  const pathSet = new Set(allPaths.map((p) => p.replace(/\\/g, "/")));
  for (const c of candidates) {
    if (pathSet.has(c)) return c;
  }
  return null;
}

export function extractJsTsImports(content: string, fromPath: string): ExtractedDependency[] {
  const deps: ExtractedDependency[] = [];
  const importRe = /(?:import|export)\s+(?:type\s+)?(?:[\s\S]*?\sfrom\s+)?['"]([^'"]+)['"]/g;
  const requireRe = /require\(\s*['"]([^'"]+)['"]\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = importRe.exec(content)) !== null) {
    deps.push({ fromPath, toSpecifier: m[1], kind: "import" });
  }
  while ((m = requireRe.exec(content)) !== null) {
    deps.push({ fromPath, toSpecifier: m[1], kind: "require" });
  }
  return deps;
}

export function extractPythonImports(content: string, fromPath: string): ExtractedDependency[] {
  const deps: ExtractedDependency[] = [];
  const fromRe = /^from\s+([.\w]+)\s+import\s+/gm;
  const importRe = /^import\s+([.\w]+)/gm;
  let m: RegExpExecArray | null;
  while ((m = fromRe.exec(content)) !== null) {
    deps.push({ fromPath, toSpecifier: m[1], kind: "import" });
  }
  while ((m = importRe.exec(content)) !== null) {
    deps.push({ fromPath, toSpecifier: m[1], kind: "import" });
  }
  return deps;
}

export function extractJavaImports(content: string, fromPath: string): ExtractedDependency[] {
  const deps: ExtractedDependency[] = [];
  const re = /^import\s+([\w.]+)\s*;/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    deps.push({ fromPath, toSpecifier: m[1], kind: "import" });
  }
  return deps;
}

export function extractCIncludes(content: string, fromPath: string): ExtractedDependency[] {
  const deps: ExtractedDependency[] = [];
  const re = /^#\s*include\s+[<"]([^>"]+)[>"]/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    deps.push({ fromPath, toSpecifier: m[1], kind: "include" });
  }
  return deps;
}

export function extractDependencies(
  file: Pick<FileRef, "path" | "extension" | "content">,
  language: string | null
): ExtractedDependency[] {
  const content = file.content || "";
  if (!content) return [];
  const ext = (file.extension || "").toLowerCase();

  if (language === "TypeScript" || language === "JavaScript" || ["ts", "tsx", "js", "jsx", "mjs", "cjs"].includes(ext)) {
    return extractJsTsImports(content, file.path);
  }
  if (language === "Python" || ext === "py") return extractPythonImports(content, file.path);
  if (language === "Java" || ext === "java") return extractJavaImports(content, file.path);
  if (language === "C" || language === "C++" || ["c", "h", "cc", "cpp", "hpp"].includes(ext)) {
    return extractCIncludes(content, file.path);
  }
  return [];
}

export { SOURCE_EXTS };
