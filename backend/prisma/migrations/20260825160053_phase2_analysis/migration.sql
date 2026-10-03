/*
  Warnings:

  - Added the required column `chunkType` to the `CodeChunk` table without a default value. This is not possible if the table is not empty.
  - Added the required column `repositoryId` to the `CodeChunk` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "FileCategory" AS ENUM ('SOURCE_CODE', 'TEST', 'CONFIG', 'DOCUMENTATION', 'MARKUP', 'STYLESHEET', 'DATABASE', 'SCRIPT', 'API_SCHEMA', 'BUILD_CONFIG', 'DEPENDENCY_MANIFEST', 'OTHER');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "RepoStatus" ADD VALUE 'ANALYZING';
ALTER TYPE "RepoStatus" ADD VALUE 'ANALYZED';

-- AlterTable
ALTER TABLE "CodeChunk" ADD COLUMN     "chunkType" TEXT NOT NULL,
ADD COLUMN     "isExported" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "language" TEXT,
ADD COLUMN     "parentSymbol" TEXT,
ADD COLUMN     "repositoryId" TEXT NOT NULL,
ADD COLUMN     "symbolName" TEXT;

-- AlterTable
ALTER TABLE "RepoFile" ADD COLUMN     "category" "FileCategory",
ADD COLUMN     "isBinary" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isExcluded" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isSensitive" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "language" TEXT;

-- CreateTable
CREATE TABLE "FileDependency" (
    "id" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "fromFileId" TEXT NOT NULL,
    "toSpecifier" TEXT NOT NULL,
    "toFileId" TEXT,
    "kind" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FileDependency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RepositoryAnalysis" (
    "id" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "languages" JSONB NOT NULL,
    "frameworks" JSONB NOT NULL,
    "packageManagers" JSONB NOT NULL,
    "importantDirectories" JSONB NOT NULL,
    "sourceFileCount" INTEGER NOT NULL DEFAULT 0,
    "testFileCount" INTEGER NOT NULL DEFAULT 0,
    "documentationFileCount" INTEGER NOT NULL DEFAULT 0,
    "configFileCount" INTEGER NOT NULL DEFAULT 0,
    "entryPoints" JSONB NOT NULL,
    "importantModules" JSONB NOT NULL,
    "databaseFiles" JSONB NOT NULL,
    "apiFiles" JSONB NOT NULL,
    "fileStats" JSONB NOT NULL,
    "chunkCount" INTEGER NOT NULL DEFAULT 0,
    "dependencyCount" INTEGER NOT NULL DEFAULT 0,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RepositoryAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FileDependency_repositoryId_idx" ON "FileDependency"("repositoryId");

-- CreateIndex
CREATE INDEX "FileDependency_fromFileId_idx" ON "FileDependency"("fromFileId");

-- CreateIndex
CREATE UNIQUE INDEX "RepositoryAnalysis_repositoryId_key" ON "RepositoryAnalysis"("repositoryId");

-- CreateIndex
CREATE INDEX "CodeChunk_repositoryId_idx" ON "CodeChunk"("repositoryId");

-- AddForeignKey
ALTER TABLE "CodeChunk" ADD CONSTRAINT "CodeChunk_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "Repository"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileDependency" ADD CONSTRAINT "FileDependency_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "Repository"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileDependency" ADD CONSTRAINT "FileDependency_fromFileId_fkey" FOREIGN KEY ("fromFileId") REFERENCES "RepoFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileDependency" ADD CONSTRAINT "FileDependency_toFileId_fkey" FOREIGN KEY ("toFileId") REFERENCES "RepoFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepositoryAnalysis" ADD CONSTRAINT "RepositoryAnalysis_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "Repository"("id") ON DELETE CASCADE ON UPDATE CASCADE;
