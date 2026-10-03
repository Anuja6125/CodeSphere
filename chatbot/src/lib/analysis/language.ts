const EXTENSION_LANGUAGE: Record<string, string> = {
  ts: "TypeScript",
  tsx: "TypeScript",
  js: "JavaScript",
  jsx: "JavaScript",
  mjs: "JavaScript",
  cjs: "JavaScript",
  py: "Python",
  java: "Java",
  c: "C",
  h: "C",
  cc: "C++",
  cpp: "C++",
  cxx: "C++",
  hpp: "C++",
  cs: "C#",
  go: "Go",
  rs: "Rust",
  php: "PHP",
  html: "HTML",
  htm: "HTML",
  css: "CSS",
  scss: "CSS",
  sass: "CSS",
  less: "CSS",
  sql: "SQL",
  prisma: "SQL",
  md: "Markdown",
  mdx: "Markdown",
  json: "JSON",
  yml: "YAML",
  yaml: "YAML",
  sh: "Shell",
  bash: "Shell",
  rb: "Ruby",
};

const FILENAME_LANGUAGE: Record<string, string> = {
  dockerfile: "Dockerfile",
  makefile: "Makefile",
  "schema.prisma": "SQL",
};

export function detectLanguage(file: { name: string; extension: string; path?: string }): string | null {
  const name = file.name.toLowerCase();
  const ext = (file.extension || "").toLowerCase();

  if (FILENAME_LANGUAGE[name]) return FILENAME_LANGUAGE[name];
  if (ext && EXTENSION_LANGUAGE[ext]) return EXTENSION_LANGUAGE[ext];
  return null;
}

export const AST_LANGUAGES = new Set(["TypeScript", "JavaScript"]);

export function usesAstParsing(language: string | null): boolean {
  return language !== null && AST_LANGUAGES.has(language);
}
