export const embeddingConfig = {
  provider: "voyage-ai",
  model: process.env.VOYAGE_EMBEDDING_MODEL || "voyage-code-4",
  dimensions: 1024,
  batchSize: 2,
  maxQueryLength: 4_000,
  maxRetries: 5,
} as const;

export function hasVoyageApiKey(): boolean {
  return Boolean(process.env.VOYAGE_API_KEY);
}
