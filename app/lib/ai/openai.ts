import OpenAI from "openai";
import type { AIProvider, GenerationParams, PageContent, PageOutline } from "./provider";
import { buildSystemPrompt, buildOutlinePrompt, parseAIResponse } from "./provider";

export class OpenAIProvider implements AIProvider {
  private client: OpenAI;
  private model: string;

  constructor(apiKey: string, model = "gpt-4o") {
    this.client = new OpenAI({ apiKey });
    this.model = model;
  }

  /**
   * Two-pass generation:
   *   1. Cheap outline pass: AI plans a unique angle and concrete local references
   *      (300-500 output tokens, prevents every page from feeling templated)
   *   2. Content pass: full page generated with the outline injected as user message
   *      (1500-2000 output tokens, follows the planned structure)
   */
  async generatePageContent(params: GenerationParams): Promise<PageContent> {
    const outline = await this.generateOutline(params).catch((err) => {
      console.warn("[ai] outline pass failed, falling back to single pass:", err.message);
      return null;
    });

    const systemPrompt = buildSystemPrompt(params);
    const userMessage = outline
      ? buildContentPromptWithOutline(params, outline)
      : `Generate the page content for ${params.serviceName} in ${params.locationCity}, ${params.locationState}.`;

    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      temperature: 0.8,
      max_tokens: 2200,
      response_format: { type: "json_object" },
    });

    const raw = response.choices[0]?.message?.content;
    if (!raw) throw new Error("OpenAI returned empty response");

    return parseAIResponse(raw);
  }

  private async generateOutline(params: GenerationParams): Promise<PageOutline> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: "system", content: buildOutlinePrompt(params) },
        {
          role: "user",
          content: `Plan the page for ${params.serviceName} in ${params.locationCity}, ${params.locationState}.`,
        },
      ],
      temperature: 0.9,
      max_tokens: 600,
      response_format: { type: "json_object" },
    });

    const raw = response.choices[0]?.message?.content;
    if (!raw) throw new Error("OpenAI returned empty outline");
    return JSON.parse(raw) as PageOutline;
  }

  estimateCost(params: GenerationParams): number {
    // Two-pass: ~600+400 input tokens, ~500+1500 output tokens
    const inputCost = (1000 / 1_000_000) * 5;
    const outputCost = (2000 / 1_000_000) * 15;
    return inputCost + outputCost;
  }
}

function buildContentPromptWithOutline(params: GenerationParams, outline: PageOutline): string {
  return `Generate the page for ${params.serviceName} in ${params.locationCity}, ${params.locationState} following this outline:

Unique angle: ${outline.mainAngle}
Value propositions to weave in: ${outline.uniqueValueProps.join("; ")}
FAQ topics (use these exact angles): ${outline.faqTopics.join("; ")}
Local references to include: ${outline.localReferences.join("; ")}

Follow the outline closely so this page is differentiated from other pages for the same service in other cities.`;
}
