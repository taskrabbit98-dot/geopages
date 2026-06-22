# Setup Guide

End-to-end setup for getting `geopages` running on Fly with a fresh Shopify Partner account.

## Prerequisites

- Shopify Partner account (https://partners.shopify.com)
- Fly.io account with billing set up (https://fly.io)
- OpenAI API key (https://platform.openai.com)
- Google Maps API key with Geocoding + Places enabled (optional but recommended)
- Node 18.20.0+ locally for development

## 1. Create the Shopify app

In your Partner Dashboard:

1. **Apps → Create app → Create app manually**
2. Set **App URL:** `https://geopages.fly.dev`
3. Set **Allowed redirection URLs:**
   ```
   https://geopages.fly.dev/auth/callback
   https://geopages.fly.dev/auth/shopify/callback
   https://geopages.fly.dev/exitiframe
   ```
4. **Embedded:** ON
5. **Access scopes:**
   ```
   write_content,read_content,write_metaobjects,read_metaobjects,read_themes,write_themes,read_online_store_navigation,write_online_store_navigation
   ```
6. **App Proxy:**
   - Subpath prefix: `apps`
   - Subpath: `service-areas`
   - Proxy URL: `https://geopages.fly.dev/apps/service-areas`
7. **Webhooks API version:** `2024-07`

Save each section. Copy the **Client ID** (API key) and **Client secret** — you'll need them for Fly secrets.

## 2. Provision Fly resources

Install the Fly CLI (https://fly.io/docs/flyctl/install/), then:

```bash
flyctl auth login
flyctl apps create geopages --org personal
flyctl postgres create --name geopages-db --region iad --org personal \
  --initial-cluster-size 1 --vm-size shared-cpu-1x --volume-size 1
flyctl postgres attach geopages-db --app geopages --yes
```

The attach step creates a database + user and automatically sets the `DATABASE_URL` secret on the app.

## 3. Set the rest of the secrets

```bash
flyctl secrets set --app geopages \
  "SHOPIFY_API_KEY=<your client ID>" \
  "SHOPIFY_API_SECRET=<your client secret>" \
  "SHOPIFY_APP_URL=https://geopages.fly.dev" \
  "SCOPES=write_content,read_content,write_metaobjects,read_metaobjects,read_themes,write_themes,read_online_store_navigation,write_online_store_navigation" \
  "NODE_ENV=production" \
  "PORT=3000"
```

## 4. Deploy

```bash
git clone https://github.com/taskrabbit98-dot/geopages.git
cd geopages
flyctl deploy --app geopages
```

The build phase runs `prisma generate && remix vite:build`. The release phase runs `npx prisma migrate deploy` automatically before swapping in the new machines.

Verify:

```bash
curl -I https://geopages.fly.dev/
# Expect: HTTP/1.1 200 OK
```

## 5. Pay the App Store registration fee (if you want public distribution)

- Partner Dashboard → Apps → your app → Distribution → **Manage submission**
- Pay the $19 one-time fee → unlocks "Distribute off the Shopify App Store"
- Pick **Public distribution → off the App Store**

Without this you can only use Custom App distribution (one install link per shop).

## 6. Set up payouts

- Partner Dashboard → Settings → Payouts
- Add PayPal or direct deposit
- Fill out tax form (W-9 for US, W-8BEN for non-US)
- Payouts arrive monthly above $25 (PayPal) / $50 (bank)

## 7. Create a development store + install

In Partner Dashboard:

1. **Stores → Add store → Development store**
2. Pick any name, e.g. `geopages-test`
3. Choose purpose: "Build a new app or custom theme"

Then in a browser:

```
https://geopages.fly.dev/auth/login?shop=geopages-test.myshopify.com
```

Click Install → app embeds in Shopify Admin.

## 8. Configure inside the app

Once installed, in the embedded app:

1. **Billing** → Start free trial (test mode on dev stores, no real charge)
2. **Settings → Business Information (NAP)** → fill in name, phone, address
3. **Settings → AI Configuration** → paste your OpenAI API key
4. **Settings → Google Maps** → paste your Google Maps API key
5. **Settings → Trust Links** → click presets (Yelp, BBB, Google Maps, etc.) to add URL templates
6. **Services** → add the services your business offers
7. **Locations** → add the cities/states you serve

## 9. Generate your first pages

1. **Page Generator** → matrix view shows every service × location combo
2. Click cells to select, or **Select All** / row / column
3. **Generate Selected** → jobs queue, pages appear as drafts in ~30s each
4. **Publish All Drafts** from the Dashboard → pages go live

Check a generated page at:

```
https://geopages-test.myshopify.com/apps/service-areas/<service-slug>-<location-slug>
```

## 10. Submit the sitemap to Google

The app serves a sitemap at:

```
https://<merchant-store>.myshopify.com/apps/service-areas/sitemap.xml
```

Submit this URL in Google Search Console — separately from Shopify's auto-generated `/sitemap.xml` (which only covers native Shopify resources, not our App Proxy pages).

## Common issues

| Symptom | Cause | Fix |
|---|---|---|
| `Unauthorized Access` on install | Dev store and app in different Partner accounts | Create the dev store in the same Partner account |
| `This app can't be installed yet` | Distribution method not set | Partner Dashboard → Distribution → pick Public off-App-Store |
| 404 at `/apps/service-areas/...` | App Proxy not configured or merchant hasn't re-authorized after URL change | Verify proxy in Partner Dashboard; reinstall |
| Embedded app stuck loading | `embedded: false` in Partner Dashboard | Toggle embedded ON, save, reinstall |
| Generic content (no real neighborhoods) | Google Maps API key missing or quota exhausted | Add valid key in Settings → Google Maps |
| `Subscribe to generate pages` blocks all generation | No active subscription | Click "Start 3-day free trial" in Billing |
| OAuth callback 404 | Redirect URLs missing in Partner Dashboard | Add all 3 redirect URLs (see Step 1) |

## Local development

```bash
npm install
cp .env.example .env
# Fill in: SHOPIFY_API_KEY, SHOPIFY_API_SECRET, DATABASE_URL,
#         OPENAI_API_KEY, GEMINI_API_KEY, GOOGLE_MAPS_API_KEY
npm run prisma:migrate
npm run dev
```

`npm run dev` runs `shopify app dev` which starts a Cloudflare tunnel and auto-updates the Partner Dashboard URLs to point at the tunnel — no Fly deploy needed for every local change.

## Useful Fly commands

```bash
flyctl logs --app geopages              # tail runtime logs
flyctl status --app geopages            # deployment status
flyctl secrets list --app geopages      # list secrets (values redacted)
flyctl deploy --app geopages            # rebuild and redeploy
flyctl postgres connect --app geopages-db   # psql shell into the database
flyctl releases --app geopages          # release history for rollback
```
