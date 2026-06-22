# geopages

A Shopify app that generates AI-written local SEO landing pages for service businesses — one page per **service × location** combination, served on the merchant's storefront via Shopify App Proxy.

**Live:** https://geopages.fly.dev

## What it does

A merchant adds their services (e.g., "Roof Repair", "Gutter Cleaning") and locations (e.g., "Miami, FL", "Tampa, FL"). The app generates a unique landing page for every combination at a URL like:

```
https://merchantstore.myshopify.com/apps/service-areas/roof-repair-miami-fl
```

Each page is built with:

- AI-written content (OpenAI GPT-4o, two-pass for higher per-page uniqueness)
- Real local data from Google Places (neighborhoods, landmarks, ZIPs) fed into the prompt
- Long-tail keyword variants for topical coverage
- Inline trust-link anchors on the service name (Yelp/BBB/Google Maps search URLs templated per location)
- LocalBusiness + FAQPage JSON-LD structured data
- 5-question FAQ rendered as an accordion
- Optional Google Maps embed and Unsplash/DALL-E featured image
- Mobile-responsive layout wrapped by the merchant's active Shopify theme

Pages live in the app database (not Shopify's Pages tab), so a merchant with 500+ pages doesn't drown the native Pages admin.

## Architecture

```
GitHub (taskrabbit98-dot/geopages, main)
        │  push triggers fly deploy
        ▼
Fly.io: geopages
  │
  ├── App service (Remix server, 2 machines, iad)
  │       │
  │       └── Public URL: https://geopages.fly.dev
  │
  └── Postgres: shopify-pseo-app-db.flycast
          (shared cluster, internal hostname)
```

Generated pages are served dynamically via Shopify App Proxy: `{shop}/apps/service-areas/{slug}` proxies to `https://geopages.fly.dev/apps/service-areas/{slug}` which renders from the Postgres `GeneratedPage` table and returns `application/liquid` so Shopify wraps the response with the merchant's theme.

## Tech stack

| Layer | Tech |
|---|---|
| Framework | Remix v2 (file-based routes, SSR) |
| UI | Shopify Polaris v13 + App Bridge React |
| Auth | `@shopify/shopify-app-remix` v3 (embedded auth) |
| Database | PostgreSQL via Prisma 5 |
| AI | OpenAI GPT-4o + `@google/generative-ai` (Gemini fallback) |
| Local data | Google Geocoding + Places Nearby Search |
| HTML sanitization | DOMPurify + jsdom |
| Hosting | Fly.io (multi-machine, auto-stop) |
| Billing | Shopify Billing API (`appSubscriptionCreate`) |
| Node | 18.20.8 |

## Routes

| Path | Purpose |
|---|---|
| `/` | Public landing — redirects to `/app` when accessed with `?shop=` |
| `/auth/login` | Starts OAuth install |
| `/auth/*` | OAuth callback handlers |
| `/app` | Embedded admin Dashboard |
| `/app/services` | Manage Service records |
| `/app/locations` | Manage Location records |
| `/app/generate` | Service × Location matrix — bulk generate + delete |
| `/app/pages/:id` | Per-page editor (save, publish, regenerate sections, delete) |
| `/app/bulk` | Bulk regenerate sections, refresh trust links, bulk delete |
| `/app/menu` | Storefront menu builder (3-level nested dropdowns) |
| `/app/billing` | Subscription management |
| `/app/settings` | Business info, AI keys, trust link templates |
| `/apps/service-areas/:slug` | Public page served via App Proxy |
| `/apps/service-areas/sitemap.xml` | Sitemap for Google Search Console |

## Data model

See [`prisma/schema.prisma`](prisma/schema.prisma) for the full schema. Key tables:

- `Service` — name, slug per shop
- `Location` — city/state/zip/lat/lng + cached `localContextJson` from Google Places
- `GeneratedPage` — full assembled HTML, SEO fields, status (draft/published/archived), quality score
- `TrustLinkTemplate` — shop-wide URL templates with `{service}`, `{city}`, `{state}` placeholders
- `Subscription` — Shopify Billing state per shop
- `Session` — Shopify OAuth session storage
- `GenerationJob` — in-memory queue records (pending/running/done/failed)

## Local development

```bash
git clone https://github.com/taskrabbit98-dot/geopages.git
cd geopages
npm install
cp .env.example .env  # then fill in Shopify keys, OpenAI, etc.
npm run prisma:migrate
npm run dev
```

`npm run dev` runs `shopify app dev` which sets up a Cloudflare tunnel and registers the URLs with the Partner Dashboard automatically.

## Deployment

Pushes to `main` auto-deploy to Fly via `flyctl deploy`. To deploy manually:

```bash
flyctl deploy --app geopages
```

Secrets are managed with:

```bash
flyctl secrets list --app geopages
flyctl secrets set KEY=value --app geopages
```

The `release_command` in `fly.toml` runs `npx prisma migrate deploy` before each release, so schema changes ship safely.

## Billing

The app uses Shopify's Billing API for a $30/month subscription with a 3-day free trial. New installs see a "Subscribe to start generating pages" gate on the `/app/billing` page. Test mode is auto-detected via `shop.plan.partnerDevelopment` so development stores aren't charged.

See [`app/lib/billing/index.ts`](app/lib/billing/index.ts) for the full flow.

## SEO disclaimer

Programmatic SEO at scale is risky in 2025+. Google's spam policies target "scaled content abuse" and "doorway pages." The app uses several mitigations (two-pass generation, real local data injection, banned filler phrases, per-page outline), but no app can guarantee organic rankings. Validate empirically: generate pages for a real business, submit the sitemap to Google Search Console, wait 4-8 weeks, and measure indexation + impressions before scaling.

## License

Private.
