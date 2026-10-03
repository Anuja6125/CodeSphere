import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { classifyFile } from "./classify";
import { shouldExcludeFile } from "./exclude";
import { detectLanguage } from "./language";
import { chunkFile } from "./chunk";
import { extractDependencies, resolveSpecifier } from "./dependencies";
import { analyzeArchitecture } from "./architecture";
import { shouldRedactFile } from "./sensitive";
import { GeneratedChunk } from "./types";

export interface Phase2Result {
  repositoryId: string;
  status: string;
  chunkCount: number;
  dependencyCount: number;
  analysis: {
    languages: string[];
    frameworks: string[];
    packageManagers: string[];
    sourceFileCount: number;
    testFileCount: number;
    documentationFileCount: number;
    configFileCount: number;
    entryPoints: unknown;
    importantDirectories: string[];
  };
}

export async function processRepositoryPhase2(repositoryId: string): Promise<Phase2Result> {
  const repository = await db.repository.findUnique({
    where: { id: repositoryId },
    include: { files: true },
  });

  if (!repository) {
    throw Object.assign(new Error("Repository not found."), { status: 404 });
  }

  await db.repository.update({
    where: { id: repositoryId },
    data: { status: "ANALYZING" },
  });

  try {
    const files = repository.files;
    const pathToId = new Map(files.map((f) => [f.path.replace(/\\/g, "/"), f.id]));
    const allPaths = files.map((f) => f.path.replace(/\\/g, "/"));

    const fileUpdates: Array<{
      id: string;
      language: string | null;
      category: Prisma.RepoFileUpdateInput["category"];
      isSensitive: boolean;
      isExcluded: boolean;
      isBinary: boolean;
    }> = [];

    const chunksByFile: Array<{ fileId: string; chunks: GeneratedChunk[] }> = [];
    const depRows: Array<{
      fromFileId: string;
      toSpecifier: string;
      toFileId: string | null;
      kind: string;
    }> = [];

    let loopCount = 0;
    for (const file of files) {
      loopCount++;
      if (loopCount % 50 === 0) {
        await new Promise((resolve) => setTimeout(resolve, 0)); // yield to event loop
      }

      if (file.isDirectory) {
        fileUpdates.push({
          id: file.id,
          language: null,
          category: "OTHER",
          isSensitive: false,
          isExcluded: false,
          isBinary: false,
        });
        continue;
      }

      const exclusion = shouldExcludeFile(file);
      const sensitive = shouldRedactFile({ name: file.name, content: file.content });
      const language = detectLanguage(file);
      const category = classifyFile(file);

      fileUpdates.push({
        id: file.id,
        language,
        category,
        isSensitive: sensitive,
        isExcluded: exclusion.excluded || sensitive,
        isBinary: exclusion.isBinary,
      });

      if (exclusion.excluded || sensitive || !file.content) continue;

      const chunks = chunkFile(file.content, language, category);
      chunksByFile.push({ fileId: file.id, chunks });

      const deps = extractDependencies(file, language);
      for (const dep of deps) {
        const resolved = resolveSpecifier(file.path, dep.toSpecifier, allPaths);
        depRows.push({
          fromFileId: file.id,
          toSpecifier: dep.toSpecifier,
          toFileId: resolved ? pathToId.get(resolved) || null : null,
          kind: dep.kind,
        });
      }
    }

    const architecture = analyzeArchitecture(files);
    const totalChunks = chunksByFile.reduce((sum, f) => sum + f.chunks.length, 0);

    await db.$transaction(async (tx) => {
      const groupedUpdates = new Map<string, { ids: string[]; data: any }>();
      for (const update of fileUpdates) {
        const key = JSON.stringify({
          language: update.language,
          category: update.category,
          isSensitive: update.isSensitive,
          isExcluded: update.isExcluded,
          isBinary: update.isBinary,
        });
        if (!groupedUpdates.has(key)) {
          groupedUpdates.set(key, {
            ids: [],
            data: {
              language: update.language,
              category: update.category,
              isSensitive: update.isSensitive,
              isExcluded: update.isExcluded,
              isBinary: update.isBinary,
            },
          });
        }
        groupedUpdates.get(key)!.ids.push(update.id);
      }

      for (const group of groupedUpdates.values()) {
        // Chunk the updateMany in case there are too many IDs for the IN clause
        const ID_BATCH = 1000;
        for (let i = 0; i < group.ids.length; i += ID_BATCH) {
          await tx.repoFile.updateMany({
            where: { id: { in: group.ids.slice(i, i + ID_BATCH) } },
            data: group.data,
          });
        }
      }


      await tx.fileDependency.deleteMany({ where: { repositoryId } });

      const chunkData = chunksByFile.flatMap(({ fileId, chunks }) =>
        chunks.map((chunk) => ({
          repositoryId,
          fileId,
          chunkIndex: chunk.chunkIndex,
          startLine: chunk.startLine,
          endLine: chunk.endLine,
          content: chunk.content,
          language: chunk.language,
          chunkType: chunk.chunkType,
          symbolName: chunk.symbolName,
          isExported: chunk.isExported,
          parentSymbol: chunk.parentSymbol,
        }))
      );

      await tx.codeChunk.deleteMany({ where: { repositoryId } });
      if (chunkData.length > 0) {
        const CHUNK_BATCH = 1000;
        for (let i = 0; i < chunkData.length; i += CHUNK_BATCH) {
          await tx.codeChunk.createMany({
            data: chunkData.slice(i, i + CHUNK_BATCH),
          });
        }
      }

      if (depRows.length > 0) {
        const BATCH = 200;
        for (let i = 0; i < depRows.length; i += BATCH) {
          await tx.fileDependency.createMany({
            data: depRows.slice(i, i + BATCH).map((d) => ({
              repositoryId,
              fromFileId: d.fromFileId,
              toSpecifier: d.toSpecifier,
              toFileId: d.toFileId,
              kind: d.kind,
            })),
          });
        }
      }

      await tx.repositoryAnalysis.upsert({
        where: { repositoryId },
        update: {
          languages: architecture.languages as Prisma.InputJsonValue,
          frameworks: architecture.frameworks as Prisma.InputJsonValue,
          packageManagers: architecture.packageManagers as Prisma.InputJsonValue,
          importantDirectories: architecture.importantDirectories as Prisma.InputJsonValue,
          sourceFileCount: architecture.sourceFileCount,
          testFileCount: architecture.testFileCount,
          documentationFileCount: architecture.documentationFileCount,
          configFileCount: architecture.configFileCount,
          entryPoints: architecture.entryPoints as unknown as Prisma.InputJsonValue,
          importantModules: architecture.importantModules as Prisma.InputJsonValue,
          databaseFiles: architecture.databaseFiles as Prisma.InputJsonValue,
          apiFiles: architecture.apiFiles as Prisma.InputJsonValue,
          fileStats: architecture.fileStats as Prisma.InputJsonValue,
          chunkCount: totalChunks,
          dependencyCount: depRows.length,
          processedAt: new Date(),
        },
        create: {
          repositoryId,
          languages: architecture.languages as Prisma.InputJsonValue,
          frameworks: architecture.frameworks as Prisma.InputJsonValue,
          packageManagers: architecture.packageManagers as Prisma.InputJsonValue,
          importantDirectories: architecture.importantDirectories as Prisma.InputJsonValue,
          sourceFileCount: architecture.sourceFileCount,
          testFileCount: architecture.testFileCount,
          documentationFileCount: architecture.documentationFileCount,
          configFileCount: architecture.configFileCount,
          entryPoints: architecture.entryPoints as unknown as Prisma.InputJsonValue,
          importantModules: architecture.importantModules as Prisma.InputJsonValue,
          databaseFiles: architecture.databaseFiles as Prisma.InputJsonValue,
          apiFiles: architecture.apiFiles as Prisma.InputJsonValue,
          fileStats: architecture.fileStats as Prisma.InputJsonValue,
          chunkCount: totalChunks,
          dependencyCount: depRows.length,
        },
      });

      await tx.repository.update({
        where: { id: repositoryId },
        // Analysis completion does not imply embeddings are available.
        data: { status: "INDEXED" },
      });
    },
    {
      maxWait: 20000,
      timeout: 600000, // 10 minutes
    });

    return {
      repositoryId,
      status: "INDEXED",
      chunkCount: totalChunks,
      dependencyCount: depRows.length,
      analysis: {
        languages: architecture.languages,
        frameworks: architecture.frameworks,
        packageManagers: architecture.packageManagers,
        sourceFileCount: architecture.sourceFileCount,
        testFileCount: architecture.testFileCount,
        documentationFileCount: architecture.documentationFileCount,
        configFileCount: architecture.configFileCount,
        entryPoints: architecture.entryPoints,
        importantDirectories: architecture.importantDirectories,
      },
    };
  } catch (err) {
    await db.repository.update({
      where: { id: repositoryId },
      data: { status: "FAILED" },
    }).catch(() => undefined);
    throw err;
  }
}
