import fs from "fs";
import path from "path";
import type { Request, Response } from "express";
import { idParam } from "../http/params";
import { db } from "../lib/db";
import { HttpError } from "../services/errors";
import { canonicalGithubUrl, parseGithub } from "../services/ingestion";
import { isRunning, runPipeline, PipelineSource } from "../services/pipeline";

const SUMMARY_SELECT = {
  id: true, name: true, owner: true, url: true, sourceType: true, defaultBranch: true,
  status: true, errorMessage: true, totalFiles: true, totalLines: true, techStack: true,
  createdAt: true, updatedAt: true,
} as const;

function removeUpload(file?: Express.Multer.File) {
  if (file) fs.rmSync(path.dirname(file.path), { recursive: true, force: true });
}

/** POST /api/repositories — multipart "project" (.zip) or JSON { url }. Returns 202 + the repo. */
export async function createRepository(req: Request, res: Response) {
  const file = req.file;
  try {
    let repositoryId: string;
    let source: PipelineSource;

    if (file) {
      const name = path.basename(file.originalname, path.extname(file.originalname)).slice(0, 120) || "project";
      const repo = await db.repository.create({ data: { name, owner: "local", sourceType: "ZIP", status: "PENDING" } });
      repositoryId = repo.id;
      source = { type: "zip", zipPath: file.path };
    } else {
      const url = req.body?.url;
      if (!url || typeof url !== "string") throw new HttpError(400, "Upload a .zip file (field \"project\") or send a GitHub { url }.");
      const ref = parseGithub(url);
      const canonical = canonicalGithubUrl(ref);

      // Same GitHub repo again: re-analyze the existing record. Keeps one ID per repo.
      const existing = await db.repository.findUnique({ where: { url: canonical } });
      if (existing && isRunning(existing.id)) throw new HttpError(409, "This repository is already being analyzed.");
      const repo = existing
        ? await db.repository.update({ where: { id: existing.id }, data: { status: "PENDING", errorMessage: null, defaultBranch: ref.ref || "main" } })
        : await db.repository.create({
            data: { name: ref.repo, owner: ref.owner, url: canonical, sourceType: "GITHUB", defaultBranch: ref.ref || "main", status: "PENDING" },
          });
      repositoryId = repo.id;
      source = { type: "github", ref };
    }

    // Respond now. The work continues in the background.
    void runPipeline(repositoryId, source).finally(() => removeUpload(file));
    const repository = await db.repository.findUnique({ where: { id: repositoryId }, select: SUMMARY_SELECT });
    res.status(202).json({ repository });
  } catch (error) {
    removeUpload(file);
    throw error;
  }
}

export async function listRepositories(_req: Request, res: Response) {
  const repositories = await db.repository.findMany({ orderBy: { updatedAt: "desc" }, select: SUMMARY_SELECT });
  res.json({ repositories });
}

/** GET /api/repositories/:id — summary, analysis, and per-feature status. */
export async function getRepository(req: Request, res: Response) {
  const repository = await db.repository.findUnique({
    where: { id: idParam(req) },
    select: {
      ...SUMMARY_SELECT,
      analysis: true,
      graph: { select: { generatedAt: true, stats: true, whereToStart: true } },
      documentation: { select: { status: true, updatedAt: true, error: true } },
      _count: { select: { chats: true, chunks: true } },
    },
  });
  if (!repository) throw new HttpError(404, "Repository not found.");

  const embedded = await db.codeChunk.count({ where: { repositoryId: repository.id, embeddingStatus: "EMBEDDED" } });
  res.json({ repository: { ...repository, embeddedChunks: embedded, isProcessing: isRunning(repository.id) } });
}

export async function reanalyzeRepository(req: Request, res: Response) {
  const repo = await db.repository.findUnique({ where: { id: idParam(req) } });
  if (!repo) throw new HttpError(404, "Repository not found.");
  if (isRunning(repo.id)) throw new HttpError(409, "This repository is already being analyzed.");

  const source: PipelineSource = repo.sourceType === "GITHUB" && repo.url
    ? { type: "github", ref: { ...parseGithub(repo.url), ref: repo.defaultBranch === "main" ? null : repo.defaultBranch } }
    : { type: "database" };

  await db.repository.update({ where: { id: repo.id }, data: { status: "PENDING", errorMessage: null } });
  void runPipeline(repo.id, source);
  const repository = await db.repository.findUnique({ where: { id: repo.id }, select: SUMMARY_SELECT });
  res.status(202).json({ repository });
}

export async function deleteRepository(req: Request, res: Response) {
  if (isRunning(idParam(req))) throw new HttpError(409, "Wait for the analysis to finish before deleting.");
  await db.repository.delete({ where: { id: idParam(req) } }); // cascades to everything else
  res.status(204).end();
}
