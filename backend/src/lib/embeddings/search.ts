import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { embeddingConfig } from "./config";
import { embedTexts } from "./voyage";
import { lexicalScore, toPgVector } from "./vector";

export interface SearchResult {
  id: string;
  fileId: string;
  filePath: string;
  startLine: number;
  endLine: number;
  language: string | null;
  chunkType: string;
  symbolName: string | null;
  content: string;
  similarity: number;
  hybridScore: number;
}

type RawSearchResult = {
  id: string;
  fileId: string;
  filePath: string;
  startLine: number;
  endLine: number;
  language: string | null;
  chunkType: string;
  symbolName: string | null;
  content: string;
  similarity: number;
};

export async function lexicalChunkSearch(repositoryId: string, query: string, limit = 5): Promise<SearchResult[]> {
  const chunks = await db.codeChunk.findMany({
    where: {
      repositoryId,
      file: { isSensitive: false, isExcluded: false },
    },
    select: {
      id: true,
      fileId: true,
      startLine: true,
      endLine: true,
      language: true,
      chunkType: true,
      symbolName: true,
      content: true,
      file: { select: { path: true } },
    },
    take: 400,
  });

  if (chunks.length === 0) return [];

  return chunks
    .map((chunk) => {
      const filePath = chunk.file.path;
      const lexScore = lexicalScore(query, chunk.content, chunk.symbolName, filePath);
      return {
        id: chunk.id,
        fileId: chunk.fileId,
        filePath,
        startLine: chunk.startLine,
        endLine: chunk.endLine,
        language: chunk.language,
        chunkType: chunk.chunkType,
        symbolName: chunk.symbolName,
        content: chunk.content,
        similarity: lexScore,
        hybridScore: lexScore,
      };
    })
    .sort((a, b) => b.hybridScore - a.hybridScore)
    .slice(0, limit);
}

export async function semanticSearch(repositoryId: string, query: string, limit = 5): Promise<SearchResult[]> {
  const repository = await db.repository.findUnique({ where: { id: repositoryId }, select: { id: true } });
  if (!repository) throw Object.assign(new Error("Repository not found."), { status: 404 });

  try {
    const vectors = await embedTexts([query], "query");
    if (vectors?.[0]) {
      const queryVector = toPgVector(vectors[0]);
      const candidateLimit = Math.min(Math.max(limit * 6, 24), 100);

      const rows = await db.$queryRaw<RawSearchResult[]>(Prisma.sql`
        SELECT
          c."id",
          c."fileId",
          f."path" AS "filePath",
          c."startLine",
          c."endLine",
          c."language",
          c."chunkType",
          c."symbolName",
          c."content",
          1 - (c."embedding" <=> ${queryVector}::vector) AS similarity
        FROM "CodeChunk" c
        INNER JOIN "RepoFile" f ON f."id" = c."fileId"
        WHERE c."repositoryId" = ${repositoryId}
          AND c."embeddingStatus" = 'EMBEDDED'::"EmbeddingStatus"
          AND c."embeddingModel" = ${embeddingConfig.model}
          AND f."isSensitive" = false
          AND f."isExcluded" = false
        ORDER BY c."embedding" <=> ${queryVector}::vector
        LIMIT ${candidateLimit}
      `);

      if (rows && rows.length > 0) {
        return rows
          .map((row) => {
            const lexScore = lexicalScore(query, row.content, row.symbolName, row.filePath);
            return {
              ...row,
              similarity: Number(row.similarity),
              hybridScore: Number(row.similarity) * 0.75 + lexScore * 0.25,
            };
          })
          .sort((a, b) => b.hybridScore - a.hybridScore || b.similarity - a.similarity)
          .slice(0, limit);
      }
    }
  } catch (err: any) {
    console.warn(`[search] Vector search bypassed (${err?.message || "error"}), falling back to lexical search.`);
  }

  // Fast fallback: lexical keyword and symbol matching on chunks
  return lexicalChunkSearch(repositoryId, query, limit);
}
