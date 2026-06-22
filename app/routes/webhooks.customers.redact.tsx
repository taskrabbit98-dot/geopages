import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "~/shopify.server";

/**
 * GDPR webhook: customers/redact
 *
 * Shopify sends this 10 days after a customer requests deletion. Geopages
 * does not collect or store any customer PII — we only store per-shop
 * configuration. We acknowledge and log; nothing to delete.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, payload } = await authenticate.webhook(request);

  console.log(`[webhook] ${topic} for ${shop}`, JSON.stringify(payload));
  console.log(
    `[gdpr] customer_redact: Geopages does not store customer PII for ${shop}. Nothing to delete.`,
  );

  return new Response(null, { status: 200 });
};
