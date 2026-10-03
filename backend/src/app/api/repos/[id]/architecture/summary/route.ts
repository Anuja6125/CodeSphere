import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { buildArchitectureGraph } from "@/lib/architecture/graph-builder";
import { generateArchitectureSummary } from "@/lib/architecture/summary";

export async function POST(
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
        techStack: true,
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
        language: true,
        category: true,
        isDirectory: true,
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

    let entryPoints: Array<{ path: string; reason?: string; confidence?: number }> = [];
    if (repository.analysis && Array.isArray(repository.analysis.entryPoints)) {
      entryPoints = repository.analysis.entryPoints as any[];
    }

    const graph = buildArchitectureGraph(
      files,
      validDeps,
      [],
      entryPoints,
      { view: "modules" }
    );

    const summary = await generateArchitectureSummary(
      repository.name,
      repository.techStack,
      graph
    );

    return NextResponse.json({ summary });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to generate architecture summary." },
      { status: 500 }
    );
  }
}
