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

async function generate(repositoryId: string): Promise<void> {
  try {
    const context = await buildContext(repositoryId);
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
    const model = genAI.getGenerativeModel({
      model: geminiConfig.model,
      generationConfig: { temperature: 0.2, maxOutputTokens: 8192 },
    });
    const result = await model.generateContent(DOCS_PROMPT + context);
    const content = result.response.text().trim();
    if (!content) throw new Error("Gemini returned an empty document.");

    await db.documentation.update({
      where: { repositoryId },
      data: { status: "READY", content, model: geminiConfig.model, error: null },
    });
  } catch (error) {
    console.error(`[docs] ${repositoryId} failed:`, error);
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
  if (!hasGeminiApiKey()) throw new HttpError(503, "GEMINI_API_KEY is not configured on the server.");
  if (generating.has(repositoryId)) throw new HttpError(409, "Documentation is already being generated.");

  generating.add(repositoryId);
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
