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

  return `You are an expert SEO content writer. ${styleNote}

Write a complete, unique, high-quality page for a local service business. The page is for:

Service: ${params.serviceName}
Location: ${params.locationCity}, ${params.locationState}
Business Name: ${params.businessName}
Business Phone: ${params.businessPhone}
Business Address: ${params.businessAddress}

REQUIREMENTS:
1. H1: A natural, keyword-rich heading (include service + location)
2. Introduction: 2-3 paragraphs, 150-200 words total. Mention the location naturally.
3. Why Choose Us: 3-4 bullet points specific to this service
4. Service Details: 2-3 paragraphs explaining the service in this location context
5. Local Area Section: 1 paragraph mentioning local context (neighborhoods, landmarks)
6. FAQ: Exactly 5 questions and detailed answers relevant to this service + location
7. Call to Action: One short paragraph ending the page

RULES:
- Never copy content from another page. Each page must be unique.
- Write naturally — avoid keyword stuffing
- Use second person ("you", "your") to address the reader
- Do not invent statistics or certifications
- Minimum 600 words total
- Return as structured JSON matching the schema below

Return ONLY valid JSON, no markdown, no explanation:
{
  "h1": "string",
  "metaTitle": "string (55-60 chars)",
  "metaDescription": "string (150-160 chars)",
  "intro": "string (HTML paragraphs)",
  "whyChooseUs": ["string", "string", "string"],
  "serviceDetails": "string (HTML paragraphs)",
  "localSection": "string (HTML paragraph)",
  "faq": [
    {"question": "string", "answer": "string"},
    {"question": "string", "answer": "string"},
    {"question": "string", "answer": "string"},
    {"question": "string", "answer": "string"},
    {"question": "string", "answer": "string"}
  ],
  "cta": "string (HTML paragraph)"
}`;
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
