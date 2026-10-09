-- Rename or add ownerId column on Repository
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

-- Update foreign key constraint on Repository for ownerId
ALTER TABLE "Repository" DROP CONSTRAINT IF EXISTS "Repository_userId_fkey";
ALTER TABLE "Repository" DROP CONSTRAINT IF EXISTS "Repository_ownerId_fkey";
ALTER TABLE "Repository" ADD CONSTRAINT "Repository_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX IF NOT EXISTS "Repository_ownerId_idx" ON "Repository"("ownerId");

-- Add userId to ChatMessage for user-scoped chat isolation
ALTER TABLE "ChatMessage" ADD COLUMN IF NOT EXISTS "userId" TEXT;
ALTER TABLE "ChatMessage" DROP CONSTRAINT IF EXISTS "ChatMessage_userId_fkey";
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX IF NOT EXISTS "ChatMessage_userId_idx" ON "ChatMessage"("userId");

-- Create ActivityType enum
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

-- Create ProjectActivity table
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

-- Indexes for ProjectActivity
CREATE INDEX IF NOT EXISTS "ProjectActivity_repositoryId_idx" ON "ProjectActivity"("repositoryId");
CREATE INDEX IF NOT EXISTS "ProjectActivity_userId_idx" ON "ProjectActivity"("userId");
CREATE INDEX IF NOT EXISTS "ProjectActivity_createdAt_idx" ON "ProjectActivity"("createdAt");

-- Foreign key constraints for ProjectActivity
ALTER TABLE "ProjectActivity" DROP CONSTRAINT IF EXISTS "ProjectActivity_repositoryId_fkey";
ALTER TABLE "ProjectActivity" ADD CONSTRAINT "ProjectActivity_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "Repository"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProjectActivity" DROP CONSTRAINT IF EXISTS "ProjectActivity_userId_fkey";
ALTER TABLE "ProjectActivity" ADD CONSTRAINT "ProjectActivity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill initial PROJECT_CREATED activity for existing repositories
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
