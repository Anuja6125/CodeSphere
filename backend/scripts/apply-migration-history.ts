import { db } from "../src/lib/db";

async function main() {
  console.log("Applying migration steps...");

  // 1. Rename or add ownerId column on Repository
  console.log("1. Ensuring ownerId column on Repository...");
  await db.$executeRawUnsafe(`
    DO $$ BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='Repository' AND column_name='userId'
      ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='Repository' AND column_name='ownerId'
      ) THEN
        ALTER TABLE "Repository" RENAME COLUMN "userId" TO "ownerId";
      ELSIF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='Repository' AND column_name='ownerId'
      ) THEN
        ALTER TABLE "Repository" ADD COLUMN "ownerId" TEXT;
      END IF;
    END $$;
  `);

  // 2. Foreign keys and indexes on Repository
  console.log("2. Updating constraints on Repository...");
  await db.$executeRawUnsafe(`ALTER TABLE "Repository" DROP CONSTRAINT IF EXISTS "Repository_userId_fkey";`);
  await db.$executeRawUnsafe(`ALTER TABLE "Repository" DROP CONSTRAINT IF EXISTS "Repository_ownerId_fkey";`);
  await db.$executeRawUnsafe(`
    ALTER TABLE "Repository" 
    ADD CONSTRAINT "Repository_ownerId_fkey" 
    FOREIGN KEY ("ownerId") REFERENCES "User"("id") 
    ON DELETE SET NULL ON UPDATE CASCADE;
  `);
  await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Repository_ownerId_idx" ON "Repository"("ownerId");`);

  // 3. User scoping on ChatMessage
  console.log("3. Adding userId to ChatMessage...");
  await db.$executeRawUnsafe(`ALTER TABLE "ChatMessage" ADD COLUMN IF NOT EXISTS "userId" TEXT;`);
  await db.$executeRawUnsafe(`ALTER TABLE "ChatMessage" DROP CONSTRAINT IF EXISTS "ChatMessage_userId_fkey";`);
  await db.$executeRawUnsafe(`
    ALTER TABLE "ChatMessage" 
    ADD CONSTRAINT "ChatMessage_userId_fkey" 
    FOREIGN KEY ("userId") REFERENCES "User"("id") 
    ON DELETE SET NULL ON UPDATE CASCADE;
  `);
  await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ChatMessage_userId_idx" ON "ChatMessage"("userId");`);

  // 4. Create ActivityType enum
  console.log("4. Creating ActivityType enum...");
  await db.$executeRawUnsafe(`
    DO $$ BEGIN
      CREATE TYPE "ActivityType" AS ENUM (
        'PROJECT_CREATED',
        'PROJECT_UPDATED',
        'REPO_REANALYZED',
        'INDEXING_COMPLETED',
        'GRAPH_GENERATED',
        'DOCS_GENERATION_STARTED',
        'DOCS_GENERATED',
        'CHAT_MESSAGE_SENT',
        'PROJECT_SHARED',
        'ACCESS_REVOKED'
      );
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `);

  // 5. Create ProjectActivity table
  console.log("5. Creating ProjectActivity table...");
  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "ProjectActivity" (
        "id" TEXT NOT NULL,
        "repositoryId" TEXT NOT NULL,
        "userId" TEXT,
        "activityType" "ActivityType" NOT NULL,
        "title" TEXT NOT NULL,
        "description" TEXT,
        "metadata" JSONB,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

        CONSTRAINT "ProjectActivity_pkey" PRIMARY KEY ("id")
    );
  `);

  // 6. ProjectActivity indexes & constraints
  console.log("6. Creating ProjectActivity indexes & constraints...");
  await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ProjectActivity_repositoryId_idx" ON "ProjectActivity"("repositoryId");`);
  await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ProjectActivity_userId_idx" ON "ProjectActivity"("userId");`);
  await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ProjectActivity_createdAt_idx" ON "ProjectActivity"("createdAt");`);

  await db.$executeRawUnsafe(`ALTER TABLE "ProjectActivity" DROP CONSTRAINT IF EXISTS "ProjectActivity_repositoryId_fkey";`);
  await db.$executeRawUnsafe(`
    ALTER TABLE "ProjectActivity" 
    ADD CONSTRAINT "ProjectActivity_repositoryId_fkey" 
    FOREIGN KEY ("repositoryId") REFERENCES "Repository"("id") 
    ON DELETE CASCADE ON UPDATE CASCADE;
  `);

  await db.$executeRawUnsafe(`ALTER TABLE "ProjectActivity" DROP CONSTRAINT IF EXISTS "ProjectActivity_userId_fkey";`);
  await db.$executeRawUnsafe(`
    ALTER TABLE "ProjectActivity" 
    ADD CONSTRAINT "ProjectActivity_userId_fkey" 
    FOREIGN KEY ("userId") REFERENCES "User"("id") 
    ON DELETE SET NULL ON UPDATE CASCADE;
  `);

  // 7. Backfill initial PROJECT_CREATED activities for existing repositories
  console.log("7. Backfilling initial PROJECT_CREATED activity records...");
  await db.$executeRawUnsafe(`
    INSERT INTO "ProjectActivity" ("id", "repositoryId", "userId", "activityType", "title", "description", "metadata", "createdAt")
    SELECT 
      gen_random_uuid()::text,
      r."id",
      r."ownerId",
      'PROJECT_CREATED'::"ActivityType",
      'Project created',
      CONCAT('Repository created from ', r."sourceType"::text),
      json_build_object('sourceType', r."sourceType"::text, 'url', r."url", 'name', r."name"),
      r."createdAt"
    FROM "Repository" r
    WHERE NOT EXISTS (
      SELECT 1 FROM "ProjectActivity" a WHERE a."repositoryId" = r."id" AND a."activityType" = 'PROJECT_CREATED'
    );
  `);

  console.log("Migration completed successfully!");
}

main()
  .catch((err) => {
    console.error("Migration step failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
