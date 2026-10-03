import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const repository = await db.repository.findUnique({
      where: { id: params.id },
      select: { id: true },
    });

    if (!repository) {
      return NextResponse.json({ error: "Repository not found." }, { status: 404 });
    }

    const dependencies = await db.fileDependency.findMany({
      where: { repositoryId: params.id },
      include: {
        fromFile: { select: { path: true, isSensitive: true } },
        toFile: { select: { path: true } },
      },
    });

    const rows = dependencies
      .filter((d) => !d.fromFile.isSensitive)
      .map((d) => ({
        id: d.id,
        fromPath: d.fromFile.path,
        toSpecifier: d.toSpecifier,
        toPath: d.toFile?.path || null,
        kind: d.kind,
      }));

    return NextResponse.json({ dependencies: rows });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to load dependencies." },
      { status: 500 }
    );
  }
}
