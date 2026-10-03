import { processRagQuery } from "../src/lib/ai/rag-pipeline";
import { semanticSearch } from "../src/lib/embeddings/search";
import { db } from "../src/lib/db";

async function test() {
  const repoId = "6f46cd78-9243-4600-bd9e-95192d211a05";
  const question1 = "What technologies are used?";
  const question2 = "What is the project about?";

  console.log(`\n=== SEMANTIC SEARCH TEST 1: "${question1}" ===`);
  try {
    const results1 = await semanticSearch(repoId, question1, 8);
    console.log(`Found ${results1.length} chunks.`);
    results1.forEach((r, i) => {
      console.log(`[${i+1}] Score: ${r.hybridScore.toFixed(4)} (sim: ${r.similarity.toFixed(4)}) - File: ${r.filePath} (${r.startLine}-${r.endLine})`);
    });
  } catch (err) {
    console.error("Semantic search failed:", err);
  }

  console.log(`\n=== SEMANTIC SEARCH TEST 2: "${question2}" ===`);
  try {
    const results2 = await semanticSearch(repoId, question2, 8);
    console.log(`Found ${results2.length} chunks.`);
    results2.forEach((r, i) => {
      console.log(`[${i+1}] Score: ${r.hybridScore.toFixed(4)} (sim: ${r.similarity.toFixed(4)}) - File: ${r.filePath} (${r.startLine}-${r.endLine})`);
    });
  } catch (err) {
    console.error("Semantic search failed:", err);
  }

  console.log(`\n=== RAG PIPELINE TEST 1: "${question1}" ===`);
  try {
    const rag1 = await processRagQuery(repoId, question1, []);
    console.log(`Is Low Confidence: ${rag1.isLowConfidence}`);
    console.log(`Retrieved count: ${rag1.retrievedCount}`);
    console.log(`Answer: ${rag1.answer}`);
  } catch (err) {
    console.error("RAG pipeline failed:", err);
  }

}

test().finally(() => db.$disconnect());
