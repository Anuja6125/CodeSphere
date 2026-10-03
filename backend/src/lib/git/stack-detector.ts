export interface TechStackInfo {
  languages: string[];
  frameworks: string[];
  databases: string[];
  buildTools: string[];
  packageManagers: string[];
  hasDocker: boolean;
  hasCI: boolean;
}

export function detectTechStack(filePaths: string[]): TechStackInfo {
  const languages = new Set<string>();
  const frameworks = new Set<string>();
  const databases = new Set<string>();
  const buildTools = new Set<string>();
  const packageManagers = new Set<string>();
  let hasDocker = false;
  let hasCI = false;

  for (const path of filePaths) {
    const lower = path.toLowerCase();
    const fileName = lower.split("/").pop() || "";

    // Languages by extension
    if (lower.endsWith(".ts") || lower.endsWith(".tsx")) languages.add("TypeScript");
    if (lower.endsWith(".js") || lower.endsWith(".jsx")) languages.add("JavaScript");
    if (lower.endsWith(".py")) languages.add("Python");
    if (lower.endsWith(".go")) languages.add("Go");
    if (lower.endsWith(".rs")) languages.add("Rust");
    if (lower.endsWith(".java")) languages.add("Java");
    if (lower.endsWith(".cpp") || lower.endsWith(".c") || lower.endsWith(".h")) languages.add("C/C++");
    if (lower.endsWith(".rb")) languages.add("Ruby");
    if (lower.endsWith(".php")) languages.add("PHP");

    // Frameworks & Libraries
    if (fileName === "next.config.js" || fileName === "next.config.mjs" || fileName === "next.config.ts") frameworks.add("Next.js");
    if (lower.includes("react")) frameworks.add("React");
    if (lower.includes("vue") || fileName === "vite.config.ts" || fileName === "vite.config.js") frameworks.add("Vite / Vue");
    if (fileName === "angular.json") frameworks.add("Angular");
    if (fileName === "django" || fileName === "manage.py") frameworks.add("Django");
    if (fileName.includes("flask")) frameworks.add("Flask");
    if (fileName.includes("fastapi")) frameworks.add("FastAPI");
    if (fileName === "cargo.toml") buildTools.add("Cargo");

    // Package Managers
    if (fileName === "package-lock.json") packageManagers.add("npm");
    if (fileName === "yarn.lock") packageManagers.add("yarn");
    if (fileName === "pnpm-lock.yaml") packageManagers.add("pnpm");
    if (fileName === "bun.lockb" || fileName === "bun.lock") packageManagers.add("bun");
    if (fileName === "requirements.txt" || fileName === "pipfile" || fileName === "pyproject.toml") packageManagers.add("pip / poetry");

    // Infra & CI
    if (fileName === "dockerfile" || fileName.startsWith("docker-compose")) hasDocker = true;
    if (lower.includes(".github/workflows")) hasCI = true;

    // Databases
    if (lower.includes("prisma") || fileName === "schema.prisma") {
      databases.add("Prisma");
    }
    if (lower.includes("postgres") || lower.includes("pg")) databases.add("PostgreSQL");
    if (lower.includes("mongo")) databases.add("MongoDB");
    if (lower.includes("redis")) databases.add("Redis");
  }

  return {
    languages: Array.from(languages),
    frameworks: Array.from(frameworks),
    databases: Array.from(databases),
    buildTools: Array.from(buildTools),
    packageManagers: Array.from(packageManagers),
    hasDocker,
    hasCI,
  };
}
