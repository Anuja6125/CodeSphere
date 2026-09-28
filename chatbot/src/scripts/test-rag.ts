import { PrismaClient } from "@prisma/client";
import { semanticSearch } from "../lib/embeddings/search";
import { processRagQuery } from "../lib/ai/rag-pipeline";
import { geminiConfig } from "../lib/ai/gemini-config";

const db = new PrismaClient();

async function main() {
  const repo = await db.repository.findFirst({
    where: { owner: "roystonfernandes1835", name: "portfolio-website" }
  });

  if (!repo) {
    console.error("Repo not found");
    return;
  }

  console.log("Testing semanticSearch...");
  try {
    const chunks = await semanticSearch(repo.id, "What does this project do?", geminiConfig.maxContextChunks);
    console.log("semanticSearch chunks length:", chunks.length);
    if (chunks.length > 0) {
      console.log("Max similarity:", Math.max(...chunks.map(c => c.similarity)));
    }
  } catch (e: any) {
    console.error("semanticSearch error:", e.message);
  }
}

main().finally(() => db.$disconnect());
