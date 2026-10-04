import { GoogleGenerativeAI } from "@google/generative-ai";
import { geminiConfig, getCleanGeminiApiKey, hasGeminiApiKey, FALLBACK_MODELS, REPOSITORY_SYSTEM_INSTRUCTION } from "./gemini-config";

export interface ChatHistoryTurn {
  role: "user" | "model" | "assistant";
  content: string;
}

export class GeminiProviderError extends Error {
  constructor(message: string, public readonly status: number = 500) {
    super(message);
  }
}

export async function generateGeminiResponse(
  userPrompt: string,
  contextText: string,
  history: ChatHistoryTurn[] = []
): Promise<string> {
  const apiKey = getCleanGeminiApiKey();
  if (!apiKey) {
    throw new GeminiProviderError("GEMINI_API_KEY is not configured in environment.", 500);
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const formattedHistory = history
    .slice(-geminiConfig.maxHistoryTurns * 2)
    .map((h) => ({
      role: h.role === "assistant" ? "model" : h.role,
      parts: [{ text: h.content }],
    }));

  const fullUserContent = `=== REPOSITORY CONTEXT ===\n${contextText}\n\n=== USER QUESTION ===\n${userPrompt}`;

  let lastError: Error | null = null;
  // Try configured model first, followed by known fallbacks
  const modelsToTry = Array.from(new Set([geminiConfig.model, ...FALLBACK_MODELS]));

  for (const modelName of modelsToTry) {
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        systemInstruction: REPOSITORY_SYSTEM_INSTRUCTION,
        generationConfig: {
          temperature: geminiConfig.temperature,
          maxOutputTokens: geminiConfig.maxOutputTokens,
          topP: geminiConfig.topP,
        },
      });

      const chat = model.startChat({ history: formattedHistory });
      const response = await chat.sendMessage(fullUserContent);
      const text = response.response.text();
      if (text?.trim()) {
        return text.trim();
      }
    } catch (err: any) {
      lastError = err;
      const msg = err.message || "";
      // If error is project/auth level (401, 403, invalid key), break immediately to avoid wasting time
      if (msg.includes("401") || msg.includes("403") || msg.includes("API_KEY_INVALID") || msg.includes("denied access")) {
        break;
      }
      // If error is 404 (model deprecated or not found), try next fallback model
      if (msg.includes("404") || msg.includes("is not found") || msg.includes("no longer available")) {
        continue;
      }
      break;
    }
  }

  const msg = lastError?.message || "Failed to generate AI response from Gemini.";
  throw new GeminiProviderError(`Gemini Generation Error: ${msg}`, 500);
}
