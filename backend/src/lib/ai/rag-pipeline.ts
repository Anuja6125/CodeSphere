import { db } from "@/lib/db";
import { semanticSearch, SearchResult } from "@/lib/embeddings/search";
import { geminiConfig } from "./gemini-config";
import { generateGeminiResponse, ChatHistoryTurn } from "./gemini-service";

export interface SourceCitation {
  file: string;
  startLine: number;
  endLine: number;
  chunkId: string;
  score: number;
  symbolName?: string | null;
  chunkType?: string;
}

export interface RagPipelineResult {
  answer: string;
  sources: SourceCitation[];
  isLowConfidence: boolean;
  retrievedCount: number;
}

export function formatContextString(
  chunks: SearchResult[],
  analysisMetadata: any | null,
  techStack: any | null,
  readmeContent: string | null,
  extraContext: string | null = null
): string {
  const parts: string[] = [];

  if (techStack || analysisMetadata) {
    parts.push("=== REPOSITORY METADATA ===");
    if (techStack) {
      parts.push(`Tech Stack: ${JSON.stringify(techStack)}`);
    }
    if (analysisMetadata) {
      parts.push(`Languages: ${JSON.stringify(analysisMetadata.languages)}`);
      parts.push(`Frameworks: ${JSON.stringify(analysisMetadata.frameworks)}`);
      parts.push(`Package Managers: ${JSON.stringify(analysisMetadata.packageManagers)}`);
      parts.push(`Source File Count: ${analysisMetadata.sourceFileCount}`);
      parts.push(`Important Directories: ${JSON.stringify(analysisMetadata.importantDirectories)}`);
      parts.push(`Entry Points: ${JSON.stringify(analysisMetadata.entryPoints)}`);
    }
    parts.push("");
  }

  if (extraContext) {
    parts.push(extraContext);
    parts.push("");
  }

  if (readmeContent) {
    parts.push("=== README / DOCUMENTATION ===");
    parts.push(readmeContent.substring(0, 3000)); // Limit README length
    parts.push("");
  }

  parts.push("=== RETRIEVED CODE CHUNKS ===");
  if (chunks.length === 0) {
    parts.push("No relevant code chunks retrieved.");
  } else {
    chunks.forEach((chunk, idx) => {
      parts.push(`[Source ${idx + 1}]`);
      parts.push(`File: ${chunk.filePath}`);
      parts.push(`Lines: ${chunk.startLine}–${chunk.endLine}`);
      parts.push(`Type: ${chunk.chunkType}${chunk.symbolName ? ` (${chunk.symbolName})` : ""}`);
      parts.push(`Language: ${chunk.language || "Unknown"}`);
      parts.push("Content:");
      parts.push("```");
      parts.push(chunk.content);
      parts.push("```");
      parts.push("");
    });
  }

  return parts.join("\n");
}

export async function processRagQuery(
  repositoryId: string,
  userMessage: string,
  history: ChatHistoryTurn[] = []
): Promise<RagPipelineResult> {
  const repository = await db.repository.findUnique({
    where: { id: repositoryId },
    select: { id: true, name: true, owner: true, status: true, techStack: true },
  });

  if (!repository) {
    throw Object.assign(new Error("Repository not found."), { status: 404 });
  }

  // 1. Perform Voyage query embedding + pgvector similarity search
  let retrievedChunks: SearchResult[] = [];
  let searchUnavailable = false;
  try {
    retrievedChunks = await semanticSearch(
      repositoryId,
      userMessage,
      geminiConfig.maxContextChunks
    );
  } catch (err: any) {
    // Log the error but don't fail — fall back to metadata-only context
    console.warn("Semantic search unavailable, falling back to metadata-only RAG:", err.message);
    searchUnavailable = true;
  }

  // 2. Fetch architecture metadata for high-level questions
  const analysisMetadata = await db.repositoryAnalysis.findUnique({
    where: { repositoryId },
  });

  // 2b. Fetch README content
  const readmeFile = await db.repoFile.findFirst({
    where: {
      repositoryId,
      name: { in: ["README.md", "readme.md", "README", "README.txt"] },
    },
    select: { content: true },
  });

  // 2c. Check for Change Impact or Health/Architecture intelligence intent
  let extraIntelligenceContext: string | null = null;
  const lowerMsg = userMessage.toLowerCase();

  try {
    if (/\b(change|modify|replace|break|affect|impact|blast radius)\b/i.test(lowerMsg)) {
      // Find candidate file mentioned in the user message
      const allFiles = await db.repoFile.findMany({
        where: { repositoryId, isExcluded: false },
        select: { id: true, path: true, name: true, extension: true, size: true, linesCount: true, language: true, category: true, isSensitive: true },
      });

      const matchedFile = allFiles.find((f) => lowerMsg.includes(f.path.toLowerCase()) || lowerMsg.includes(f.name.toLowerCase()));
      if (matchedFile) {
        const { analyzeChangeImpact } = await import("@/lib/impact/analyzer");
        const deps = await db.fileDependency.findMany({
          where: { repositoryId },
          include: {
            fromFile: { select: { path: true, isSensitive: true } },
            toFile: { select: { path: true } },
          },
        });
        const validDeps = deps
          .filter((d) => !d.fromFile.isSensitive)
          .map((d) => ({
            id: d.id,
            fromPath: d.fromFile.path,
            toPath: d.toFile?.path || null,
            toSpecifier: d.toSpecifier,
            kind: d.kind,
          }));

        const impact = analyzeChangeImpact(
          { type: "file", path: matchedFile.path },
          allFiles,
          validDeps,
          (analysisMetadata?.entryPoints as any[]) || []
        );

        extraIntelligenceContext = `=== DETERMINISTIC CHANGE IMPACT EVIDENCE ===
Target File: ${impact.target.path}
Risk Level: ${impact.riskLevel.toUpperCase()}
Direct Dependents (Files importing target): ${impact.directDependents.map((d) => d.path).join(", ") || "None"}
Transitive Dependents: ${impact.transitiveDependents.map((d) => d.path).join(", ") || "None"}
Affected Entry Points: ${impact.affectedEntryPoints.map((e) => e.path).join(", ") || "None"}
Related Tests: ${impact.relatedTests.map((t) => t.path).join(", ") || "None"}
Risk Factors: ${impact.riskReasons.join("; ")}`;
      }
    } else if (/\b(hotspot|health|circular|large file|risk|maintainability|quality)\b/i.test(lowerMsg)) {
      const { calculateRepositoryHealth } = await import("@/lib/health/calculator");
      const files = await db.repoFile.findMany({
        where: { repositoryId, isExcluded: false },
        select: { id: true, path: true, name: true, extension: true, size: true, linesCount: true, content: true, category: true, isSensitive: true },
      });
      const deps = await db.fileDependency.findMany({
        where: { repositoryId },
        include: {
          fromFile: { select: { path: true, isSensitive: true } },
          toFile: { select: { path: true } },
        },
      });
      const validDeps = deps
        .filter((d) => !d.fromFile.isSensitive)
        .map((d) => ({
          id: d.id,
          fromPath: d.fromFile.path,
          toPath: d.toFile?.path || null,
          toSpecifier: d.toSpecifier,
          kind: d.kind,
        }));

      const health = calculateRepositoryHealth(files, validDeps, [], (analysisMetadata?.entryPoints as any[]) || []);
      const topHotspots = health.hotspots.slice(0, 5).map((h) => `${h.path} (${h.signalType}: ${h.evidence})`).join("\n- ");

      extraIntelligenceContext = `=== REPOSITORY CODE HEALTH & HOTSPOT EVIDENCE ===
Median Lines Per File: ${health.summary.medianLinesPerFile}
Median Imports Per File: ${health.summary.medianImportsPerFile}
Total Test Files: ${health.summary.testFilesDetected}
Security Signals: ${health.summary.securityFindingsCount}
Hotspots:
- ${topHotspots || "None detected"}`;
    }
  } catch {
    // Non-critical background intelligence enrichment failure; proceed with standard RAG
  }

  // 3. Evaluate retrieval confidence
  const maxScore = retrievedChunks.length > 0 ? Math.max(...retrievedChunks.map((c) => c.hybridScore)) : 0;
  const isLowConfidence = (retrievedChunks.length === 0 || maxScore < geminiConfig.similarityThreshold) && !extraIntelligenceContext;

  // 4. Extract citations for UI grounding
  const sources: SourceCitation[] = retrievedChunks
    .filter((c) => c.hybridScore >= geminiConfig.similarityThreshold - 0.2)
    .map((c) => ({
      file: c.filePath,
      startLine: c.startLine,
      endLine: c.endLine,
      chunkId: c.id,
      score: Math.round(c.hybridScore * 10000) / 10000,
      symbolName: c.symbolName,
      chunkType: c.chunkType,
    }));

  // 5. Build bounded RAG prompt context and query Gemini (or fall back to local engine)
  const filteredChunks = retrievedChunks.filter((c) => c.hybridScore >= geminiConfig.similarityThreshold - 0.2);
  const contextChunks = filteredChunks.length > 0 ? filteredChunks : retrievedChunks.slice(0, 4);

  const contextString = formatContextString(
    contextChunks,
    analysisMetadata,
    repository.techStack,
    readmeFile?.content || null,
    extraIntelligenceContext
  );

  let answer: string;
  try {
    answer = await generateGeminiResponse(userMessage, contextString, history);
  } catch (geminiError: any) {
    console.warn(`[rag] Cloud LLM unavailable (${geminiError?.message || "error"}), generating local RAG answer.`);
    const { generateLocalRagAnswer } = await import("./local-rag");
    answer = generateLocalRagAnswer(
      userMessage,
      {
        repoName: repository.name,
        owner: repository.owner,
        techStack: repository.techStack,
        analysis: analysisMetadata,
        readme: readmeFile?.content || null,
        extraContext: extraIntelligenceContext,
      },
      contextChunks
    );
  }

  return {
    answer,
    sources: sources.slice(0, 8),
    isLowConfidence,
    retrievedCount: retrievedChunks.length,
  };
}
