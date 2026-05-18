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
  Select,
  TextField,
  RadioButton,
  Banner,
  Divider,
} from "@shopify/polaris";
import { useState } from "react";

import { authenticate } from "~/shopify.server";
import prisma from "~/db.server";

interface ShopifyMenu {
  id: string;
  handle: string;
  title: string;
  itemCount: number;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;

  const resp = await admin.graphql(`
    query {
      menus(first: 30) {
        edges {
          node {
            id
            handle
            title
            items { id }
          }
        }
      }
    }
  `);
  const data = (await resp.json()) as {
    data: { menus: { edges: { node: { id: string; handle: string; title: string; items: { id: string }[] } }[] } };
  };

  const menus: ShopifyMenu[] = data.data.menus.edges.map((e) => ({
    id: e.node.id,
    handle: e.node.handle,
    title: e.node.title,
    itemCount: e.node.items.length,
  }));

  const [serviceCount, locationCount, publishedCount] = await Promise.all([
    prisma.service.count({ where: { shop } }),
    prisma.location.count({ where: { shop } }),
    prisma.generatedPage.count({ where: { shop, status: "published" } }),
  ]);

  return json({ menus, shop, serviceCount, locationCount, publishedCount });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (intent === "build-menu") {
    const menuId = formData.get("menuId") as string;
    const rootTitle = ((formData.get("rootTitle") as string) || "Service Areas").trim();
    const hierarchy = formData.get("hierarchy") as "services-first" | "locations-first";

    const pages = await prisma.generatedPage.findMany({
      where: { shop, status: "published" },
      include: { service: true, location: true },
    });

    if (pages.length === 0) {
      return json({ error: "No published pages yet. Publish some pages first." }, { status: 400 });
    }

    // Build the nested structure
    type Leaf = { title: string; type: "HTTP"; url: string };
    type Group = { title: string; type: "HTTP"; url: string; items: Leaf[] };

    const groups = new Map<string, Group>();

    for (const page of pages) {
      const groupKey =
        hierarchy === "services-first" ? page.service.name : page.location.name;
      const leafTitle =
        hierarchy === "services-first" ? page.location.name : page.service.name;
      const leafUrl = `https://${shop}/apps/pseo/${page.slug}`;

      if (!groups.has(groupKey)) {
        groups.set(groupKey, {
          title: groupKey,
          type: "HTTP",
          url: `https://${shop}/`,
          items: [],
        });
      }
      groups.get(groupKey)!.items.push({
        title: leafTitle,
        type: "HTTP",
        url: leafUrl,
      });
    }

    // Sort groups and leaves alphabetically
    const sortedGroups: Group[] = [...groups.values()]
      .sort((a, b) => a.title.localeCompare(b.title))
      .map((g) => ({
        ...g,
        items: g.items.sort((a, b) => a.title.localeCompare(b.title)),
      }));

    const rootItem = {
      title: rootTitle,
      type: "HTTP" as const,
      url: `https://${shop}/`,
      items: sortedGroups,
    };

    // Fetch current menu so we can append rather than replace
    const menuResp = await admin.graphql(
      `
      query menu($id: ID!) {
        menu(id: $id) {
          id
          handle
          title
          items {
            id
            title
            type
            url
            resourceId
            tags
            items {
              id
              title
              type
              url
              resourceId
              tags
              items {
                id
                title
                type
                url
                resourceId
                tags
              }
            }
          }
        }
      }
    `,
      { variables: { id: menuId } },
    );
    const menuData = (await menuResp.json()) as {
      data: { menu: { id: string; handle: string; title: string; items: MenuItemPayload[] } | null };
    };
    if (!menuData.data.menu) {
      return json({ error: "Menu not found" }, { status: 404 });
    }
    const menu = menuData.data.menu;

    type MenuItemPayload = {
      id: string;
      title: string;
      type: string;
      url: string | null;
      resourceId: string | null;
      tags: string[] | null;
      items?: MenuItemPayload[];
    };

    // Recursively rewrite existing items, stripping our previous "rootTitle" item
    // if it exists (so we replace instead of duplicating).
    function rewrite(items: MenuItemPayload[]): MenuItemUpdateShape[] {
      return items
        .filter((i) => i.title !== rootTitle)
        .map((i) => ({
          id: i.id,
          title: i.title,
          type: i.type,
          url: i.url ?? undefined,
          resourceId: i.resourceId ?? undefined,
          tags: i.tags ?? undefined,
          items: i.items ? rewrite(i.items) : undefined,
        }));
    }

    type MenuItemUpdateShape = {
      id?: string;
      title: string;
      type: string;
      url?: string;
      resourceId?: string;
      tags?: string[];
      items?: MenuItemUpdateShape[];
    };

    const newItems: MenuItemUpdateShape[] = [...rewrite(menu.items), rootItem];

    const updateResp = await admin.graphql(
      `
      mutation menuUpdate(
        $id: ID!
        $title: String!
        $handle: String!
        $items: [MenuItemUpdateInput!]!
      ) {
        menuUpdate(id: $id, title: $title, handle: $handle, items: $items) {
          menu { id }
          userErrors { field message }
        }
      }
    `,
      {
        variables: {
          id: menu.id,
          title: menu.title,
          handle: menu.handle,
          items: newItems,
        },
      },
    );

    const updateData = (await updateResp.json()) as {
      data: { menuUpdate: { menu: { id: string } | null; userErrors: { field: string[]; message: string }[] } };
      errors?: { message: string }[];
    };

    if (updateData.errors && updateData.errors.length > 0) {
      return json(
        { error: `GraphQL: ${updateData.errors.map((e) => e.message).join(", ")}` },
        { status: 500 },
      );
    }
    if (updateData.data.menuUpdate.userErrors.length > 0) {
      return json(
        { error: updateData.data.menuUpdate.userErrors.map((e) => e.message).join(", ") },
        { status: 400 },
      );
    }

    const totalPages = pages.length;
    const totalGroups = sortedGroups.length;
    return json({ success: true, totalPages, totalGroups });
  }

  return json({ error: "Unknown intent" }, { status: 400 });
};

export default function MenuPage() {
  const { menus, serviceCount, locationCount, publishedCount } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();

  const [menuId, setMenuId] = useState(menus[0]?.id ?? "");
  const [rootTitle, setRootTitle] = useState("Service Areas");
  const [hierarchy, setHierarchy] = useState<"services-first" | "locations-first">("services-first");

  const isBusy = fetcher.state !== "idle";
  const data = fetcher.data as
    | { success: boolean; totalPages: number; totalGroups: number }
    | { error: string }
    | undefined;

  const handleBuild = () => {
    fetcher.submit({ intent: "build-menu", menuId, rootTitle, hierarchy }, { method: "POST" });
  };

  const previewLevel1 =
    hierarchy === "services-first"
      ? `${serviceCount} services`
      : `${locationCount} locations`;
  const previewLevel2 =
    hierarchy === "services-first"
      ? `${locationCount} locations under each`
      : `${serviceCount} services under each`;

  return (
    <Page title="Add pages to your storefront menu">
      <BlockStack gap="500">
        {publishedCount === 0 && (
          <Banner tone="warning">
            <p>
              You have <strong>0 published pages</strong>. Publish some pages first, then come back to add them to the menu.
            </p>
          </Banner>
        )}

        {data && "success" in data && (
          <Banner tone="success" title={`Added "${rootTitle}" to your menu`}>
            <p>
              {data.totalGroups} groups with {data.totalPages} total page links. Open your storefront to see it.
            </p>
          </Banner>
        )}

        {data && "error" in data && <Banner tone="critical">{data.error}</Banner>}

        <Card>
          <BlockStack gap="400">
            <Text variant="headingMd" as="h2">
              Which menu?
            </Text>
            {menus.length === 0 ? (
              <Text as="p" tone="subdued">
                No menus found on your store. Create a menu first under Online Store → Navigation, then come back.
              </Text>
            ) : (
              <Select
                label=""
                labelHidden
                value={menuId}
                onChange={setMenuId}
                options={menus.map((m) => ({
                  label: `${m.title} (${m.itemCount} items)`,
                  value: m.id,
                }))}
              />
            )}
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="400">
            <Text variant="headingMd" as="h2">
              Top-level label
            </Text>
            <Text as="p" tone="subdued">
              Visitors see this in the menu bar. Hovering it opens the dropdown.
            </Text>
            <TextField
              label=""
              labelHidden
              value={rootTitle}
              onChange={setRootTitle}
              autoComplete="off"
              placeholder="Service Areas"
            />
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="400">
            <Text variant="headingMd" as="h2">
              How should it be organized?
            </Text>
            <BlockStack gap="200">
              <RadioButton
                label="Services first → Locations second"
                helpText="Roof Builder ▸ Brandon, Clifton, Pearl..."
                checked={hierarchy === "services-first"}
                onChange={() => setHierarchy("services-first")}
              />
              <RadioButton
                label="Locations first → Services second"
                helpText="Brandon ▸ Roof Builder, Roof Repair..."
                checked={hierarchy === "locations-first"}
                onChange={() => setHierarchy("locations-first")}
              />
            </BlockStack>

            <Divider />
            <Text as="p" tone="subdued" variant="bodySm">
              Preview: <strong>{rootTitle}</strong> dropdown → {previewLevel1} → {previewLevel2}
            </Text>
          </BlockStack>
        </Card>

        <Card>
          <InlineStack align="space-between" blockAlign="center">
            <Text as="p" tone="subdued" variant="bodySm">
              Re-running replaces the existing "{rootTitle}" entry. Other menu items aren't touched.
            </Text>
            <Button
              variant="primary"
              onClick={handleBuild}
              loading={isBusy}
              disabled={publishedCount === 0 || !menuId}
            >
              Add to menu
            </Button>
          </InlineStack>
        </Card>

        <Card>
          <BlockStack gap="200">
            <Text variant="headingSm" as="h3">
              Heads up about themes
            </Text>
            <Text as="p" tone="subdued" variant="bodySm">
              Most modern Shopify themes (Dawn, Sense, Refresh, etc.) support 3-level dropdowns
              out of the box. A few older themes only render 2 levels — in that case, locations or
              services under each group won't show up. Test on your live storefront and switch to
              a flatter hierarchy if needed.
            </Text>
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}
