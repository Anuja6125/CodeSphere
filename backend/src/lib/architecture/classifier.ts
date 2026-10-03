import { ArchitectureGroup } from "./types";

export function classifyArchitectureGroup(filePath: string, category?: string | null): ArchitectureGroup {
  const p = filePath.replace(/\\/g, "/").toLowerCase();
  const segments = p.split("/").filter(Boolean);
  const fileName = segments[segments.length - 1] || "";
  const ext = fileName.includes(".") ? fileName.split(".").pop()! : "";

  // 1. Tests
  if (
    category === "TEST" ||
    /\.(test|spec)\.[a-z0-9]+$/i.test(fileName) ||
    segments.some((s) => ["__tests__", "tests", "test", "spec", "specs", "e2e"].includes(s))
  ) {
    return "tests";
  }

  // 2. Documentation
  if (
    category === "DOCUMENTATION" ||
    ["md", "mdx", "rst", "txt", "adoc"].includes(ext) ||
    segments.some((s) => ["docs", "doc", "documentation"].includes(s))
  ) {
    return "documentation";
  }

  // 3. Database
  if (
    category === "DATABASE" ||
    ext === "sql" ||
    ext === "prisma" ||
    fileName === "schema.prisma" ||
    segments.some((s) => ["prisma", "migrations", "database", "db", "models", "entities", "schema"].includes(s))
  ) {
    return "database";
  }

  // 4. API
  if (
    category === "API_SCHEMA" ||
    ext === "graphql" ||
    ext === "gql" ||
    fileName.includes("openapi") ||
    fileName.includes("swagger") ||
    /route\.(t|j)sx?$/.test(fileName) ||
    segments.some((s) => ["api", "routes", "endpoints", "controllers", "trpc", "graphql"].includes(s))
  ) {
    return "api";
  }

  // 5. Components
  if (
    segments.some((s) => ["components", "ui", "views", "widgets"].includes(s)) ||
    /^[A-Z][a-zA-Z0-9]+\.(tsx|jsx|vue|svelte)$/.test(fileName)
  ) {
    return "components";
  }

  // 6. Services & Business Logic
  if (
    segments.some((s) => ["services", "service", "providers", "modules", "core", "auth"].includes(s)) ||
    fileName.startsWith("auth.") ||
    fileName.endsWith(".service.ts") ||
    fileName.endsWith(".service.js")
  ) {
    return "services";
  }

  // 7. Scripts
  if (
    category === "SCRIPT" ||
    ["sh", "bash", "zsh", "ps1", "bat", "cmd"].includes(ext) ||
    segments.some((s) => ["scripts", "bin", "tools"].includes(s))
  ) {
    return "scripts";
  }

  // 8. Configuration & Build
  if (
    category === "CONFIG" ||
    category === "BUILD_CONFIG" ||
    category === "DEPENDENCY_MANIFEST" ||
    fileName.startsWith(".env") ||
    fileName.includes("config") ||
    ["json", "yaml", "yml", "toml", "lock"].includes(ext) && !p.includes("src/")
  ) {
    return "configuration";
  }

  // 9. Assets
  if (
    ["png", "jpg", "jpeg", "gif", "svg", "ico", "webp", "woff", "woff2", "ttf", "eot"].includes(ext) ||
    segments.some((s) => ["assets", "public", "images", "icons", "styles", "css"].includes(s))
  ) {
    return "assets";
  }

  // 10. Utilities
  if (
    segments.some((s) => ["utils", "util", "helpers", "lib", "common", "shared"].includes(s)) ||
    fileName.endsWith(".util.ts") ||
    fileName.endsWith(".util.js")
  ) {
    return "utilities";
  }

  // 11. Application
  if (
    segments.some((s) => ["app", "pages"].includes(s)) ||
    ["main.ts", "main.js", "app.tsx", "app.jsx", "index.tsx", "index.jsx", "index.ts", "index.js"].includes(fileName)
  ) {
    return "application";
  }

  // 12. Fallback
  return "other";
}

export const ARCHITECTURE_GROUP_METADATA: Record<
  ArchitectureGroup,
  { name: string; color: string; description: string }
> = {
  application: { name: "Application", color: "#6366f1", description: "Main application entries, routing, and page trees" },
  components: { name: "Components", color: "#38bdf8", description: "UI components, layout elements, and view widgets" },
  services: { name: "Services", color: "#a855f7", description: "Business logic, domain operations, and external services" },
  api: { name: "API & Routes", color: "#ec4899", description: "HTTP endpoints, routing handlers, and API schemas" },
  database: { name: "Database & Models", color: "#f59e0b", description: "Schemas, migrations, ORM entities, and database queries" },
  configuration: { name: "Configuration", color: "#64748b", description: "Project configurations, manifests, and build settings" },
  utilities: { name: "Utilities", color: "#14b8a6", description: "Helper functions, shared tools, and utility libraries" },
  tests: { name: "Tests", color: "#10b981", description: "Unit, integration, and end-to-end test suites" },
  documentation: { name: "Documentation", color: "#8b5cf6", description: "README, design guides, and documentation files" },
  assets: { name: "Assets", color: "#f43f5e", description: "Stylesheets, static assets, and visual resources" },
  scripts: { name: "Scripts", color: "#eab308", description: "Build, setup, and maintenance automation scripts" },
  other: { name: "Unknown / Other", color: "#94a3b8", description: "Unclassified repository files" },
};
