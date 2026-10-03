import { describe, it, expect, afterAll } from "vitest";
import { db } from "@/lib/db";
import { processRepositoryPhase2 } from "@/lib/analysis/pipeline";

describe("Phase 2 PostgreSQL persistence", () => {
  const marker = `phase2-test-${Date.now()}`;
  let repoId: string | undefined;

  afterAll(async () => {
    if (repoId) {
      await db.repository.deleteMany({ where: { id: repoId } });
    }
  });

  it(
    "J/K/N. persists chunks, analysis, and replaces chunks on re-index",
    async () => {
      const repo = await db.repository.create({
        data: {
          url: `https://github.com/example/${marker}`,
          name: marker,
          owner: "example",
          defaultBranch: "main",
          status: "INDEXED",
          totalFiles: 3,
          totalLines: 20,
          files: {
            create: [
              {
                path: "src/index.ts",
                name: "index.ts",
                extension: "ts",
                size: 120,
                isDirectory: false,
                linesCount: 8,
                content: `import { helper } from "./helper";\nexport function main() {\n  return helper();\n}\n`,
              },
              {
                path: "src/helper.ts",
                name: "helper.ts",
                extension: "ts",
                size: 80,
                isDirectory: false,
                linesCount: 4,
                content: `export function helper() {\n  return 42;\n}\n`,
              },
              {
                path: "README.md",
                name: "README.md",
                extension: "md",
                size: 40,
                isDirectory: false,
                linesCount: 3,
                content: "# Demo\n\nHello world\n",
              },
              {
                path: ".env",
                name: ".env",
                extension: "",
                size: 20,
                isDirectory: false,
                linesCount: 1,
                content: "SECRET=supersecretvalue123",
              },
            ],
          },
        },
      });
      repoId = repo.id;

      const first = await processRepositoryPhase2(repo.id);
      expect(first.status).toBe("INDEXED");
      expect(first.chunkCount).toBeGreaterThan(0);

      const chunks = await db.codeChunk.findMany({ where: { repositoryId: repo.id } });
      expect(chunks.length).toBe(first.chunkCount);

      const analysis = await db.repositoryAnalysis.findUnique({ where: { repositoryId: repo.id } });
      expect(analysis).not.toBeNull();
      expect(analysis?.sourceFileCount).toBeGreaterThan(0);

      const deps = await db.fileDependency.findMany({ where: { repositoryId: repo.id } });
      expect(deps.length).toBeGreaterThan(0);

      const envFile = await db.repoFile.findFirst({
        where: { repositoryId: repo.id, name: ".env" },
      });
      expect(envFile?.isSensitive).toBe(true);
      expect(envFile?.isExcluded).toBe(true);
      const envChunks = await db.codeChunk.count({ where: { fileId: envFile!.id } });
      expect(envChunks).toBe(0);

      const second = await processRepositoryPhase2(repo.id);
      const chunksAfter = await db.codeChunk.findMany({ where: { repositoryId: repo.id } });
      expect(chunksAfter.length).toBe(second.chunkCount);
      expect(await db.repositoryAnalysis.count({ where: { repositoryId: repo.id } })).toBe(1);
    },
    30000
  );

  it("M. missing repository analysis returns not found at data layer", async () => {
    const missing = await db.repository.findUnique({
      where: { id: "00000000-0000-0000-0000-000000000000" },
    });
    expect(missing).toBeNull();
  });
});
