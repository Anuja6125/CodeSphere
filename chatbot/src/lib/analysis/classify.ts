import { FileCategory, FileRef } from "./types";

const SOURCE_EXTENSIONS = new Set([
  "ts", "tsx", "js", "jsx", "mjs", "cjs",
  "py", "java", "c", "cc", "cpp", "cxx", "h", "hpp",
  "cs", "go", "rs", "php", "rb", "kt", "swift", "scala",
]);

const TEST_NAME_PATTERNS = [
  /\.test\./i,
  /\.spec\./i,
  /\.tests\./i,
];

const TEST_DIR_PATTERNS = [
  /(^|\/)__tests__(\/|$)/i,
  /(^|\/)tests?(\/|$)/i,
  /(^|\/)spec(\/|$)/i,
];

const DOC_NAMES = new Set([
  "readme", "readme.md", "changelog", "changelog.md", "license", "license.md",
  "contributing", "contributing.md", "code_of_conduct.md", "security.md",
]);

const MANIFEST_NAMES = new Set([
  "package.json", "package-lock.json", "yarn.lock", "pnpm-lock.yaml",
  "bun.lock", "bun.lockb", "requirements.txt", "pipfile", "pipfile.lock",
  "pyproject.toml", "poetry.lock", "cargo.toml", "cargo.lock",
  "go.mod", "go.sum", "composer.json", "composer.lock", "gemfile", "gemfile.lock",
  "pom.xml", "build.gradle", "build.gradle.kts",
]);

const BUILD_CONFIG_NAMES = new Set([
  "tsconfig.json", "jsconfig.json", "webpack.config.js", "webpack.config.ts",
  "vite.config.js", "vite.config.ts", "next.config.js", "next.config.mjs",
  "next.config.ts", "babel.config.js", "babel.config.json", ".babelrc",
  "rollup.config.js", "esbuild.config.js", "turbo.json", "nx.json",
  "makefile", "cmakeLists.txt", "dockerfile", "docker-compose.yml",
  "docker-compose.yaml", "procfile",
]);

const CONFIG_NAMES = new Set([
  ".env.example", ".editorconfig", ".gitignore", ".gitattributes",
  ".prettierrc", ".eslintrc", ".eslintrc.json", ".eslintrc.js",
  "eslint.config.js", "eslint.config.mjs", ".npmrc", ".nvmrc",
  "tailwind.config.js", "tailwind.config.ts", "postcss.config.js",
  "postcss.config.mjs", "vitest.config.ts", "jest.config.js",
  "jest.config.ts", "pytest.ini", "setup.cfg", "tox.ini",
]);

const API_SCHEMA_NAMES = new Set([
  "openapi.yaml", "openapi.yml", "openapi.json", "swagger.yaml",
  "swagger.yml", "swagger.json", "schema.graphql", "schema.gql",
]);

const SCRIPT_EXTENSIONS = new Set(["sh", "bash", "zsh", "ps1", "bat", "cmd"]);
const MARKUP_EXTENSIONS = new Set(["html", "htm", "xml", "vue", "svelte"]);
const STYLE_EXTENSIONS = new Set(["css", "scss", "sass", "less", "styl"]);
const DB_EXTENSIONS = new Set(["sql", "prisma"]);
const DOC_EXTENSIONS = new Set(["md", "mdx", "rst", "txt", "adoc"]);

export function classifyFile(file: Pick<FileRef, "path" | "name" | "extension" | "isDirectory">): FileCategory {
  if (file.isDirectory) return "OTHER";

  const name = file.name.toLowerCase();
  const ext = (file.extension || "").toLowerCase();
  const pathLower = file.path.replace(/\\/g, "/").toLowerCase();

  if (TEST_NAME_PATTERNS.some((p) => p.test(name)) || TEST_DIR_PATTERNS.some((p) => p.test(pathLower))) {
    return "TEST";
  }

  if (MANIFEST_NAMES.has(name)) return "DEPENDENCY_MANIFEST";
  if (BUILD_CONFIG_NAMES.has(name) || name.startsWith("webpack.config") || name.startsWith("vite.config") || name.startsWith("next.config")) {
    return "BUILD_CONFIG";
  }
  if (API_SCHEMA_NAMES.has(name) || ext === "graphql" || ext === "gql" || name.endsWith(".openapi.yaml")) {
    return "API_SCHEMA";
  }
  if (name === ".env.example" || (CONFIG_NAMES.has(name) && !name.startsWith(".env.")) || name.endsWith(".config.js") || name.endsWith(".config.ts") || name.endsWith(".config.mjs")) {
    return "CONFIG";
  }
  if (DOC_NAMES.has(name) || DOC_EXTENSIONS.has(ext)) return "DOCUMENTATION";
  if (ext === "prisma" || name === "schema.prisma" || pathLower.includes("/prisma/") || pathLower.includes("/migrations/") || DB_EXTENSIONS.has(ext)) {
    return "DATABASE";
  }
  if (STYLE_EXTENSIONS.has(ext)) return "STYLESHEET";
  if (MARKUP_EXTENSIONS.has(ext)) return "MARKUP";
  if (SCRIPT_EXTENSIONS.has(ext) || pathLower.includes("/scripts/")) return "SCRIPT";
  if (SOURCE_EXTENSIONS.has(ext)) return "SOURCE_CODE";

  return "OTHER";
}
