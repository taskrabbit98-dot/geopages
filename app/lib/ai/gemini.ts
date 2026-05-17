import { GoogleGenerativeAI } from "@google/generative-ai";
import type { AIProvider, GenerationParams, PageContent } from "./provider";
import { buildSystemPrompt, parseAIResponse } from "./provider";

export class GeminiProvider implements AIProvider {
  private client: GoogleGenerativeAI;
  private modelName: string;

  constructor(apiKey: string, modelName = "gemini-1.5-pro") {
    this.client = new GoogleGenerativeAI(apiKey);
    this.modelName = modelName;
  }

  async generatePageContent(params: GenerationParams): Promise<PageContent> {
    const systemPrompt = buildSystemPrompt(params);
    const model = this.client.getGenerativeModel({
      model: this.modelName,
      generationConfig: {
        temperature: 0.8,
        maxOutputTokens: 2000,
        responseMimeType: "application/json",
      },
    });

    const prompt = `${systemPrompt}\n\nGenerate the page content for ${params.serviceName} in ${params.locationCity}, ${params.locationState}.`;

    const result = await model.generateContent(prompt);
    const raw = result.response.text();
    if (!raw) throw new Error("Gemini returned empty response");

    return parseAIResponse(raw);
  }

  estimateCost(params: GenerationParams): number {
    // Gemini 1.5 Pro: ~$3.50 input / $10.50 output per 1M tokens
    const inputCost = (600 / 1_000_000) * 3.5;
    const outputCost = (1200 / 1_000_000) * 10.5;
    return inputCost + outputCost;
  }
}
