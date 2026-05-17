import { JSDOM } from "jsdom";
import DOMPurify from "dompurify";
import type { PageContent } from "~/lib/ai/provider";
import type { DirectoryLink } from "@prisma/client";
import { buildSchemaJson } from "./schema";

const window = new JSDOM("").window;
const purify = DOMPurify(window as unknown as Window & typeof globalThis);

interface AssembleParams {
  content: PageContent;
  serviceName: string;
  locationName: string;
  locationCity: string;
  locationState: string;
  businessName: string;
  businessPhone: string;
  businessAddress: string;
  shopUrl: string;
  slug: string;
  imageUrl?: string | null;
  mapEmbedUrl?: string | null;
  directoryLinks: Pick<DirectoryLink, "url" | "anchorText" | "platform">[];
  relatedPages: { title: string; slug: string }[];
}

/**
 * Sanitizes HTML produced by AI to prevent XSS before storing in Shopify.
 */
function sanitize(html: string): string {
  return purify.sanitize(html, {
    ALLOWED_TAGS: ["p", "br", "strong", "em", "ul", "ol", "li", "h2", "h3", "a", "span"],
    ALLOWED_ATTR: ["href", "target", "rel", "class"],
  });
}

/**
 * Assembles the full page body HTML from AI content + template variables.
 */
export function assemblePageHtml(params: AssembleParams): string {
  const {
    content,
    serviceName,
    locationName,
    locationCity,
    locationState,
    businessName,
    businessPhone,
    businessAddress,
    shopUrl,
    slug,
    imageUrl,
    mapEmbedUrl,
    directoryLinks,
    relatedPages,
  } = params;

  const schema = buildSchemaJson({
    businessName,
    businessPhone,
    businessAddress,
    serviceName,
    locationName,
    locationCity,
    locationState,
    shopUrl,
    slug,
    faq: content.faq,
  });

  const whyList = content.whyChooseUs
    .map((item) => `<li>${sanitize(item)}</li>`)
    .join("\n      ");

  const faqHtml = content.faq
    .map(
      (item) => `
    <details class="pseo-faq-item">
      <summary><h3>${sanitize(item.question)}</h3></summary>
      <p>${sanitize(item.answer)}</p>
    </details>`
    )
    .join("\n");

  const dirLinksHtml =
    directoryLinks.length > 0
      ? directoryLinks
          .map(
            (l) =>
              `<li><a href="${l.url}" target="_blank" rel="noopener noreferrer">${l.anchorText}</a></li>`
          )
          .join("\n      ")
      : '<li>No directory links added yet. Add them in the Services manager.</li>';

  const relatedHtml =
    relatedPages.length > 0
      ? relatedPages
          .map(
            (p) =>
              `<li><a href="/pages/${p.slug}">${p.title}</a></li>`
          )
          .join("\n      ")
      : "";

  const mapSection = mapEmbedUrl
    ? `
  <div class="pseo-map">
    <h2>Serving ${locationName}</h2>
    <iframe
      src="${mapEmbedUrl}"
      width="600"
      height="300"
      style="border:0;max-width:100%;"
      allowfullscreen=""
      loading="lazy"
      referrerpolicy="no-referrer-when-downgrade"
      title="Map of ${locationName}">
    </iframe>
  </div>`
    : `
  <div class="pseo-map">
    <h2>Serving ${locationName}</h2>
    <p><a href="https://maps.google.com/?q=${encodeURIComponent(locationCity + " " + locationState)}" target="_blank" rel="noopener noreferrer">View ${locationName} on Google Maps</a></p>
  </div>`;

  const imageSection = imageUrl
    ? `
  <div class="pseo-image">
    <img
      src="${imageUrl}"
      alt="${serviceName} in ${locationName}"
      width="800"
      height="400"
      loading="lazy"
    />
  </div>`
    : "";

  const relatedSection = relatedPages.length > 0
    ? `
  <div class="pseo-related">
    <h2>${serviceName} in Other Areas</h2>
    <ul>
      ${relatedHtml}
    </ul>
  </div>`
    : "";

  return `<script type="application/ld+json">
${JSON.stringify(schema, null, 2)}
</script>

<div class="pseo-page" data-pseo-page="true">

  <h1>${sanitize(content.h1)}</h1>

  <div class="pseo-intro">
    ${sanitize(content.intro)}
  </div>

  <div class="pseo-why">
    <h2>Why Choose Us for ${serviceName} in ${locationName}</h2>
    <ul>
      ${whyList}
    </ul>
  </div>

  <div class="pseo-details">
    <h2>About Our ${serviceName} Service</h2>
    ${sanitize(content.serviceDetails)}
  </div>

  ${mapSection}

  <div class="pseo-local">
    ${sanitize(content.localSection)}
  </div>

  ${imageSection}

  <div class="pseo-directories">
    <h2>Find ${businessName} on the Web</h2>
    <p>Verify our ${serviceName} credentials and read reviews:</p>
    <ul>
      ${dirLinksHtml}
    </ul>
  </div>

  <div class="pseo-faq">
    <h2>Frequently Asked Questions — ${serviceName} in ${locationName}</h2>
    ${faqHtml}
  </div>

  <div class="pseo-cta">
    ${sanitize(content.cta)}
    <a href="/contact" class="pseo-cta-button">Get a Free Quote</a>
  </div>

  ${relatedSection}

</div>`;
}

/**
 * Calculates a quality score 0-100 for a generated page.
 */
export function calculateQualityScore(params: {
  bodyHtml: string;
  faqCount: number;
  directoryLinksCount: number;
  hasImage: boolean;
  hasMap: boolean;
  serviceName: string;
  locationName: string;
}): number {
  let score = 0;
  const text = params.bodyHtml.replace(/<[^>]+>/g, " ").toLowerCase();
  const words = text.split(/\s+/).filter(Boolean);

  // Word count (up to 30 pts)
  if (words.length >= 700) score += 30;
  else if (words.length >= 500) score += 20;
  else if (words.length >= 300) score += 10;

  // Keyword density — service + location (up to 20 pts each)
  const svcMentions = (text.match(new RegExp(params.serviceName.toLowerCase(), "g")) || []).length;
  const locMentions = (text.match(new RegExp(params.locationName.toLowerCase(), "g")) || []).length;
  score += Math.min(20, svcMentions * 4);
  score += Math.min(20, locMentions * 4);

  // FAQ count (up to 10 pts)
  if (params.faqCount >= 5) score += 10;
  else score += params.faqCount * 2;

  // Directory links (up to 10 pts)
  if (params.directoryLinksCount >= 5) score += 10;
  else score += params.directoryLinksCount * 2;

  // Image (5 pts)
  if (params.hasImage) score += 5;

  // Map (5 pts)
  if (params.hasMap) score += 5;

  return Math.min(100, score);
}
