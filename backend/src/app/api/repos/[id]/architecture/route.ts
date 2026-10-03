import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { buildArchitectureGraph } from "@/lib/architecture/graph-builder";
import { ArchitectureGroup } from "@/lib/architecture/types";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  if (!params.id) {
    return NextResponse.json({ error: "Repository ID is required." }, { status: 400 });
  }

  try {
    const repository = await db.repository.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        name: true,
        owner: true,
        status: true,
        analysis: true,
      },
    });

    if (!repository) {
      return NextResponse.json({ error: "Repository not found." }, { status: 404 });
    }

    const { searchParams } = new URL(req.url);
    const view = (searchParams.get("view") === "files" ? "files" : "modules") as "modules" | "files";
    const moduleFilter = searchParams.get("module") || undefined;
    const groupFilter = (searchParams.get("group") as ArchitectureGroup) || undefined;
    const limitParam = searchParams.get("limit");
    const maxFilesLimit = limitParam ? Math.min(Math.max(parseInt(limitParam, 10), 10), 1000) : 300;

    // Fetch repository files
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
        isDirectory: true,
        isSensitive: true,
        isExcluded: true,
      },
    });

    if (files.length === 0) {
      return NextResponse.json({
        graph: {
          nodes: [],
          edges: [],
          groups: [],
          stats: {
            totalFiles: 0,
            analyzedFiles: 0,
            dependencyEdges: 0,
            entryPoints: 0,
            modulesCount: 0,
            highlyConnectedFiles: [],
            isolatedFiles: [],
            circularDependencies: [],
          },
        },
      });
    }

    // Fetch dependencies
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

    // Fetch code chunk symbols if in files view
    let chunks: Array<{
      id: string;
      fileId: string;
      symbolName: string | null;
      chunkType: string;
      isExported: boolean;
    }> = [];

    if (view === "files") {
      chunks = await db.codeChunk.findMany({
        where: {
          repositoryId: params.id,
          symbolName: { not: null },
        },
        select: {
          id: true,
          fileId: true,
          symbolName: true,
          chunkType: true,
          isExported: true,
        },
      });
    }

    // Extract entry points from RepositoryAnalysis
    let entryPoints: Array<{ path: string; reason?: string; confidence?: number }> = [];
    if (repository.analysis && Array.isArray(repository.analysis.entryPoints)) {
      entryPoints = repository.analysis.entryPoints as any[];
    }

    const graph = buildArchitectureGraph(
      files,
      validDeps,
      chunks,
      entryPoints,
      {
        view,
        moduleFilter,
        groupFilter,
        maxFilesLimit,
      }
    );

    return NextResponse.json({ graph });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to generate architecture graph." },
      { status: 500 }
    );
  }
}
