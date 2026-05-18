import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { Form, useLoaderData } from "@remix-run/react";

import { login } from "~/shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return { showForm: Boolean(login) };
};

export default function App() {
  const { showForm } = useLoaderData<typeof loader>();

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", fontFamily: "sans-serif" }}>
      <div style={{ maxWidth: 480, width: "100%", padding: 24, border: "1px solid #e1e3e5", borderRadius: 12 }}>
        <h1 style={{ marginBottom: 8, fontSize: 24, fontWeight: 700 }}>Programmatic SEO App</h1>
        <p style={{ color: "#6d7175", marginBottom: 24 }}>
          Generate hundreds of unique, SEO-optimized service + location pages for your Shopify store.
        </p>
        {showForm && (
          <Form method="post" action="/auth/login">
            <label htmlFor="shop" style={{ display: "block", marginBottom: 4, fontWeight: 500 }}>
              Shop domain
            </label>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                id="shop"
                name="shop"
                type="text"
                placeholder="your-store.myshopify.com"
                style={{ flex: 1, padding: "8px 12px", border: "1px solid #c9cccf", borderRadius: 6 }}
              />
              <button
                type="submit"
                style={{ padding: "8px 16px", background: "#008060", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer" }}
              >
                Log in
              </button>
            </div>
          </Form>
        )}
      </div>
    </div>
  );
}
