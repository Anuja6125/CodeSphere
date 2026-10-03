import { ArchitectureAnalysis, FileRef } from "./types";
import { classifyFile } from "./classify";
import { detectLanguage } from "./language";
import { detectEntryPoints } from "./entrypoints";
import { detectTechStack } from "@/lib/git/stack-detector";

const IMPORTANT_DIR_NAMES = new Set([
  "src", "app", "pages", "api", "lib", "components", "server", "backend",
  "frontend", "prisma", "db", "database", "tests", "test", "__tests__",
  "docs", "scripts", "packages", "apps",
]);

export function analyzeArchitecture(
  files: Array<Pick<FileRef, "path" | "name" | "extension" | "isDirectory" | "content" | "size" | "linesCount">>
): ArchitectureAnalysis {
  const fileStats: Record<string, number> = {};
  const languages = new Set<string>();
  const importantDirectories = new Set<string>();
  const importantModules: string[] = [];
  const databaseFiles: string[] = [];
  const apiFiles: string[] = [];

  let sourceFileCount = 0;
  let testFileCount = 0;
  let documentationFileCount = 0;
  let configFileCount = 0;

  const nonDirs = files.filter((f) => !f.isDirectory);
  const stack = detectTechStack(files.map((f) => f.path));

  for (const file of nonDirs) {
    const category = classifyFile(file);
    fileStats[category] = (fileStats[category] || 0) + 1;

    const language = detectLanguage(file);
    if (language) languages.add(language);

    if (category === "SOURCE_CODE") sourceFileCount++;
    if (category === "TEST") testFileCount++;
    if (category === "DOCUMENTATION") documentationFileCount++;
    if (category === "CONFIG" || category === "BUILD_CONFIG") configFileCount++;

    const top = file.path.replace(/\\/g, "/").split("/")[0];
    if (IMPORTANT_DIR_NAMES.has(top.toLowerCase())) importantDirectories.add(top);

    const pathLower = file.path.replace(/\\/g, "/").toLowerCase();
    if (category === "DATABASE" || pathLower.includes("/prisma/") || file.extension === "sql") {
      databaseFiles.push(file.path);
    }
    if (
      category === "API_SCHEMA" ||
      /(^|\/)(api|routes|controllers|endpoints)\//i.test(pathLower) ||
      /route\.(t|j)sx?$/.test(pathLower)
    ) {
      apiFiles.push(file.path);
    }

    if (
      /^(src\/)?(lib|utils|core|services|models)\//i.test(pathLower) ||
      file.name === "index.ts" ||
      file.name === "index.js"
    ) {
      importantModules.push(file.path);
    }
  }

  const entryPoints = detectEntryPoints(files, { frameworks: stack.frameworks });

  return {
    languages: Array.from(languages).sort(),
    frameworks: stack.frameworks,
    packageManagers: stack.packageManagers,
    importantDirectories: Array.from(importantDirectories).sort(),
    sourceFileCount,
    testFileCount,
    documentationFileCount,
    configFileCount,
    entryPoints,
    importantModules: importantModules.slice(0, 40),
    databaseFiles,
    apiFiles,
    fileStats,
  };
}
