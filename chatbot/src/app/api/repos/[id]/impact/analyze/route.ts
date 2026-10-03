import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { analyzeChangeImpact } from "@/lib/impact/analyzer";
import { ImpactTarget, SemanticImpactItem } from "@/lib/impact/types";
import { semanticSearch } from "@/lib/embeddings/search";
import { generateImpactSummary } from "@/lib/impact/summary";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  if (!params.id) {
    return NextResponse.json({ error: "Repository ID is required." }, { status: 400 });
  }

  try {
    const repository = await db.repository.findUnique({
      where: { id: params.id },
      select: { id: true, name: true, analysis: true },
    });

    if (!repository) {
      return NextResponse.json({ error: "Repository not found." }, { status: 404 });
    }

    const body = await req.json();
    const { file: targetFile, symbol: targetSymbol, query, depth = 2 } = body;

    const files = await db.repoFile.findMany({
      where: { repositoryId: params.id },
      select: {
        id: true,
        path: true,
        name: true,
        extension: true,
        size: true,
        linesCount: true,
        language: true,
        category: true,
        isSensitive: true,
        isExcluded: true,
      },
    });

    let targetPath = targetFile;
    let targetType: ImpactTarget["type"] = "file";
    let semanticItems: SemanticImpactItem[] = [];

    if (query) {
      try {
        const searchResults = await semanticSearch(params.id, query, 5);
        semanticItems = searchResults.map((r) => ({
          path: r.filePath,
          chunkId: r.id,
          contentSnippet: r.content.slice(0, 300),
          similarity: r.similarity,
          hybridScore: r.hybridScore,
          reason: `Semantic match (${Math.round(r.similarity * 100)}% similarity)`,
          symbolName: r.symbolName,
          chunkType: r.chunkType,
          startLine: r.startLine,
          endLine: r.endLine,
        }));

        if (!targetPath && searchResults.length > 0) {
          targetPath = searchResults[0].filePath;
          targetType = "query";
        }
      } catch {
        // Fall back to graph
      }
    } else if (targetSymbol && !targetPath) {
      const chunk = await db.codeChunk.findFirst({
        where: {
          repositoryId: params.id,
          symbolName: targetSymbol,
        },
        include: { file: true },
      });
      if (chunk) {
        targetPath = chunk.file.path;
        targetType = "symbol";
      }
    }

    if (!targetPath) {
      return NextResponse.json(
        { error: "Target file, symbol, or query is required." },
        { status: 400 }
      );
    }

    const dependencies = await db.fileDependency.findMany({
      where: { repositoryId: params.id },
      include: {
        fromFile: { select: { path: true, isSensitive: true } },
        toFile: { select: { path: true } },
      },
    });

    const validDeps = dependencies
      .filter((d) => !d.fromFile.isSensitive)
      .map((d) => ({
        id: d.id,
        fromPath: d.fromFile.path,
        toPath: d.toFile?.path || null,
        toSpecifier: d.toSpecifier,
        kind: d.kind,
      }));

    let entryPoints: Array<{ path: string; reason?: string }> = [];
    if (repository.analysis && Array.isArray(repository.analysis.entryPoints)) {
      entryPoints = repository.analysis.entryPoints as any[];
    }

    const target: ImpactTarget = {
      type: targetType,
      path: targetPath,
      symbolName: targetSymbol || null,
    };

    const result = analyzeChangeImpact(target, files, validDeps, entryPoints, {
      depth,
      semanticResults: semanticItems,
    });

    const explanation = await generateImpactSummary(repository.name, result);

    return NextResponse.json({
      result,
      explanation,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to generate change impact analysis." },
      { status: 500 }
    );
  }
}
