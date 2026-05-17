import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useSubmit, useFetcher } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  InlineStack,
  IndexTable,
  Badge,
  Button,
  EmptyState,
  Modal,
  TextField,
  FormLayout,
  Banner,
  Divider,
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
      directoryLinks: true,
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

  if (intent === "delete") {
    const id = formData.get("id") as string;
    await prisma.service.delete({ where: { id } });
    return json({ success: true });
  }

  if (intent === "add-link") {
    const serviceId = formData.get("serviceId") as string;
    const platform = (formData.get("platform") as string).trim();
    const url = (formData.get("url") as string).trim();
    const anchorText = (formData.get("anchorText") as string).trim();

    if (!platform || !url || !anchorText)
      return json({ error: "All directory link fields are required" }, { status: 400 });

    await prisma.directoryLink.create({ data: { serviceId, platform, url, anchorText } });
    return json({ success: true });
  }

  if (intent === "delete-link") {
    const id = formData.get("id") as string;
    await prisma.directoryLink.delete({ where: { id } });
    return json({ success: true });
  }

  return json({ error: "Unknown intent" }, { status: 400 });
};

const SUGGESTED_DIRECTORIES = [
  { platform: "Yelp", anchor: "Find us on Yelp" },
  { platform: "Manta", anchor: "See us on Manta" },
  { platform: "BBB", anchor: "We're BBB Accredited" },
  { platform: "Angi", anchor: "Reviews on Angi" },
  { platform: "HomeAdvisor", anchor: "Find us on HomeAdvisor" },
  { platform: "Thumbtack", anchor: "Hire us on Thumbtack" },
  { platform: "YellowPages", anchor: "Yellow Pages listing" },
  { platform: "Houzz", anchor: "Find us on Houzz" },
  { platform: "Nextdoor", anchor: "See us on Nextdoor" },
];

export default function Services() {
  const { services } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [expandedServiceId, setExpandedServiceId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [linkForm, setLinkForm] = useState({ platform: "", url: "", anchorText: "" });

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

  const handleAddLink = (serviceId: string) => {
    if (!linkForm.platform || !linkForm.url || !linkForm.anchorText) return;
    fetcher.submit(
      { intent: "add-link", serviceId, ...linkForm },
      { method: "POST" }
    );
    setLinkForm({ platform: "", url: "", anchorText: "" });
  };

  return (
    <Page
      title="Services"
      primaryAction={{ content: "Add Service", onAction: () => setShowCreateModal(true) }}
    >
      <BlockStack gap="400">
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
          services.map((service) => {
            const isExpanded = expandedServiceId === service.id;
            return (
              <Card key={service.id}>
                <BlockStack gap="400">
                  <InlineStack align="space-between">
                    <BlockStack gap="100">
                      <Text variant="headingMd" as="h2">{service.name}</Text>
                      <Text as="p" tone="subdued">/{service.slug} · {service._count.pages} pages generated</Text>
                    </BlockStack>
                    <InlineStack gap="200">
                      <Button
                        size="slim"
                        onClick={() => setExpandedServiceId(isExpanded ? null : service.id)}
                      >
                        {isExpanded ? "Hide Links" : `Directory Links (${service.directoryLinks.length})`}
                      </Button>
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
                  </InlineStack>

                  {service.directoryLinks.length < 5 && (
                    <Banner tone="warning">
                      <p>
                        This service has only {service.directoryLinks.length} directory link(s). Add at least 5 for optimal SEO.
                      </p>
                    </Banner>
                  )}

                  {isExpanded && (
                    <BlockStack gap="300">
                      <Divider />
                      <Text variant="headingMd" as="h3">Directory Links</Text>

                      {service.directoryLinks.map((link) => (
                        <InlineStack key={link.id} align="space-between">
                          <BlockStack gap="100">
                            <Text as="span" fontWeight="bold">{link.platform}</Text>
                            <Text as="span" tone="subdued">{link.url}</Text>
                          </BlockStack>
                          <Button
                            size="slim"
                            tone="critical"
                            onClick={() =>
                              fetcher.submit(
                                { intent: "delete-link", id: link.id },
                                { method: "POST" }
                              )
                            }
                          >
                            Remove
                          </Button>
                        </InlineStack>
                      ))}

                      <Text variant="headingSm" as="h4">Add Directory Link</Text>
                      <FormLayout>
                        <FormLayout.Group>
                          <TextField
                            label="Platform"
                            value={linkForm.platform}
                            onChange={(v) => setLinkForm((f) => ({ ...f, platform: v }))}
                            autoComplete="off"
                            placeholder="e.g., Yelp"
                            helpText="Suggestions: Yelp, Manta, BBB, Angi, HomeAdvisor, Thumbtack, YellowPages"
                          />
                          <TextField
                            label="URL"
                            value={linkForm.url}
                            onChange={(v) => setLinkForm((f) => ({ ...f, url: v }))}
                            autoComplete="off"
                            placeholder="https://yelp.com/biz/..."
                          />
                          <TextField
                            label="Anchor Text"
                            value={linkForm.anchorText}
                            onChange={(v) => setLinkForm((f) => ({ ...f, anchorText: v }))}
                            autoComplete="off"
                            placeholder="Find us on Yelp"
                          />
                        </FormLayout.Group>
                      </FormLayout>
                      <Button
                        size="slim"
                        onClick={() => handleAddLink(service.id)}
                        loading={fetcher.state !== "idle"}
                      >
                        Add Link
                      </Button>

                      <Text variant="headingSm" as="h4">Suggested Platforms</Text>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                        {SUGGESTED_DIRECTORIES.map((dir) => (
                          <Button
                            key={dir.platform}
                            size="micro"
                            onClick={() =>
                              setLinkForm((f) => ({
                                ...f,
                                platform: dir.platform,
                                anchorText: dir.anchor,
                              }))
                            }
                          >
                            {dir.platform}
                          </Button>
                        ))}
                      </div>
                    </BlockStack>
                  )}
                </BlockStack>
              </Card>
            );
          })
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
    </Page>
  );
}
