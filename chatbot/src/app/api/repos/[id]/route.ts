import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const repository = await db.repository.findUnique({
      where: { id: params.id },
      include: {
        files: {
          orderBy: { path: "asc" },
        },
      },
    });

    if (!repository) {
      return NextResponse.json({ error: "Repository not found." }, { status: 404 });
    }

    return NextResponse.json({ repository });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to fetch repository from database." },
      { status: 500 }
    );
  }
}
