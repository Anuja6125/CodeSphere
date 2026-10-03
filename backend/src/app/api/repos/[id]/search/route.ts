import { NextRequest, NextResponse } from "next/server";
import { embeddingConfig } from "@/lib/embeddings/config";
import { semanticSearch } from "@/lib/embeddings/search";
import { EmbeddingProviderError } from "@/lib/embeddings/voyage";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await req.json();
    const query = typeof body.query === "string" ? body.query.trim() : "";
    const requestedLimit = Number(body.limit ?? 5);

    if (!query) return NextResponse.json({ error: "Search query is required." }, { status: 400 });
    if (query.length > embeddingConfig.maxQueryLength) {
      return NextResponse.json({ error: `Search query must not exceed ${embeddingConfig.maxQueryLength} characters.` }, { status: 400 });
    }
    if (!Number.isInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > 20) {
      return NextResponse.json({ error: "limit must be an integer between 1 and 20." }, { status: 400 });
    }

    const results = await semanticSearch(params.id, query, requestedLimit);
    return NextResponse.json({ results });
  } catch (error) {
    // Return user-friendly message for rate limiting
    if (error instanceof EmbeddingProviderError && error.isRateLimited) {
      return NextResponse.json(
        { error: "Search is temporarily rate-limited. Please wait a moment and try again." },
        { status: 429 }
      );
    }
    const status = (error as { status?: number }).status || 500;
    const message = error instanceof EmbeddingProviderError
      ? error.message
      : error instanceof Error
        ? error.message
        : "Semantic search failed.";
    return NextResponse.json({ error: message }, { status });
  }
}

