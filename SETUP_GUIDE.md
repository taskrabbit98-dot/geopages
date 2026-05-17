# Setup Checklist — PSEO App

> ✅ = already done &nbsp;&nbsp; ▶ = do this now

---

## ✅ Done Already

- Node.js installed
- `npm install` done (node_modules exists)
- `.env` filled in (API keys added)
- `shopify.app.toml` has correct Client ID and dev store
- App created in Dev Dashboard at [dev.shopify.com/dashboard](https://dev.shopify.com/dashboard)

---

## ▶ Step 1 — Create a Version in the Dev Dashboard

> You only do this once. This is required before the app can be installed.

1. Go to [dev.shopify.com/dashboard](https://dev.shopify.com/dashboard)
2. Click your app **PSEO** in the left sidebar
3. Click **Versions**
4. Click **Create version**
5. Set these fields:
   - **App URL** → type `https://localhost`
   - **Webhooks API version** → pick the latest (e.g. `2025-01`)
   - **Scopes** → add each of these:
     - `write_content`
     - `read_content`
     - `write_metaobjects`
     - `read_metaobjects`
     - `read_themes`
     - `write_themes`
6. Click **Release**

---

## ▶ Step 2 — Set Up the Database

In the VS Code terminal, run:

```powershell
cd "e:\A-ONLINE WORK\WORDPRESS PLUGINS\my plugins\SHOPIFY APPS\SEO collections pages"
npx prisma migrate dev --name init
```

Wait for it to finish. You'll see: `Your database is now in sync with your schema.`

---

## ▶ Step 3 — Start the App

In the same terminal, run:

```powershell
npm run dev
```

The CLI will ask you a few questions — answer like this:

| Prompt | Answer |
|---|---|
| Which organization? | Select your organization |
| Which store? | `dupe-test-store.myshopify.com` |
| Connect to existing app or create new? | **Connect to existing** → select **PSEO** |
| Update app URLs? | Press `Y` then Enter |

When it finishes starting, you'll see a `trycloudflare.com` URL and this message:
```
Press p › Preview in browser
```

---

## ▶ Step 4 — Install the App on Your Dev Store

1. With `npm run dev` still running, press **`p`** in the terminal
2. Your browser opens → click **Install app**
3. Your app dashboard appears — you're in! ✅

---

## ▶ Step 5 — Fill In Your Business Details

1. Click **Settings** in the app
2. Enter your business name, phone, address
3. Select **OpenAI** as the AI provider
4. Click **Save**

---

## ▶ Step 6 — Add Services & Locations, Then Generate Pages

1. Click **Services** → add your services (e.g. "Roof Repair")
2. Click **Locations** → add your cities (e.g. Miami, FL)
3. Click **Generate** → click **Generate All**
4. Wait for pages to generate, then click **Publish**

---

## If Something Goes Wrong

| Error | Fix |
|---|---|
| `App name cannot contain "Shopify"` | Already fixed in `shopify.app.toml` ✅ |
| `Table does not exist` | Run `npx prisma migrate dev --name init` |
| `Invalid API key` | Check `.env` — `SHOPIFY_API_KEY` must match Client ID in Dev Dashboard |
| White/blank screen | Make sure `npm run dev` is still running in terminal |
| CLI asks to log in | Run `npx shopify auth login` then `npm run dev` again |

---

## Where Is the New Shopify Dashboard?

Shopify replaced the old `partners.shopify.com` Apps section with a new **Dev Dashboard**:

👉 **[dev.shopify.com/dashboard](https://dev.shopify.com/dashboard)**

Log in with the same Shopify Partner email you always use. Everything app-related now lives here.

---

## Step 1 — Find Your App in the Dev Dashboard

1. Go to **[dev.shopify.com/dashboard](https://dev.shopify.com/dashboard)**
2. Log in with your Shopify Partner email
3. Click **Apps** in the left sidebar
4. You should see your app listed (the one whose Client ID you already put in `.env`)
5. Click your app name to open it
6. Click **Settings** (left sidebar inside your app)
7. You will see **Client ID** and **Client secret** — these match what is already in your `.env` ✅

---

## Step 2 — Create a Version in the Dev Dashboard

The new Dev Dashboard requires you to create at least one **Version** before you can install the app.

1. Inside your app, click **Versions** in the left sidebar
2. Click **Create version**
3. Fill in:
   - **App URL**: `https://localhost` (temporary — will be replaced automatically)
   - **Webhooks API version**: select the newest one (e.g. `2025-01`)
   - **Scopes**: add these one by one:
     ```
     write_content
     read_content
     write_metaobjects
     read_metaobjects
     read_themes
     write_themes
     ```
4. Click **Release**

---

## Step 3 — Install the App on Your Dev Store

1. Inside your app in the Dev Dashboard, click **Home** (left sidebar)
2. Scroll down and click **Install app**
3. Select your store: **dupe-test-store.myshopify.com**
4. Click **Install**

The app is now associated with your dev store. The actual app UI won't work yet until you start the local server (next steps).

---

## Step 4 — Initialize the Database

Open the **PowerShell terminal** in VS Code (it's already open — click the Terminal tab at the bottom).

Run this command:

```powershell
npx prisma migrate dev --name init
```

You should see:
```
Applying migration `20260516102719_init`
Your database is now in sync with your schema.
Generated Prisma Client
```

If it asks `Do you want to continue? All data will be lost.` → type `yes` and press Enter.

---

## Step 5 — Start the App

Run:

```powershell
npm run dev
```

The first time it runs, Shopify CLI will ask you questions in the terminal. Here is what to answer:

**Question: "Which organization?"**
→ Select your Shopify Partner organization

**Question: "Which store do you want to connect to?"**
→ Select `dupe-test-store.myshopify.com`

**Question: "Connect to an existing app or create a new one?"**
→ Select **Connect to an existing app** → pick your app from the list

**Question: "Update your app URLs?"** (or similar)
→ Press `Y` and Enter

After that you will see:

```
  ✔ Connected to app
  ✔ Starting dev server

  App URL:      https://abc123def456.trycloudflare.com
  GraphiQL URL: https://abc123def456.trycloudflare.com/graphiql

  Press p › Preview in browser
  Press q › Quit
```

Shopify CLI has automatically:
- Created a Cloudflare tunnel (the `trycloudflare.com` URL)
- Updated your `shopify.app.toml` with the live URL
- Updated the redirect URLs in your Dev Dashboard

**Leave this terminal running.** Do not close it.

---

## Step 6 — Open the App in Your Browser

Press **`p`** in the terminal where `npm run dev` is running.

Your browser will open the app. It will redirect you to the Shopify admin on your dev store and ask you to **install the app** — click **Install app**.

You are now inside your app! You will see the dashboard.

---

## Step 7 — Configure the App Settings

1. Click **Settings** in the app's left navigation
2. Fill in:
   - **Business name** (e.g. "Miami Roofing Co")
   - **Business phone** (e.g. "+1 305 000 0000")
   - **Business address** (e.g. "123 Main St, Miami, FL 33101")
3. **AI Provider** → select **OpenAI** (your key is already in `.env`)
4. **Image Strategy** → leave as **Unsplash** (works without a key)
5. Click **Save**

---

## Step 8 — Add Services

1. Click **Services** in the navigation
2. Click **Add service**
3. Enter a service name, e.g. `Roof Repair`
4. Click **Save**
5. Repeat for each service you offer

---

## Step 9 — Add Locations

1. Click **Locations** in the navigation
2. Click **Add location**
3. Enter: City = `Miami`, State = `FL`
4. Click **Save**
5. Repeat for each city you want to target

**Or bulk import via CSV:**
- Click **Import CSV**
- Upload a file with columns: `city,state,zip`
- Example row: `Miami,FL,33101`

---

## Step 10 — Generate Pages

1. Click **Generate** in the navigation
2. You will see a grid — every row is a service, every column is a location
3. Click **Generate All** to queue all combinations
4. Watch statuses change: `pending` → `running` → `done`
5. Each page is automatically created in your Shopify store at `/pages/your-slug`

---

## Step 11 — Publish Pages

1. Click any generated page from the grid
2. Review the content (you can edit title, H1, meta description)
3. Click **Publish to Shopify** — the page goes live and is crawlable by Google

---

## Step 12 — Submit Sitemap to Google

1. On the Dashboard, copy your **Sitemap URL**:
   ```
   https://dupe-test-store.myshopify.com/apps/pseo/sitemap.xml
   ```
2. Go to [Google Search Console](https://search.google.com/search-console)
3. Add your store as a property
4. Go to **Sitemaps** → paste the URL → **Submit**

---

## Troubleshooting

### "App not found" or "Invalid API key" when running npm run dev
- Open `.env` and make sure `SHOPIFY_API_KEY` matches the **Client ID** shown in **Dev Dashboard → your app → Settings**
- They must be identical with no extra spaces

### Prisma error: "Table does not exist"
```powershell
npx prisma migrate dev --name init
```

### CLI asks to log in every time
```powershell
npx shopify auth login
```
Then run `npm run dev` again.

### "Cannot find module" errors
```powershell
npm install
```

### Tunnel URL changes every time I restart
That is normal. Shopify CLI auto-updates everything when you run `npm run dev`. Your app always works with the new tunnel URL.

### App blank / white screen after install
- Make sure `npm run dev` is still running in the terminal
- Your laptop must stay on and the terminal must stay open while testing

---

## All Commands Summary

```powershell
# Go to project folder
cd "e:\A-ONLINE WORK\WORDPRESS PLUGINS\my plugins\SHOPIFY APPS\SEO collections pages"

# One-time: set up the database
npx prisma migrate dev --name init

# Every time you want to work on the app
npm run dev
```

---

## Later: Going to Production (When Ready)

When done testing and you want the app live 24/7 without your laptop:

| Step | Service | Cost |
|---|---|---|
| Database | [Neon.tech](https://neon.tech) PostgreSQL | Free tier |
| Hosting | [Fly.io](https://fly.io) | Free tier |
| App Store listing | Shopify Partner App Store | Free to submit |
