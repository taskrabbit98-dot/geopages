// AI Provider interface and types

export interface GenerationParams {
  serviceName: string;
  locationName: string;
  locationCity: string;
  locationState: string;
  businessName: string;
  businessPhone: string;
  businessAddress: string;
  writingStyle?: "formal" | "conversational" | "direct";
  /**
   * How many times the exact serviceName phrase should appear in the body
   * content (intro + serviceDetails + localSection). Used to ensure enough
   * occurrences for inline trust-link anchors. Defaults to 5.
   */
  minServiceNameMentions?: number;
  /**
   * Real local context from Google Places API. The AI uses these as hard
   * facts to reference, instead of inventing neighborhoods and landmarks.
   */
  localContext?: {
    neighborhoods: string[];
    landmarks: string[];
    zipCodes: string[];
    cityFullName: string;
    county?: string;
  };
  /**
   * Long-tail keyword variations the AI should naturally weave in for
   * better topical coverage in search results.
   */
  keywordPhrases?: string[];
}

export interface PageOutline {
  mainAngle: string;
  uniqueValueProps: string[];
  faqTopics: string[];
  localReferences: string[];
}

export interface FAQItem {
  question: string;
  answer: string;
}

export interface PageContent {
  h1: string;
  metaTitle: string;
  metaDescription: string;
  intro: string;
  whyChooseUs: string[];
  serviceDetails: string;
  localSection: string;
  faq: FAQItem[];
  cta: string;
}

export interface AIProvider {
  generatePageContent(params: GenerationParams): Promise<PageContent>;
  estimateCost(params: GenerationParams): number;
}

export function buildSystemPrompt(params: GenerationParams): string {
  const styles = {
    formal: "Use a professional, authoritative tone.",
    conversational: "Use a friendly, approachable tone that feels like talking to a neighbor.",
    direct: "Use a concise, action-oriented tone. Short sentences. Get to the point.",
  };
  const styleNote = styles[params.writingStyle ?? "conversational"];
  const minMentions = params.minServiceNameMentions ?? 5;

  const lc = params.localContext;
  const localFactsBlock = lc && (lc.neighborhoods.length || lc.landmarks.length || lc.zipCodes.length)
    ? `\nREAL LOCAL FACTS (use these — do not invent others):
${lc.neighborhoods.length ? `- Neighborhoods: ${lc.neighborhoods.join(", ")}` : ""}
${lc.landmarks.length ? `- Landmarks/POIs: ${lc.landmarks.join(", ")}` : ""}
${lc.zipCodes.length ? `- ZIP codes: ${lc.zipCodes.join(", ")}` : ""}
${lc.county ? `- County: ${lc.county}` : ""}`
    : "";

  const keywordBlock = params.keywordPhrases && params.keywordPhrases.length
    ? `\nLONG-TAIL KEYWORDS (weave at least 3 of these naturally into the body):
${params.keywordPhrases.map((k) => `- "${k}"`).join("\n")}`
    : "";

  return `You are an expert local-SEO content writer. ${styleNote}

Write a UNIQUE, locally-specific page for this service business:

Service: ${params.serviceName}
Location: ${params.locationCity}, ${params.locationState}
Business Name: ${params.businessName}
Business Phone: ${params.businessPhone}
Business Address: ${params.businessAddress}
${localFactsBlock}
${keywordBlock}

STRUCTURE (return as JSON, no markdown):
{
  "h1": "Natural keyword-rich H1 (include service + location)",
  "metaTitle": "55-60 chars, includes service + city",
  "metaDescription": "150-160 chars, includes service + city + a compelling angle",
  "intro": "<p>2-3 paragraphs, 150-200 words. Reference at least one real neighborhood OR landmark from the facts above.</p>",
  "whyChooseUs": ["3-4 bullets, each specific to ${params.serviceName} — no generic 'experienced team' filler"],
  "serviceDetails": "<p>2-3 paragraphs explaining ${params.serviceName} in context. Mention ZIP code OR county from facts above.</p>",
  "localSection": "<p>1 paragraph referencing 2+ real neighborhoods or landmarks from facts above.</p>",
  "faq": [5 unique questions specific to ${params.serviceName} in ${params.locationCity}, with detailed 2-3 sentence answers],
  "cta": "<p>Short closing paragraph, 1-2 sentences.</p>"
}

HARD RULES:
1. Use the EXACT phrase "${params.serviceName}" verbatim ${minMentions}+ times in intro+serviceDetails+localSection body text (not in headings/FAQ/CTA).
2. Reference at least 2 of the real local facts (neighborhoods/landmarks/ZIPs) — no inventing places.
3. Minimum 600 words total across all sections.
4. NO filler phrases: ban "our experienced team", "top-notch service", "second to none", "state-of-the-art", "passionate about", "go above and beyond".
5. NO invented statistics or certifications. NO claims like "voted #1" or "award-winning" unless explicitly given.
6. Second person ("you", "your") to address the reader.
7. Each FAQ question must be DIFFERENT and specific — not generic questions like "How long have you been in business?".
8. Return ONLY valid JSON. No markdown fences, no commentary before or after.`;
}

/**
 * Smaller prompt for the outline pass — generates a strategy doc the
 * main generation prompt builds on. Cuts token use and improves
 * differentiation between pages.
 */
export function buildOutlinePrompt(params: GenerationParams): string {
  const lc = params.localContext;
  const local = lc && (lc.neighborhoods.length || lc.landmarks.length)
    ? `Real local data: neighborhoods=${lc.neighborhoods.slice(0, 3).join(",")}; landmarks=${lc.landmarks.slice(0, 3).join(",")}`
    : "";

  return `You are planning a unique SEO page for "${params.serviceName}" in "${params.locationCity}, ${params.locationState}".

${local}

Return JSON ONLY (no markdown):
{
  "mainAngle": "1-sentence unique angle for this page (e.g., 'fast emergency service for Brandon's older homes')",
  "uniqueValueProps": ["3 SHORT differentiators specific to this service + location combo"],
  "faqTopics": ["5 specific topics for FAQ — each must be unique and locally-relevant"],
  "localReferences": ["3 specific local references to weave in (neighborhood names, ZIP codes, landmarks)"]
}

Be SPECIFIC. Avoid generic angles like "quality service" — find a real reason this combo matters.`;
}

export function parseAIResponse(raw: string): PageContent {
  // Strip markdown code fences if present
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const parsed = JSON.parse(cleaned) as PageContent;

  // Validate required fields
  const required: (keyof PageContent)[] = [
    "h1", "metaTitle", "metaDescription", "intro",
    "whyChooseUs", "serviceDetails", "localSection", "faq", "cta",
  ];
  for (const field of required) {
    if (!parsed[field]) throw new Error(`Missing field: ${field}`);
  }
  if (!Array.isArray(parsed.faq) || parsed.faq.length < 5) {
    throw new Error("FAQ must have at least 5 items");
  }

  return parsed;
}
