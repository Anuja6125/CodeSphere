import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { calculateRepositoryHealth } from "@/lib/health/calculator";

export async function GET(
  _req: NextRequest,
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

    const files = await db.repoFile.findMany({
      where: { repositoryId: params.id },
      select: {
        id: true,
        path: true,
        name: true,
        extension: true,
        size: true,
        linesCount: true,
        content: true,
        category: true,
        isSensitive: true,
        isExcluded: true,
      },
    });

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

    const chunks = await db.codeChunk.findMany({
      where: { repositoryId: params.id },
      select: {
        id: true,
        fileId: true,
        symbolName: true,
        chunkType: true,
        isExported: true,
      },
    });

    let entryPoints: Array<{ path: string }> = [];
    if (repository.analysis && Array.isArray(repository.analysis.entryPoints)) {
      entryPoints = repository.analysis.entryPoints as any[];
    }

    const report = calculateRepositoryHealth(
      files,
      validDeps,
      chunks,
      entryPoints
    );

    return NextResponse.json({ report });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to calculate repository health." },
      { status: 500 }
    );
  }
}
