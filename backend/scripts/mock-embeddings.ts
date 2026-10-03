import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const repo = await db.repository.findFirst({
    where: { owner: "roystonfernandes1835", name: "portfolio-website" }
  });
  if (!repo) return console.log("Repo not found");

  const chunks = await db.codeChunk.findMany({
    where: { repositoryId: repo.id }
  });

  console.log(`Mocking embeddings for ${chunks.length} chunks...`);
  
  for (const chunk of chunks) {
    // Generate a random 1024-d vector
    const vector = Array.from({ length: 1024 }, () => Math.random() - 0.5);
    const sumSq = vector.reduce((sum, val) => sum + val * val, 0);
    const norm = Math.sqrt(sumSq);
    const normalized = vector.map(v => v / norm);

    const vectorStr = `[${normalized.join(",")}]`;

    await db.$executeRawUnsafe(`
      UPDATE "CodeChunk"
      SET "embedding" = $1::vector,
          "embeddingStatus" = 'EMBEDDED',
          "embeddingModel" = 'voyage-code-4'
      WHERE id = $2
    `, vectorStr, chunk.id);
  }

  console.log("Mock embeddings complete!");
}

main().finally(() => db.$disconnect());
