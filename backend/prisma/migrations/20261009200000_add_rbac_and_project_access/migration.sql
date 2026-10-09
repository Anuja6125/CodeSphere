-- Create or update UserRole enum
CREATE TYPE "UserRole_new" AS ENUM ('MANAGER', 'EMPLOYEE');
ALTER TABLE "User" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "User" ALTER COLUMN "role" TYPE "UserRole_new" USING ('EMPLOYEE'::"UserRole_new");
DROP TYPE "UserRole";
ALTER TYPE "UserRole_new" RENAME TO "UserRole";
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'EMPLOYEE';

-- Add userId to Repository
ALTER TABLE "Repository" ADD COLUMN IF NOT EXISTS "userId" TEXT;

-- Add foreign key constraint
ALTER TABLE "Repository" DROP CONSTRAINT IF EXISTS "Repository_userId_fkey";
ALTER TABLE "Repository" ADD CONSTRAINT "Repository_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Create ProjectRole enum
DO $$ BEGIN
  CREATE TYPE "ProjectRole" AS ENUM ('VIEWER', 'EDITOR', 'MANAGER');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Create ProjectAccess table
CREATE TABLE IF NOT EXISTS "ProjectAccess" (
    "id" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "ProjectRole" NOT NULL DEFAULT 'VIEWER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectAccess_pkey" PRIMARY KEY ("id")
);

-- Add indexes and constraints
CREATE UNIQUE INDEX IF NOT EXISTS "ProjectAccess_repositoryId_userId_key" ON "ProjectAccess"("repositoryId", "userId");
CREATE INDEX IF NOT EXISTS "ProjectAccess_repositoryId_idx" ON "ProjectAccess"("repositoryId");
CREATE INDEX IF NOT EXISTS "ProjectAccess_userId_idx" ON "ProjectAccess"("userId");

ALTER TABLE "ProjectAccess" DROP CONSTRAINT IF EXISTS "ProjectAccess_repositoryId_fkey";
ALTER TABLE "ProjectAccess" ADD CONSTRAINT "ProjectAccess_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "Repository"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProjectAccess" DROP CONSTRAINT IF EXISTS "ProjectAccess_userId_fkey";
ALTER TABLE "ProjectAccess" ADD CONSTRAINT "ProjectAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
