import { describe, it, expect, vi, beforeEach } from "vitest";
import { processRagQuery, formatContextString } from "../src/lib/ai/rag-pipeline";
import { db } from "../src/lib/db";
import { semanticSearch } from "../src/lib/embeddings/search";
import { generateGeminiResponse } from "../src/lib/ai/gemini-service";
import { getDisplayStatus } from "../src/lib/status";

vi.mock("../src/lib/db", () => ({
  db: {
    repository: { findUnique: vi.fn() },
    repositoryAnalysis: { findUnique: vi.fn() },
    repoFile: { findFirst: vi.fn() },
  },
}));

vi.mock("../src/lib/embeddings/search", () => ({
  semanticSearch: vi.fn(),
}));

vi.mock("../src/lib/ai/gemini-service", () => ({
  generateGeminiResponse: vi.fn(),
}));

describe("RAG Pipeline and UI Status Tests", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  const mockRepo = {
    id: "repo-1",
    name: "test-repo",
    owner: "user",
    status: "INDEXED",
    techStack: { languages: ["TypeScript"] },
  };

  const mockMetadata = {
    languages: ["TypeScript"],
    sourceFileCount: 10,
  };

  const mockReadme = { content: "Test README content" };

  it("1. Normal successful query", async () => {
    vi.mocked(db.repository.findUnique).mockResolvedValue(mockRepo as any);
    vi.mocked(db.repositoryAnalysis.findUnique).mockResolvedValue(mockMetadata as any);
    vi.mocked(db.repoFile.findFirst).mockResolvedValue(mockReadme as any);

    vi.mocked(semanticSearch).mockResolvedValue([
      { id: "chunk-1", filePath: "index.ts", content: "const a = 1;", hybridScore: 0.8, similarity: 0.8, startLine: 1, endLine: 2 } as any,
    ]);

    vi.mocked(generateGeminiResponse).mockResolvedValue("This is the answer.");

    const res = await processRagQuery("repo-1", "What is a?");
    expect(res.answer).toBe("This is the answer.");
    expect(res.isLowConfidence).toBe(false);
    expect(res.sources).toHaveLength(1);
    expect(vi.mocked(generateGeminiResponse)).toHaveBeenCalled();
  });

  it("2. Query when embedding database is missing chunks", async () => {
    vi.mocked(db.repository.findUnique).mockResolvedValue(mockRepo as any);
    vi.mocked(db.repositoryAnalysis.findUnique).mockResolvedValue(mockMetadata as any);
    vi.mocked(db.repoFile.findFirst).mockResolvedValue(mockReadme as any);

    // semanticSearch returns empty array when no chunks are found
    vi.mocked(semanticSearch).mockResolvedValue([]);
    vi.mocked(generateGeminiResponse).mockResolvedValue("Answer based on metadata.");

    const res = await processRagQuery("repo-1", "What technologies?");
    expect(res.isLowConfidence).toBe(true);
    expect(res.retrievedCount).toBe(0);
    // Still queries Gemini using metadata
    expect(vi.mocked(generateGeminiResponse)).toHaveBeenCalled();
  });

  it("3. Query when pgvector similarity is extremely low", async () => {
    vi.mocked(db.repository.findUnique).mockResolvedValue(mockRepo as any);
    vi.mocked(semanticSearch).mockResolvedValue([
      { id: "chunk-1", filePath: "index.ts", content: "const a = 1;", hybridScore: 0.1, similarity: 0.1, startLine: 1, endLine: 2 } as any,
    ]);
    vi.mocked(generateGeminiResponse).mockResolvedValue("Answer");

    const res = await processRagQuery("repo-1", "Unrelated?");
    expect(res.isLowConfidence).toBe(true); // hybridScore < 0.35
    expect(res.sources.length).toBe(0); // Chunks filtered out because score < 0.15
  });

  it("4. Query that relies exclusively on architectural metadata (tech stack, file counts)", async () => {
    vi.mocked(db.repository.findUnique).mockResolvedValue(mockRepo as any);
    vi.mocked(db.repositoryAnalysis.findUnique).mockResolvedValue(mockMetadata as any);
    vi.mocked(semanticSearch).mockResolvedValue([]);
    vi.mocked(generateGeminiResponse).mockImplementation(async (query, context) => {
      expect(context).toContain("TypeScript");
      expect(context).toContain("Source File Count: 10");
      return "Answer";
    });

    await processRagQuery("repo-1", "Tech stack?");
    expect(vi.mocked(generateGeminiResponse)).toHaveBeenCalled();
  });

  it("5. Query that relies exclusively on the README", async () => {
    vi.mocked(db.repository.findUnique).mockResolvedValue(mockRepo as any);
    vi.mocked(db.repoFile.findFirst).mockResolvedValue({ content: "SUPER IMPORTANT README" } as any);
    vi.mocked(semanticSearch).mockResolvedValue([]);
    vi.mocked(generateGeminiResponse).mockImplementation(async (query, context) => {
      expect(context).toContain("SUPER IMPORTANT README");
      return "Answer";
    });

    await processRagQuery("repo-1", "What is the project about?");
    expect(vi.mocked(generateGeminiResponse)).toHaveBeenCalled();
  });

  it("6. The exact fallback message triggered when BOTH semantic search and metadata fail", async () => {
    // This is handled by Gemini based on the prompt, but let's verify formatting output
    const context = formatContextString([], null, null, null);
    expect(context).toContain("No relevant code chunks retrieved.");
    expect(context).not.toContain("=== REPOSITORY METADATA ===");
  });

  it("7. Graceful degradation when Voyage API returns a 503 error", async () => {
    vi.mocked(db.repository.findUnique).mockResolvedValue(mockRepo as any);
    vi.mocked(semanticSearch).mockRejectedValue({ status: 503, message: "Service Unavailable" });
    vi.mocked(db.repositoryAnalysis.findUnique).mockResolvedValue(null);
    vi.mocked(db.repoFile.findFirst).mockResolvedValue(null);
    vi.mocked(generateGeminiResponse).mockResolvedValue("Fallback answer");

    const result = await processRagQuery("repo-1", "test");
    expect(result.retrievedCount).toBe(0);
    expect(result.isLowConfidence).toBe(true);
    expect(result.answer).toContain("Semantic code search was temporarily unavailable");
  });

  it("8. Graceful handling of a Gemini API refusal / safety block", async () => {
    vi.mocked(db.repository.findUnique).mockResolvedValue(mockRepo as any);
    vi.mocked(semanticSearch).mockResolvedValue([]);
    vi.mocked(generateGeminiResponse).mockRejectedValue(new Error("Safety block"));

    await expect(processRagQuery("repo-1", "test")).rejects.toThrow("Safety block");
  });

  it("9. Verify formatting of code block citations", () => {
    const context = formatContextString([
      { id: "1", filePath: "a.ts", content: "let x = 1;", startLine: 1, endLine: 1, chunkType: "module", hybridScore: 1, similarity: 1 } as any
    ], null, null, null);
    
    expect(context).toContain("[Source 1]");
    expect(context).toContain("File: a.ts");
    expect(context).toContain("```\nlet x = 1;\n```");
  });

  it("10. UI mapping of the 5 required indexing statuses", () => {
    expect(getDisplayStatus("INDEXED")).toEqual({ text: "Indexed; embeddings pending", colorClass: "text-slate-400", icon: "none" });
    expect(getDisplayStatus("ANALYZED")).toEqual({ text: "Ready", colorClass: "text-emerald-400", icon: "ready" });
    expect(getDisplayStatus("ANALYZING")).toEqual({ text: "Analyzing", colorClass: "text-amber-400", icon: "spinner" });
    expect(getDisplayStatus("INDEXING")).toEqual({ text: "Generating embeddings", colorClass: "text-amber-400", icon: "spinner" });
    expect(getDisplayStatus("FAILED")).toEqual({ text: "Error", colorClass: "text-red-400", icon: "error" });
    expect(getDisplayStatus("PENDING")).toEqual({ text: "Not indexed", colorClass: "text-slate-400", icon: "none" });
  });
});
