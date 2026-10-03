const { PrismaClient } = require("@prisma/client");
const db = new PrismaClient();

async function main() {
  const chunk = await db.codeChunk.findFirst({
    where: { repositoryId: "86e2583b-71d9-4194-9939-2be3d957fc34", embeddingStatus: "FAILED" },
    select: { embeddingError: true },
  });
  console.log("Embedding Error:", chunk?.embeddingError);
}

main().finally(() => db.$disconnect());
