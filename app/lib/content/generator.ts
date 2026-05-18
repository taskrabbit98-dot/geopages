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

${PSEO_STYLES}

<article class="pseo-page" data-pseo-page="true">

  <header class="pseo-header">
    <h1>${sanitize(content.h1)}</h1>
    <p class="pseo-breadcrumb">${serviceName} · ${locationCity}, ${locationState}</p>
  </header>

  <div class="pseo-intro">
    ${sanitize(content.intro)}
  </div>

  <section class="pseo-why">
    <h2>Why Choose Us for ${serviceName} in ${locationName}</h2>
    <ul>
      ${whyList}
    </ul>
  </section>

  <section class="pseo-details">
    <h2>About Our ${serviceName} Service</h2>
    ${sanitize(content.serviceDetails)}
  </section>

  ${mapSection}

  <section class="pseo-local">
    <h2>About ${locationName}</h2>
    ${sanitize(content.localSection)}
  </section>

  ${imageSection}

  <section class="pseo-faq">
    <h2>Frequently Asked Questions</h2>
    <div class="pseo-faq-list">
      ${faqHtml}
    </div>
  </section>

  <aside class="pseo-cta">
    <div class="pseo-cta-body">
      ${sanitize(content.cta)}
    </div>
    <a href="/pages/contact" class="pseo-cta-button">Get a Free Quote →</a>
  </aside>

  ${relatedSection}

</article>`;

  return embedTrustLinks(assembled, serviceName, directoryLinks);
}

const PSEO_STYLES = `<style>
.pseo-page {
  max-width: 820px;
  margin: 0 auto;
  padding: 48px 24px 80px;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  line-height: 1.7;
  color: #202223;
  font-size: 17px;
}
.pseo-page * { box-sizing: border-box; }

/* Header */
.pseo-header { margin-bottom: 32px; }
.pseo-page h1 {
  font-size: clamp(28px, 4.5vw, 42px);
  font-weight: 700;
  line-height: 1.2;
  letter-spacing: -0.02em;
  margin: 0 0 8px;
  color: #1a1a1a;
}
.pseo-breadcrumb {
  color: #6d7175;
  font-size: 14px;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  margin: 0;
}

/* Headings */
.pseo-page h2 {
  font-size: clamp(22px, 3vw, 28px);
  font-weight: 700;
  line-height: 1.3;
  letter-spacing: -0.01em;
  margin: 48px 0 16px;
  color: #1a1a1a;
}
.pseo-page p { margin: 0 0 16px; }
.pseo-page p:last-child { margin-bottom: 0; }

/* Links */
.pseo-page a {
  color: #006fbb;
  text-decoration: underline;
  text-underline-offset: 3px;
  text-decoration-thickness: 1px;
  transition: color 0.15s ease;
}
.pseo-page a:hover { color: #004c84; text-decoration-thickness: 2px; }

/* Intro */
.pseo-intro {
  font-size: 18px;
  color: #2c2c2c;
  background: #f6f6f7;
  border-left: 4px solid #008060;
  border-radius: 0 8px 8px 0;
  padding: 20px 24px;
  margin: 0 0 16px;
}
.pseo-intro p:first-child { font-weight: 500; }

/* Why-choose-us bullets */
.pseo-why ul {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  gap: 12px;
}
.pseo-why li {
  position: relative;
  padding: 14px 16px 14px 48px;
  background: #f9fafb;
  border-radius: 10px;
  border: 1px solid #e1e3e5;
}
.pseo-why li::before {
  content: "";
  position: absolute;
  left: 16px;
  top: 50%;
  transform: translateY(-50%);
  width: 20px;
  height: 20px;
  background: #008060;
  border-radius: 50%;
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='white'><path d='M6 11.4L2.6 8l1.4-1.4L6 8.6l6-6L13.4 4z'/></svg>");
  background-position: center;
  background-size: 12px;
  background-repeat: no-repeat;
}

/* Map */
.pseo-map {
  margin: 32px 0;
  padding: 24px;
  background: #f6f6f7;
  border-radius: 14px;
  text-align: center;
}
.pseo-map h2 { margin-top: 0; }
.pseo-map iframe {
  border-radius: 10px;
  width: 100%;
  max-width: 600px;
}

/* Local section */
.pseo-local {
  padding: 24px;
  background: linear-gradient(135deg, #f9fafb 0%, #f0f4f8 100%);
  border-radius: 14px;
  margin: 32px 0;
  border: 1px solid #e1e3e5;
}
.pseo-local h2 { margin-top: 0; }

/* Featured image */
.pseo-image { margin: 32px 0; }
.pseo-image img {
  width: 100%;
  height: auto;
  border-radius: 14px;
  display: block;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
}

/* FAQ accordion */
.pseo-faq-list {
  display: grid;
  gap: 10px;
}
.pseo-faq-item {
  border: 1px solid #e1e3e5;
  border-radius: 12px;
  background: white;
  overflow: hidden;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
.pseo-faq-item:hover { border-color: #c8cccf; }
.pseo-faq-item[open] {
  border-color: #008060;
  box-shadow: 0 1px 6px rgba(0, 128, 96, 0.12);
}
.pseo-faq-item summary {
  list-style: none;
  cursor: pointer;
  padding: 18px 56px 18px 22px;
  position: relative;
  font-weight: 600;
  font-size: 16px;
  color: #1a1a1a;
  user-select: none;
}
.pseo-faq-item summary::-webkit-details-marker { display: none; }
.pseo-faq-item summary h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  display: inline;
  line-height: 1.5;
}
.pseo-faq-item summary::after {
  content: "";
  position: absolute;
  right: 22px;
  top: 50%;
  width: 12px;
  height: 12px;
  border-right: 2px solid #008060;
  border-bottom: 2px solid #008060;
  transform: translateY(-75%) rotate(45deg);
  transition: transform 0.2s ease;
}
.pseo-faq-item[open] summary::after {
  transform: translateY(-25%) rotate(-135deg);
}
.pseo-faq-item p {
  padding: 0 22px 20px;
  margin: 0;
  color: #4a4a4a;
  line-height: 1.7;
}

/* CTA card */
.pseo-cta {
  margin: 56px 0 32px;
  padding: 40px 32px;
  background: linear-gradient(135deg, #008060 0%, #005f47 100%);
  border-radius: 18px;
  color: white;
  text-align: center;
  box-shadow: 0 8px 24px rgba(0, 128, 96, 0.2);
}
.pseo-cta-body { margin-bottom: 24px; }
.pseo-cta-body p {
  color: white;
  font-size: 19px;
  line-height: 1.55;
}
.pseo-cta-button {
  display: inline-block;
  padding: 16px 36px;
  background: white;
  color: #008060 !important;
  font-weight: 600;
  font-size: 17px;
  border-radius: 10px;
  text-decoration: none !important;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
  letter-spacing: 0.01em;
}
.pseo-cta-button:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.18);
}

/* Related pages */
.pseo-related {
  margin: 48px 0;
  padding: 28px;
  background: #f9fafb;
  border-radius: 14px;
  border: 1px solid #e1e3e5;
}
.pseo-related h2 { margin-top: 0; }
.pseo-related ul {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.pseo-related li { margin: 0; }
.pseo-related a {
  display: inline-block;
  padding: 8px 14px;
  background: white;
  border: 1px solid #c8cccf;
  border-radius: 999px;
  text-decoration: none !important;
  font-size: 14px;
  color: #202223;
  transition: background 0.15s ease, border-color 0.15s ease;
}
.pseo-related a:hover {
  background: #f6f6f7;
  border-color: #008060;
  color: #008060;
}

/* Mobile */
@media (max-width: 600px) {
  .pseo-page { padding: 24px 16px 48px; font-size: 16px; }
  .pseo-page h2 { margin: 36px 0 14px; }
  .pseo-intro { padding: 16px 18px; font-size: 17px; }
  .pseo-cta { padding: 28px 20px; }
  .pseo-cta-body p { font-size: 17px; }
  .pseo-faq-item summary { padding: 16px 48px 16px 18px; font-size: 15px; }
  .pseo-faq-item p { padding: 0 18px 16px; }
}
</style>`;

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
