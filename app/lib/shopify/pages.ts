/**
 * Shopify Pages API wrapper via GraphQL Admin API.
 */

interface CreatePageParams {
  title: string;
  handle: string;
  bodyHtml: string;
  metaTitle: string;
  metaDescription: string;
  published: boolean;
}

interface ShopifyPage {
  id: string;
  handle: string;
  title: string;
  onlineStoreUrl?: string | null;
}

/**
 * Creates a page on the Shopify store via GraphQL Admin API.
 * Returns the new page GID.
 */
export async function createShopifyPage(
  admin: { graphql: (query: string, options?: object) => Promise<{ json: () => Promise<unknown> }> },
  params: CreatePageParams
): Promise<ShopifyPage> {
  const mutation = `
    mutation pageCreate($page: PageCreateInput!) {
      pageCreate(page: $page) {
        page {
          id
          handle
          title
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const variables = {
    page: {
      title: params.title,
      handle: params.handle,
      body: params.bodyHtml,
      isPublished: params.published,
      metafields: [
        {
          namespace: "seo",
          key: "title",
          type: "single_line_text_field",
          value: params.metaTitle,
        },
        {
          namespace: "seo",
          key: "description",
          type: "single_line_text_field",
          value: params.metaDescription,
        },
      ],
    },
  };

  let response;
  try {
    response = await admin.graphql(mutation, { variables });
  } catch (err: unknown) {
    const e = err as { body?: { errors?: unknown }; graphQLErrors?: unknown; message?: string };
    const gqlErrors = e?.body?.errors ?? e?.graphQLErrors;
    console.error("[pageCreate] GraphQL request failed", {
      message: e?.message,
      gqlErrors: JSON.stringify(gqlErrors, null, 2),
      variables: JSON.stringify(variables, null, 2),
    });
    throw new Error(
      `Shopify pageCreate failed: ${e?.message ?? "unknown error"}. Details: ${JSON.stringify(gqlErrors)}`
    );
  }

  const data = (await response.json()) as {
    data?: { pageCreate?: { page: ShopifyPage; userErrors: { field: string; message: string }[] } };
    errors?: { message: string }[];
  };

  if (data.errors && data.errors.length > 0) {
    console.error("[pageCreate] GraphQL errors", JSON.stringify(data.errors, null, 2));
    throw new Error(`Shopify pageCreate GraphQL errors: ${data.errors.map((e) => e.message).join(", ")}`);
  }

  const userErrors = data?.data?.pageCreate?.userErrors;
  if (userErrors && userErrors.length > 0) {
    console.error("[pageCreate] userErrors", JSON.stringify(userErrors, null, 2));
    throw new Error(userErrors.map((e) => e.message).join(", "));
  }

  if (!data?.data?.pageCreate?.page) {
    console.error("[pageCreate] Unexpected response shape", JSON.stringify(data, null, 2));
    throw new Error("Shopify pageCreate returned no page");
  }

  return data.data.pageCreate.page;
}

/**
 * Updates an existing Shopify page.
 */
export async function updateShopifyPage(
  admin: { graphql: (query: string, options?: object) => Promise<{ json: () => Promise<unknown> }> },
  pageId: string,
  params: Partial<CreatePageParams>
): Promise<void> {
  const mutation = `
    mutation pageUpdate($id: ID!, $page: PageUpdateInput!) {
      pageUpdate(id: $id, page: $page) {
        page { id }
        userErrors { field message }
      }
    }
  `;

  const variables: Record<string, unknown> = { id: pageId, page: {} };
  if (params.title) (variables.page as Record<string, unknown>).title = params.title;
  if (params.bodyHtml) (variables.page as Record<string, unknown>).body = params.bodyHtml;
  if (params.published !== undefined)
    (variables.page as Record<string, unknown>).isPublished = params.published;

  const response = await admin.graphql(mutation, { variables });
  const data = (await response.json()) as {
    data: { pageUpdate: { userErrors: { field: string; message: string }[] } };
  };

  const userErrors = data?.data?.pageUpdate?.userErrors;
  if (userErrors && userErrors.length > 0) {
    throw new Error(userErrors.map((e) => e.message).join(", "));
  }
}

/**
 * Deletes a Shopify page.
 */
export async function deleteShopifyPage(
  admin: { graphql: (query: string, options?: object) => Promise<{ json: () => Promise<unknown> }> },
  pageId: string
): Promise<void> {
  const mutation = `
    mutation pageDelete($id: ID!) {
      pageDelete(id: $id) {
        deletedPageId
        userErrors { field message }
      }
    }
  `;

  const response = await admin.graphql(mutation, { variables: { id: pageId } });
  const data = (await response.json()) as {
    data: { pageDelete: { userErrors: { field: string; message: string }[] } };
  };

  const userErrors = data?.data?.pageDelete?.userErrors;
  if (userErrors && userErrors.length > 0) {
    throw new Error(userErrors.map((e) => e.message).join(", "));
  }
}
