import { NextRequest, NextResponse } from "next/server";
import { processRepositoryPhase2 } from "@/lib/analysis/pipeline";

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  if (!params.id) {
    return NextResponse.json({ error: "Repository id is required." }, { status: 400 });
  }

  try {
    const result = await processRepositoryPhase2(params.id);
    return NextResponse.json({ success: true, ...result });
  } catch (err: any) {
    const status = err.status === 404 ? 404 : 500;
    return NextResponse.json(
      { error: err.message || "Phase 2 analysis failed." },
      { status }
    );
  }
}
