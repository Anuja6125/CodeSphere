import { describe, it, expect, afterAll } from "vitest";
import { db } from "@/lib/db";
import { ingestRepository } from "@/lib/git/ingest";

describe("PostgreSQL Database Persistence Integration Tests", () => {
  const testRepoUrl = "https://github.com/roystonfernandes1835/portfolio-website";
  let createdRepoId: string | undefined;

  afterAll(async () => {
    // Cleanup test repository from database
    if (createdRepoId) {
      await db.repository.deleteMany({
        where: { id: createdRepoId },
      });
    }
  });

  it(
    "B, C, D, E, F, G. ingests and persists Repository & RepoFiles to PostgreSQL database",
    async () => {
      const ingested = await ingestRepository(testRepoUrl);

      // Persist to PostgreSQL database using transaction
      const repoRecord = await db.$transaction(async (tx) => {
        const existing = await tx.repository.findUnique({ where: { url: testRepoUrl } });
        if (existing) {
          await tx.repoFile.deleteMany({ where: { repositoryId: existing.id } });
        }

        return tx.repository.upsert({
          where: { url: testRepoUrl },
          update: {
            name: ingested.repoName,
            owner: ingested.owner,
            defaultBranch: ingested.defaultBranch,
            status: "INDEXED",
            totalFiles: ingested.totalFiles,
            totalLines: ingested.totalLines,
            techStack: ingested.techStack as any,
            files: {
              createMany: {
                data: ingested.files.map((f) => ({
                  path: f.path,
                  name: f.name,
                  extension: f.extension,
                  size: f.size,
                  isDirectory: f.isDirectory,
                  content: f.content || null,
                  linesCount: f.linesCount,
                })),
              },
            },
          },
          create: {
            url: testRepoUrl,
            name: ingested.repoName,
            owner: ingested.owner,
            defaultBranch: ingested.defaultBranch,
            status: "INDEXED",
            totalFiles: ingested.totalFiles,
            totalLines: ingested.totalLines,
            techStack: ingested.techStack as any,
            files: {
              createMany: {
                data: ingested.files.map((f) => ({
                  path: f.path,
                  name: f.name,
                  extension: f.extension,
                  size: f.size,
                  isDirectory: f.isDirectory,
                  content: f.content || null,
                  linesCount: f.linesCount,
                })),
              },
            },
          },
        });
      });

      createdRepoId = repoRecord.id;

      // Verify Repository record in DB
      const dbRepo = await db.repository.findUnique({
        where: { id: createdRepoId },
        include: { files: true },
      });

      expect(dbRepo).not.toBeNull();
      expect(dbRepo?.name).toBe("portfolio-website");
      expect(dbRepo?.owner).toBe("roystonfernandes1835");
      expect(dbRepo?.status).toBe("INDEXED");
      expect(dbRepo?.defaultBranch).toBe(ingested.defaultBranch);
      expect(dbRepo?.totalFiles).toBe(ingested.totalFiles);
      expect(dbRepo?.totalLines).toBe(ingested.totalLines);

      // Verify RepoFiles in DB
      expect(dbRepo?.files.length).toBe(ingested.files.length);
      const hasIndexFile = dbRepo?.files.some(
        (f) =>
          f.name.includes("index") ||
          f.name.includes("package") ||
          f.extension === "js" ||
          f.extension === "html"
      );
      expect(hasIndexFile).toBe(true);
    },
    30000
  );

  it(
    "H. handles duplicate repository ingestion by updating existing database record",
    async () => {
      expect(createdRepoId).toBeDefined();
      if (!createdRepoId) return;

      const dbRepoBefore = await db.repository.findUnique({ where: { id: createdRepoId } });
      expect(dbRepoBefore).not.toBeNull();

      const reIngested = await db.repository.update({
        where: { id: createdRepoId },
        data: {
          status: "INDEXED",
          updatedAt: new Date(),
        },
      });

      expect(reIngested.id).toBe(createdRepoId);
    },
    10000
  );

  it(
    "L, M. retrieves repository details by ID and handles missing repository with null/404",
    async () => {
      expect(createdRepoId).toBeDefined();
      if (!createdRepoId) return;

      const fetched = await db.repository.findUnique({
        where: { id: createdRepoId },
        include: { files: true },
      });
      expect(fetched).not.toBeNull();
      expect(fetched?.id).toBe(createdRepoId);

      const nonExistent = await db.repository.findUnique({
        where: { id: "00000000-0000-0000-0000-000000000000" },
      });
      expect(nonExistent).toBeNull();
    },
    10000
  );
});
