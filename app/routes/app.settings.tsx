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
  TextField,
  Select,
  Button,
  Banner,
  FormLayout,
} from "@shopify/polaris";
import { useState } from "react";

import { authenticate } from "~/shopify.server";
import prisma from "~/db.server";
import { TRUST_LINK_PRESETS } from "~/lib/content/trustLinks";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const [settings, trustLinks] = await Promise.all([
    prisma.appSettings.findUnique({ where: { shop } }),
    prisma.trustLinkTemplate.findMany({ where: { shop }, orderBy: { sortOrder: "asc" } }),
  ]);
  return json({ settings, trustLinks, shop });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();
  const intent = formData.get("intent") as string | null;

  if (intent === "add-trust-link") {
    const platform = (formData.get("platform") as string).trim();
    const urlTemplate = (formData.get("urlTemplate") as string).trim();
    if (!platform || !urlTemplate) {
      return json({ error: "Platform and URL template are required" }, { status: 400 });
    }
    await prisma.trustLinkTemplate.create({
      data: { shop, platform, urlTemplate },
    });
    return json({ success: true });
  }

  if (intent === "delete-trust-link") {
    const id = formData.get("id") as string;
    await prisma.trustLinkTemplate.delete({ where: { id } });
    return json({ success: true });
  }

  if (intent === "add-trust-preset") {
    const platform = (formData.get("platform") as string).trim();
    const urlTemplate = (formData.get("urlTemplate") as string).trim();
    await prisma.trustLinkTemplate.create({
      data: { shop, platform, urlTemplate },
    });
    return json({ success: true });
  }

  const data = {
    businessName: (formData.get("businessName") as string).trim(),
    businessPhone: (formData.get("businessPhone") as string).trim(),
    businessAddress: (formData.get("businessAddress") as string).trim(),
    businessWebsite: (formData.get("businessWebsite") as string).trim(),
    defaultAiModel: formData.get("defaultAiModel") as string,
    imageStrategy: formData.get("imageStrategy") as string,
    openaiApiKey: (formData.get("openaiApiKey") as string).trim() || null,
    geminiApiKey: (formData.get("geminiApiKey") as string).trim() || null,
    googleMapsKey: (formData.get("googleMapsKey") as string).trim() || null,
    unsplashKey: (formData.get("unsplashKey") as string).trim() || null,
  };

  await prisma.appSettings.upsert({
    where: { shop },
    create: { shop, ...data },
    update: data,
  });

  return json({ success: true });
};

export default function Settings() {
  const { settings, trustLinks } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const trustFetcher = useFetcher<typeof action>();

  const [form, setForm] = useState({
    businessName: settings?.businessName ?? "",
    businessPhone: settings?.businessPhone ?? "",
    businessAddress: settings?.businessAddress ?? "",
    businessWebsite: settings?.businessWebsite ?? "",
    defaultAiModel: settings?.defaultAiModel ?? "openai",
    imageStrategy: settings?.imageStrategy ?? "unsplash",
    openaiApiKey: settings?.openaiApiKey ?? "",
    geminiApiKey: settings?.geminiApiKey ?? "",
    googleMapsKey: settings?.googleMapsKey ?? "",
    unsplashKey: settings?.unsplashKey ?? "",
  });

  const [trustForm, setTrustForm] = useState({ platform: "", urlTemplate: "" });

  const set = (key: string) => (v: string) => setForm((f) => ({ ...f, [key]: v }));

  const handleSave = () => {
    fetcher.submit(form, { method: "POST" });
  };

  const handleAddTrustLink = () => {
    if (!trustForm.platform || !trustForm.urlTemplate) return;
    trustFetcher.submit(
      { intent: "add-trust-link", platform: trustForm.platform, urlTemplate: trustForm.urlTemplate },
      { method: "POST" },
    );
    setTrustForm({ platform: "", urlTemplate: "" });
  };

  const handleAddPreset = (preset: { platform: string; urlTemplate: string }) => {
    trustFetcher.submit(
      { intent: "add-trust-preset", platform: preset.platform, urlTemplate: preset.urlTemplate },
      { method: "POST" },
    );
  };

  const handleDeleteTrustLink = (id: string) => {
    trustFetcher.submit({ intent: "delete-trust-link", id }, { method: "POST" });
  };

  return (
    <Page
      title="Settings"
      primaryAction={{ content: "Save Settings", onAction: handleSave, loading: fetcher.state !== "idle" }}
    >
      <BlockStack gap="500">
        {fetcher.data?.success && <Banner tone="success">Settings saved successfully.</Banner>}

        <Layout>
          <Layout.Section>
            <BlockStack gap="400">
              {/* Business Info */}
              <Card>
                <BlockStack gap="400">
                  <Text variant="headingMd" as="h2">Business Information (NAP)</Text>
                  <Text as="p" tone="subdued">
                    This data is embedded in every generated page for NAP consistency and schema.org markup.
                  </Text>
                  <FormLayout>
                    <TextField label="Business Name" value={form.businessName} onChange={set("businessName")} autoComplete="organization" />
                    <FormLayout.Group>
                      <TextField label="Phone" value={form.businessPhone} onChange={set("businessPhone")} autoComplete="tel" placeholder="+1 (555) 000-0000" />
                      <TextField label="Website" value={form.businessWebsite} onChange={set("businessWebsite")} autoComplete="url" placeholder="https://example.com" />
                    </FormLayout.Group>
                    <TextField label="Address" value={form.businessAddress} onChange={set("businessAddress")} autoComplete="street-address" placeholder="123 Main St, Miami, FL" />
                  </FormLayout>
                </BlockStack>
              </Card>

              {/* Trust Links */}
              <Card>
                <BlockStack gap="400">
                  <a id="trust-links" />
                  <Text variant="headingMd" as="h2">Trust Links</Text>
                  <Text as="p" tone="subdued">
                    URL templates for third-party directory <strong>search pages</strong>. When a page is
                    generated for "Roof Repair in Biloxi, MS", the placeholders in each template get
                    filled in, and the resulting URLs are embedded inline as anchors on the service
                    name throughout the article.
                  </Text>
                  <Text as="p" tone="subdued" variant="bodySm">
                    Placeholders: <code>{"{service}"}</code> <code>{"{city}"}</code>{" "}
                    <code>{"{state}"}</code> <code>{"{zip}"}</code> <code>{"{service-slug}"}</code>{" "}
                    <code>{"{city-slug}"}</code> <code>{"{state-slug}"}</code>
                  </Text>

                  {trustLinks.length > 0 && (
                    <BlockStack gap="200">
                      <Text variant="headingSm" as="h3">Active templates ({trustLinks.length})</Text>
                      {trustLinks.map((t) => (
                        <InlineStack key={t.id} align="space-between" gap="200" blockAlign="center">
                          <BlockStack gap="100">
                            <Text as="span" fontWeight="bold">{t.platform}</Text>
                            <Text as="span" tone="subdued" variant="bodySm">
                              <code>{t.urlTemplate}</code>
                            </Text>
                          </BlockStack>
                          <Button
                            size="slim"
                            tone="critical"
                            onClick={() => handleDeleteTrustLink(t.id)}
                          >
                            Remove
                          </Button>
                        </InlineStack>
                      ))}
                    </BlockStack>
                  )}

                  <Text variant="headingSm" as="h3">Quick add (presets)</Text>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {TRUST_LINK_PRESETS.map((p) => {
                      const alreadyAdded = trustLinks.some((t) => t.platform === p.platform);
                      return (
                        <Button
                          key={p.platform}
                          size="slim"
                          disabled={alreadyAdded}
                          onClick={() => handleAddPreset(p)}
                        >
                          {alreadyAdded ? `✓ ${p.platform}` : `+ ${p.platform}`}
                        </Button>
                      );
                    })}
                  </div>

                  <Text variant="headingSm" as="h3">Or add a custom template</Text>
                  <FormLayout>
                    <FormLayout.Group>
                      <TextField
                        label="Platform name"
                        value={trustForm.platform}
                        onChange={(v) => setTrustForm((f) => ({ ...f, platform: v }))}
                        autoComplete="off"
                        placeholder="Local Chamber"
                      />
                      <TextField
                        label="URL template (with placeholders)"
                        value={trustForm.urlTemplate}
                        onChange={(v) => setTrustForm((f) => ({ ...f, urlTemplate: v }))}
                        autoComplete="off"
                        placeholder="https://example.com/find?q={service}&city={city}"
                      />
                    </FormLayout.Group>
                  </FormLayout>
                  <InlineStack align="end">
                    <Button onClick={handleAddTrustLink} loading={trustFetcher.state !== "idle"}>
                      Add custom template
                    </Button>
                  </InlineStack>
                </BlockStack>
              </Card>

              {/* AI Config */}
              <Card>
                <BlockStack gap="400">
                  <Text variant="headingMd" as="h2">AI Configuration</Text>
                  <FormLayout>
                    <Select
                      label="Default AI Model"
                      value={form.defaultAiModel}
                      onChange={set("defaultAiModel")}
                      options={[
                        { label: "OpenAI GPT-4o (recommended)", value: "openai" },
                        { label: "Google Gemini 1.5 Pro", value: "gemini" },
                      ]}
                    />
                    <TextField
                      label="OpenAI API Key"
                      value={form.openaiApiKey}
                      onChange={set("openaiApiKey")}
                      autoComplete="off"
                      type="password"
                      placeholder="sk-..."
                      helpText="Get your key at platform.openai.com"
                    />
                    <TextField
                      label="Google Gemini API Key"
                      value={form.geminiApiKey}
                      onChange={set("geminiApiKey")}
                      autoComplete="off"
                      type="password"
                      helpText="Get your key at ai.google.dev"
                    />
                  </FormLayout>
                </BlockStack>
              </Card>

              {/* Image Config */}
              <Card>
                <BlockStack gap="400">
                  <Text variant="headingMd" as="h2">Image Strategy</Text>
                  <FormLayout>
                    <Select
                      label="Default Image Source"
                      value={form.imageStrategy}
                      onChange={set("imageStrategy")}
                      options={[
                        { label: "Unsplash (free stock photos)", value: "unsplash" },
                        { label: "DALL-E 3 (AI-generated)", value: "dalle" },
                        { label: "No automatic images", value: "none" },
                      ]}
                    />
                    <TextField
                      label="Unsplash Access Key"
                      value={form.unsplashKey}
                      onChange={set("unsplashKey")}
                      autoComplete="off"
                      type="password"
                      helpText="Free at unsplash.com/developers"
                    />
                  </FormLayout>
                </BlockStack>
              </Card>

              {/* Maps */}
              <Card>
                <BlockStack gap="300">
                  <Text variant="headingMd" as="h2">Google Maps</Text>
                  <TextField
                    label="Google Maps Embed API Key"
                    value={form.googleMapsKey}
                    onChange={set("googleMapsKey")}
                    autoComplete="off"
                    type="password"
                    helpText="Enables embedded Google Maps on pages with lat/lng data. Get a key at console.cloud.google.com (Maps Embed API)."
                  />
                </BlockStack>
              </Card>
            </BlockStack>
          </Layout.Section>

          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="300">
                <Text variant="headingMd" as="h2">Required Shopify Scopes</Text>
                <Text as="p" tone="subdued">
                  Make sure your app has these scopes approved in the Partner Dashboard:
                </Text>
                <ul style={{ paddingLeft: 16 }}>
                  {[
                    "write_content",
                    "read_content",
                    "write_metaobjects",
                    "read_metaobjects",
                  ].map((scope) => (
                    <li key={scope}><code>{scope}</code></li>
                  ))}
                </ul>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>

        <Button variant="primary" onClick={handleSave} loading={fetcher.state !== "idle"}>
          Save Settings
        </Button>
      </BlockStack>
    </Page>
  );
}
