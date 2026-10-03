/*
  Warnings:

  - Added the required column `updatedAt` to the `CodeChunk` table without a default value. This is not possible if the table is not empty.

*/
-- EnableExtension
CREATE EXTENSION IF NOT EXISTS vector;

-- CreateEnum
CREATE TYPE "EmbeddingStatus" AS ENUM ('PENDING', 'EMBEDDED', 'FAILED');

-- AlterTable
ALTER TABLE "CodeChunk"
  ADD COLUMN "embeddedAt" TIMESTAMP(3),
  ADD COLUMN "embedding" vector(1024),
  ADD COLUMN "embeddingError" TEXT,
  ADD COLUMN "embeddingHash" TEXT,
  ADD COLUMN "embeddingModel" TEXT,
  ADD COLUMN "embeddingStatus" "EmbeddingStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "CodeChunk" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateIndex
CREATE INDEX "CodeChunk_embeddingStatus_idx" ON "CodeChunk"("embeddingStatus");

-- CreateIndex
CREATE INDEX "CodeChunk_embeddingHash_idx" ON "CodeChunk"("embeddingHash");
