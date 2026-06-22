import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "~/shopify.server";

/**
 * GDPR webhook: customers/data_request
 *
 * Shopify sends this when a customer (via the shop owner) requests a copy of
 * the data we have about them. Geopages does not collect or store any
 * personally-identifiable customer data — we only store per-shop merchant
 * configuration. We return 200 with an explanatory log; nothing to export.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, payload } = await authenticate.webhook(request);

  console.log(`[webhook] ${topic} for ${shop}`, JSON.stringify(payload));
  console.log(
    `[gdpr] data_request: Geopages does not store customer PII for ${shop}. No data to export.`,
  );

  return new Response(null, { status: 200 });
};
