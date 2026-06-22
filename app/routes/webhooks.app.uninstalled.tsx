import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "~/shopify.server";
import prisma from "~/db.server";

/**
 * Webhook: app/uninstalled
 *
 * Fired when a merchant uninstalls Geopages. We delete the OAuth session so
 * the next install starts clean. We keep the per-shop business data (services,
 * locations, generated pages, trust links, subscription state) for 48 hours so
 * the merchant can reinstall and pick up where they left off; the shop/redact
 * webhook (sent by Shopify ~48 hrs after uninstall) does the final cleanup.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, session } = await authenticate.webhook(request);

  console.log(`[webhook] ${topic} for ${shop}`);

  if (session) {
    await prisma.session.deleteMany({ where: { shop } });
    console.log(`[webhook] cleared session for ${shop}`);
  }

  // Mark subscription cancelled so they're not stuck in ACTIVE when reinstalling
  await prisma.subscription.updateMany({
    where: { shop, status: "ACTIVE" },
    data: { status: "CANCELLED", cancelledAt: new Date() },
  });

  return new Response(null, { status: 200 });
};
