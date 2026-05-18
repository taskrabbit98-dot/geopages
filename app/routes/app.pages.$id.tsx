import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  InlineStack,
  Button,
  TextField,
  Badge,
  Banner,
  Divider,
} from "@shopify/polaris";
import { useState } from "react";

import { authenticate } from "~/shopify.server";
import prisma from "~/db.server";
import { createShopifyPage, updateShopifyPage } from "~/lib/shopify/pages";
import { createAIProvider } from "~/lib/ai";
import { assemblePageHtml } from "~/lib/content/generator";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const page = await prisma.generatedPage.findFirst({
    where: { id: params.id, shop },
    include: {
      service: { include: { directoryLinks: true } },
      location: true,
    },
  });

  if (!page) throw new Response("Not Found", { status: 404 });

  const settings = await prisma.appSettings.findUnique({ where: { shop } });

  const relatedPages = await prisma.generatedPage.findMany({
    where: { shop, serviceId: page.serviceId, status: "published", id: { not: page.id } },
    select: { title: true, slug: true },
    take: 10,
  });

  return json({
    page: {
      ...page,
      faqJson: page.faqJson,
    },
    settings,
    shopUrl: `https://${shop}`,
    relatedPages,
  });
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  const page = await prisma.generatedPage.findFirst({
    where: { id: params.id, shop },
    include: { service: { include: { directoryLinks: true } }, location: true },
  });
  if (!page) return json({ error: "Page not found" }, { status: 404 });

  if (intent === "save") {
    const title = formData.get("title") as string;
    const h1 = formData.get("h1") as string;
    const metaTitle = formData.get("metaTitle") as string;
    const metaDescription = formData.get("metaDescription") as string;
    const bodyHtml = formData.get("bodyHtml") as string;

    await prisma.generatedPage.update({
      where: { id: page.id },
      data: { title, h1, metaTitle, metaDescription, bodyHtml, updatedAt: new Date() },
    });

    // Sync to Shopify if already published
    if (page.shopifyPageId) {
      await updateShopifyPage(admin, page.shopifyPageId, { title, bodyHtml, metaTitle, metaDescription });
    }

    return json({ success: true, message: "Saved" });
  }

  if (intent === "publish") {
    try {
      const shopifyPage = await createShopifyPage(admin, {
        title: page.title,
        handle: page.slug,
        bodyHtml: page.bodyHtml,
        metaTitle: page.metaTitle,
        metaDescription: page.metaDescription,
        published: true,
      });

      await prisma.generatedPage.update({
        where: { id: page.id },
        data: {
          shopifyPageId: shopifyPage.id,
          status: "published",
          publishedAt: new Date(),
        },
      });

      const liveUrl = `https://${shop}/pages/${shopifyPage.handle}`;
      return json({ success: true, message: "Published", url: liveUrl });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[publish] failed", message);
      return json({ error: `Publish failed: ${message}` }, { status: 500 });
    }
  }

  if (intent === "unpublish") {
    if (page.shopifyPageId) {
      await updateShopifyPage(admin, page.shopifyPageId, { published: false });
    }
    await prisma.generatedPage.update({
      where: { id: page.id },
      data: { status: "draft" },
    });
    return json({ success: true, message: "Unpublished" });
  }

  if (intent === "archive") {
    await prisma.generatedPage.update({
      where: { id: page.id },
      data: { status: "archived" },
    });
    return json({ success: true, message: "Archived" });
  }

  if (intent === "regenerate-section") {
    const section = formData.get("section") as string;
    const settings = await prisma.appSettings.findUnique({ where: { shop } });
    if (!settings?.openaiApiKey && !settings?.geminiApiKey) {
      return json({ error: "No AI API key configured" }, { status: 400 });
    }

    const provider = createAIProvider(
      settings.defaultAiModel,
      settings.openaiApiKey,
      settings.geminiApiKey
    );
    const content = await provider.generatePageContent({
      serviceName: page.service.name,
      locationName: page.location.name,
      locationCity: page.location.city,
      locationState: page.location.state,
      businessName: settings.businessName || shop,
      businessPhone: settings.businessPhone || "",
      businessAddress: settings.businessAddress || "",
    });

    const updates: Record<string, string> = {};
    if (section === "intro") updates.bodyHtml = page.bodyHtml.replace(
      /(<div class="pseo-intro">)([\s\S]*?)(<\/div>)/,
      `$1${content.intro}$3`
    );
    if (section === "faq") updates.faqJson = JSON.stringify(content.faq);
    if (section === "cta") updates.bodyHtml = page.bodyHtml.replace(
      /(<div class="pseo-cta">)([\s\S]*?)(<\/div>)/,
      `$1${content.cta}<a href="/contact" class="pseo-cta-button">Get a Free Quote</a>$3`
    );

    await prisma.generatedPage.update({ where: { id: page.id }, data: updates });
    return json({ success: true, message: `${section} regenerated` });
  }

  return json({ error: "Unknown intent" }, { status: 400 });
};

const statusTone: Record<string, "success" | "info" | "attention"> = {
  published: "success",
  draft: "info",
  archived: "attention",
};

export default function PageEditor() {
  const { page, shopUrl, relatedPages } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();

  const [title, setTitle] = useState(page.title);
  const [h1, setH1] = useState(page.h1);
  const [metaTitle, setMetaTitle] = useState(page.metaTitle);
  const [metaDescription, setMetaDescription] = useState(page.metaDescription);
  const [bodyHtml, setBodyHtml] = useState(page.bodyHtml);

  const isBusy = fetcher.state !== "idle";
  const shopifyUrl = page.shopifyPageId
    ? `${shopUrl}/pages/${page.slug}`
    : null;

  return (
    <Page
      title={`${page.title} [${page.status}]`}
      backAction={{ content: "Generator", url: "/app/generate" }}
      primaryAction={{
        content: page.status === "published" ? "Save Changes" : "Publish to Shopify",
        onAction: () =>
          fetcher.submit(
            { intent: page.status === "published" ? "save" : "publish", title, h1, metaTitle, metaDescription, bodyHtml },
            { method: "POST" }
          ),
        loading: isBusy,
      }}
      secondaryActions={[
        ...(page.status === "published"
          ? [{ content: "Unpublish", onAction: () => fetcher.submit({ intent: "unpublish" }, { method: "POST" }) }]
          : []),
        { content: "Archive", onAction: () => fetcher.submit({ intent: "archive" }, { method: "POST" }) },
        ...(shopifyUrl ? [{ content: "View Live Page", url: shopifyUrl, external: true }] : []),
      ]}
    >
      <BlockStack gap="500">
        {'success' in (fetcher.data ?? {}) && (
          <Banner tone="success">{(fetcher.data as {message: string}).message}</Banner>
        )}
        {'error' in (fetcher.data ?? {}) && (
          <Banner tone="critical">{(fetcher.data as {error: string}).error}</Banner>
        )}

        <Layout>
          <Layout.Section>
            <BlockStack gap="400">
              {/* SEO Fields */}
              <Card>
                <BlockStack gap="300">
                  <Text variant="headingMd" as="h2">SEO Fields</Text>
                  <TextField
                    label={`Title (${title.length} chars)`}
                    value={title}
                    onChange={setTitle}
                    autoComplete="off"
                    error={title.length > 70 ? "Title is too long (>70 chars)" : undefined}
                  />
                  <TextField
                    label={`Meta Title (${metaTitle.length} chars)`}
                    value={metaTitle}
                    onChange={setMetaTitle}
                    autoComplete="off"
                    helpText="Target: 55-60 characters"
                    error={metaTitle.length > 65 ? "Too long" : undefined}
                  />
                  <TextField
                    label={`Meta Description (${metaDescription.length} chars)`}
                    value={metaDescription}
                    onChange={setMetaDescription}
                    autoComplete="off"
                    multiline={2}
                    helpText="Target: 150-160 characters"
                    error={metaDescription.length > 165 ? "Too long" : undefined}
                  />
                  <TextField
                    label="H1"
                    value={h1}
                    onChange={setH1}
                    autoComplete="off"
                  />
                </BlockStack>
              </Card>

              {/* Body Editor */}
              <Card>
                <BlockStack gap="300">
                  <InlineStack align="space-between">
                    <Text variant="headingMd" as="h2">Page Body HTML</Text>
                    <InlineStack gap="200">
                      <Button
                        size="slim"
                        loading={isBusy}
                        onClick={() =>
                          fetcher.submit({ intent: "regenerate-section", section: "intro" }, { method: "POST" })
                        }
                      >
                        Regen Intro
                      </Button>
                      <Button
                        size="slim"
                        loading={isBusy}
                        onClick={() =>
                          fetcher.submit({ intent: "regenerate-section", section: "faq" }, { method: "POST" })
                        }
                      >
                        Regen FAQ
                      </Button>
                      <Button
                        size="slim"
                        loading={isBusy}
                        onClick={() =>
                          fetcher.submit({ intent: "regenerate-section", section: "cta" }, { method: "POST" })
                        }
                      >
                        Regen CTA
                      </Button>
                    </InlineStack>
                  </InlineStack>
                  <TextField
                    label=""
                    labelHidden
                    value={bodyHtml}
                    onChange={setBodyHtml}
                    autoComplete="off"
                    multiline={20}
                    monospaced
                  />
                </BlockStack>
              </Card>

              {/* Save Button */}
              <InlineStack>
                <Button
                  variant="primary"
                  loading={isBusy}
                  onClick={() =>
                    fetcher.submit(
                      { intent: "save", title, h1, metaTitle, metaDescription, bodyHtml },
                      { method: "POST" }
                    )
                  }
                >
                  Save Changes
                </Button>
              </InlineStack>
            </BlockStack>
          </Layout.Section>

          {/* Sidebar */}
          <Layout.Section variant="oneThird">
            <BlockStack gap="400">
              <Card>
                <BlockStack gap="300">
                  <Text variant="headingMd" as="h2">Page Info</Text>
                  <Text as="p"><strong>Slug:</strong> /{page.slug}</Text>
                  <Text as="p"><strong>Service:</strong> {page.service.name}</Text>
                  <Text as="p"><strong>Location:</strong> {page.location.name}</Text>
                  <Text as="p"><strong>AI Model:</strong> {page.aiModel ?? "—"}</Text>
                  {page.qualityScore != null && (
                    <Text as="p">
                      <strong>Quality Score:</strong>{" "}
                      <Badge tone={page.qualityScore >= 80 ? "success" : page.qualityScore >= 50 ? "info" : "critical"}>
                        {`${page.qualityScore}/100`}
                      </Badge>
                    </Text>
                  )}
                  {shopifyUrl && (
                    <Button url={shopifyUrl} external size="slim">View Live Page</Button>
                  )}
                </BlockStack>
              </Card>

              {page.imageUrl && (
                <Card>
                  <BlockStack gap="200">
                    <Text variant="headingMd" as="h2">Featured Image</Text>
                    <img src={page.imageUrl} alt={page.title} style={{ width: "100%", borderRadius: 4 }} />
                  </BlockStack>
                </Card>
              )}

              {relatedPages.length > 0 && (
                <Card>
                  <BlockStack gap="200">
                    <Text variant="headingMd" as="h2">Related Pages</Text>
                    {relatedPages.map((rp) => (
                      <Button key={rp.slug} url={`/pages/${rp.slug}`} external size="slim" variant="plain">
                        {rp.title}
                      </Button>
                    ))}
                  </BlockStack>
                </Card>
              )}
            </BlockStack>
          </Layout.Section>
        </Layout>

        {/* Live Preview */}
        <Card>
          <BlockStack gap="300">
            <Text variant="headingMd" as="h2">Preview</Text>
            <div
              style={{ border: "1px solid #e1e3e5", borderRadius: 8, padding: 16, fontFamily: "sans-serif" }}
              dangerouslySetInnerHTML={{ __html: bodyHtml }}
            />
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}
