import { GoogleGenerativeAI } from "@google/generative-ai";
import { geminiConfig, hasGeminiApiKey, REPOSITORY_SYSTEM_INSTRUCTION } from "./gemini-config";

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
  if (!hasGeminiApiKey()) {
    throw new GeminiProviderError("GEMINI_API_KEY is not configured in environment.", 500);
  }

  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
    const model = genAI.getGenerativeModel({
      model: geminiConfig.model,
      systemInstruction: REPOSITORY_SYSTEM_INSTRUCTION,
      generationConfig: {
        temperature: geminiConfig.temperature,
        maxOutputTokens: geminiConfig.maxOutputTokens,
        topP: geminiConfig.topP,
      },
    });

    const formattedHistory = history
      .slice(-geminiConfig.maxHistoryTurns * 2)
      .map((h) => ({
        role: h.role === "assistant" ? "model" : h.role,
        parts: [{ text: h.content }],
      }));

    const fullUserContent = `=== REPOSITORY CONTEXT ===\n${contextText}\n\n=== USER QUESTION ===\n${userPrompt}`;

    const chat = model.startChat({
      history: formattedHistory,
    });

    const response = await chat.sendMessage(fullUserContent);
    const text = response.response.text();
    if (!text) {
      throw new GeminiProviderError("Empty response received from Gemini model.", 500);
    }

    return text;
  } catch (err: any) {
    if (err instanceof GeminiProviderError) throw err;
    const msg = err.message || "Failed to generate AI response from Gemini.";
    throw new GeminiProviderError(`Gemini Generation Error: ${msg}`, 500);
  }
}
