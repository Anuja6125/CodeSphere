import { GoogleGenerativeAI } from "@google/generative-ai";
import { db } from "../lib/db";
import { geminiConfig, hasGeminiApiKey } from "../lib/ai/gemini-config";
import { HttpError } from "./errors";

export type FlowNode = { id: string; label: string; type: string; desc: string; explanation: string };
export type FlowEdge = { source: string; target: string; label?: string };

const MAX_CODE_CHARS = 20_000;

// Prompt from the mindmap visualizer (mindmap/backend/main.py → /api/visualize).
const flowPrompt = (code: string, language: string | null) => `
You are an expert software architect. Analyze this${language ? ` (${language})` : ""} code regardless of language.
Identify:
1. Entry Points
2. Logical Branches (If/Else, Loops)
3. Data Flow and API Calls
4. Final Outputs

Code to analyze:
\`\`\`
${code}
\`\`\`

Return ONLY a valid JSON object matching this structure EXACTLY. No markdown, no extra text:
{
  "nodes": [
    { "id": "1", "label": "Short Function Name or Concept", "type": "endpoint|logic|database",
      "desc": "A brief tech summary", "explanation": "A simple, beginner-friendly explanation." }
  ],
  "edges": [ { "source": "1", "target": "2", "label": "Data passing or branch type" } ]
}`;

/** Pull the JSON object out of an LLM reply, even if it wrapped it in ``` fences. */
export function parseFlowJson(raw: string): { nodes: FlowNode[]; edges: FlowEdge[] } {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new HttpError(502, "The AI did not return a flow diagram.");
  let parsed: { nodes?: unknown; edges?: unknown };
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    throw new HttpError(502, "The AI returned an invalid flow diagram. Try again.");
  }
  const nodes = (Array.isArray(parsed.nodes) ? parsed.nodes : [])
    .filter((n): n is Record<string, unknown> => !!n && typeof n === "object" && "id" in n)
    .map((n) => ({
      id: String(n.id),
      label: String(n.label ?? n.id),
      type: String(n.type ?? "logic"),
      desc: String(n.desc ?? ""),
      explanation: String(n.explanation ?? ""),
    }));
  const ids = new Set(nodes.map((n) => n.id));
  const edges = (Array.isArray(parsed.edges) ? parsed.edges : [])
    .filter((e): e is Record<string, unknown> => !!e && typeof e === "object")
    .map((e) => ({ source: String(e.source), target: String(e.target), label: e.label ? String(e.label) : undefined }))
    .filter((e) => ids.has(e.source) && ids.has(e.target));
  if (nodes.length === 0) throw new HttpError(502, "The AI returned an empty flow diagram.");
  return { nodes, edges };
}

export async function getFileContent(repositoryId: string, filePath: string) {
  if (!filePath) throw new HttpError(400, "File path is required.");
  const file = await db.repoFile.findUnique({
    where: { repositoryId_path: { repositoryId, path: filePath } },
    select: { path: true, content: true, language: true, linesCount: true, size: true },
  });
  if (!file) throw new HttpError(404, "File not found in this repository.");
  return file;
}

export async function buildFileFlow(repositoryId: string, filePath: string) {
  const file = await getFileContent(repositoryId, filePath);
  if (!file.content?.trim()) throw new HttpError(422, "This file has no readable content.");
  if (!hasGeminiApiKey()) throw new HttpError(503, "GEMINI_API_KEY is not configured on the server.");

  const model = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!).getGenerativeModel({
    model: geminiConfig.model,
    generationConfig: { temperature: 0.2, maxOutputTokens: 4096, responseMimeType: "application/json" },
  });
  const result = await model.generateContent(flowPrompt(file.content.slice(0, MAX_CODE_CHARS), file.language));
  return { path: file.path, truncated: file.content.length > MAX_CODE_CHARS, ...parseFlowJson(result.response.text()) };
}
