import { describe, it, expect, afterAll, beforeEach, afterEach } from "vitest";
import { formatContextString, processRagQuery } from "@/lib/ai/rag-pipeline";
import { db } from "@/lib/db";
import { SearchResult, semanticSearch } from "@/lib/embeddings/search";
import * as searchModule from "@/lib/embeddings/search";
import * as geminiService from "@/lib/ai/gemini-service";
import { vi } from "vitest";

describe("Phase 4 RAG Chat & Retrieval Unit & Integration Tests", () => {
  const marker = `phase4-test-${Date.now()}`;
  let testRepoId: string | undefined;

  afterAll(async () => {
    if (testRepoId) {
      await db.repository.deleteMany({ where: { id: testRepoId } });
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("C. formatContextString formats chunks and architecture metadata cleanly", () => {
    const mockChunks: SearchResult[] = [
      {
        id: "chunk-1",
        fileId: "file-1",
        filePath: "script.js",
        startLine: 10,
        endLine: 30,
        language: "JavaScript",
        chunkType: "function",
        symbolName: "themeToggler",
        content: "function themeToggler() { document.body.classList.toggle('dark'); }",
        similarity: 0.85,
        hybridScore: 0.88,
      },
    ];

    const mockMeta = {
      languages: ["JavaScript", "HTML"],
      frameworks: [],
      packageManagers: [],
      sourceFileCount: 2,
      importantDirectories: ["src"],
      entryPoints: [{ path: "index.html", reason: "Root file", confidence: 0.9 }],
    };

    const formatted = formatContextString(mockChunks, mockMeta, null, null);
    expect(formatted).toContain("=== REPOSITORY METADATA ===");
    expect(formatted).toContain("File: script.js");
    expect(formatted).toContain("Lines: 10–30");
    expect(formatted).toContain("themeToggler");
  });

  it(
    "J. Low-confidence / ungrounded feature query returns grounded refusal",
    async () => {
      // Setup a test repo in DB
      const repo = await db.repository.create({
        data: {
          url: `https://github.com/example/${marker}`,
          name: marker,
          owner: "example",
          defaultBranch: "main",
          status: "ANALYZED",
          totalFiles: 2,
          totalLines: 50,
        },
      });
      testRepoId = repo.id;

      // Ask about PostgreSQL authentication in a repository that doesn't have it
      const result = await processRagQuery(
        repo.id,
        "How does this repository implement a PostgreSQL authentication service?"
      );
      expect(result.isLowConfidence).toBe(true);
      // The answer should either contain the grounded refusal or a search-unavailable notice
      const hasRefusal = result.answer.includes("could not find sufficient implementation evidence");
      const hasSearchUnavailable = result.answer.includes("Semantic code search was temporarily unavailable");
      expect(hasRefusal || hasSearchUnavailable).toBe(true);
      expect(result.sources).toEqual([]);
    },
    120000
  );

  it(
    "H. Chat history persists messages in PostgreSQL ChatMessage model",
    async () => {
      expect(testRepoId).toBeDefined();
      if (!testRepoId) return;

      await db.chatMessage.create({
        data: {
          repositoryId: testRepoId,
          role: "user",
          content: "What does this repo do?",
        },
      });

      await db.chatMessage.create({
        data: {
          repositoryId: testRepoId,
          role: "assistant",
          content: "This repository is a test repository.",
          fileRefs: [{ file: "README.md", startLine: 1, endLine: 10, chunkId: "c1", score: 0.9 }] as any,
        },
      });

      const messages = await db.chatMessage.findMany({
        where: { repositoryId: testRepoId },
        orderBy: { createdAt: "asc" },
      });

      expect(messages.length).toBe(2);
      expect(messages[0].role).toBe("user");
      expect(messages[1].role).toBe("assistant");
      expect((messages[1].fileRefs as any)[0].file).toBe("README.md");
    },
    15000
  );

  it(
    "B, M. Handles missing repository ID gracefully",
    async () => {
      await expect(
        processRagQuery("00000000-0000-0000-0000-000000000000", "Hello?")
      ).rejects.toThrow("Repository not found.");
    },
    10000
  );

  it("Falls back to metadata-only RAG when semanticSearch (Voyage API/DB) fails", async () => {
    expect(testRepoId).toBeDefined();
    if (!testRepoId) return;

    vi.spyOn(searchModule, "semanticSearch").mockRejectedValueOnce(new Error("Voyage API rate limit exceeded"));
    vi.spyOn(geminiService, "generateGeminiResponse").mockResolvedValueOnce("Metadata-based answer");

    const result = await processRagQuery(testRepoId, "What does this project do?");

    // Should NOT reject — instead falls back gracefully
    expect(result.retrievedCount).toBe(0);
    expect(result.answer).toContain("Semantic code search was temporarily unavailable");
    // Should still call Gemini with metadata context
    expect(geminiService.generateGeminiResponse).toHaveBeenCalledTimes(1);
  });

  it("Handles zero-result retrieval as low confidence but STILL calls Gemini for metadata fallback", async () => {
    expect(testRepoId).toBeDefined();
    if (!testRepoId) return;

    vi.spyOn(searchModule, "semanticSearch").mockResolvedValueOnce([]);
    vi.spyOn(geminiService, "generateGeminiResponse").mockResolvedValueOnce("I analyzed the repository context, but could not find sufficient implementation evidence to answer your question.");

    const result = await processRagQuery(testRepoId, "What does this project do?");
    
    expect(result.isLowConfidence).toBe(true);
    expect(result.retrievedCount).toBe(0);
    expect(geminiService.generateGeminiResponse).toHaveBeenCalledTimes(1);
    expect(result.answer).toContain("could not find sufficient implementation evidence");
  });

  it("Handles successful semantic retrieval correctly based on similarity threshold", async () => {
    expect(testRepoId).toBeDefined();
    if (!testRepoId) return;

    const mockGoodChunks: SearchResult[] = [
      {
        id: "chunk-good",
        fileId: "file-1",
        filePath: "script.js",
        startLine: 1,
        endLine: 10,
        language: "JavaScript",
        chunkType: "file",
        symbolName: null,
        content: "console.log('hi');",
        similarity: 0.4,
        hybridScore: 0.45, // Above 0.35 threshold
      },
    ];

    vi.spyOn(searchModule, "semanticSearch").mockResolvedValueOnce(mockGoodChunks);
    vi.spyOn(geminiService, "generateGeminiResponse").mockResolvedValueOnce("It prints hi.");

    const result = await processRagQuery(testRepoId, "What does this project do?");
    
    expect(result.isLowConfidence).toBe(false);
    expect(result.retrievedCount).toBe(1);
    expect(geminiService.generateGeminiResponse).toHaveBeenCalledTimes(1);
    expect(result.answer).toBe("It prints hi.");
  });

  it("Sets low confidence if max score is below similarity threshold but STILL calls Gemini", async () => {
    expect(testRepoId).toBeDefined();
    if (!testRepoId) return;

    const mockBadChunks: SearchResult[] = [
      {
        id: "chunk-bad",
        fileId: "file-1",
        filePath: "script.js",
        startLine: 1,
        endLine: 10,
        language: "JavaScript",
        chunkType: "file",
        symbolName: null,
        content: "unrelated text",
        similarity: 0.1, 
        hybridScore: 0.1, // Below 0.35 threshold
      },
    ];

    vi.spyOn(searchModule, "semanticSearch").mockResolvedValueOnce(mockBadChunks);
    vi.spyOn(geminiService, "generateGeminiResponse").mockResolvedValueOnce("I analyzed the repository context, but could not find sufficient implementation evidence to answer your question.");

    const result = await processRagQuery(testRepoId, "What does this project do?");
    
    expect(result.isLowConfidence).toBe(true);
    expect(result.retrievedCount).toBe(1);
    expect(geminiService.generateGeminiResponse).toHaveBeenCalledTimes(1);
  });
});
