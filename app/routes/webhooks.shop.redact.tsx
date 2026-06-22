import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "~/shopify.server";
import prisma from "~/db.server";

/**
 * GDPR webhook: shop/redact
 *
 * Shopify sends this 48 hours after a shop uninstalls the app. We must
 * delete ALL data we have for this shop. We delete in the right order so
 * foreign-key cascades work cleanly.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, payload } = await authenticate.webhook(request);

  console.log(`[webhook] ${topic} for ${shop}`, JSON.stringify(payload));

  try {
    // GeneratedPage references Service and Location, so it cascades when
    // the parent is deleted (onDelete: Cascade in the schema).
    await prisma.$transaction([
      prisma.generationJob.deleteMany({ where: { shop } }),
      prisma.generatedPage.deleteMany({ where: { shop } }),
      prisma.directoryLink.deleteMany({ where: { service: { shop } } }),
      prisma.service.deleteMany({ where: { shop } }),
      prisma.location.deleteMany({ where: { shop } }),
      prisma.trustLinkTemplate.deleteMany({ where: { shop } }),
      prisma.subscription.deleteMany({ where: { shop } }),
      prisma.appSettings.deleteMany({ where: { shop } }),
      prisma.session.deleteMany({ where: { shop } }),
    ]);
    console.log(`[gdpr] shop_redact: deleted all data for ${shop}`);
  } catch (err) {
    console.error(`[gdpr] shop_redact failed for ${shop}:`, err);
    // Still return 200 — Shopify retries non-200, and partial deletion
    // is fine as long as we eventually succeed.
  }

  return new Response(null, { status: 200 });
};
