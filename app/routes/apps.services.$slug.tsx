import type { LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "~/shopify.server";
import prisma from "~/db.server";

/**
 * Public-facing page served via Shopify App Proxy at:
 *   https://<shop>.myshopify.com/apps/services/{slug}
 *
 * Response is application/liquid so Shopify wraps with the store theme.
 * If the page isn't found or isn't published, returns a 404 page that
 * still gets wrapped by the theme.
 */
export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate.public.appProxy(request);
  const shop = session?.shop;
  const slug = params.slug;

  if (!shop || !slug) {
    return notFoundResponse();
  }

  const page = await prisma.generatedPage.findFirst({
    where: { shop, slug, status: "published" },
    include: { service: true, location: true },
  });

  if (!page) {
    return notFoundResponse();
  }

  // Escape any rogue {% or {{ in the body so Liquid doesn't try to parse them.
  // The body content is sanitized HTML, but it may contain curly braces in URLs.
  const safeBody = page.bodyHtml.replace(/\{%/g, "{{ '{%' }}").replace(/\{\{/g, "{{ '{{' }}");

  const liquid = `{% layout 'theme' %}
<div class="pseo-app-page page-width" style="max-width: 1100px; margin: 0 auto; padding: 40px 20px;">
  <meta name="description" content="${escapeAttr(page.metaDescription)}" data-pseo-meta />
  <link rel="canonical" href="https://${shop}/apps/services/${page.slug}" />
${safeBody}
</div>`;

  return new Response(liquid, {
    status: 200,
    headers: {
      "Content-Type": "application/liquid",
      "Cache-Control": "public, max-age=300",
    },
  });
};

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function notFoundResponse() {
  const liquid = `{% layout 'theme' %}
<div class="page-width" style="max-width: 800px; margin: 80px auto; padding: 40px 20px; text-align: center;">
  <h1>Page not found</h1>
  <p>The page you're looking for doesn't exist or hasn't been published yet.</p>
  <p><a href="/">Return to home</a></p>
</div>`;
  return new Response(liquid, {
    status: 404,
    headers: { "Content-Type": "application/liquid" },
  });
}
