import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
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

    if (!repository.analysis) {
      return NextResponse.json(
        { error: "Repository has not been analyzed yet.", status: repository.status },
        { status: 404 }
      );
    }

    return NextResponse.json({
      repositoryId: repository.id,
      status: repository.status,
      analysis: repository.analysis,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to load analysis." },
      { status: 500 }
    );
  }
}
