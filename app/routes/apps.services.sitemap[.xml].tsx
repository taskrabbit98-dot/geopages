import type { LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "~/shopify.server";
import prisma from "~/db.server";

/**
 * Public sitemap served via Shopify App Proxy at:
 *   https://<shop>.myshopify.com/apps/services/sitemap.xml
 *
 * Requires the App Proxy to be configured in Partner Dashboard:
 *   - Subpath prefix: apps
 *   - Subpath: pseo
 *   - Proxy URL: https://<your-app>/apps/services
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.public.appProxy(request);
  const shop = session?.shop;

  if (!shop) {
    return new Response("Missing shop", { status: 400 });
  }

  const pages = await prisma.generatedPage.findMany({
    where: { shop, status: "published" },
    select: { slug: true, publishedAt: true, updatedAt: true },
    orderBy: { publishedAt: "desc" },
  });

  const shopUrl = `https://${shop}`;

  const urls = pages
    .map(
      (p) => `
  <url>
    <loc>${shopUrl}/apps/services/${p.slug}</loc>
    <lastmod>${(p.updatedAt ?? p.publishedAt ?? new Date()).toISOString().split("T")[0]}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>`
    )
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}
</urlset>`;

  return new Response(xml, {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
    },
  });
};
