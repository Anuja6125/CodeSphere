import { PrismaClient, Prisma } from "@prisma/client";
import { embeddingConfig } from "../src/lib/embeddings/config";

const db = new PrismaClient();

async function main() {
  const repo = await db.repository.findFirst({
    where: { owner: "roystonfernandes1835", name: "portfolio-website" }
  });
  if (!repo) return console.log("Repo not found");

  const repoId = repo.id;

  const res = await db.$queryRaw`
    SELECT COUNT(*) as count FROM "CodeChunk" c
    INNER JOIN "RepoFile" f ON f."id" = c."fileId"
    WHERE c."repositoryId" = ${repoId}
  `;
  console.log("Total chunks:", res);

  const res2 = await db.$queryRaw`
    SELECT COUNT(*) as count FROM "CodeChunk" c
    INNER JOIN "RepoFile" f ON f."id" = c."fileId"
    WHERE c."repositoryId" = ${repoId}
      AND c."embeddingStatus" = 'EMBEDDED'::"EmbeddingStatus"
  `;
  console.log("EMBEDDED chunks:", res2);

  const res3 = await db.$queryRaw`
    SELECT COUNT(*) as count FROM "CodeChunk" c
    INNER JOIN "RepoFile" f ON f."id" = c."fileId"
    WHERE c."repositoryId" = ${repoId}
      AND c."embeddingStatus" = 'EMBEDDED'::"EmbeddingStatus"
      AND c."embeddingModel" = ${embeddingConfig.model}
  `;
  console.log("Model match chunks:", res3);

  const res4 = await db.$queryRaw`
    SELECT COUNT(*) as count FROM "CodeChunk" c
    INNER JOIN "RepoFile" f ON f."id" = c."fileId"
    WHERE c."repositoryId" = ${repoId}
      AND c."embeddingStatus" = 'EMBEDDED'::"EmbeddingStatus"
      AND c."embeddingModel" = ${embeddingConfig.model}
      AND f."isSensitive" = false
      AND f."isExcluded" = false
  `;
  console.log("Valid chunks:", res4);

  // Check what embeddingModel actually is in DB
  const models = await db.$queryRaw`
    SELECT DISTINCT "embeddingModel" FROM "CodeChunk" WHERE "repositoryId" = ${repoId}
  `;
  console.log("Models in DB:", models);
  console.log("embeddingConfig.model is:", embeddingConfig.model);
}

main().finally(() => db.$disconnect());
