import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(
  req: NextRequest,
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

    const fileId = req.nextUrl.searchParams.get("fileId");
    const where = fileId
      ? { repositoryId: params.id, fileId }
      : { repositoryId: params.id };

    const chunks = await db.codeChunk.findMany({
      where,
      orderBy: [{ fileId: "asc" }, { chunkIndex: "asc" }],
      select: {
        id: true,
        fileId: true,
        chunkIndex: true,
        startLine: true,
        endLine: true,
        content: true,
        language: true,
        chunkType: true,
        symbolName: true,
        isExported: true,
        parentSymbol: true,
        file: {
          select: { path: true, name: true, isSensitive: true },
        },
      },
    });

    const sanitized = chunks
      .filter((c) => !c.file.isSensitive)
      .map(({ file, ...chunk }) => ({
        ...chunk,
        path: file.path,
        fileName: file.name,
      }));

    return NextResponse.json({ chunks: sanitized });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to load chunks." },
      { status: 500 }
    );
  }
}
