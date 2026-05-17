import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  TextField,
  Select,
  Button,
  Banner,
  FormLayout,
  Divider,
} from "@shopify/polaris";
import { useState } from "react";

import { authenticate } from "~/shopify.server";
import prisma from "~/db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const settings = await prisma.appSettings.findUnique({ where: { shop } });
  return json({ settings, shop });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();

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
  const { settings } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();

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

  const set = (key: string) => (v: string) => setForm((f) => ({ ...f, [key]: v }));

  const handleSave = () => {
    fetcher.submit(form, { method: "POST" });
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
