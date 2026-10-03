import { Prisma, RepoStatus } from "@prisma/client";
import { db } from "../lib/db";
import { scanRepositoryDirectory } from "../lib/git/ingest";
import { processRepositoryPhase2 } from "../lib/analysis/pipeline";
import { embedRepositoryChunks } from "../lib/embeddings/service";
import { buildRepositoryGraph } from "./graph";
import { cleanupWorkDir, materializeSource, GithubRef } from "./ingestion";
import { errorMessage } from "./errors";

export type PipelineSource =
  | { type: "zip"; zipPath: string }
  | { type: "github"; ref: GithubRef }
  | { type: "database" };

// Repos being processed right now (one server process).
const running = new Set<string>();

export function isRunning(repositoryId: string): boolean {
  return running.has(repositoryId);
}

const IN_PROGRESS: RepoStatus[] = ["PENDING", "CLONING", "PARSING", "ANALYZING", "INDEXING"];

/** On boot, nothing is running. Any repo stuck "in progress" was cut off by a restart. */
export async function recoverInterruptedRuns(): Promise<number> {
  const result = await db.repository.updateMany({
    where: { status: { in: IN_PROGRESS } },
    data: { status: "FAILED", errorMessage: "Analysis was interrupted by a server restart. Click Re-analyze." },
  });
  return result.count;
}

async function setStatus(repositoryId: string, status: RepoStatus) {
  await db.repository.update({ where: { id: repositoryId }, data: { status } });
}

/** Save scanned files. Replaces old files (and, by cascade, old chunks and deps). */
async function saveFiles(repositoryId: string, projectRoot: string) {
  const scan = await scanRepositoryDirectory(projectRoot);
  if (scan.totalFiles === 0) throw new Error("No readable files were found in this project.");

  await db.$transaction(
    async (tx) => {
      await tx.repoFile.deleteMany({ where: { repositoryId } });
      const BATCH_SIZE = 500;
      for (let i = 0; i < scan.files.length; i += BATCH_SIZE) {
        await tx.repoFile.createMany({
          data: scan.files.slice(i, i + BATCH_SIZE).map((f) => ({
            repositoryId,
            path: f.path,
            name: f.name,
            extension: f.extension,
            size: f.size,
            isDirectory: f.isDirectory,
            content: f.content ? f.content.replace(/\0/g, "") : null,
            linesCount: f.linesCount,
          })),
        });
      }
      await tx.repository.update({
        where: { id: repositoryId },
        data: {
          totalFiles: scan.totalFiles,
          totalLines: scan.totalLines,
          techStack: scan.techStack as unknown as Prisma.InputJsonValue,
        },
      });
    },
    { maxWait: 10_000, timeout: 120_000 }
  );
}

async function saveGraph(repositoryId: string, projectRoot: string) {
  const graph = buildRepositoryGraph(projectRoot);
  const data = {
    nodes: graph.nodes as unknown as Prisma.InputJsonValue,
    edges: graph.edges as unknown as Prisma.InputJsonValue,
    stats: graph.stats as Prisma.InputJsonValue,
    unresolved: graph.unresolved as unknown as Prisma.InputJsonValue,
    whereToStart: graph.whereToStart as unknown as Prisma.InputJsonValue,
    generatedAt: new Date(),
  };
  await db.repositoryGraph.upsert({ where: { repositoryId }, create: { repositoryId, ...data }, update: data });
}

/**
 * Full analysis: files → graph → chunks/deps → embeddings.
 * Runs in the background. Progress is visible through Repository.status.
 */
export async function runPipeline(repositoryId: string, source: PipelineSource): Promise<void> {
  if (running.has(repositoryId)) return;
  running.add(repositoryId);

  let warning: string | null = null;
  try {
    await db.repository.update({ where: { id: repositoryId }, data: { status: "CLONING", errorMessage: null } });
    const projectRoot = await materializeSource(repositoryId, source);

    await setStatus(repositoryId, "PARSING");
    await saveFiles(repositoryId, projectRoot);

    await setStatus(repositoryId, "ANALYZING");
    await saveGraph(repositoryId, projectRoot);
    await processRepositoryPhase2(repositoryId); // chunks, file deps, analysis summary

    // Embeddings power semantic search in chat. If they fail, the rest still works.
    try {
      const result = await embedRepositoryChunks(repositoryId);
      if (result.failed > 0) warning = result.message;
    } catch (error) {
      warning = `Embeddings failed: ${errorMessage(error)}. Chat will answer from metadata only. Re-analyze to retry.`;
    }

    await db.repository.update({ where: { id: repositoryId }, data: { status: "ANALYZED", errorMessage: warning } });
  } catch (error) {
    console.error(`[pipeline] ${repositoryId} failed:`, error);
    await db.repository
      .update({ where: { id: repositoryId }, data: { status: "FAILED", errorMessage: errorMessage(error) } })
      .catch(() => undefined); // the repo may have been deleted meanwhile
  } finally {
    running.delete(repositoryId);
    cleanupWorkDir(repositoryId);
  }
}
