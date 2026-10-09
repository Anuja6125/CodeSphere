import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { processRagQuery } from "@/lib/ai/rag-pipeline";
import { ChatHistoryTurn } from "@/lib/ai/gemini-service";
import { Prisma } from "@prisma/client";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  if (!params.id) {
    return NextResponse.json({ error: "Repository ID is required." }, { status: 400 });
  }

  try {
    const body = await req.json();
    const message = typeof body.message === "string" ? body.message.trim() : "";

    if (!message) {
      return NextResponse.json({ error: "Message content is required." }, { status: 400 });
    }

    if (message.length > 4000) {
      return NextResponse.json(
        { error: "Message length exceeds maximum allowed 4000 characters." },
        { status: 400 }
      );
    }

    const userId = (req as any).user?.sub || req.headers.get("x-user-id") || null;

    // Retrieve recent chat history for conversational context scoped to the user
    const whereClause: any = { repositoryId: params.id };
    if (userId) {
      whereClause.OR = [{ userId }, { userId: null }];
    }

    const recentMessages = await db.chatMessage.findMany({
      where: whereClause,
      orderBy: { createdAt: "desc" },
      take: 6,
    });

    const history: ChatHistoryTurn[] = recentMessages
      .reverse()
      .map((msg) => ({
        role: msg.role === "assistant" ? "model" : "user",
        content: msg.content,
      }));

    // Process question via RAG pipeline
    const ragResult = await processRagQuery(params.id, message, history);

    // Persist messages in PostgreSQL scoped to current user
    await db.$transaction(async (tx) => {
      await tx.chatMessage.create({
        data: {
          repositoryId: params.id,
          userId: userId || null,
          role: "user",
          content: message,
        },
      });

      await tx.chatMessage.create({
        data: {
          repositoryId: params.id,
          userId: userId || null,
          role: "assistant",
          content: ragResult.answer,
          fileRefs: ragResult.sources as unknown as Prisma.InputJsonValue,
        },
      });
    });

    // Record activity in project history
    const { logActivity } = await import("@/services/activity");
    void logActivity({
      repositoryId: params.id,
      userId: userId || null,
      activityType: "CHAT_MESSAGE_SENT",
      title: "AI Chat query submitted",
      description: message.length > 100 ? `${message.slice(0, 97)}...` : message,
      metadata: { sourcesCount: ragResult.sources?.length ?? 0 },
    });

    return NextResponse.json({
      answer: ragResult.answer,
      sources: ragResult.sources,
      isLowConfidence: ragResult.isLowConfidence,
    });
  } catch (err: any) {
    const status = err.status || 500;
    return NextResponse.json(
      { error: err.message || "Failed to process chat message." },
      { status }
    );
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  if (!params.id) {
    return NextResponse.json({ error: "Repository ID is required." }, { status: 400 });
  }

  try {
    const repository = await db.repository.findUnique({ where: { id: params.id }, select: { id: true } });
    if (!repository) {
      return NextResponse.json({ error: "Repository not found." }, { status: 404 });
    }

    const userId = (_req as any).user?.sub || _req.headers.get("x-user-id") || null;
    const whereClause: any = { repositoryId: params.id };
    if (userId) {
      whereClause.OR = [{ userId }, { userId: null }];
    }

    const messages = await db.chatMessage.findMany({
      where: whereClause,
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        role: true,
        content: true,
        fileRefs: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ messages });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to fetch chat history." },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  if (!params.id) {
    return NextResponse.json({ error: "Repository ID is required." }, { status: 400 });
  }

  try {
    const repository = await db.repository.findUnique({ where: { id: params.id }, select: { id: true } });
    if (!repository) {
      return NextResponse.json({ error: "Repository not found." }, { status: 404 });
    }

    const userId = (_req as any).user?.sub || _req.headers.get("x-user-id") || null;
    const whereClause: any = { repositoryId: params.id };
    if (userId) {
      whereClause.userId = userId;
    }

    await db.chatMessage.deleteMany({
      where: whereClause,
    });
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to clear chat history." },
      { status: 500 }
    );
  }
}
