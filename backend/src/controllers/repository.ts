import fs from "fs";
import path from "path";
import type { Request, Response } from "express";
import { idParam } from "../http/params";
import { db } from "../lib/db";
import { HttpError } from "../services/errors";
import { canonicalGithubUrl, parseGithub, cleanupWorkDir } from "../services/ingestion";
import { isRunning, runPipeline, PipelineSource } from "../services/pipeline";
import { AuthenticatedRequest } from "../middleware/auth";
import { ProjectRole } from "@prisma/client";
import { logActivity } from "../services/activity";

const SUMMARY_SELECT = {
  id: true, name: true, owner: true, url: true, sourceType: true, defaultBranch: true,
  status: true, errorMessage: true, totalFiles: true, totalLines: true, techStack: true,
  ownerId: true,
  createdAt: true, updatedAt: true,
} as const;

function formatRepo(repo: any) {
  if (!repo) return repo;
  const ownerId = repo.ownerId ?? repo.userId ?? null;
  return {
    ...repo,
    ownerId,
    userId: ownerId, // backward compatibility
    user: repo.ownerUser ?? repo.user ?? null,
  };
}

function removeUpload(file?: Express.Multer.File) {
  if (file) fs.rmSync(path.dirname(file.path), { recursive: true, force: true });
}

/** POST /api/repositories — multipart "project" (.zip) or JSON { url }. Returns 202 + the repo. */
export async function createRepository(req: Request, res: Response) {
  const file = req.file;
  const userId = (req as AuthenticatedRequest).user?.sub;

  try {
    let repositoryId: string;
    let source: PipelineSource;

    if (file) {
      const name = path.basename(file.originalname, path.extname(file.originalname)).slice(0, 120) || "project";
      const repo = await db.repository.create({
        data: {
          name,
          owner: "local",
          sourceType: "ZIP",
          status: "PENDING",
          ownerId: userId || null,
        },
      });
      repositoryId = repo.id;
      source = { type: "zip", zipPath: file.path };

      void logActivity({
        repositoryId,
        userId: userId || null,
        activityType: "PROJECT_CREATED",
        title: "Project created from ZIP upload",
        description: `Uploaded archive: ${file.originalname} (${Math.round(file.size / 1024)} KB)`,
        metadata: { filename: file.originalname, size: file.size, sourceType: "ZIP" },
      });
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
            data: {
              name: ref.repo,
              owner: ref.owner,
              url: canonical,
              sourceType: "GITHUB",
              defaultBranch: ref.ref || "main",
              status: "PENDING",
              ownerId: userId || null,
            },
          });
      repositoryId = repo.id;
      source = { type: "github", ref };

      void logActivity({
        repositoryId,
        userId: userId || null,
        activityType: existing ? "REPO_REANALYZED" : "PROJECT_CREATED",
        title: existing ? "Repository re-analysis requested" : "Project imported from GitHub",
        description: `GitHub repository: ${canonical} (branch: ${ref.ref || "main"})`,
        metadata: { url: canonical, branch: ref.ref || "main", sourceType: "GITHUB" },
      });
    }

    // Respond now. The work continues in the background.
    void runPipeline(repositoryId, source).finally(() => removeUpload(file));
    const repository = await db.repository.findUnique({ where: { id: repositoryId }, select: SUMMARY_SELECT });
    res.status(202).json({ repository: formatRepo(repository) });
  } catch (error) {
    removeUpload(file);
    throw error;
  }
}

/**
 * GET /api/repositories — lists repositories accessible to the user:
 * 1. Projects created by this user (owner).
 * 2. Projects explicitly shared with this user via ProjectAccess.
 * 3. Legacy unowned demo repositories (for compatibility).
 */
export async function listRepositories(req: Request, res: Response) {
  const userId = (req as AuthenticatedRequest).user?.sub;

  const whereClause: any = userId
    ? {
        OR: [
          { ownerId: userId },
          { access: { some: { userId } } },
          { ownerId: null },
        ],
      }
    : {};

  const repositories = await db.repository.findMany({
    where: whereClause,
    orderBy: { updatedAt: "desc" },
    select: {
      ...SUMMARY_SELECT,
      ownerUser: { select: { id: true, email: true, role: true } },
      access: {
        select: {
          id: true,
          userId: true,
          role: true,
          user: { select: { email: true } },
        },
      },
    },
  });

  res.json({ repositories: repositories.map(formatRepo) });
}

/** GET /api/repositories/:id — summary, analysis, and per-feature status. */
export async function getRepository(req: Request, res: Response) {
  const repository = await db.repository.findUnique({
    where: { id: idParam(req) },
    select: {
      ...SUMMARY_SELECT,
      ownerUser: { select: { id: true, email: true } },
      access: {
        select: {
          id: true,
          userId: true,
          role: true,
          user: { select: { email: true } },
        },
      },
      analysis: true,
      graph: { select: { generatedAt: true, stats: true, whereToStart: true } },
      documentation: { select: { status: true, updatedAt: true, error: true } },
      _count: { select: { chats: true, chunks: true, activities: true } },
    },
  });
  if (!repository) throw new HttpError(404, "Repository not found.");

  const embedded = await db.codeChunk.count({ where: { repositoryId: repository.id, embeddingStatus: "EMBEDDED" } });
  res.json({ repository: { ...formatRepo(repository), embeddedChunks: embedded, isProcessing: isRunning(repository.id) } });
}

export async function reanalyzeRepository(req: Request, res: Response) {
  const repo = await db.repository.findUnique({ where: { id: idParam(req) } });
  if (!repo) throw new HttpError(404, "Repository not found.");
  if (isRunning(repo.id)) throw new HttpError(409, "This repository is already being analyzed.");

  const userId = (req as AuthenticatedRequest).user?.sub;
  void logActivity({
    repositoryId: repo.id,
    userId: userId || null,
    activityType: "REPO_REANALYZED",
    title: "Repository re-analysis initiated",
    description: "Manual re-analysis triggered by user",
  });

  const source: PipelineSource = repo.sourceType === "GITHUB" && repo.url
    ? { type: "github", ref: { ...parseGithub(repo.url), ref: repo.defaultBranch === "main" ? null : repo.defaultBranch } }
    : { type: "database" };

  await db.repository.update({ where: { id: repo.id }, data: { status: "PENDING", errorMessage: null } });
  void runPipeline(repo.id, source);
  const repository = await db.repository.findUnique({ where: { id: repo.id }, select: SUMMARY_SELECT });
  res.status(202).json({ repository: formatRepo(repository) });
}

export async function deleteRepository(req: Request, res: Response) {
  const repositoryId = idParam(req);
  if (isRunning(repositoryId)) throw new HttpError(409, "Wait for the analysis to finish before deleting.");

  // Clean up any extracted files on disk to prevent orphaned files
  cleanupWorkDir(repositoryId);

  // Cascade delete in PostgreSQL
  await db.repository.delete({ where: { id: repositoryId } });
  res.status(204).end();
}

/**
 * GET /api/repositories/:id/access
 * List team members with access to this project.
 */
export async function listProjectAccess(req: Request, res: Response) {
  const repositoryId = idParam(req);
  const repo = await db.repository.findUnique({
    where: { id: repositoryId },
    select: {
      ownerId: true,
      ownerUser: { select: { id: true, email: true } },
      access: {
        select: {
          id: true,
          userId: true,
          role: true,
          createdAt: true,
          user: { select: { email: true, role: true } },
        },
      },
    },
  });

  if (!repo) throw new HttpError(404, "Repository not found.");

  res.json({
    owner: repo.ownerUser,
    access: repo.access,
  });
}

/**
 * POST /api/repositories/:id/access
 * Share project with another user by email.
 */
export async function addProjectAccess(req: Request, res: Response) {
  const repositoryId = idParam(req);
  const { email, role = "VIEWER" } = req.body || {};

  if (!email || typeof email !== "string") {
    throw new HttpError(400, "User email is required.");
  }

  const targetUser = await db.user.findUnique({
    where: { email: email.trim().toLowerCase() },
  });

  if (!targetUser) {
    throw new HttpError(404, `User with email '${email}' not found. They must sign in to CodeSphere first.`);
  }

  const repo = await db.repository.findUnique({
    where: { id: repositoryId },
  });

  if (!repo) throw new HttpError(404, "Repository not found.");

  if (repo.ownerId === targetUser.id) {
    throw new HttpError(400, "This user is already the owner of this repository.");
  }

  const validRoles: ProjectRole[] = ["VIEWER", "EDITOR", "MANAGER"];
  const projectRole: ProjectRole = validRoles.includes(role) ? role : "VIEWER";

  const accessRecord = await db.projectAccess.upsert({
    where: {
      repositoryId_userId: {
        repositoryId,
        userId: targetUser.id,
      },
    },
    update: { role: projectRole },
    create: {
      repositoryId,
      userId: targetUser.id,
      role: projectRole,
    },
    include: {
      user: { select: { email: true, role: true } },
    },
  });

  void logActivity({
    repositoryId,
    userId: (req as AuthenticatedRequest).user?.sub || null,
    activityType: "PROJECT_SHARED",
    title: `Project shared with ${targetUser.email}`,
    description: `Granted ${projectRole} role`,
    metadata: { targetUserId: targetUser.id, targetEmail: targetUser.email, role: projectRole },
  });

  res.status(200).json({
    success: true,
    message: `Project shared with ${targetUser.email} as ${projectRole}.`,
    access: accessRecord,
  });
}

/**
 * DELETE /api/repositories/:id/access/:userId
 * Revoke project access from a user.
 */
export async function removeProjectAccess(req: Request, res: Response) {
  const repositoryId = idParam(req);
  const targetUserId = req.params.userId as string;

  if (!targetUserId) throw new HttpError(400, "Target userId is required.");

  await db.projectAccess.deleteMany({
    where: {
      repositoryId,
      userId: targetUserId,
    },
  });

  void logActivity({
    repositoryId,
    userId: (req as AuthenticatedRequest).user?.sub || null,
    activityType: "ACCESS_REVOKED",
    title: "Project access revoked",
    description: `Revoked access from user ID ${targetUserId}`,
    metadata: { targetUserId },
  });

  res.status(200).json({ success: true, message: "Project access revoked." });
}

/**
 * GET /api/repositories/:id/history
 * Unified project history and activity log:
 * - Creator & timestamps
 * - Source & upload references
 * - Graph and analysis status
 * - Documentation status
 * - Scoped chat message metrics
 * - Activity event timeline
 */
export async function getProjectHistory(req: Request, res: Response) {
  const repositoryId = idParam(req);
  const userId = (req as AuthenticatedRequest).user?.sub;

  const repo = await db.repository.findUnique({
    where: { id: repositoryId },
    select: {
      id: true,
      name: true,
      owner: true,
      url: true,
      sourceType: true,
      defaultBranch: true,
      status: true,
      errorMessage: true,
      totalFiles: true,
      totalLines: true,
      techStack: true,
      ownerId: true,
      createdAt: true,
      updatedAt: true,
      ownerUser: { select: { id: true, email: true, role: true } },
      graph: {
        select: {
          generatedAt: true,
          stats: true,
        },
      },
      documentation: {
        select: {
          status: true,
          model: true,
          updatedAt: true,
          error: true,
        },
      },
      analysis: {
        select: {
          processedAt: true,
          languages: true,
          frameworks: true,
        },
      },
      activities: {
        orderBy: { createdAt: "desc" },
        take: 100,
        select: {
          id: true,
          activityType: true,
          title: true,
          description: true,
          metadata: true,
          createdAt: true,
          user: {
            select: { id: true, email: true, role: true },
          },
        },
      },
    },
  });

  if (!repo) throw new HttpError(404, "Repository not found.");

  // Scoped user chat count
  const chatCount = await db.chatMessage.count({
    where: {
      repositoryId,
      ...(userId ? { OR: [{ userId }, { userId: null }] } : {}),
    },
  });

  res.json({
    project: formatRepo(repo),
    history: {
      activities: repo.activities,
      graph: repo.graph,
      documentation: repo.documentation,
      analysis: repo.analysis,
      chatCount,
    },
  });
}
