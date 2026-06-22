import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";
import {
  Page,
  Card,
  Text,
  BlockStack,
  InlineStack,
  Button,
  Banner,
  Badge,
  Divider,
} from "@shopify/polaris";

import { authenticate } from "~/shopify.server";
import {
  PLAN,
  createSubscription,
  cancelSubscription,
  syncSubscriptionFromShopify,
  getOrCreateSubscriptionRecord,
  hasActiveAccess,
} from "~/lib/billing";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;

  const url = new URL(request.url);
  const isCallback = url.searchParams.get("billing") === "callback";

  let subscription;
  if (isCallback) {
    // Merchant just came back from Shopify's approval screen — sync with Shopify
    subscription = await syncSubscriptionFromShopify(admin, shop);
  } else {
    subscription = await getOrCreateSubscriptionRecord(shop);
  }

  const now = new Date();
  const isTrial =
    subscription.status === "ACTIVE" &&
    subscription.trialEndsAt != null &&
    subscription.trialEndsAt > now;
  const trialDaysLeft = isTrial
    ? Math.ceil((subscription.trialEndsAt!.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
    : 0;

  return json({
    subscription: {
      status: subscription.status,
      activatedAt: subscription.activatedAt?.toISOString() ?? null,
      trialEndsAt: subscription.trialEndsAt?.toISOString() ?? null,
      shopifyChargeId: subscription.shopifyChargeId,
    },
    hasAccess: hasActiveAccess(subscription),
    isTrial,
    trialDaysLeft,
    justActivated: isCallback && subscription.status === "ACTIVE",
    plan: PLAN,
    appUrl: process.env.SHOPIFY_APP_URL ?? "",
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (intent === "subscribe") {
    const appUrl = process.env.SHOPIFY_APP_URL ?? "https://geopages.fly.dev";
    try {
      await getOrCreateSubscriptionRecord(shop);
      const result = await createSubscription(admin, shop, appUrl);
      if ("error" in result) {
        console.error("[billing] createSubscription returned error:", result.error);
        return json({ error: result.error }, { status: 500 });
      }
      // Redirect the merchant to Shopify's confirmation URL (outside the iframe).
      return json({ confirmationUrl: result.confirmationUrl });
    } catch (err) {
      const e = err as { message?: string };
      console.error("[billing] subscribe threw:", e?.message ?? err);
      return json(
        { error: `Subscribe failed: ${e?.message ?? "unknown error"}` },
        { status: 500 },
      );
    }
  }

  if (intent === "cancel") {
    const sub = await getOrCreateSubscriptionRecord(shop);
    if (!sub.shopifyChargeId) {
      return json({ error: "No active subscription to cancel" }, { status: 400 });
    }
    const result = await cancelSubscription(admin, shop, sub.shopifyChargeId);
    if ("error" in result) {
      return json({ error: result.error }, { status: 500 });
    }
    return redirect("/app/billing");
  }

  return json({ error: "Unknown intent" }, { status: 400 });
};

export default function Billing() {
  const { subscription, hasAccess, isTrial, trialDaysLeft, justActivated, plan } =
    useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const isBusy = fetcher.state !== "idle";
  const fetcherData = fetcher.data as
    | { confirmationUrl?: string; error?: string }
    | undefined;

  const handleSubscribe = () => {
    fetcher.submit({ intent: "subscribe" }, { method: "POST" });
  };

  const handleCancel = () => {
    if (
      window.confirm(
        "Cancel subscription? You'll lose access to page generation at the end of the current billing period.",
      )
    ) {
      fetcher.submit({ intent: "cancel" }, { method: "POST" });
    }
  };

  const statusBadge =
    subscription.status === "ACTIVE" ? (
      <Badge tone="success">Active</Badge>
    ) : subscription.status === "CANCELLED" ? (
      <Badge tone="attention">Cancelled</Badge>
    ) : subscription.status === "PENDING" ? (
      <Badge tone="info">Not subscribed</Badge>
    ) : (
      <Badge tone="warning">{subscription.status}</Badge>
    );

  return (
    <Page title="Billing & Plan">
      <BlockStack gap="500">
        {justActivated && (
          <Banner tone="success" title="🎉 Subscription active!">
            <p>
              Your 3-day free trial has started. You'll be charged ${plan.amount}/month after the
              trial ends. Cancel anytime.
            </p>
          </Banner>
        )}

        {fetcherData?.error && (
          <Banner tone="critical">{fetcherData.error}</Banner>
        )}

        {fetcherData?.confirmationUrl && (
          <Banner tone="success" title="One more step — approve on Shopify">
            <p style={{ marginBottom: 12 }}>
              Click the button below to open Shopify's approval screen. Approve the
              ${plan.amount}/month subscription with a 3-day free trial.
            </p>
            <a
              href={fetcherData.confirmationUrl}
              target="_top"
              rel="noopener noreferrer"
              style={{
                display: "inline-block",
                padding: "10px 20px",
                background: "#008060",
                color: "white",
                fontWeight: 600,
                borderRadius: 6,
                textDecoration: "none",
              }}
            >
              Open Shopify approval →
            </a>
          </Banner>
        )}

        {!hasAccess && (
          <Banner tone="warning" title="Subscribe to start generating pages">
            <p>
              Page generation, trust links, and bulk operations require an active subscription.
              You'll get a <strong>3-day free trial</strong> — no charge until day 4.
            </p>
          </Banner>
        )}

        <Card>
          <BlockStack gap="400">
            <InlineStack align="space-between">
              <Text variant="headingMd" as="h2">
                Current plan
              </Text>
              {statusBadge}
            </InlineStack>

            <Divider />

            <InlineStack align="space-between" blockAlign="center">
              <BlockStack gap="100">
                <Text variant="heading2xl" as="p">
                  ${plan.amount}
                  <Text as="span" variant="bodyMd" tone="subdued">
                    {" "}
                    / month
                  </Text>
                </Text>
                <Text as="p" tone="subdued">
                  {plan.name} · 3-day free trial · Cancel anytime
                </Text>
              </BlockStack>

              {!hasAccess && (
                <Button variant="primary" onClick={handleSubscribe} loading={isBusy} size="large">
                  Start 3-day free trial
                </Button>
              )}
              {hasAccess && subscription.status === "ACTIVE" && (
                <Button onClick={handleCancel} loading={isBusy} tone="critical">
                  Cancel subscription
                </Button>
              )}
            </InlineStack>

            {isTrial && (
              <Banner tone="info">
                <p>
                  You're on a free trial. <strong>{trialDaysLeft} day(s) left</strong> — Shopify will
                  bill ${plan.amount} on the day your trial ends.
                </p>
              </Banner>
            )}
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="300">
            <Text variant="headingMd" as="h2">
              What's included
            </Text>
            <ul style={{ paddingLeft: 20, lineHeight: 1.9 }}>
              <li>Unlimited AI-generated SEO pages</li>
              <li>Bulk generation, publishing, and content refresh</li>
              <li>Inline trust-link anchors with directory templates</li>
              <li>Storefront menu builder (3-level nested dropdowns)</li>
              <li>Auto sitemap.xml for Google Search Console</li>
              <li>App proxy serving — pages live at /apps/service-areas/&lt;slug&gt;</li>
              <li>FAQ accordion, structured data, mobile-responsive layout</li>
            </ul>
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="200">
            <Text variant="headingSm" as="h3">
              How billing works
            </Text>
            <Text as="p" tone="subdued" variant="bodySm">
              Billing is handled by Shopify — the ${plan.amount}/month charge appears on your
              regular Shopify bill, not a separate credit card. You can cancel anytime from this
              page or from your Shopify admin under Settings → Apps and sales channels.
            </Text>
            <Text as="p" tone="subdued" variant="bodySm">
              Development stores are billed in test mode (no real charge).
            </Text>
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}
