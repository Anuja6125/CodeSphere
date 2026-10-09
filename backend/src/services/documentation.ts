import { GoogleGenerativeAI } from "@google/generative-ai";
import { db } from "../lib/db";
import { geminiConfig, hasGeminiApiKey } from "../lib/ai/gemini-config";
import { errorMessage, HttpError } from "./errors";

const generating = new Set<string>();
const CONTEXT_BUDGET = 60_000; // characters of code/context sent to Gemini

const take = (value: unknown, n: number) => (Array.isArray(value) ? value.slice(0, n) : value);

/** Collect real repository facts for the prompt. */
async function buildContext(repositoryId: string): Promise<string> {
  const repo = await db.repository.findUnique({
    where: { id: repositoryId },
    include: { analysis: true, graph: true },
  });
  if (!repo) throw new HttpError(404, "Repository not found.");

  const files = await db.repoFile.findMany({
    where: { repositoryId, isDirectory: false },
    select: { path: true, content: true, linesCount: true },
    orderBy: { path: "asc" },
  });

  const a = repo.analysis;
  const stats = (repo.graph?.stats ?? {}) as { entryFiles?: string[]; mostImported?: { file: string }[] };
  const sections: string[] = [];

  sections.push(
    `# Repository: ${repo.owner}/${repo.name}`,
    `Source: ${repo.url ?? "ZIP upload"}`,
    `Files: ${repo.totalFiles}, lines: ${repo.totalLines}`,
    `Tech stack: ${JSON.stringify(repo.techStack)}`
  );
  if (a) {
    sections.push(
      `Languages: ${JSON.stringify(a.languages)}`,
      `Frameworks: ${JSON.stringify(a.frameworks)}`,
      `Package managers: ${JSON.stringify(a.packageManagers)}`,
      `Important directories: ${JSON.stringify(take(a.importantDirectories, 25))}`,
      `Entry points: ${JSON.stringify(take(a.entryPoints, 20))}`,
      `Important modules: ${JSON.stringify(take(a.importantModules, 20))}`,
      `API files: ${JSON.stringify(take(a.apiFiles, 30))}`,
      `Database files: ${JSON.stringify(take(a.databaseFiles, 30))}`
    );
  }
  sections.push(`\n## File tree\n${files.slice(0, 400).map((f) => f.path).join("\n")}`);

  // Most useful files first: README, manifests, entry points, most-imported, then API/DB files.
  const wanted: string[] = [];
  const add = (p?: string) => p && !wanted.includes(p) && wanted.push(p);
  files.filter((f) => /(^|\/)readme(\.md)?$/i.test(f.path)).forEach((f) => add(f.path));
  files.filter((f) => /(^|\/)(package\.json|requirements\.txt|pyproject\.toml|pom\.xml|go\.mod|Cargo\.toml)$/.test(f.path)).forEach((f) => add(f.path));
  (stats.entryFiles ?? []).slice(0, 8).forEach(add);
  (stats.mostImported ?? []).slice(0, 8).forEach((m) => add(m.file));
  const asPaths = (v: unknown) => (Array.isArray(v) ? v.map((x) => (typeof x === "string" ? x : x?.path)).filter(Boolean) : []);
  asPaths(a?.entryPoints).slice(0, 8).forEach(add);
  asPaths(a?.apiFiles).slice(0, 8).forEach(add);
  asPaths(a?.databaseFiles).slice(0, 6).forEach(add);

  const byPath = new Map(files.map((f) => [f.path, f]));
  let used = sections.join("\n").length;
  for (const p of wanted) {
    const content = byPath.get(p)?.content;
    if (!content) continue;
    const snippet = content.slice(0, 6_000);
    if (used + snippet.length > CONTEXT_BUDGET) break;
    sections.push(`\n## File: ${p}\n\`\`\`\n${snippet}\n\`\`\``);
    used += snippet.length;
  }
  return sections.join("\n");
}

// Prompt adapted from the mindmap docs generator, scaled from one snippet to a whole repo.
const DOCS_PROMPT = `You are an expert software developer writing documentation for a repository.
Use ONLY the facts in the context below. If something is not in the context, say it is not clear from the code. Never invent endpoints, env vars, or commands.

Write clean Markdown with these sections (skip a section only if there is truly nothing to say):
# <Project name>
## Overview — what the project does, in plain words
## Tech Stack
## Getting Started — install and run commands found in manifests/README
## Project Structure — main folders and what they hold
## Architecture & Data Flow — how the main parts connect
## Key Modules — the important files and what each does
## API Endpoints — table of method, path, purpose (if any)
## Data & Storage — databases, models, schemas (if any)
## Configuration — environment variables and config files (names only, never values)
## Notes & Gaps — missing tests/docs, risks, TODOs you can see

Use short sentences. Use simple English. Use file paths in backticks.

Context:
`;

export async function generateDeterministicDocumentation(repositoryId: string): Promise<string> {
  const repo = await db.repository.findUnique({
    where: { id: repositoryId },
    include: { analysis: true, graph: true },
  });
  if (!repo) throw new HttpError(404, "Repository not found.");

  const files = await db.repoFile.findMany({
    where: { repositoryId, isDirectory: false },
    select: { path: true, name: true, extension: true, content: true, linesCount: true, category: true },
    orderBy: { path: "asc" },
  });

  const a = repo.analysis;
  const stats = (repo.graph?.stats ?? {}) as {
    entryFiles?: string[];
    mostImported?: { file: string; importedByCount: number }[];
    dependencyCount?: number;
    unresolvedCount?: number;
  };
  const whereToStart = (repo.graph?.whereToStart ?? {}) as {
    suggestions?: { file: string; role: string; reason: string }[];
    notes?: string[];
  };

  const sections: string[] = [];

  // 1. Title
  sections.push(`# ${repo.name}\n`);

  // 2. Overview
  sections.push("## Overview\n");
  const readme = files.find((f) => /(^|\/)readme(\.md)?$/i.test(f.path));
  let overviewText = "";
  if (readme?.content) {
    const cleanParagraphs = readme.content
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter((p) => p && !p.startsWith("#") && !p.startsWith("```") && !p.startsWith("[!") && !p.startsWith("!["));
    if (cleanParagraphs.length > 0) {
      overviewText = cleanParagraphs.slice(0, 3).join("\n\n");
    }
  }
  if (!overviewText) {
    const tech = (repo.techStack as any) || {};
    const langs = tech.languages?.join(", ") || "software";
    const frameworks = tech.frameworks?.length ? ` using ${tech.frameworks.join(", ")}` : "";
    overviewText = `**${repo.name}** is a ${langs} project${frameworks}, comprising **${repo.totalFiles} files** and approximately **${repo.totalLines?.toLocaleString() || 0} lines of code**.`;
  }
  sections.push(overviewText + "\n");

  // 3. Tech Stack
  sections.push("## Tech Stack\n");
  const tech = (repo.techStack as any) || {};
  sections.push("| Category | Detected Technologies |");
  sections.push("| :--- | :--- |");
  sections.push(`| **Languages** | ${tech.languages?.join(", ") || (a?.languages as string[])?.join(", ") || "None specified"} |`);
  sections.push(`| **Frameworks** | ${tech.frameworks?.join(", ") || (a?.frameworks as string[])?.join(", ") || "None detected"} |`);
  sections.push(`| **Package Managers** | ${tech.packageManagers?.join(", ") || (a?.packageManagers as string[])?.join(", ") || "None"} |`);
  sections.push(`| **Databases** | ${tech.databases?.join(", ") || "None detected"} |`);
  sections.push(`| **Build Tools / CI** | ${tech.buildTools?.join(", ") || "None"} ${tech.hasCI ? "(CI Configured)" : ""} ${tech.hasDocker ? "(Docker Configured)" : ""} |`);
  sections.push("");

  // 4. Getting Started
  sections.push("## Getting Started\n");
  const pkgJson = files.find((f) => f.name === "package.json");
  if (pkgJson?.content) {
    try {
      const parsed = JSON.parse(pkgJson.content);
      if (parsed.scripts && Object.keys(parsed.scripts).length > 0) {
        sections.push("### Available Scripts\n");
        sections.push("Run these commands from the project directory:\n");
        sections.push("```bash");
        sections.push("# Install dependencies");
        sections.push("npm install\n");
        for (const [scriptName, scriptCmd] of Object.entries(parsed.scripts)) {
          sections.push(`npm run ${scriptName}   # ${scriptCmd}`);
        }
        sections.push("```\n");
      }
    } catch {
      // ignore JSON parse error
    }
  } else {
    sections.push("Refer to the project manifests or repository instructions for setup and running procedures.\n");
  }

  // 5. Project Structure
  sections.push("## Project Structure\n");
  const topDirs = new Map<string, number>();
  for (const f of files) {
    const parts = f.path.split("/");
    if (parts.length > 1) {
      const top = parts[0];
      topDirs.set(top, (topDirs.get(top) || 0) + 1);
    }
  }
  if (topDirs.size > 0) {
    sections.push("Main directories and file counts:\n");
    sections.push("| Directory | Files | Primary Role |");
    sections.push("| :--- | :--- | :--- |");
    for (const [dir, count] of topDirs.entries()) {
      let role = "General source code";
      if (/src|source/i.test(dir)) role = "Application source code";
      else if (/test|spec|__tests__/i.test(dir)) role = "Test suites";
      else if (/public|static|assets/i.test(dir)) role = "Static assets & client resources";
      else if (/server|backend|api/i.test(dir)) role = "Backend server & API logic";
      else if (/client|frontend|ui/i.test(dir)) role = "Client-side frontend user interface";
      else if (/docs|documentation/i.test(dir)) role = "Documentation & guides";
      else if (/config|scripts/i.test(dir)) role = "Build scripts & configuration";
      else if (/models|schemas/i.test(dir)) role = "Data models & database schemas";
      else if (/controllers|routes/i.test(dir)) role = "API controllers & route handlers";
      sections.push(`| \`${dir}/\` | ${count} | ${role} |`);
    }
    sections.push("");
  }

  // 6. Architecture & Data Flow
  sections.push("## Architecture & Data Flow\n");
  sections.push(`The dependency graph maps **${stats.dependencyCount || 0} inter-file dependencies** across the codebase.`);
  if (stats.entryFiles && stats.entryFiles.length > 0) {
    sections.push(`\n**Primary Entry Points**: ${stats.entryFiles.slice(0, 6).map((e) => `\`${e}\``).join(", ")}`);
  }
  if (stats.mostImported && stats.mostImported.length > 0) {
    sections.push(`\n**Central Dependency Hubs** (most imported modules):\n`);
    for (const m of stats.mostImported.slice(0, 5)) {
      sections.push(`- \`${m.file}\` (imported by ${m.importedByCount} files)`);
    }
  }
  sections.push("");

  // 7. Key Modules
  sections.push("## Key Modules\n");
  if (whereToStart.suggestions && whereToStart.suggestions.length > 0) {
    sections.push("| File | Role | Architectural Significance |");
    sections.push("| :--- | :--- | :--- |");
    for (const s of whereToStart.suggestions.slice(0, 8)) {
      sections.push(`| \`${s.file}\` | ${s.role.toUpperCase()} | ${s.reason} |`);
    }
    sections.push("");
  } else {
    sections.push("Key modules include the primary entry points and central dependency files listed above.\n");
  }

  // 8. API Endpoints
  const asPaths = (v: unknown) => (Array.isArray(v) ? v.map((x) => (typeof x === "string" ? x : x?.path)).filter(Boolean) : []);
  const apiFiles = asPaths(a?.apiFiles);
  if (apiFiles.length > 0) {
    sections.push("## API Endpoints & Routes\n");
    sections.push("Detected API and route handler modules:\n");
    for (const f of apiFiles.slice(0, 10)) {
      sections.push(`- \`${f}\``);
    }
    sections.push("");
  }

  // 9. Data & Storage
  const dbFiles = asPaths(a?.databaseFiles);
  if (dbFiles.length > 0) {
    sections.push("## Data & Storage\n");
    sections.push("Database connections, models, or schema definitions:\n");
    for (const f of dbFiles.slice(0, 8)) {
      sections.push(`- \`${f}\``);
    }
    sections.push("");
  }

  // 10. Configuration
  sections.push("## Configuration\n");
  const configFiles = files.filter((f) =>
    /(^|\/)(\.env\.example|\.env|tsconfig\.json|package\.json|vite\.config|next\.config|docker-compose|dockerfile)/i.test(f.path)
  );
  if (configFiles.length > 0) {
    sections.push("Detected project configuration files:\n");
    for (const c of configFiles.slice(0, 8)) {
      sections.push(`- \`${c.path}\``);
    }
    sections.push("");
  }

  // 11. Notes & Gaps
  sections.push("## Notes & Code Insights\n");
  sections.push(`- **Total Analyzed Files**: ${repo.totalFiles}`);
  sections.push(`- **Total Code Lines**: ${repo.totalLines?.toLocaleString() || 0}`);
  if (a?.testFileCount !== undefined) {
    sections.push(`- **Test Files Detected**: ${a.testFileCount}`);
  }
  if (stats.unresolvedCount && stats.unresolvedCount > 0) {
    sections.push(`- **Unresolved Import Specifiers**: ${stats.unresolvedCount} (external packages or aliased imports)`);
  }
  sections.push("\n---\n> *Documentation compiled by CodeSphere Intelligence Engine.*");

  return sections.join("\n");
}

async function generate(repositoryId: string): Promise<void> {
  try {
    const apiKey = (await import("../lib/ai/gemini-config")).getCleanGeminiApiKey();
    if (apiKey) {
      try {
        const context = await buildContext(repositoryId);
        const genAI = new GoogleGenerativeAI(apiKey);
        const { geminiConfig, FALLBACK_MODELS } = await import("../lib/ai/gemini-config");
        const modelsToTry = Array.from(new Set([geminiConfig.model, ...FALLBACK_MODELS]));
        let generatedContent: string | null = null;
        let usedModel: string = geminiConfig.model;

        for (const m of modelsToTry) {
          try {
            const model = genAI.getGenerativeModel({
              model: m,
              generationConfig: { temperature: 0.2, maxOutputTokens: 8192 },
            });
            const result = await model.generateContent(DOCS_PROMPT + context);
            const text = result.response.text().trim();
            if (text) {
              generatedContent = text;
              usedModel = m;
              break;
            }
          } catch (err: any) {
            const msg = err.message || "";
            if (msg.includes("401") || msg.includes("403") || msg.includes("API_KEY_INVALID") || msg.includes("denied access")) {
              break;
            }
            if (msg.includes("404") || msg.includes("is not found") || msg.includes("no longer available")) {
              continue;
            }
            break;
          }
        }

        if (generatedContent) {
          await db.documentation.update({
            where: { repositoryId },
            data: { status: "READY", content: generatedContent, model: usedModel, error: null },
          });

          const { logActivity } = await import("./activity");
          void logActivity({
            repositoryId,
            activityType: "DOCS_GENERATED",
            title: "Documentation generated",
            description: `Generated documentation with model: ${usedModel}`,
            metadata: { model: usedModel, length: generatedContent.length },
          });
          return;
        }
      } catch (err) {
        console.warn(`[docs] Cloud LLM generation failed for ${repositoryId}, falling back to deterministic generator:`, errorMessage(err));
      }
    }

    // Deterministic fallback
    const content = await generateDeterministicDocumentation(repositoryId);
    await db.documentation.update({
      where: { repositoryId },
      data: { status: "READY", content, model: "CodeSphere Intelligence Engine", error: null },
    });

    const { logActivity } = await import("./activity");
    void logActivity({
      repositoryId,
      activityType: "DOCS_GENERATED",
      title: "Documentation generated",
      description: "Generated comprehensive deterministic repository documentation",
      metadata: { model: "CodeSphere Intelligence Engine", length: content.length },
    });
  } catch (error) {
    console.error(`[docs] ${repositoryId} documentation generation failed:`, error);
    await db.documentation
      .update({ where: { repositoryId }, data: { status: "FAILED", error: errorMessage(error) } })
      .catch(() => undefined);
  } finally {
    generating.delete(repositoryId);
  }
}

/** Start generation in the background. Returns right away. */
export async function startDocumentation(repositoryId: string) {
  const repo = await db.repository.findUnique({ where: { id: repositoryId }, select: { status: true, analysis: { select: { id: true } } } });
  if (!repo) throw new HttpError(404, "Repository not found.");
  // Docs need the analysis step only. They do not wait for embeddings.
  if (!repo.analysis || ["PENDING", "CLONING", "PARSING", "ANALYZING"].includes(repo.status)) {
    throw new HttpError(409, "Wait until the repository analysis finishes.");
  }
  if (generating.has(repositoryId)) throw new HttpError(409, "Documentation is already being generated.");

  generating.add(repositoryId);

  const { logActivity } = await import("./activity");
  void logActivity({
    repositoryId,
    activityType: "DOCS_GENERATION_STARTED",
    title: "Documentation generation initiated",
    description: "System documentation pipeline started",
  });

  const doc = await db.documentation.upsert({
    where: { repositoryId },
    create: { repositoryId, status: "GENERATING" },
    update: { status: "GENERATING", error: null },
  });
  void generate(repositoryId);
  return doc;
}

/** Docs left "GENERATING" by a restart can never finish. Mark them failed on boot. */
export async function recoverInterruptedDocs(): Promise<void> {
  await db.documentation.updateMany({
    where: { status: { in: ["PENDING", "GENERATING"] } },
    data: { status: "FAILED", error: "Generation was interrupted by a server restart. Try again." },
  });
}
