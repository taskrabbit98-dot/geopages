import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useFetcher, useNavigate } from "@remix-run/react";
import {
  Page,
  Card,
  Text,
  BlockStack,
  InlineStack,
  Button,
  Badge,
  Banner,
  Spinner,
  Checkbox,
} from "@shopify/polaris";
import { useState, useMemo } from "react";

import { authenticate } from "~/shopify.server";
import prisma from "~/db.server";
import { enqueueJob } from "~/lib/queue/jobs";
import { createAIProvider } from "~/lib/ai";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const [services, locations, pages, settings] = await Promise.all([
    prisma.service.findMany({ where: { shop }, orderBy: { name: "asc" } }),
    prisma.location.findMany({ where: { shop }, orderBy: [{ state: "asc" }, { city: "asc" }] }),
    prisma.generatedPage.findMany({
      where: { shop },
      select: {
        id: true,
        serviceId: true,
        locationId: true,
        status: true,
        qualityScore: true,
        generatedAt: true,
      },
    }),
    prisma.appSettings.findUnique({ where: { shop } }),
  ]);

  const pageMap: Record<string, { id: string; status: string; qualityScore: number | null }> = {};
  for (const p of pages) {
    pageMap[`${p.serviceId}:${p.locationId}`] = {
      id: p.id,
      status: p.status,
      qualityScore: p.qualityScore,
    };
  }

  // Estimate total cost
  const provider = settings?.openaiApiKey || settings?.geminiApiKey
    ? createAIProvider(
        settings.defaultAiModel,
        settings.openaiApiKey,
        settings.geminiApiKey
      )
    : null;
  const costPerPage = provider?.estimateCost({ serviceName: "", locationName: "", locationCity: "", locationState: "", businessName: "", businessPhone: "", businessAddress: "" }) ?? 0.01;

  const missingCount =
    services.length * locations.length - pages.length;

  return json({
    services,
    locations,
    pageMap,
    missingCount,
    estimatedCostPerPage: costPerPage,
    hasApiKey: !!(settings?.openaiApiKey || settings?.geminiApiKey),
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (intent === "generate-selected") {
    const pairsJson = formData.get("pairs") as string;
    const pairs: { serviceId: string; locationId: string }[] = JSON.parse(pairsJson);
    let queued = 0;

    for (const { serviceId, locationId } of pairs) {
      // Check if a job already running
      const existing = await prisma.generationJob.findFirst({
        where: { shop, serviceId, locationId, status: { in: ["pending", "running"] } },
      });
      if (existing) continue;

      const job = await prisma.generationJob.create({
        data: { shop, serviceId, locationId },
      });
      enqueueJob(job.id);
      queued++;
    }

    return json({ success: true, queued });
  }

  if (intent === "delete-selected") {
    const pairsJson = formData.get("pairs") as string;
    const pairs: { serviceId: string; locationId: string }[] = JSON.parse(pairsJson);

    let deleted = 0;
    for (const { serviceId, locationId } of pairs) {
      const result = await prisma.generatedPage.deleteMany({
        where: { shop, serviceId, locationId },
      });
      deleted += result.count;
      // Also clean up any orphaned generation jobs for this cell
      await prisma.generationJob.deleteMany({
        where: { shop, serviceId, locationId },
      });
    }

    return json({ success: true, deleted });
  }

  return json({ error: "Unknown intent" }, { status: 400 });
};

const statusBadge = (
  entry: { status: string; qualityScore: number | null } | undefined
) => {
  if (!entry) return <Badge tone="new">—</Badge>;
  const tone =
    entry.status === "published"
      ? "success"
      : entry.status === "draft"
      ? "info"
      : "attention";
  const score = entry.qualityScore != null ? ` (${entry.qualityScore})` : "";
  return <Badge tone={tone}>{entry.status + score}</Badge>;
};

export default function Generate() {
  const { services, locations, pageMap, missingCount, estimatedCostPerPage, hasApiKey } =
    useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const navigate = useNavigate();

  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggleCell = (svcId: string, locId: string) => {
    const key = `${svcId}:${locId}`;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selectRow = (svcId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const loc of locations) {
        next.add(`${svcId}:${loc.id}`);
      }
      return next;
    });
  };

  const selectCol = (locId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const svc of services) {
        next.add(`${svc.id}:${locId}`);
      }
      return next;
    });
  };

  const selectAll = () => {
    const keys: string[] = [];
    for (const svc of services) for (const loc of locations) keys.push(`${svc.id}:${loc.id}`);
    setSelected(new Set(keys));
  };

  const clearSelection = () => setSelected(new Set());

  const pairs = useMemo(
    () =>
      [...selected].map((key) => {
        const [serviceId, locationId] = key.split(":");
        return { serviceId, locationId };
      }),
    [selected]
  );

  const estimatedCost = (pairs.length * estimatedCostPerPage).toFixed(4);

  const handleGenerate = () => {
    fetcher.submit(
      { intent: "generate-selected", pairs: JSON.stringify(pairs) },
      { method: "POST" }
    );
    setSelected(new Set());
  };

  const handleDelete = () => {
    if (
      window.confirm(
        `Permanently delete ${pairs.length} page(s)? Their public URLs will 404. This cannot be undone.`,
      )
    ) {
      fetcher.submit(
        { intent: "delete-selected", pairs: JSON.stringify(pairs) },
        { method: "POST" },
      );
      setSelected(new Set());
    }
  };

  return (
    <Page
      title="Page Generator"
      subtitle={`${services.length} services × ${locations.length} locations = ${services.length * locations.length} possible pages`}
    >
      <BlockStack gap="400">
        {!hasApiKey && (
          <Banner tone="warning" action={{ content: "Go to Settings", url: "/app/settings" }}>
            <p>Add an OpenAI or Gemini API key in Settings before generating pages.</p>
          </Banner>
        )}

        {'queued' in (fetcher.data ?? {}) && (
          <Banner tone="success">
            Queued {(fetcher.data as { queued: number }).queued} generation job(s). Pages will appear as drafts shortly.
          </Banner>
        )}

        {'deleted' in (fetcher.data ?? {}) && (
          <Banner tone="success">
            Deleted {(fetcher.data as { deleted: number }).deleted} page(s).
          </Banner>
        )}

        {('error' in (fetcher.data ?? {})) && (
          <Banner tone="critical">
            {(fetcher.data as { error: string }).error}
          </Banner>
        )}

        {(services.length === 0 || locations.length === 0) ? (
          <Banner tone="warning">
            <p>You need at least 1 service and 1 location before generating pages.</p>
          </Banner>
        ) : (
          <>
            {/* Toolbar */}
            <Card>
              <InlineStack align="space-between" wrap={false}>
                <InlineStack gap="200">
                  <Button size="slim" onClick={selectAll}>Select All</Button>
                  <Button size="slim" onClick={clearSelection} disabled={selected.size === 0}>Clear</Button>
                  <Text as="span" tone="subdued">{selected.size} selected</Text>
                </InlineStack>
                <InlineStack gap="200">
                  <Button
                    tone="critical"
                    disabled={selected.size === 0}
                    loading={fetcher.state !== "idle"}
                    onClick={handleDelete}
                  >
                    {`Delete Selected (${selected.size})`}
                  </Button>
                  <Button
                    variant="primary"
                    disabled={selected.size === 0 || !hasApiKey}
                    loading={fetcher.state !== "idle"}
                    onClick={handleGenerate}
                  >
                    {`Generate Selected (${selected.size})`}
                  </Button>
                </InlineStack>
              </InlineStack>
            </Card>

            {/* Matrix */}
            <Card>
              <div style={{ overflowX: "auto" }}>
                <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12 }}>
                  <thead>
                    <tr>
                      <th style={{ padding: 8, border: "1px solid #e1e3e5", background: "#f6f6f7", textAlign: "left", minWidth: 160 }}>Service \ Location</th>
                      {locations.map((loc) => (
                        <th
                          key={loc.id}
                          style={{ padding: 8, border: "1px solid #e1e3e5", background: "#f6f6f7", cursor: "pointer", minWidth: 100, textAlign: "center" }}
                          onClick={() => selectCol(loc.id)}
                          title="Click to select column"
                        >
                          {loc.city}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {services.map((svc) => (
                      <tr key={svc.id}>
                        <td
                          style={{ padding: 8, border: "1px solid #e1e3e5", fontWeight: 600, cursor: "pointer", background: "#fafbfb" }}
                          onClick={() => selectRow(svc.id)}
                          title="Click to select row"
                        >
                          {svc.name}
                        </td>
                        {locations.map((loc) => {
                          const key = `${svc.id}:${loc.id}`;
                          const entry = pageMap[key];
                          const isSelected = selected.has(key);
                          return (
                            <td
                              key={loc.id}
                              style={{
                                padding: 6,
                                border: "1px solid #e1e3e5",
                                background: isSelected ? "#e3f1df" : "white",
                                cursor: "pointer",
                                textAlign: "center",
                              }}
                              onClick={() => toggleCell(svc.id, loc.id)}
                            >
                              {entry ? (
                                <span
                                  style={{ cursor: "pointer" }}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    navigate(`/app/pages/${entry.id}`);
                                  }}
                                >
                                  {statusBadge(entry)}
                                </span>
                              ) : (
                                <Badge tone="new">—</Badge>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ padding: "8px 0", display: "flex", gap: 16 }}>
                <Text as="span" tone="subdued"><Badge tone="success">published</Badge> = live on store</Text>
                <Text as="span" tone="subdued"><Badge tone="info">draft</Badge> = generated, not published</Text>
                <Text as="span" tone="subdued"><Badge tone="new">—</Badge> = not generated</Text>
              </div>
            </Card>
          </>
        )}
      </BlockStack>
    </Page>
  );
}
