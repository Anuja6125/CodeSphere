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

    // Retrieve recent chat history for conversational context
    const recentMessages = await db.chatMessage.findMany({
      where: { repositoryId: params.id },
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

    // Persist messages in PostgreSQL
    await db.$transaction(async (tx) => {
      await tx.chatMessage.create({
        data: {
          repositoryId: params.id,
          role: "user",
          content: message,
        },
      });

      await tx.chatMessage.create({
        data: {
          repositoryId: params.id,
          role: "assistant",
          content: ragResult.answer,
          fileRefs: ragResult.sources as unknown as Prisma.InputJsonValue,
        },
      });
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
    const messages = await db.chatMessage.findMany({
      where: { repositoryId: params.id },
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
    await db.chatMessage.deleteMany({
      where: { repositoryId: params.id },
    });
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to clear chat history." },
      { status: 500 }
    );
  }
}
