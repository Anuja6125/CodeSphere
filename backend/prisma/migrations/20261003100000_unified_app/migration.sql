-- Unified CodeSphere app: ZIP uploads, graph storage, documentation.
-- Additive only. No existing data is removed.

-- CreateEnum
CREATE TYPE "SourceType" AS ENUM ('GITHUB', 'ZIP');

-- CreateEnum
CREATE TYPE "DocumentationStatus" AS ENUM ('PENDING', 'GENERATING', 'READY', 'FAILED');

-- AlterTable: ZIP uploads have no URL. Postgres allows many NULLs in a unique column.
ALTER TABLE "Repository"
  ADD COLUMN "sourceType" "SourceType" NOT NULL DEFAULT 'GITHUB',
  ADD COLUMN "errorMessage" TEXT,
  ALTER COLUMN "url" DROP NOT NULL;

-- CreateTable
CREATE TABLE "RepositoryGraph" (
    "id" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "nodes" JSONB NOT NULL,
    "edges" JSONB NOT NULL,
    "stats" JSONB NOT NULL,
    "unresolved" JSONB NOT NULL,
    "whereToStart" JSONB NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RepositoryGraph_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Documentation" (
    "id" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "status" "DocumentationStatus" NOT NULL DEFAULT 'PENDING',
    "content" TEXT,
    "model" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Documentation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RepositoryGraph_repositoryId_key" ON "RepositoryGraph"("repositoryId");

-- CreateIndex
CREATE UNIQUE INDEX "Documentation_repositoryId_key" ON "Documentation"("repositoryId");

-- AddForeignKey
ALTER TABLE "RepositoryGraph" ADD CONSTRAINT "RepositoryGraph_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "Repository"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Documentation" ADD CONSTRAINT "Documentation_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "Repository"("id") ON DELETE CASCADE ON UPDATE CASCADE;
