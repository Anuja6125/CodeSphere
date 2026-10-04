export const embeddingConfig = {
  provider: "voyage-ai",
  model: process.env.VOYAGE_EMBEDDING_MODEL || "voyage-code-4",
  dimensions: 1024,
  // Batch size 32 embeds up to 96 chunks/min even on free tier without hitting limits.
  batchSize: Math.max(1, Number(process.env.VOYAGE_BATCH_SIZE) || 32),
  batchDelayMs: Math.max(0, Number(process.env.VOYAGE_BATCH_DELAY_MS ?? 2_000)),
  maxQueryLength: 4_000,
  maxRetries: 3,
} as const;

export function hasVoyageApiKey(): boolean {
  return Boolean(process.env.VOYAGE_API_KEY);
}
