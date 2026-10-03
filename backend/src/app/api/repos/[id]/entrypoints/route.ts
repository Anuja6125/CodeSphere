import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const analysis = await db.repositoryAnalysis.findUnique({
      where: { repositoryId: params.id },
    });

    if (!analysis) {
      const repo = await db.repository.findUnique({ where: { id: params.id }, select: { id: true } });
      if (!repo) {
        return NextResponse.json({ error: "Repository not found." }, { status: 404 });
      }
      return NextResponse.json({ error: "Repository has not been analyzed yet." }, { status: 404 });
    }

    return NextResponse.json({ entryPoints: analysis.entryPoints });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to load entry points." },
      { status: 500 }
    );
  }
}
