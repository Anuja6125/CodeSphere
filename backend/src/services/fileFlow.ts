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

export function generateDeterministicFileFlow(filePath: string, code: string): { nodes: FlowNode[]; edges: FlowEdge[] } {
  const nodes: FlowNode[] = [];
  const edges: FlowEdge[] = [];
  let nodeId = 1;

  // 1. Entry / File Node
  const fileId = String(nodeId++);
  nodes.push({
    id: fileId,
    label: filePath.split("/").pop() || filePath,
    type: "endpoint",
    desc: `File module (${filePath})`,
    explanation: "Main entry point for this file module.",
  });

  // 2. Identify top imports/dependencies
  const importMatches = code.matchAll(/(?:import\s+(?:[\w*\s{},]+)\s+from\s+['"]([^'"]+)['"]|require\(['"]([^'"]+)['"]\))/g);
  let importCount = 0;
  for (const m of importMatches) {
    if (importCount >= 4) break;
    const dep = m[1] || m[2];
    const isDb = /db|mongo|prisma|sql|model/i.test(dep);
    const id = String(nodeId++);
    nodes.push({
      id,
      label: dep.split("/").pop() || dep,
      type: isDb ? "database" : "logic",
      desc: `Imported dependency: ${dep}`,
      explanation: `Provides supporting ${isDb ? "database/data persistence" : "utility or module"} functionality.`,
    });
    edges.push({ source: fileId, target: id, label: "imports" });
    importCount++;
  }

  // 3. Identify functions and methods
  const fnMatches = code.matchAll(/(?:function\s+([a-zA-Z0-9_$]+)|const\s+([a-zA-Z0-9_$]+)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>|([a-zA-Z0-9_$]+)\s*\([^)]*\)\s*\{)/g);
  let prevFnId: string | null = null;
  let fnCount = 0;
  for (const m of fnMatches) {
    if (fnCount >= 6) break;
    const name = m[1] || m[2] || m[3];
    if (!name || name === "if" || name === "for" || name === "while" || name === "switch" || name === "catch") continue;
    const id = String(nodeId++);
    const isHandler = /handle|get|post|put|delete|fetch|load|render|submit/i.test(name);
    nodes.push({
      id,
      label: `${name}()`,
      type: isHandler ? "endpoint" : "logic",
      desc: `Execution routine: ${name}`,
      explanation: `Executes business logic or routine for ${name}.`,
    });

    edges.push({ source: fileId, target: id, label: "defines" });
    if (prevFnId) {
      edges.push({ source: prevFnId, target: id, label: "calls / next" });
    }
    prevFnId = id;
    fnCount++;
  }

  // If no functions found, create general execution blocks
  if (nodes.length === 1) {
    const execId = String(nodeId++);
    nodes.push({
      id: execId,
      label: "Module Execution",
      type: "logic",
      desc: "Top-level module instructions",
      explanation: "Evaluates module declarations and configuration.",
    });
    edges.push({ source: fileId, target: execId, label: "executes" });
  }

  return { nodes, edges };
}

export async function buildFileFlow(repositoryId: string, filePath: string) {
  const file = await getFileContent(repositoryId, filePath);
  if (!file.content?.trim()) throw new HttpError(422, "This file has no readable content.");

  const apiKey = (await import("../lib/ai/gemini-config")).getCleanGeminiApiKey();
  if (apiKey) {
    try {
      const { geminiConfig, FALLBACK_MODELS } = await import("../lib/ai/gemini-config");
      const genAI = new GoogleGenerativeAI(apiKey);
      const modelsToTry = Array.from(new Set([geminiConfig.model, ...FALLBACK_MODELS]));
      for (const m of modelsToTry) {
        try {
          const model = genAI.getGenerativeModel({
            model: m,
            generationConfig: { temperature: 0.2, maxOutputTokens: 4096, responseMimeType: "application/json" },
          });
          const result = await model.generateContent(flowPrompt(file.content.slice(0, MAX_CODE_CHARS), file.language));
          return { path: file.path, truncated: file.content.length > MAX_CODE_CHARS, ...parseFlowJson(result.response.text()) };
        } catch (err: any) {
          const msg = err.message || "";
          if (msg.includes("401") || msg.includes("403") || msg.includes("API_KEY_INVALID") || msg.includes("denied access")) {
            break;
          }
          if (msg.includes("404") || msg.includes("is not found") || msg.includes("no longer available")) {
            continue;
          }
          break;
        }
      }
    } catch (e) {
      console.warn(`[fileFlow] Cloud AI flow generation failed for ${filePath}, using deterministic flow:`, e);
    }
  }

  // Fallback to deterministic flow
  return {
    path: file.path,
    truncated: file.content.length > MAX_CODE_CHARS,
    ...generateDeterministicFileFlow(file.path, file.content),
  };
}
