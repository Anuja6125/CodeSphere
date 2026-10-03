export const embeddingConfig = {
  provider: "voyage-ai",
  model: process.env.VOYAGE_EMBEDDING_MODEL || "voyage-code-4",
  dimensions: 1024,
  // Defaults fit Voyage's free tier (3 requests/min). With billing enabled,
  // set VOYAGE_BATCH_SIZE=64 and VOYAGE_BATCH_DELAY_MS=0 for much faster indexing.
  batchSize: Math.max(1, Number(process.env.VOYAGE_BATCH_SIZE) || 2),
  batchDelayMs: Math.max(0, Number(process.env.VOYAGE_BATCH_DELAY_MS ?? 21_000)),
  maxQueryLength: 4_000,
  maxRetries: 5,
} as const;

export function hasVoyageApiKey(): boolean {
  return Boolean(process.env.VOYAGE_API_KEY);
}
