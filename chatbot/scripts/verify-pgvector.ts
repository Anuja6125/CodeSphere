import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function verify() {
  const extensions = await db.$queryRawUnsafe<Array<{ extname: string }>>(
    "SELECT extname FROM pg_extension WHERE extname = 'vector'"
  );
  const vector = await db.$queryRawUnsafe<Array<{ dimension: number }>>(
    "SELECT atttypmod - 4 AS dimension FROM pg_attribute WHERE attrelid = '\"CodeChunk\"'::regclass AND attname = 'embedding'"
  );
  console.log(JSON.stringify({ pgvectorEnabled: extensions.length === 1, dimension: vector[0]?.dimension ?? null }));
}

verify().finally(async () => db.$disconnect());
