# Deployment Guide — Shopify PSEO App

Last updated: 2026-05-17

## Live Status

🟢 **App is LIVE**

- **Public URL:** https://shopify-pseo-app-production.up.railway.app
- **HTTP:** 200 OK confirmed
- **Hosting:** Railway
- **Database:** Railway managed PostgreSQL

---

## Quick Links

| What | Where |
|---|---|
| Live app | https://shopify-pseo-app-production.up.railway.app |
| GitHub repo | https://github.com/taskrabbit98-dot/shopify-pseo-app |
| Railway project | `amused-optimism` (https://railway.com) |
| Shopify Partner Dashboard | https://partners.shopify.com |
| Postgres host (internal) | `postgres.railway.internal:5432` |

---

## Current Architecture

```
GitHub (taskrabbit98-dot/shopify-pseo-app, main branch)
        │ push triggers
        ▼
Railway project: amused-optimism / production
        │
        ├── Service: shopify-pseo-app (Remix + Prisma + Polaris)
        │       │
        │       ├── Public URL: shopify-pseo-app-production.up.railway.app
        │       └── Listens on PORT=3000
        │
        └── Service: Postgres (managed)
                └── Internal: postgres.railway.internal:5432
```

---

## What's Still Pending

### 1. Update Shopify Partner Dashboard URLs ⚠️ (REQUIRED before install works)

Go to https://partners.shopify.com → Apps → click `pseo-app` → Configuration → set:

**App URL:**
```
https://shopify-pseo-app-production.up.railway.app
```

**Allowed redirection URL(s):**
```
https://shopify-pseo-app-production.up.railway.app/auth/callback
https://shopify-pseo-app-production.up.railway.app/auth/shopify/callback
https://shopify-pseo-app-production.up.railway.app/exitiframe
```

Click **Save**.

### 2. Install on a development store

Open in browser (replace `YOURSTORE`):
```
https://shopify-pseo-app-production.up.railway.app/auth?shop=YOURSTORE.myshopify.com
```

Configured dev store in toml: `dupe-test-store.myshopify.com`

### 3. Enter app-level API keys in Settings page

After installing, go to the in-app **Settings** page and enter:
- OpenAI API key (stored per-shop in `AppSettings` table)
- Gemini API key (optional)
- Unsplash Access Key
- Google Maps Embed API key

These are NOT Railway env vars — they're stored per-shop in the database.

---

## Environment Variables (Railway)

All 7 variables are set via Railway CLI on the `shopify-pseo-app` service:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection (uses `postgres.railway.internal:5432`) |
| `SHOPIFY_API_KEY` | App's Shopify client ID |
| `SHOPIFY_API_SECRET` | App's Shopify client secret |
| `SHOPIFY_APP_URL` | Public URL (matches Railway domain) |
| `SCOPES` | `write_content,read_content,write_metaobjects,read_metaobjects,read_themes,write_themes` |
| `NODE_ENV` | `production` |
| `PORT` | `3000` (must match Railway proxy target) |

**To view current values:**
```powershell
railway variables
```

**To update a variable:**
```powershell
railway variables --set "KEY=value"
```

⚠️ **Always use the CLI, NOT the Railway web UI.** See [Known Issues](#known-issues) below.

---

## How to Deploy Changes

The repo auto-deploys on push to `main`. Just:

```powershell
git add .
git commit -m "Your change description"
git push
```

Railway picks up the push and rebuilds within ~1 minute. Monitor with:

```powershell
railway status
railway logs           # latest runtime logs
railway logs --deployment   # logs for current deployment
```

---

## Manual Deploy / Redeploy

If you need to force a redeploy without code changes:

```powershell
railway redeploy --yes
```

---

## Useful Railway CLI Commands

```powershell
# From the project directory:
railway whoami                              # confirm auth
railway status                              # service status + URL
railway variables                           # list all env vars (source of truth)
railway variables --set "KEY=value"         # set a variable (redeploys)
railway logs                                # recent logs
railway redeploy --yes                      # force redeploy
railway open                                # open dashboard in browser
railway link                                # re-link if association is lost
railway run npm run dev                     # run a command with env vars injected
```

If `railway` not found, install with:
```powershell
npm install -g @railway/cli
railway login
```

---

## Known Issues

### Railway Web UI doesn't reliably persist variables ⚠️

During the initial deploy on 2026-05-17, the Railway web UI repeatedly showed env variables as set (DATABASE_URL, SHOPIFY_API_KEY, etc.) but they were never actually applied to the running service. Every deploy crashed with `Environment variable not found: DATABASE_URL` despite the UI showing the value clearly.

**Diagnosis:** Running `railway variables` via CLI returned ONLY the Railway system variables (RAILWAY_*) — none of the user-set variables.

**Fix:** Setting variables via `railway variables --set "KEY=value"` from the CLI forced them to persist. After that, the app booted successfully.

**Rule of thumb:** Always treat the CLI output as the source of truth, not the web UI.

### PORT must match Railway's proxy target

Without an explicit `PORT` env var, Railway sometimes assigns PORT=8080 to the container, but the public HTTP proxy defaults to targeting port 3000 — causing 502 Bad Gateway from the edge.

**Fix:** Set `PORT=3000` explicitly:
```powershell
railway variables --set "PORT=3000"
```

This is already set in the current deploy.

### SQLite → PostgreSQL migration syntax

The initial Prisma migration was generated against SQLite, which uses incompatible SQL syntax. Converted manually:
- `DATETIME` → `TIMESTAMP(3)`
- `REAL` → `DOUBLE PRECISION`
- Inline `PRIMARY KEY` → separate `CONSTRAINT ... PRIMARY KEY`
- Inline `FOREIGN KEY` → separate `ALTER TABLE ... ADD CONSTRAINT`
- `migration_lock.toml` provider changed to `postgresql`

See git commit: `Convert init migration from SQLite to PostgreSQL syntax`.

---

## Local Development

For local dev with the Shopify CLI (Cloudflare Tunnel):

```powershell
npm install
npm run dev
```

For local Prisma migrations against a local Postgres:
```powershell
npm run prisma:migrate
```

The `.env` file (gitignored) holds your local API keys. Use `.env.example` as a template.

---

## Database Backups

Railway's managed Postgres provides automatic backups on paid plans. To get a manual dump:

```powershell
railway run pg_dump $env:DATABASE_URL > backup.sql
```

⚠️ Free trial plans may not retain backups long-term.

---

## Troubleshooting

| Symptom | Most likely cause | Fix |
|---|---|---|
| 502 Bad Gateway | PORT mismatch | `railway variables --set "PORT=3000"` |
| `Environment variable not found: X` | Variable not actually saved (UI bug) | `railway variables --set "X=value"` via CLI |
| `the URL must start with postgresql://` | DATABASE_URL is reference/empty | Paste literal URL, set via CLI |
| Build fails on migrations | SQLite syntax in migration | See [SQLite→PostgreSQL](#sqlite--postgresql-migration-syntax) |
| OAuth callback 404 | Partner Dashboard URLs not updated | See [Pending #1](#1-update-shopify-partner-dashboard-urls--required-before-install-works) |
| App crashes on store install | Missing API keys in DB | Configure in app's Settings page |

---

## Tech Stack Reference

- **Framework:** Remix v2 (Vite, SSR)
- **UI:** Shopify Polaris v13
- **Database:** PostgreSQL via Prisma 5.x
- **Auth:** `@shopify/shopify-app-remix` with Prisma session storage
- **AI:** OpenAI GPT-4o + Google Gemini 1.5 Pro
- **Sanitization:** DOMPurify + jsdom
- **Node:** 18.20.8 (pinned)
- **Hosting:** Railway (Railpack auto-detect)

---

## Where to Get Help

- Railway docs: https://docs.railway.com
- Shopify app dev: https://shopify.dev/docs/apps
- Prisma docs: https://www.prisma.io/docs
- Remix docs: https://remix.run/docs
