import type { LoaderFunctionArgs } from "@remix-run/node";
import prisma from "~/db.server";

/**
 * App Proxy sitemap served at: /apps/pseo/sitemap.xml
 * Register this path in shopify.app.toml under [app_proxy].
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  // Shopify App Proxy passes the shop as a query param
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");

  if (!shop) {
    return new Response("Missing shop parameter", { status: 400 });
  }

  const pages = await prisma.generatedPage.findMany({
    where: { shop, status: "published" },
    select: { slug: true, publishedAt: true, updatedAt: true },
    orderBy: { publishedAt: "desc" },
  });

  const shopUrl = `https://${shop}`;
  const now = new Date().toISOString();

  const urls = pages
    .map(
      (p) => `
  <url>
    <loc>${shopUrl}/pages/${p.slug}</loc>
    <lastmod>${(p.updatedAt ?? p.publishedAt ?? new Date()).toISOString().split("T")[0]}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>`
    )
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;

  return new Response(xml, {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
};
