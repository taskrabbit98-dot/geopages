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
  directoryLinks: Pick<DirectoryLink, "url" | "platform">[];
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
 * Walks the page HTML and wraps occurrences of the service name with anchor
 * tags pointing at the merchant's directory profile URLs. One occurrence per
 * link, in document order. Skips text that is already inside an anchor or
 * inside a heading, so we don't pollute h1/h2/h3 with links.
 *
 * Result: a paragraph that mentions "retatrutide" 5 times will get 5 different
 * anchors (yelp, bbb, google maps, etc.) — each linking the same service name
 * to a different trust URL.
 */
export function embedTrustLinks(
  html: string,
  serviceName: string,
  links: Pick<DirectoryLink, "url" | "platform">[],
): string {
  if (!links || links.length === 0 || !serviceName) return html;

  const dom = new JSDOM(`<!DOCTYPE html><body>${html}</body>`);
  const doc = dom.window.document;
  const target = serviceName.toLowerCase();

  let linkIndex = 0;

  function isInsideSkippableAncestor(node: Node): boolean {
    let p: Node | null = node.parentNode;
    while (p && (p as Element).tagName) {
      const tag = (p as Element).tagName.toLowerCase();
      if (
        tag === "a" ||
        tag === "script" ||
        tag === "style" ||
        tag === "noscript" ||
        /^h[1-6]$/.test(tag)
      )
        return true;
      p = p.parentNode;
    }
    return false;
  }

  function processTextNode(node: Text): void {
    if (linkIndex >= links.length) return;
    if (isInsideSkippableAncestor(node)) return;

    const text = node.textContent || "";
    const lower = text.toLowerCase();
    const idx = lower.indexOf(target);
    if (idx === -1) return;

    const before = text.substring(0, idx);
    const match = text.substring(idx, idx + serviceName.length);
    const after = text.substring(idx + serviceName.length);

    const fragment = doc.createDocumentFragment();
    if (before) fragment.appendChild(doc.createTextNode(before));

    const anchor = doc.createElement("a");
    anchor.setAttribute("href", links[linkIndex].url);
    anchor.setAttribute("target", "_blank");
    anchor.setAttribute("rel", "noopener noreferrer nofollow");
    anchor.textContent = match;
    fragment.appendChild(anchor);

    linkIndex++;

    let afterNode: Text | null = null;
    if (after) {
      afterNode = doc.createTextNode(after);
      fragment.appendChild(afterNode);
    }

    node.parentNode!.replaceChild(fragment, node);

    // Continue scanning the "after" text for more occurrences
    if (afterNode && linkIndex < links.length) {
      processTextNode(afterNode);
    }
  }

  function walk(node: Node): void {
    if (linkIndex >= links.length) return;

    if (node.nodeType === 3) {
      processTextNode(node as Text);
      return;
    }
    if (node.nodeType === 1) {
      const children = Array.from(node.childNodes);
      for (const child of children) {
        if (linkIndex >= links.length) return;
        walk(child);
      }
    }
  }

  walk(doc.body);
  return doc.body.innerHTML;
}

/**
 * Removes anchor tags we previously inserted as trust links — identified by
 * rel="...nofollow..." — and keeps their inner text. Lets us re-embed cleanly
 * when the merchant adds/removes trust links on an existing page.
 */
export function stripTrustLinks(html: string): string {
  const dom = new JSDOM(`<!DOCTYPE html><body>${html}</body>`);
  const doc = dom.window.document;

  const anchors = Array.from(doc.querySelectorAll('a[rel~="nofollow"]'));
  for (const a of anchors) {
    const text = doc.createTextNode(a.textContent || "");
    a.parentNode?.replaceChild(text, a);
  }
  // Merge adjacent text nodes that result from the swap, so future runs can
  // match across the join point.
  doc.body.normalize();
  return doc.body.innerHTML;
}

/**
 * Convenience: clear any previous trust-link anchors and re-embed fresh ones
 * based on the current set of links. Use this when the merchant changed the
 * service's trust-link list and wants existing pages updated.
 */
export function reapplyTrustLinks(
  html: string,
  serviceName: string,
  links: Pick<DirectoryLink, "url" | "platform">[],
): string {
  return embedTrustLinks(stripTrustLinks(html), serviceName, links);
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

  const assembled = `<script type="application/ld+json">
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

  return embedTrustLinks(assembled, serviceName, directoryLinks);
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
