const { PrismaClient } = require("@prisma/client");

const db = new PrismaClient();

async function main() {
  const extensions = await db.$queryRawUnsafe("SELECT extname FROM pg_extension WHERE extname = 'vector'");
  const dimensions = await db.$queryRawUnsafe("SELECT atttypmod AS dimension FROM pg_attribute WHERE attrelid = '\"CodeChunk\"'::regclass AND attname = 'embedding'");
  console.log(JSON.stringify({ pgvectorEnabled: extensions.length === 1, dimension: dimensions[0]?.dimension ?? null }));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
}).finally(() => db.$disconnect());
