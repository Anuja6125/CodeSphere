import { describe, it, expect } from "vitest";
import { classifyFile } from "@/lib/analysis/classify";
import { shouldExcludeFile, DEFAULT_EXCLUSION_CONFIG } from "@/lib/analysis/exclude";
import { detectLanguage, usesAstParsing } from "@/lib/analysis/language";
import { chunkFile, chunkJsTs, fallbackChunk, chunkMarkdown } from "@/lib/analysis/chunk";
import { extractDependencies, extractJsTsImports, extractPythonImports, extractJavaImports, extractCIncludes, resolveSpecifier } from "@/lib/analysis/dependencies";
import { detectEntryPoints } from "@/lib/analysis/entrypoints";
import { analyzeArchitecture } from "@/lib/analysis/architecture";
import { isSensitiveFileName, containsSecretLikeContent } from "@/lib/analysis/sensitive";

describe("A. File classification", () => {
  it("classifies source, tests, docs, manifests, and configs", () => {
    expect(classifyFile({ path: "src/app.ts", name: "app.ts", extension: "ts", isDirectory: false })).toBe("SOURCE_CODE");
    expect(classifyFile({ path: "src/app.test.ts", name: "app.test.ts", extension: "ts", isDirectory: false })).toBe("TEST");
    expect(classifyFile({ path: "__tests__/foo.js", name: "foo.js", extension: "js", isDirectory: false })).toBe("TEST");
    expect(classifyFile({ path: "README.md", name: "README.md", extension: "md", isDirectory: false })).toBe("DOCUMENTATION");
    expect(classifyFile({ path: "package.json", name: "package.json", extension: "json", isDirectory: false })).toBe("DEPENDENCY_MANIFEST");
    expect(classifyFile({ path: "tsconfig.json", name: "tsconfig.json", extension: "json", isDirectory: false })).toBe("BUILD_CONFIG");
    expect(classifyFile({ path: ".env.example", name: ".env.example", extension: "example", isDirectory: false })).toBe("CONFIG");
    expect(classifyFile({ path: "styles.css", name: "styles.css", extension: "css", isDirectory: false })).toBe("STYLESHEET");
    expect(classifyFile({ path: "index.html", name: "index.html", extension: "html", isDirectory: false })).toBe("MARKUP");
    expect(classifyFile({ path: "schema.prisma", name: "schema.prisma", extension: "prisma", isDirectory: false })).toBe("DATABASE");
    expect(classifyFile({ path: "openapi.yaml", name: "openapi.yaml", extension: "yaml", isDirectory: false })).toBe("API_SCHEMA");
    expect(classifyFile({ path: "scripts/setup.sh", name: "setup.sh", extension: "sh", isDirectory: false })).toBe("SCRIPT");
  });
});

describe("B. File exclusion", () => {
  it("excludes node_modules, binaries, generated, and oversized files", () => {
    expect(shouldExcludeFile({ path: "node_modules/foo/index.js", name: "index.js", extension: "js", size: 10, isDirectory: false }).excluded).toBe(true);
    expect(shouldExcludeFile({ path: "logo.png", name: "logo.png", extension: "png", size: 10, isDirectory: false }).isBinary).toBe(true);
    expect(shouldExcludeFile({ path: "dist/app.js", name: "app.js", extension: "js", size: 10, isDirectory: false }).excluded).toBe(true);
    expect(shouldExcludeFile({ path: "src/app.min.js", name: "app.min.js", extension: "js", size: 10, isDirectory: false }).excluded).toBe(true);
    expect(shouldExcludeFile({ path: "src/huge.ts", name: "huge.ts", extension: "ts", size: DEFAULT_EXCLUSION_CONFIG.maxFileSizeBytes + 1, isDirectory: false }).excluded).toBe(true);
    expect(shouldExcludeFile({ path: "README.md", name: "README.md", extension: "md", size: 100, isDirectory: false }).excluded).toBe(false);
    expect(shouldExcludeFile({ path: "package.json", name: "package.json", extension: "json", size: 100, isDirectory: false }).excluded).toBe(false);
  });
});

describe("C. Language detection", () => {
  it("detects supported languages", () => {
    expect(detectLanguage({ name: "a.ts", extension: "ts" })).toBe("TypeScript");
    expect(detectLanguage({ name: "a.js", extension: "js" })).toBe("JavaScript");
    expect(detectLanguage({ name: "a.py", extension: "py" })).toBe("Python");
    expect(detectLanguage({ name: "A.java", extension: "java" })).toBe("Java");
    expect(detectLanguage({ name: "a.c", extension: "c" })).toBe("C");
    expect(detectLanguage({ name: "a.cpp", extension: "cpp" })).toBe("C++");
    expect(detectLanguage({ name: "a.cs", extension: "cs" })).toBe("C#");
    expect(detectLanguage({ name: "a.go", extension: "go" })).toBe("Go");
    expect(detectLanguage({ name: "a.rs", extension: "rs" })).toBe("Rust");
    expect(detectLanguage({ name: "a.php", extension: "php" })).toBe("PHP");
    expect(detectLanguage({ name: "a.html", extension: "html" })).toBe("HTML");
    expect(detectLanguage({ name: "a.css", extension: "css" })).toBe("CSS");
    expect(detectLanguage({ name: "a.sql", extension: "sql" })).toBe("SQL");
    expect(detectLanguage({ name: "unknown.xyz", extension: "xyz" })).toBeNull();
    expect(usesAstParsing("TypeScript")).toBe(true);
    expect(usesAstParsing("Python")).toBe(false);
  });
});

describe("D/E/F. Chunking", () => {
  it("extracts JS/TS functions, classes, and exports", () => {
    const src = `
import React from "react";
export function greet(name: string) {
  return "hi " + name;
}
export class User {
  name: string;
  constructor(name: string) { this.name = name; }
}
export interface Person { name: string }
export type Id = string;
const helper = () => 1;
export default function App() { return null; }
`;
    const chunks = chunkJsTs(src, "TypeScript");
    const names = chunks.map((c) => c.symbolName).filter(Boolean);
    expect(names).toContain("greet");
    expect(names).toContain("User");
    expect(names).toContain("Person");
    expect(names).toContain("Id");
    expect(names).toContain("App");
    expect(chunks.some((c) => c.isExported && c.symbolName === "greet")).toBe(true);
    expect(chunks.every((c) => c.startLine >= 1 && c.endLine >= c.startLine)).toBe(true);
  });

  it("falls back for unsupported languages and malformed JS", () => {
    const py = "def foo():\n  return 1\n" + "x = 1\n".repeat(100);
    const fallback = fallbackChunk(py, "Python");
    expect(fallback.length).toBeGreaterThan(1);
    expect(fallback[0].chunkType).toBe("fallback");

    const malformed = "function oops( { this is not valid";
    const chunks = chunkFile(malformed, "JavaScript");
    expect(chunks.length).toBeGreaterThan(0);

    const md = "# Title\nHello\n\n## Next\nWorld";
    const sections = chunkMarkdown(md, "Markdown");
    expect(sections.length).toBeGreaterThanOrEqual(2);
  });

  it("handles empty content without crashing", () => {
    expect(chunkFile("", "TypeScript")).toEqual([]);
    expect(chunkFile("   ", "Python")).toEqual([]);
  });
});

describe("G. Import/dependency extraction", () => {
  it("extracts JS/TS, Python, Java, and C includes", () => {
    const js = `import { a } from "./lib/a";\nconst b = require("./b");\nexport { c } from "../c";`;
    const jsDeps = extractJsTsImports(js, "src/index.ts");
    expect(jsDeps.map((d) => d.toSpecifier)).toEqual(expect.arrayContaining(["./lib/a", "./b", "../c"]));

    const py = "from utils.helpers import x\nimport os\n";
    expect(extractPythonImports(py, "app.py").map((d) => d.toSpecifier)).toEqual(expect.arrayContaining(["utils.helpers", "os"]));

    const java = "import java.util.List;\nimport com.app.Service;\n";
    expect(extractJavaImports(java, "Main.java").map((d) => d.toSpecifier)).toContain("com.app.Service");

    const c = '#include "foo.h"\n#include <stdio.h>\n';
    expect(extractCIncludes(c, "main.c").map((d) => d.toSpecifier)).toEqual(expect.arrayContaining(["foo.h", "stdio.h"]));

    const resolved = resolveSpecifier("src/index.ts", "./lib/a", ["src/lib/a.ts", "src/b.js"]);
    expect(resolved).toBe("src/lib/a.ts");
  });
});

describe("H. Entry-point detection", () => {
  it("detects Next.js, Node, Python, and Java entry points with confidence", () => {
    const files = [
      { path: "package.json", name: "package.json", extension: "json", isDirectory: false, content: JSON.stringify({ main: "server.js", scripts: { start: "node server.js" } }) },
      { path: "server.js", name: "server.js", extension: "js", isDirectory: false, content: "" },
      { path: "app/page.tsx", name: "page.tsx", extension: "tsx", isDirectory: false, content: "" },
      { path: "main.py", name: "main.py", extension: "py", isDirectory: false, content: "" },
      { path: "App.java", name: "App.java", extension: "java", isDirectory: false, content: "public class App { public static void main(String[] args) {} }" },
    ];
    const eps = detectEntryPoints(files, { frameworks: ["Next.js"] });
    const paths = eps.map((e) => e.path);
    expect(paths).toEqual(expect.arrayContaining(["server.js", "app/page.tsx", "main.py", "App.java"]));
    expect(eps.every((e) => e.confidence > 0 && e.confidence <= 1)).toBe(true);
  });
});

describe("I. Architecture analysis", () => {
  it("counts categories and identifies directories without an LLM", () => {
    const files = [
      { path: "src/index.ts", name: "index.ts", extension: "ts", isDirectory: false, content: "export const x = 1;", size: 10, linesCount: 1 },
      { path: "src/index.test.ts", name: "index.test.ts", extension: "ts", isDirectory: false, content: "", size: 10, linesCount: 1 },
      { path: "README.md", name: "README.md", extension: "md", isDirectory: false, content: "# Hi", size: 10, linesCount: 1 },
      { path: "tsconfig.json", name: "tsconfig.json", extension: "json", isDirectory: false, content: "{}", size: 2, linesCount: 1 },
      { path: "prisma/schema.prisma", name: "schema.prisma", extension: "prisma", isDirectory: false, content: "", size: 1, linesCount: 1 },
      { path: "src", name: "src", extension: "", isDirectory: true, content: null, size: 0, linesCount: 0 },
    ];
    const analysis = analyzeArchitecture(files);
    expect(analysis.sourceFileCount).toBe(1);
    expect(analysis.testFileCount).toBe(1);
    expect(analysis.documentationFileCount).toBe(1);
    expect(analysis.configFileCount).toBeGreaterThanOrEqual(1);
    expect(analysis.languages).toContain("TypeScript");
    expect(analysis.importantDirectories).toContain("src");
    expect(analysis.databaseFiles.length).toBeGreaterThan(0);
  });

  it("handles empty repository and missing README/tests", () => {
    const empty = analyzeArchitecture([]);
    expect(empty.sourceFileCount).toBe(0);
    expect(empty.entryPoints).toEqual([]);

    const noDocs = analyzeArchitecture([
      { path: "main.go", name: "main.go", extension: "go", isDirectory: false, content: "package main", size: 12, linesCount: 1 },
    ]);
    expect(noDocs.documentationFileCount).toBe(0);
    expect(noDocs.testFileCount).toBe(0);
    expect(noDocs.languages).toContain("Go");
  });
});

describe("L. Sensitive-file handling", () => {
  it("detects secrets by name and content", () => {
    expect(isSensitiveFileName(".env")).toBe(true);
    expect(isSensitiveFileName(".env.local")).toBe(true);
    expect(isSensitiveFileName(".env.example")).toBe(false);
    expect(containsSecretLikeContent("const key = 'sk-abcdefghijklmnopqrstuvwxyz'")).toBe(true);
    expect(containsSecretLikeContent("export const greeting = 'hello'")).toBe(false);
  });
});

describe("Edge cases", () => {
  it("handles duplicate filenames, nested apps, and large files via exclusion", () => {
    expect(classifyFile({ path: "apps/web/index.ts", name: "index.ts", extension: "ts", isDirectory: false })).toBe("SOURCE_CODE");
    expect(classifyFile({ path: "apps/api/index.ts", name: "index.ts", extension: "ts", isDirectory: false })).toBe("SOURCE_CODE");
    const deps = extractDependencies(
      { path: "apps/web/index.ts", extension: "ts", content: 'import { api } from "../api/index";' },
      "TypeScript"
    );
    expect(deps[0].toSpecifier).toBe("../api/index");
    const large = shouldExcludeFile({ path: "blob.bin", name: "blob.bin", extension: "bin", size: 50, isDirectory: false });
    expect(large.excluded).toBe(true);
  });
});
