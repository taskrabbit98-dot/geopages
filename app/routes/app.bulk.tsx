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
import { reapplyTrustLinks } from "~/lib/content/generator";

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

  if (intent === "refresh-trust-links") {
    const serviceFilter = formData.get("serviceId") as string;

    const pages = await prisma.generatedPage.findMany({
      where: {
        shop,
        ...(serviceFilter !== "all" ? { serviceId: serviceFilter } : {}),
      },
      include: { service: { include: { directoryLinks: true } } },
    });

    let updated = 0;
    for (const page of pages) {
      const newBody = reapplyTrustLinks(
        page.bodyHtml,
        page.service.name,
        page.service.directoryLinks,
      );
      if (newBody !== page.bodyHtml) {
        await prisma.generatedPage.update({
          where: { id: page.id },
          data: { bodyHtml: newBody, updatedAt: new Date() },
        });
        updated++;
      }
    }
    return json({ success: true, refreshed: updated, total: pages.length });
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
  const [trustServiceId, setTrustServiceId] = useState<string>("all");

  const isBusy = fetcher.state !== "idle";
  const data = fetcher.data as
    | { success: boolean; updated: number; failed: number; failures: string[]; total: number }
    | { success: boolean; deleted: number }
    | { success: boolean; refreshed: number; total: number }
    | { error: string }
    | undefined;

  const handleRegenerate = () => {
    fetcher.submit({ intent: "regenerate-section", serviceId, section }, { method: "POST" });
  };

  const handleRefreshTrustLinks = () => {
    fetcher.submit(
      { intent: "refresh-trust-links", serviceId: trustServiceId },
      { method: "POST" },
    );
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

        {data && "refreshed" in data && (
          <Banner
            title={`Updated trust-link anchors on ${data.refreshed} of ${data.total} page(s)`}
            tone="success"
          />
        )}

        {data && "error" in data && <Banner tone="critical">{data.error}</Banner>}

        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h2">
                  Refresh content on existing pages
                </Text>
                <Text as="p" tone="subdued">
                  Rewrite one section (like the FAQ or intro) across many pages at once.
                  Changes go live immediately.
                </Text>

                <Select
                  label="Which pages?"
                  value={serviceId}
                  onChange={setServiceId}
                  options={[
                    { label: `All pages (${draftCount + publishedCount})`, value: "all" },
                    ...services.map((s) => ({ label: `Only ${s.name}`, value: s.id })),
                  ]}
                />

                <Select
                  label="Which part of the page?"
                  value={section}
                  onChange={setSection}
                  options={[
                    { label: "FAQ section", value: "faq" },
                    { label: "Intro paragraphs", value: "intro" },
                    { label: "Call-to-action", value: "cta" },
                    { label: "SEO title + description", value: "meta" },
                  ]}
                />

                <InlineStack align="end">
                  <Button
                    variant="primary"
                    onClick={handleRegenerate}
                    loading={isBusy}
                    disabled={!hasApiKey}
                  >
                    Refresh content
                  </Button>
                </InlineStack>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h2">
                  Refresh trust-link anchors
                </Text>
                <Text as="p" tone="subdued">
                  When you add or remove trust links on a service, click this to update
                  existing pages so the service name in their content gets re-linked to
                  the latest URLs. No AI calls, no cost.
                </Text>

                <Select
                  label="Which service?"
                  value={trustServiceId}
                  onChange={setTrustServiceId}
                  options={[
                    { label: "All services", value: "all" },
                    ...services.map((s) => ({ label: s.name, value: s.id })),
                  ]}
                />

                <InlineStack align="end">
                  <Button variant="primary" onClick={handleRefreshTrustLinks} loading={isBusy}>
                    Refresh trust-link anchors
                  </Button>
                </InlineStack>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h2">
                  Delete pages in bulk
                </Text>
                <Text as="p" tone="subdued">
                  Permanently remove pages. This cannot be undone.
                </Text>

                <Select
                  label="Which service?"
                  value={deleteServiceId}
                  onChange={setDeleteServiceId}
                  options={[
                    { label: "All services", value: "all" },
                    ...services.map((s) => ({ label: s.name, value: s.id })),
                  ]}
                />

                <Select
                  label="Which pages?"
                  value={deleteStatus}
                  onChange={setDeleteStatus}
                  options={[
                    { label: "Only archived pages (safest)", value: "archived" },
                    { label: "Only drafts", value: "draft" },
                    { label: "Only published pages", value: "published" },
                    { label: "All pages (most destructive)", value: "all" },
                  ]}
                />

                <InlineStack align="end">
                  <Button variant="primary" tone="critical" onClick={handleBulkDelete} loading={isBusy}>
                    Delete pages
                  </Button>
                </InlineStack>
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="300">
                <Text variant="headingMd" as="h2">
                  Page counts
                </Text>
                <InlineStack gap="200">
                  <Badge tone="info">{`${draftCount} drafts`}</Badge>
                  <Badge tone="success">{`${publishedCount} published`}</Badge>
                </InlineStack>
                <Divider />
                <Text as="p" tone="subdued" variant="bodySm">
                  Page edits from the editor go live right away. There's no extra publish step.
                </Text>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}
