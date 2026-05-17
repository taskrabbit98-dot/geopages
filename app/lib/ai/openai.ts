import OpenAI from "openai";
import type { AIProvider, GenerationParams, PageContent } from "./provider";
import { buildSystemPrompt, parseAIResponse } from "./provider";

export class OpenAIProvider implements AIProvider {
  private client: OpenAI;
  private model: string;

  constructor(apiKey: string, model = "gpt-4o") {
    this.client = new OpenAI({ apiKey });
    this.model = model;
  }

  async generatePageContent(params: GenerationParams): Promise<PageContent> {
    const systemPrompt = buildSystemPrompt(params);

    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `Generate the page content for ${params.serviceName} in ${params.locationCity}, ${params.locationState}.`,
        },
      ],
      temperature: 0.8,
      max_tokens: 2000,
      response_format: { type: "json_object" },
    });

    const raw = response.choices[0]?.message?.content;
    if (!raw) throw new Error("OpenAI returned empty response");

    return parseAIResponse(raw);
  }

  estimateCost(params: GenerationParams): number {
    // gpt-4o pricing: ~$5 input / $15 output per 1M tokens
    // Estimate ~600 tokens input, ~1200 tokens output
    const inputCost = (600 / 1_000_000) * 5;
    const outputCost = (1200 / 1_000_000) * 15;
    return inputCost + outputCost;
  }
}
