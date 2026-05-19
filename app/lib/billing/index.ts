/**
 * Shopify Billing API integration.
 *
 * Plan: $30/month flat with a 14-day free trial. New merchants install free,
 * get 14 days unrestricted, then must subscribe to keep generating pages.
 *
 * Test mode is automatically used for development stores so the dev store
 * doesn't get billed during development.
 */

import prisma from "~/db.server";

export const PLAN = {
  name: "PSEO Pro",
  amount: 30.0,
  currencyCode: "USD",
  trialDays: 14,
  interval: "EVERY_30_DAYS" as const,
};

export type AdminClient = {
  graphql: (query: string, options?: { variables?: Record<string, unknown> }) => Promise<{
    json: () => Promise<unknown>;
  }>;
};

/**
 * Returns the merchant's current subscription record (DB), creating it if missing.
 * Status PENDING means they've never subscribed; we'll prompt them.
 */
export async function getOrCreateSubscriptionRecord(shop: string) {
  return prisma.subscription.upsert({
    where: { shop },
    create: { shop, status: "PENDING" },
    update: {},
  });
}

/**
 * Decides whether the merchant has access to paid features.
 * - status ACTIVE = paying or in trial
 * - status PENDING/CANCELLED/EXPIRED = no access
 */
export function hasActiveAccess(sub: { status: string; trialEndsAt?: Date | null }): boolean {
  return sub.status === "ACTIVE";
}

/**
 * Determines whether the shop should use Shopify's test billing mode.
 * Returns true for development stores so we don't charge during testing.
 */
export async function isDevelopmentStore(admin: AdminClient): Promise<boolean> {
  try {
    const resp = await admin.graphql(`
      query {
        shop {
          plan {
            displayName
            partnerDevelopment
          }
        }
      }
    `);
    const data = (await resp.json()) as {
      data?: { shop?: { plan?: { partnerDevelopment?: boolean; displayName?: string } } };
    };
    return Boolean(data.data?.shop?.plan?.partnerDevelopment);
  } catch {
    // If we can't determine, default to test mode for safety.
    return true;
  }
}

/**
 * Creates a recurring subscription via Shopify and returns the confirmation URL
 * the merchant must visit to approve. After approval, Shopify redirects to
 * returnUrl with a charge_id query param.
 */
export async function createSubscription(
  admin: AdminClient,
  shop: string,
  appUrl: string,
): Promise<{ confirmationUrl: string; subscriptionId: string } | { error: string }> {
  const test = await isDevelopmentStore(admin);

  // Return URL must come back into the embedded app via /app/billing
  const returnUrl = `${appUrl}/app/billing?shop=${encodeURIComponent(shop)}&billing=callback`;

  const mutation = `
    mutation AppSubscriptionCreate(
      $name: String!
      $returnUrl: URL!
      $trialDays: Int
      $test: Boolean
      $lineItems: [AppSubscriptionLineItemInput!]!
    ) {
      appSubscriptionCreate(
        name: $name
        returnUrl: $returnUrl
        trialDays: $trialDays
        test: $test
        lineItems: $lineItems
      ) {
        confirmationUrl
        appSubscription { id status }
        userErrors { field message }
      }
    }
  `;

  const variables = {
    name: PLAN.name,
    returnUrl,
    trialDays: PLAN.trialDays,
    test,
    lineItems: [
      {
        plan: {
          appRecurringPricingDetails: {
            price: { amount: PLAN.amount, currencyCode: PLAN.currencyCode },
            interval: PLAN.interval,
          },
        },
      },
    ],
  };

  const resp = await admin.graphql(mutation, { variables });
  const data = (await resp.json()) as {
    data?: {
      appSubscriptionCreate?: {
        confirmationUrl: string | null;
        appSubscription: { id: string; status: string } | null;
        userErrors: { field: string[]; message: string }[];
      };
    };
  };

  const result = data.data?.appSubscriptionCreate;
  if (!result) return { error: "No response from Shopify" };
  if (result.userErrors.length > 0) {
    return { error: result.userErrors.map((e) => e.message).join(", ") };
  }
  if (!result.confirmationUrl || !result.appSubscription) {
    return { error: "Missing confirmation URL from Shopify" };
  }

  // Store the pending subscription so we know what we're waiting for
  await prisma.subscription.update({
    where: { shop },
    data: {
      shopifyChargeId: result.appSubscription.id,
      status: result.appSubscription.status,
    },
  });

  return {
    confirmationUrl: result.confirmationUrl,
    subscriptionId: result.appSubscription.id,
  };
}

/**
 * Checks the current active subscriptions on Shopify and syncs our DB record.
 * Called after the merchant returns from the confirmation URL.
 */
export async function syncSubscriptionFromShopify(
  admin: AdminClient,
  shop: string,
): Promise<{ id: string; shop: string; status: string; trialEndsAt: Date | null; activatedAt: Date | null }> {
  const resp = await admin.graphql(`
    query {
      currentAppInstallation {
        activeSubscriptions {
          id
          name
          status
          createdAt
          currentPeriodEnd
          trialDays
          test
        }
      }
    }
  `);
  const data = (await resp.json()) as {
    data?: {
      currentAppInstallation?: {
        activeSubscriptions: {
          id: string;
          name: string;
          status: string;
          createdAt: string;
          currentPeriodEnd: string;
          trialDays: number;
          test: boolean;
        }[];
      };
    };
  };

  const active = data.data?.currentAppInstallation?.activeSubscriptions ?? [];
  // Prefer the one matching PLAN.name; else take the first
  const sub = active.find((s) => s.name === PLAN.name) ?? active[0];

  if (sub) {
    const trialEnd =
      sub.trialDays > 0
        ? new Date(new Date(sub.createdAt).getTime() + sub.trialDays * 24 * 60 * 60 * 1000)
        : null;
    return prisma.subscription.upsert({
      where: { shop },
      create: {
        shop,
        shopifyChargeId: sub.id,
        status: sub.status,
        trialEndsAt: trialEnd,
        activatedAt: sub.status === "ACTIVE" ? new Date() : null,
      },
      update: {
        shopifyChargeId: sub.id,
        status: sub.status,
        trialEndsAt: trialEnd,
        activatedAt: sub.status === "ACTIVE" ? new Date() : null,
      },
    });
  }

  // No active subscription on Shopify side — make sure DB reflects that
  return prisma.subscription.upsert({
    where: { shop },
    create: { shop, status: "PENDING" },
    update: { status: "PENDING", shopifyChargeId: null, activatedAt: null, trialEndsAt: null },
  });
}

/**
 * Cancels the active subscription on Shopify and updates the DB.
 */
export async function cancelSubscription(
  admin: AdminClient,
  shop: string,
  subscriptionId: string,
): Promise<{ ok: true } | { error: string }> {
  const resp = await admin.graphql(
    `
      mutation appSubscriptionCancel($id: ID!) {
        appSubscriptionCancel(id: $id) {
          appSubscription { id status }
          userErrors { field message }
        }
      }
    `,
    { variables: { id: subscriptionId } },
  );
  const data = (await resp.json()) as {
    data?: {
      appSubscriptionCancel?: {
        appSubscription: { id: string; status: string } | null;
        userErrors: { field: string[]; message: string }[];
      };
    };
  };
  const result = data.data?.appSubscriptionCancel;
  if (!result) return { error: "No response from Shopify" };
  if (result.userErrors.length > 0) {
    return { error: result.userErrors.map((e) => e.message).join(", ") };
  }

  await prisma.subscription.update({
    where: { shop },
    data: { status: "CANCELLED", cancelledAt: new Date() },
  });

  return { ok: true };
}
