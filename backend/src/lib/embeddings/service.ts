import { db } from "@/lib/db";
import { embeddingConfig } from "./config";
import { contentHash, embedTexts, EmbeddingProviderError } from "./voyage";
import { toPgVector } from "./vector";

export interface EmbeddingRunResult {
  repositoryId: string;
  embedded: number;
  skipped: number;
  failed: number;
  totalChunks: number;
  message: string;
}

export async function embedRepositoryChunks(repositoryId: string): Promise<EmbeddingRunResult> {
  const repository = await db.repository.findUnique({
    where: { id: repositoryId },
    select: { id: true, name: true, analysis: { select: { id: true } } },
  });
  if (!repository) throw Object.assign(new Error("Repository not found."), { status: 404 });

  // Do not downgrade an already analyzed repository to INDEXING in the UI
  const alreadyAnalyzed = Boolean(repository.analysis);
  if (!alreadyAnalyzed) {
    await db.repository.update({ where: { id: repositoryId }, data: { status: "INDEXING" } });
  }

  const chunks = await db.codeChunk.findMany({
    where: {
      repositoryId,
      file: { isSensitive: false, isExcluded: false },
    },
    select: { id: true, content: true, embeddingHash: true, embeddingModel: true, embeddingStatus: true },
    orderBy: { createdAt: "asc" },
  });

  const eligible = chunks.filter((chunk) => {
    const hash = contentHash(chunk.content);
    return !(
      chunk.embeddingStatus === "EMBEDDED" &&
      chunk.embeddingModel === embeddingConfig.model &&
      chunk.embeddingHash === hash
    );
  });

  let embedded = 0;
  let failed = 0;
  let rateLimitCount = 0;
  const totalBatches = Math.ceil(eligible.length / embeddingConfig.batchSize);

  for (let offset = 0; offset < eligible.length; offset += embeddingConfig.batchSize) {
    const batchIndex = Math.floor(offset / embeddingConfig.batchSize) + 1;
    const batch = eligible.slice(offset, offset + embeddingConfig.batchSize);

    try {
      const vectors = await embedTexts(batch.map((chunk) => chunk.content), "document");
      for (let index = 0; index < batch.length; index++) {
        const chunk = batch[index];
        const vector = toPgVector(vectors[index]);
        const hash = contentHash(chunk.content);
        await db.$executeRawUnsafe(
          `UPDATE "CodeChunk"
           SET "embedding" = $1::vector,
               "embeddingModel" = $2,
               "embeddingHash" = $3,
               "embeddingStatus" = 'EMBEDDED'::"EmbeddingStatus",
               "embeddingError" = NULL,
               "embeddedAt" = CURRENT_TIMESTAMP,
               "updatedAt" = CURRENT_TIMESTAMP
           WHERE "id" = $4`,
          vector,
          embeddingConfig.model,
          hash,
          chunk.id
        );
      }
      embedded += batch.length;
      console.log(`[Embeddings] Batch ${batchIndex}/${totalBatches}: embedded ${batch.length} chunks (${embedded}/${eligible.length} total)`);

      // Rate-limit pacing between batches
      if (embeddingConfig.batchDelayMs > 0 && offset + embeddingConfig.batchSize < eligible.length) {
        await new Promise((resolve) => setTimeout(resolve, embeddingConfig.batchDelayMs));
      }
    } catch (error) {
      const isRateLimited = error instanceof EmbeddingProviderError && error.isRateLimited;
      const message = error instanceof Error ? error.message.slice(0, 500) : "Embedding request failed.";
      console.warn(`[Embeddings] Batch ${batchIndex}/${totalBatches} failed: ${message}`);

      failed += batch.length;
      const ids = batch.map((chunk) => chunk.id);
      await db.codeChunk.updateMany({
        where: { id: { in: ids } },
        data: {
          embeddingStatus: "FAILED",
          embeddingError: isRateLimited
            ? "Rate limited — fast lexical search will answer queries for these chunks."
            : message,
          embeddingModel: embeddingConfig.model,
        },
      });

      if (isRateLimited) {
        rateLimitCount++;
        // If repeatedly rate-limited, yield to avoid locking up background execution
        if (rateLimitCount >= 2) {
          console.log(`[Embeddings] Free-tier rate limit reached. Yielding; remaining chunks will use fast lexical search.`);
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 5_000));
      }
    }
  }

  // Once files and analysis exist, repository is ready!
  const finalStatus = repository.analysis ? "ANALYZED" : "INDEXED";
  await db.repository.update({ where: { id: repositoryId }, data: { status: finalStatus } });

  const skipped = chunks.length - eligible.length;
  const successMessage = failed > 0
    ? `Embedded ${embedded} chunks. ${failed} chunks failed (rate-limited). Re-run to retry failed chunks.`
    : `Successfully embedded all ${embedded} chunks.`;

  return {
    repositoryId,
    embedded,
    skipped,
    failed,
    totalChunks: chunks.length,
    message: skipped > 0
      ? `${successMessage} ${skipped} chunks were already up-to-date.`
      : successMessage,
  };
}

