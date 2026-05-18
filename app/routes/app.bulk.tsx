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
  Select,
  Banner,
  Divider,
  Badge,
} from "@shopify/polaris";
import { useState } from "react";

import { authenticate } from "~/shopify.server";
import prisma from "~/db.server";
import { createAIProvider } from "~/lib/ai";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const [services, settings, counts] = await Promise.all([
    prisma.service.findMany({ where: { shop }, orderBy: { name: "asc" } }),
    prisma.appSettings.findUnique({ where: { shop } }),
    prisma.generatedPage.groupBy({
      by: ["status"],
      where: { shop },
      _count: true,
    }),
  ]);

  const draftCount = counts.find((c) => c.status === "draft")?._count ?? 0;
  const publishedCount = counts.find((c) => c.status === "published")?._count ?? 0;

  return json({
    services,
    draftCount,
    publishedCount,
    hasApiKey: !!(settings?.openaiApiKey || settings?.geminiApiKey),
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (intent === "regenerate-section") {
    const serviceId = formData.get("serviceId") as string;
    const section = formData.get("section") as string;

    const settings = await prisma.appSettings.findUnique({ where: { shop } });
    if (!settings?.openaiApiKey && !settings?.geminiApiKey) {
      return json({ error: "No AI API key configured" }, { status: 400 });
    }

    const pages = await prisma.generatedPage.findMany({
      where: {
        shop,
        ...(serviceId !== "all" ? { serviceId } : {}),
      },
      include: { service: true, location: true },
    });

    if (pages.length === 0) {
      return json({ error: "No pages match the selected filter" }, { status: 400 });
    }

    const provider = createAIProvider(
      settings.defaultAiModel,
      settings.openaiApiKey,
      settings.geminiApiKey,
    );

    let updated = 0;
    let failed = 0;
    const failures: string[] = [];

    for (const page of pages) {
      try {
        const content = await provider.generatePageContent({
          serviceName: page.service.name,
          locationName: page.location.name,
          locationCity: page.location.city,
          locationState: page.location.state,
          businessName: settings.businessName || shop,
          businessPhone: settings.businessPhone || "",
          businessAddress: settings.businessAddress || "",
        });

        const updates: Record<string, string | Date> = { updatedAt: new Date() };

        if (section === "intro") {
          updates.bodyHtml = page.bodyHtml.replace(
            /(<div class="pseo-intro">)([\s\S]*?)(<\/div>)/,
            `$1${content.intro}$3`,
          );
        } else if (section === "faq") {
          updates.faqJson = JSON.stringify(content.faq);
        } else if (section === "cta") {
          updates.bodyHtml = page.bodyHtml.replace(
            /(<div class="pseo-cta">)([\s\S]*?)(<\/div>)/,
            `$1${content.cta}<a href="/contact" class="pseo-cta-button">Get a Free Quote</a>$3`,
          );
        } else if (section === "meta") {
          updates.metaTitle = content.metaTitle;
          updates.metaDescription = content.metaDescription;
        }

        await prisma.generatedPage.update({ where: { id: page.id }, data: updates });
        updated++;
      } catch (err) {
        failed++;
        const msg = err instanceof Error ? err.message : String(err);
        failures.push(`${page.slug}: ${msg}`);
        console.error(`[bulk-regen] ${page.slug}`, msg);
      }
    }

    return json({ success: true, updated, failed, failures, total: pages.length });
  }

  if (intent === "delete-pages") {
    const serviceId = formData.get("serviceId") as string;
    const statusFilter = formData.get("statusFilter") as string;

    const where: { shop: string; serviceId?: string; status?: string } = { shop };
    if (serviceId !== "all") where.serviceId = serviceId;
    if (statusFilter !== "all") where.status = statusFilter;

    const result = await prisma.generatedPage.deleteMany({ where });
    return json({ success: true, deleted: result.count });
  }

  return json({ error: "Unknown intent" }, { status: 400 });
};

export default function BulkOperations() {
  const { services, draftCount, publishedCount, hasApiKey } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();

  const [serviceId, setServiceId] = useState<string>("all");
  const [section, setSection] = useState<string>("faq");
  const [deleteServiceId, setDeleteServiceId] = useState<string>("all");
  const [deleteStatus, setDeleteStatus] = useState<string>("archived");

  const isBusy = fetcher.state !== "idle";
  const data = fetcher.data as
    | { success: boolean; updated: number; failed: number; failures: string[]; total: number }
    | { success: boolean; deleted: number }
    | { error: string }
    | undefined;

  const handleRegenerate = () => {
    fetcher.submit({ intent: "regenerate-section", serviceId, section }, { method: "POST" });
  };

  const handleBulkDelete = () => {
    const serviceLabel =
      deleteServiceId === "all" ? "ALL services" : services.find((s) => s.id === deleteServiceId)?.name;
    const statusLabel = deleteStatus === "all" ? "any status" : deleteStatus;
    if (
      window.confirm(
        `Permanently delete pages where service = "${serviceLabel}" and status = "${statusLabel}"? This cannot be undone.`,
      )
    ) {
      fetcher.submit(
        { intent: "delete-pages", serviceId: deleteServiceId, statusFilter: deleteStatus },
        { method: "POST" },
      );
    }
  };

  return (
    <Page title="Bulk Operations">
      <BlockStack gap="500">
        {!hasApiKey && (
          <Banner tone="warning" action={{ content: "Go to Settings", url: "/app/settings" }}>
            <p>Add an OpenAI or Gemini API key in Settings before running bulk regeneration.</p>
          </Banner>
        )}

        {data && "updated" in data && (
          <Banner
            title={`Updated ${data.updated} of ${data.total} pages${data.failed > 0 ? `, ${data.failed} failed` : ""}`}
            tone={data.failed > 0 ? "warning" : "success"}
          >
            {data.failures.length > 0 && (
              <ul style={{ marginTop: 8, fontSize: 12 }}>
                {data.failures.slice(0, 5).map((f, i) => (
                  <li key={i}>{f}</li>
                ))}
              </ul>
            )}
          </Banner>
        )}

        {data && "deleted" in data && (
          <Banner title={`Deleted ${data.deleted} page(s)`} tone="success" />
        )}

        {data && "error" in data && <Banner tone="critical">{data.error}</Banner>}

        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h2">
                  Bulk Regenerate Section
                </Text>
                <Text as="p" tone="subdued">
                  Re-runs the AI to rewrite one section across many pages. Useful when you want a fresh
                  FAQ, intro, or meta tags without touching the whole page. Edits go live immediately
                  (no Shopify publish needed).
                </Text>

                <Select
                  label="Pages to update"
                  value={serviceId}
                  onChange={setServiceId}
                  options={[
                    { label: `All pages (${draftCount + publishedCount})`, value: "all" },
                    ...services.map((s) => ({ label: `Only ${s.name}`, value: s.id })),
                  ]}
                />

                <Select
                  label="Section to regenerate"
                  value={section}
                  onChange={setSection}
                  options={[
                    { label: "FAQ (cheapest, most useful)", value: "faq" },
                    { label: "Intro paragraphs", value: "intro" },
                    { label: "Call-to-action", value: "cta" },
                    { label: "Meta title + description", value: "meta" },
                  ]}
                />

                <InlineStack align="space-between">
                  <Text as="span" tone="subdued" variant="bodySm">
                    ⚠️ Each page = 1 AI call. Bulk regen across 500 pages costs ~$0.50–$5 depending on model.
                  </Text>
                  <Button
                    variant="primary"
                    onClick={handleRegenerate}
                    loading={isBusy}
                    disabled={!hasApiKey}
                  >
                    Regenerate
                  </Button>
                </InlineStack>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h2">
                  Bulk Delete Pages
                </Text>
                <Text as="p" tone="subdued">
                  Permanently removes pages from the database. Their public URLs will 404.
                  This cannot be undone.
                </Text>

                <Select
                  label="Service filter"
                  value={deleteServiceId}
                  onChange={setDeleteServiceId}
                  options={[
                    { label: "All services", value: "all" },
                    ...services.map((s) => ({ label: s.name, value: s.id })),
                  ]}
                />

                <Select
                  label="Status filter"
                  value={deleteStatus}
                  onChange={setDeleteStatus}
                  options={[
                    { label: "Only archived (safest)", value: "archived" },
                    { label: "Only drafts", value: "draft" },
                    { label: "Only published", value: "published" },
                    { label: "Any status (most destructive)", value: "all" },
                  ]}
                />

                <InlineStack align="end">
                  <Button variant="primary" tone="critical" onClick={handleBulkDelete} loading={isBusy}>
                    Delete matching pages
                  </Button>
                </InlineStack>
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="300">
                <Text variant="headingMd" as="h2">
                  Page Stats
                </Text>
                <InlineStack gap="200">
                  <Badge tone="info">{`${draftCount} drafts`}</Badge>
                  <Badge tone="success">{`${publishedCount} published`}</Badge>
                </InlineStack>
                <Divider />
                <Text as="p" tone="subdued" variant="bodySm">
                  Pages are served via Shopify App Proxy at <code>/apps/pseo/&lt;slug&gt;</code>.
                  Edits in the page editor go live immediately — no publish step required after.
                </Text>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}
