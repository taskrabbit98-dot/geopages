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
  EmptyState,
  Modal,
  TextField,
  FormLayout,
  Banner,
  DropZone,
} from "@shopify/polaris";
import { useState, useCallback } from "react";
import Papa from "papaparse";

import { authenticate } from "~/shopify.server";
import prisma from "~/db.server";

function slugify(str: string) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const locations = await prisma.location.findMany({
    where: { shop },
    include: { _count: { select: { pages: true } } },
    orderBy: [{ state: "asc" }, { city: "asc" }],
  });

  return json({ locations });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (intent === "create") {
    const city = (formData.get("city") as string).trim();
    const state = (formData.get("state") as string).trim();
    const zip = (formData.get("zip") as string | null)?.trim() || null;
    const lat = formData.get("lat") ? Number(formData.get("lat")) : null;
    const lng = formData.get("lng") ? Number(formData.get("lng")) : null;

    if (!city || !state) return json({ error: "City and state are required" }, { status: 400 });

    const name = `${city}, ${state}`;
    const slug = slugify(`${city}-${state}`);

    const existing = await prisma.location.findFirst({ where: { shop, slug } });
    if (existing) return json({ error: "Location already exists" }, { status: 400 });

    const location = await prisma.location.create({
      data: { shop, name, slug, city, state, zip, lat, lng },
    });
    return json({ success: true, location });
  }

  if (intent === "bulk-import") {
    const csvData = formData.get("csvData") as string;
    if (!csvData) return json({ error: "No CSV data" }, { status: 400 });

    const parsed = Papa.parse<{ city: string; state: string; zip?: string; lat?: string; lng?: string }>(
      csvData,
      { header: true, skipEmptyLines: true }
    );

    let created = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const row of parsed.data) {
      const city = row.city?.trim();
      const state = row.state?.trim();
      if (!city || !state) { skipped++; continue; }

      const name = `${city}, ${state}`;
      const slug = slugify(`${city}-${state}`);
      const lat = row.lat ? Number(row.lat) : null;
      const lng = row.lng ? Number(row.lng) : null;

      try {
        await prisma.location.upsert({
          where: { shop_slug: { shop, slug } },
          create: { shop, name, slug, city, state, zip: row.zip?.trim() || null, lat, lng },
          update: {},
        });
        created++;
      } catch (e) {
        errors.push(`${city}, ${state}: ${e instanceof Error ? e.message : String(e)}`);
        skipped++;
      }
    }

    return json({ success: true, created, skipped, errors });
  }

  if (intent === "delete") {
    const id = formData.get("id") as string;
    await prisma.location.delete({ where: { id } });
    return json({ success: true });
  }

  return json({ error: "Unknown intent" }, { status: 400 });
};

export default function Locations() {
  const { locations } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [form, setForm] = useState({ city: "", state: "", zip: "", lat: "", lng: "" });
  const [csvPreview, setCsvPreview] = useState<{ city: string; state: string }[]>([]);
  const [csvRaw, setCsvRaw] = useState("");

  const handleCreate = () => {
    if (!form.city.trim() || !form.state.trim()) return;
    fetcher.submit({ intent: "create", ...form }, { method: "POST" });
    setShowCreateModal(false);
    setForm({ city: "", state: "", zip: "", lat: "", lng: "" });
  };

  const handleCsvDrop = useCallback(
    (_: File[], acceptedFiles: File[]) => {
      const file = acceptedFiles[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        setCsvRaw(text);
        const parsed = Papa.parse<{ city: string; state: string }>(text, {
          header: true,
          skipEmptyLines: true,
        });
        setCsvPreview(parsed.data.slice(0, 5));
      };
      reader.readAsText(file);
    },
    []
  );

  const handleImport = () => {
    if (!csvRaw) return;
    fetcher.submit({ intent: "bulk-import", csvData: csvRaw }, { method: "POST" });
    setShowImportModal(false);
    setCsvRaw("");
    setCsvPreview([]);
  };

  const grouped = locations.reduce<Record<string, typeof locations>>((acc, loc) => {
    if (!acc[loc.state]) acc[loc.state] = [];
    acc[loc.state].push(loc);
    return acc;
  }, {});

  return (
    <Page
      title="Locations"
      primaryAction={{ content: "Add Location", onAction: () => setShowCreateModal(true) }}
      secondaryActions={[{ content: "Bulk Import CSV", onAction: () => setShowImportModal(true) }]}
    >
      <BlockStack gap="400">
        {fetcher.data && "created" in fetcher.data && (
          <Banner tone="success">
            Imported {(fetcher.data as unknown as { created: number; skipped: number }).created} locations.{" "}
            Skipped {(fetcher.data as unknown as { created: number; skipped: number }).skipped}.
          </Banner>
        )}

        {locations.length === 0 ? (
          <Card>
            <EmptyState
              heading="No locations yet"
              action={{ content: "Add your first location", onAction: () => setShowCreateModal(true) }}
              secondaryAction={{ content: "Import from CSV", onAction: () => setShowImportModal(true) }}
              image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
            >
              <p>Add the cities and states where your business operates.</p>
            </EmptyState>
          </Card>
        ) : (
          Object.entries(grouped).map(([state, locs]) => (
            <Card key={state}>
              <BlockStack gap="300">
                <Text variant="headingMd" as="h2">{state} ({locs.length})</Text>
                {locs.map((loc) => (
                  <InlineStack key={loc.id} align="space-between">
                    <BlockStack gap="100">
                      <Text as="span" fontWeight="bold">{loc.name}</Text>
                      <Text as="span" tone="subdued">/{loc.slug} · {loc._count.pages} pages</Text>
                    </BlockStack>
                    <Button
                      size="slim"
                      tone="critical"
                      onClick={() =>
                        fetcher.submit({ intent: "delete", id: loc.id }, { method: "POST" })
                      }
                    >
                      Delete
                    </Button>
                  </InlineStack>
                ))}
              </BlockStack>
            </Card>
          ))
        )}
      </BlockStack>

      {/* Create Modal */}
      <Modal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Add Location"
        primaryAction={{ content: "Add", onAction: handleCreate }}
        secondaryActions={[{ content: "Cancel", onAction: () => setShowCreateModal(false) }]}
      >
        <Modal.Section>
          <FormLayout>
            <FormLayout.Group>
              <TextField label="City" value={form.city} onChange={(v) => setForm((f) => ({ ...f, city: v }))} autoComplete="off" placeholder="Miami" />
              <TextField label="State" value={form.state} onChange={(v) => setForm((f) => ({ ...f, state: v }))} autoComplete="off" placeholder="FL" />
            </FormLayout.Group>
            <FormLayout.Group>
              <TextField label="ZIP (optional)" value={form.zip} onChange={(v) => setForm((f) => ({ ...f, zip: v }))} autoComplete="off" />
              <TextField label="Latitude (optional)" value={form.lat} onChange={(v) => setForm((f) => ({ ...f, lat: v }))} autoComplete="off" placeholder="25.7617" />
              <TextField label="Longitude (optional)" value={form.lng} onChange={(v) => setForm((f) => ({ ...f, lng: v }))} autoComplete="off" placeholder="-80.1918" />
            </FormLayout.Group>
          </FormLayout>
        </Modal.Section>
      </Modal>

      {/* CSV Import Modal */}
      <Modal
        open={showImportModal}
        onClose={() => setShowImportModal(false)}
        title="Bulk Import Locations from CSV"
        primaryAction={{ content: "Import", onAction: handleImport, disabled: !csvRaw }}
        secondaryActions={[{ content: "Cancel", onAction: () => setShowImportModal(false) }]}
      >
        <Modal.Section>
          <BlockStack gap="400">
            <Text as="p">CSV must have columns: <code>city, state</code> (and optionally <code>zip, lat, lng</code>).</Text>
            <DropZone onDrop={handleCsvDrop} accept=".csv,text/csv">
              <DropZone.FileUpload actionTitle="Upload CSV" actionHint="or drop a CSV file here" />
            </DropZone>
            {csvPreview.length > 0 && (
              <BlockStack gap="200">
                <Text variant="headingSm" as="h4">Preview (first 5 rows)</Text>
                {csvPreview.map((row, i) => (
                  <Text key={i} as="p">{row.city}, {row.state}</Text>
                ))}
              </BlockStack>
            )}
          </BlockStack>
        </Modal.Section>
      </Modal>
    </Page>
  );
}
