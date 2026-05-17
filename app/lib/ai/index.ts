import type { AIProvider, GenerationParams } from "./provider";
import { OpenAIProvider } from "./openai";
import { GeminiProvider } from "./gemini";

export function createAIProvider(
  model: string,
  openaiKey?: string | null,
  geminiKey?: string | null
): AIProvider {
  switch (model) {
    case "gemini":
      if (!geminiKey) throw new Error("Gemini API key not configured");
      return new GeminiProvider(geminiKey);
    case "openai":
    default:
      if (!openaiKey) throw new Error("OpenAI API key not configured");
      return new OpenAIProvider(openaiKey);
  }
}

export type { AIProvider, GenerationParams };
export { OpenAIProvider } from "./openai";
export { GeminiProvider } from "./gemini";
