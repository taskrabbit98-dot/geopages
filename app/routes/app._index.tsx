import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  InlineGrid,
  Banner,
  Button,
  Badge,
  List,
  Divider,
} from "@shopify/polaris";

import { authenticate } from "~/shopify.server";
import prisma from "~/db.server";
import { enqueueJob } from "~/lib/queue/jobs";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const [
    serviceCount,
    locationCount,
    pageStats,
    recentJobs,
    settings,
  ] = await Promise.all([
    prisma.service.count({ where: { shop } }),
    prisma.location.count({ where: { shop } }),
    prisma.generatedPage.groupBy({
      by: ["status"],
      where: { shop },
      _count: true,
    }),
    prisma.generationJob.findMany({
      where: { shop },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    prisma.appSettings.findUnique({ where: { shop } }),
  ]);

  const draft = pageStats.find((s) => s.status === "draft")?._count ?? 0;
  const published = pageStats.find((s) => s.status === "published")?._count ?? 0;
  const total = draft + published;

  return json({
    serviceCount,
    locationCount,
    total,
    draft,
    published,
    recentJobs,
    hasSettings: !!settings?.businessName,
    sitemapUrl: `https://${shop}/apps/pseo/sitemap.xml`,
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "publish-all-drafts") {
    const result = await prisma.generatedPage.updateMany({
      where: { shop, status: "draft" },
      data: { status: "published", publishedAt: new Date() },
    });
    return json({ success: true, published: result.count, failed: 0, failures: [] as string[] });
  }

  if (intent === "unpublish-all") {
    const result = await prisma.generatedPage.updateMany({
      where: { shop, status: "published" },
      data: { status: "draft" },
    });
    return json({ success: true, unpublished: result.count });
  }

  if (intent === "generate-all") {
    // Find all service+location combos without a generated page
    const services = await prisma.service.findMany({ where: { shop }, select: { id: true } });
    const locations = await prisma.location.findMany({ where: { shop }, select: { id: true } });
    const existing = await prisma.generatedPage.findMany({
      where: { shop },
      select: { serviceId: true, locationId: true },
    });

    const existingSet = new Set(existing.map((p) => `${p.serviceId}:${p.locationId}`));
    let queued = 0;

    for (const svc of services) {
      for (const loc of locations) {
        if (!existingSet.has(`${svc.id}:${loc.id}`)) {
          const job = await prisma.generationJob.create({
            data: { shop, serviceId: svc.id, locationId: loc.id },
          });
          enqueueJob(job.id);
          queued++;
        }
      }
    }

    return json({ success: true, queued });
  }

  return json({ success: false });
};

const statusColor: Record<string, "success" | "warning" | "critical" | "info"> = {
  done: "success",
  running: "info",
  pending: "warning",
  failed: "critical",
};

export default function Dashboard() {
  const { serviceCount, locationCount, total, draft, published, recentJobs, hasSettings, sitemapUrl } =
    useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();

  const isGenerating = fetcher.state !== "idle";

  return (
    <Page
      title="Dashboard"
      primaryAction={{
        content: "Generate All Missing Pages",
        onAction: () => fetcher.submit({ intent: "generate-all" }, { method: "POST" }),
        loading: isGenerating,
      }}
      secondaryActions={
        draft > 0
          ? [
              {
                content: `Publish All ${draft} Drafts`,
                onAction: () => fetcher.submit({ intent: "publish-all-drafts" }, { method: "POST" }),
                loading: isGenerating,
              },
            ]
          : []
      }
    >
      <BlockStack gap="500">
        {!hasSettings && (
          <Banner title="Complete your setup" tone="warning" action={{ content: "Go to Settings", url: "/app/settings" }}>
            <p>Add your business info, API keys, and service locations to start generating pages.</p>
          </Banner>
        )}

        {fetcher.data && 'queued' in fetcher.data && fetcher.data.queued != null && (
          <Banner title={`Queued ${fetcher.data.queued} generation jobs`} tone="success" />
        )}

        {fetcher.data && 'published' in fetcher.data && (
          <Banner
            title={`Published ${(fetcher.data as { published: number }).published} pages${
              (fetcher.data as { failed: number }).failed > 0
                ? `, ${(fetcher.data as { failed: number }).failed} failed`
                : ""
            }`}
            tone={(fetcher.data as { failed: number }).failed > 0 ? "warning" : "success"}
          >
            {(fetcher.data as { failures?: string[] }).failures &&
              (fetcher.data as { failures: string[] }).failures.length > 0 && (
                <ul style={{ marginTop: 8, fontSize: 12 }}>
                  {(fetcher.data as { failures: string[] }).failures.slice(0, 5).map((f, i) => (
                    <li key={i}>{f}</li>
                  ))}
                </ul>
              )}
          </Banner>
        )}

        <InlineGrid columns={4} gap="400">
          <Card>
            <BlockStack gap="200">
              <Text variant="headingMd" as="h2">Services</Text>
              <Text variant="heading2xl" as="p">{serviceCount}</Text>
              <Button url="/app/services" size="slim">Manage</Button>
            </BlockStack>
          </Card>
          <Card>
            <BlockStack gap="200">
              <Text variant="headingMd" as="h2">Locations</Text>
              <Text variant="heading2xl" as="p">{locationCount}</Text>
              <Button url="/app/locations" size="slim">Manage</Button>
            </BlockStack>
          </Card>
          <Card>
            <BlockStack gap="200">
              <Text variant="headingMd" as="h2">Total Pages</Text>
              <Text variant="heading2xl" as="p">{total}</Text>
              <Text variant="bodySm" as="p" tone="subdued">{serviceCount * locationCount} possible</Text>
            </BlockStack>
          </Card>
          <Card>
            <BlockStack gap="200">
              <Text variant="headingMd" as="h2">Published</Text>
              <Text variant="heading2xl" as="p">{published}</Text>
              <Text variant="bodySm" as="p" tone="subdued">{draft} drafts</Text>
            </BlockStack>
          </Card>
        </InlineGrid>

        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h2">Recent Generation Jobs</Text>
                {recentJobs.length === 0 ? (
                  <Text as="p" tone="subdued">No jobs yet. Generate pages from the Page Generator screen.</Text>
                ) : (
                  <BlockStack gap="200">
                    {recentJobs.map((job) => (
                      <div key={job.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <Text as="span" variant="bodySm">{job.id.slice(0, 8)}… {job.serviceId.slice(0, 6)} × {job.locationId.slice(0, 6)}</Text>
                        <Badge tone={statusColor[job.status] ?? "info"}>{job.status}</Badge>
                      </div>
                    ))}
                  </BlockStack>
                )}
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section variant="oneThird">
            <BlockStack gap="400">
              <Card>
                <BlockStack gap="300">
                  <Text variant="headingMd" as="h2">Sitemap</Text>
                  <Text as="p" tone="subdued">Submit this URL to Google Search Console after publishing pages.</Text>
                  <Text as="p" variant="bodySm" fontWeight="bold">{sitemapUrl}</Text>
                  <Button url={sitemapUrl} external size="slim">Open Sitemap</Button>
                </BlockStack>
              </Card>
              <Card>
                <BlockStack gap="300">
                  <Text variant="headingMd" as="h2">Robots.txt Advisory</Text>
                  <Banner tone="info">
                    <p>Make sure your Shopify theme's robots.txt does <strong>NOT</strong> disallow <code>/pages/</code>. Check Settings → Preferences in Shopify Admin.</p>
                  </Banner>
                </BlockStack>
              </Card>
            </BlockStack>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}
