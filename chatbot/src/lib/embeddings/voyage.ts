import crypto from "crypto";
import { embeddingConfig, hasVoyageApiKey } from "./config";

interface VoyageEmbeddingResponse {
  data: Array<{ embedding: number[]; index: number }>;
}

export class EmbeddingProviderError extends Error {
  constructor(
    message: string,
    public readonly retryable: boolean,
    public readonly isRateLimited: boolean = false
  ) {
    super(message);
  }
}

const delay = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export function contentHash(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

/**
 * Sanitize Voyage API error messages so internal details (billing page URLs,
 * API key hints, etc.) are never propagated to the user.
 */
function sanitizeVoyageError(status: number, _rawBody: string): string {
  if (status === 429) {
    return "Embedding service is temporarily rate-limited. Please wait a moment and try again.";
  }
  if (status === 401 || status === 403) {
    return "Embedding service authentication failed. Please check your VOYAGE_API_KEY.";
  }
  if (status >= 500) {
    return "Embedding service is temporarily unavailable. Please try again later.";
  }
  return `Embedding request failed (status ${status}).`;
}

export async function embedTexts(texts: string[], inputType: "document" | "query"): Promise<number[][]> {
  if (!hasVoyageApiKey()) {
    throw new EmbeddingProviderError("VOYAGE_API_KEY is required for embedding generation.", false);
  }
  if (texts.length === 0) return [];

  let lastError: Error | null = null;
  const maxRetries = embeddingConfig.maxRetries;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch("https://api.voyageai.com/v1/embeddings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
        },
        body: JSON.stringify({
          input: texts,
          model: embeddingConfig.model,
          input_type: inputType,
          output_dimension: embeddingConfig.dimensions,
          output_dtype: "float",
        }),
      });

      if (!response.ok) {
        const isRateLimited = response.status === 429;
        const retryable = isRateLimited || response.status >= 500;

        // For rate limits, use at least 21 seconds (free tier = 3 RPM)
        let retryAfterMs = isRateLimited
          ? Math.max(21_000, 1000 * 2 ** attempt)
          : 1000 * 2 ** attempt;

        if (isRateLimited) {
          const retryAfter = response.headers.get("Retry-After");
          if (retryAfter) {
            const parsed = parseInt(retryAfter, 10);
            if (!isNaN(parsed)) {
              retryAfterMs = Math.max(retryAfterMs, parsed * 1000);
            } else {
              const date = new Date(retryAfter);
              if (!isNaN(date.getTime())) {
                retryAfterMs = Math.max(retryAfterMs, date.getTime() - Date.now());
              }
            }
          }
        }

        const bodyText = await response.text().catch(() => "");
        const userMessage = sanitizeVoyageError(response.status, bodyText);
        const error = new EmbeddingProviderError(userMessage, retryable, isRateLimited);
        (error as any).retryAfterMs = retryAfterMs;
        throw error;
      }

      const body = (await response.json()) as VoyageEmbeddingResponse;
      const embeddings = body.data.sort((a, b) => a.index - b.index).map((item) => item.embedding);
      if (embeddings.length !== texts.length || embeddings.some((vector) => vector.length !== embeddingConfig.dimensions)) {
        throw new EmbeddingProviderError("Voyage returned embeddings with an unexpected count or dimension.", false);
      }
      return embeddings;
    } catch (error) {
      lastError = error as Error;
      const retryable = error instanceof EmbeddingProviderError ? error.retryable : true;
      if (!retryable || attempt === maxRetries - 1) break;
      const waitTime = (error as any).retryAfterMs || 1000 * 2 ** attempt;
      console.warn(`Voyage API rate limited or failed. Retrying in ${waitTime}ms (Attempt ${attempt + 1}/${maxRetries})...`);
      await delay(waitTime);
    }
  }

  throw lastError || new EmbeddingProviderError("Embedding request failed after all retries.", false);
}
