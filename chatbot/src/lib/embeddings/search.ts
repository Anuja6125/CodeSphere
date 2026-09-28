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

export async function semanticSearch(repositoryId: string, query: string, limit = 5): Promise<SearchResult[]> {
  const repository = await db.repository.findUnique({ where: { id: repositoryId }, select: { id: true } });
  if (!repository) throw Object.assign(new Error("Repository not found."), { status: 404 });

  const queryVector = toPgVector((await embedTexts([query], "query"))[0]);
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
