import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const repoId = "6f46cd78-9243-4600-bd9e-95192d211a05";
  console.log("Setting chunks back to PENDING...");
  await db.$executeRawUnsafe(`
    UPDATE "CodeChunk"
    SET "embedding" = NULL,
        "embeddingStatus" = 'PENDING',
        "embeddingError" = NULL
    WHERE "repositoryId" = $1
  `, repoId);
  console.log("Done. Triggering embed endpoint...");
  const res = await fetch(`http://localhost:3000/api/repos/${repoId}/embed`, { method: "POST" });
  console.log("Embed status:", res.status);
  console.log("Response:", await res.text());
}

main().finally(() => db.$disconnect());
