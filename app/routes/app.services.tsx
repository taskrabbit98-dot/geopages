import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";
import {
  Page,
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
} from "@shopify/polaris";
import { useState } from "react";

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

  const services = await prisma.service.findMany({
    where: { shop },
    include: {
      _count: { select: { pages: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  return json({ services });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (intent === "create") {
    const name = (formData.get("name") as string).trim();
    const description = (formData.get("description") as string).trim();
    const slug = slugify(name);

    if (!name) return json({ error: "Name is required" }, { status: 400 });

    const existing = await prisma.service.findFirst({ where: { shop, slug } });
    if (existing) return json({ error: "A service with this slug already exists" }, { status: 400 });

    const service = await prisma.service.create({
      data: { shop, name, slug, description: description || null },
    });
    return json({ success: true, service });
  }

  if (intent === "bulk-create") {
    const rawLines = (formData.get("names") as string) || "";
    const names = rawLines
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    if (names.length === 0) return json({ error: "No service names provided" }, { status: 400 });

    let created = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const name of names) {
      const slug = slugify(name);
      if (!slug) {
        skipped++;
        continue;
      }
      try {
        await prisma.service.upsert({
          where: { shop_slug: { shop, slug } },
          create: { shop, name, slug },
          update: {},
        });
        created++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`${name}: ${msg}`);
      }
    }

    return json({ success: true, created, skipped, errors });
  }

  if (intent === "delete") {
    const id = formData.get("id") as string;
    await prisma.service.delete({ where: { id } });
    return json({ success: true });
  }

  return json({ error: "Unknown intent" }, { status: 400 });
};

export default function Services() {
  const { services } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [bulkNames, setBulkNames] = useState("");

  const handleCreate = () => {
    if (!newName.trim()) return;
    fetcher.submit(
      { intent: "create", name: newName, description: newDescription },
      { method: "POST" }
    );
    setShowCreateModal(false);
    setNewName("");
    setNewDescription("");
  };

  const handleBulkCreate = () => {
    if (!bulkNames.trim()) return;
    fetcher.submit({ intent: "bulk-create", names: bulkNames }, { method: "POST" });
    setShowBulkModal(false);
    setBulkNames("");
  };

  const bulkResult = fetcher.data as
    | { success: boolean; created?: number; skipped?: number; errors?: string[] }
    | undefined;

  return (
    <Page
      title="Services"
      primaryAction={{ content: "Add Service", onAction: () => setShowCreateModal(true) }}
      secondaryActions={[
        { content: "Bulk add", onAction: () => setShowBulkModal(true) },
      ]}
    >
      <BlockStack gap="400">
        {bulkResult && bulkResult.created != null && (
          <Banner tone="success">
            Added {bulkResult.created} service(s).
            {bulkResult.skipped ? ` Skipped ${bulkResult.skipped} blank line(s).` : ""}
            {bulkResult.errors && bulkResult.errors.length > 0 && (
              <ul style={{ marginTop: 8, fontSize: 12 }}>
                {bulkResult.errors.slice(0, 5).map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            )}
          </Banner>
        )}

        <Banner tone="info">
          <p>
            Looking for <strong>Trust Links</strong>? They moved to{" "}
            <a href="/app/settings#trust-links" style={{ textDecoration: "underline" }}>
              Settings → Trust Links
            </a>{" "}
            and now apply to <em>all</em> services at once (one set per shop).
          </p>
        </Banner>

        {services.length === 0 ? (
          <Card>
            <EmptyState
              heading="No services yet"
              action={{ content: "Add your first service", onAction: () => setShowCreateModal(true) }}
              image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
            >
              <p>Add the services your business offers (e.g., Roof Repair, Gutter Cleaning).</p>
            </EmptyState>
          </Card>
        ) : (
          services.map((service) => (
            <Card key={service.id}>
              <InlineStack align="space-between">
                <BlockStack gap="100">
                  <Text variant="headingMd" as="h2">{service.name}</Text>
                  <Text as="p" tone="subdued">/{service.slug} · {service._count.pages} pages generated</Text>
                </BlockStack>
                <Button
                  size="slim"
                  tone="critical"
                  onClick={() =>
                    fetcher.submit({ intent: "delete", id: service.id }, { method: "POST" })
                  }
                >
                  Delete
                </Button>
              </InlineStack>
            </Card>
          ))
        )}
      </BlockStack>

      <Modal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Add Service"
        primaryAction={{ content: "Add", onAction: handleCreate }}
        secondaryActions={[{ content: "Cancel", onAction: () => setShowCreateModal(false) }]}
      >
        <Modal.Section>
          <FormLayout>
            <TextField
              label="Service Name"
              value={newName}
              onChange={setNewName}
              autoComplete="off"
              placeholder="e.g., Roof Repair"
              helpText="This will be used as the service keyword in all generated pages."
            />
            <TextField
              label="Description (optional)"
              value={newDescription}
              onChange={setNewDescription}
              autoComplete="off"
              multiline={3}
              placeholder="Describe this service — used as AI context for content generation."
            />
          </FormLayout>
        </Modal.Section>
      </Modal>

      <Modal
        open={showBulkModal}
        onClose={() => setShowBulkModal(false)}
        title="Bulk add services"
        primaryAction={{ content: "Add all", onAction: handleBulkCreate, disabled: !bulkNames.trim() }}
        secondaryActions={[{ content: "Cancel", onAction: () => setShowBulkModal(false) }]}
      >
        <Modal.Section>
          <BlockStack gap="300">
            <Text as="p" tone="subdued">
              Paste one service name per line. Duplicates (by slug) are skipped automatically.
            </Text>
            <TextField
              label="Services"
              value={bulkNames}
              onChange={setBulkNames}
              autoComplete="off"
              multiline={10}
              placeholder={`Roof Repair\nRoof Builder\nGutter Cleaning\nSiding Installation\nWindow Replacement`}
              helpText="One per line. Slugs auto-generated."
            />
          </BlockStack>
        </Modal.Section>
      </Modal>
    </Page>
  );
}
