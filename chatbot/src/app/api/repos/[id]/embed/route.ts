import { NextRequest, NextResponse } from "next/server";
import { embedRepositoryChunks } from "@/lib/embeddings/service";
import { EmbeddingProviderError } from "@/lib/embeddings/voyage";

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const result = await embedRepositoryChunks(params.id);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    if (error instanceof EmbeddingProviderError && error.isRateLimited) {
      return NextResponse.json(
        { error: "Embedding service is rate-limited. Please wait 1-2 minutes and try again." },
        { status: 429 }
      );
    }
    const status = (error as { status?: number }).status || 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Embedding failed." },
      { status }
    );
  }
}

