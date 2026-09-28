import { PrismaClient, Prisma } from "@prisma/client";
import { embeddingConfig } from "../lib/embeddings/config";
import { lexicalScore } from "../lib/embeddings/vector";

const db = new PrismaClient();

async function main() {
  const repo = await db.repository.findFirst({
    where: { owner: "roystonfernandes1835", name: "portfolio-website" }
  });
  if (!repo) return console.log("Repo not found");

  const queryVectorStr = `[${Array.from({ length: 1024 }, () => Math.random() - 0.5).join(",")}]`;
  const limit = 8;
  const candidateLimit = 48;

  const rows = await db.$queryRaw<any[]>(Prisma.sql`
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
      1 - (c."embedding" <=> ${queryVectorStr}::vector) AS similarity
    FROM "CodeChunk" c
    INNER JOIN "RepoFile" f ON f."id" = c."fileId"
    WHERE c."repositoryId" = ${repo.id}
      AND c."embeddingStatus" = 'EMBEDDED'::"EmbeddingStatus"
      AND c."embeddingModel" = ${embeddingConfig.model}
      AND f."isSensitive" = false
      AND f."isExcluded" = false
    ORDER BY c."embedding" <=> ${queryVectorStr}::vector
    LIMIT ${candidateLimit}
  `);

  console.log("Returned rows:", rows.length);
  if (rows.length > 0) {
    console.log("First row similarity (raw):", rows[0].similarity);
    console.log("Type of similarity:", typeof rows[0].similarity);
    const parsedSim = Number(rows[0].similarity);
    console.log("Parsed similarity:", parsedSim);
  }
}

main().finally(() => db.$disconnect());
