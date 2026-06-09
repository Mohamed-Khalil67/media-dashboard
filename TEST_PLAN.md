# TEST_PLAN.md — verify every concept in the project

This is the playbook for confirming the full media-buying dashboard works end-to-end. It's organized so you can verify each module in isolation, then run the full golden-path journey, then probe failure modes.

Before you start: confirm credentials are pasted per [`CREDENTIALS.md`](./CREDENTIALS.md).

---

## Table of contents

1. [Pre-test setup](#1-pre-test-setup)
2. [Module 0 — Database schema](#module-0--database-schema)
3. [Module 1 — Auth (register / login / me)](#module-1--auth)
4. [Module 2 — Token encryption](#module-2--token-encryption)
5. [Module 3 — Facebook OAuth](#module-3--facebook-oauth)
6. [Module 4 — Shopify OAuth](#module-4--shopify-oauth)
7. [Module 5 — TikTok OAuth](#module-5--tiktok-oauth)
8. [Module 6 — Sync engine (cron + manual)](#module-6--sync-engine)
9. [Module 7 — Metrics endpoints](#module-7--metrics-endpoints)
10. [Module 8 — Alerts engine](#module-8--alerts-engine)
11. [Module 9 — Frontend journey (browser)](#module-9--frontend-journey)
12. [Module 10 — Rate limiting](#module-10--rate-limiting)
13. [Module 11 — Unit test suite](#module-11--unit-test-suite)
14. [Golden path — full end-to-end](#golden-path--full-end-to-end)
15. [Negative tests](#negative-tests)
16. [Cleanup](#cleanup)

---

## 1. Pre-test setup

### Prerequisites

- Node ≥ 22.22.3, npm 11+, Angular CLI 21
- PostgreSQL 18 running locally on `:5432`
- Database `media_dashboard` already created and migrated

### Boot both services

Terminal **A** — backend:
```powershell
cd backend
npm run dev
# Expect: "API listening on http://localhost:3000"
#         "[sync] cron scheduled: */30 * * * *"
```

Terminal **B** — frontend:
```powershell
cd frontend
npm start
# Expect: "Local: http://localhost:4200/"
```

### Helper variables (PowerShell)

```powershell
$api  = "http://localhost:3000/api"
# After login (see Module 1), set:
$auth = @{ Authorization = "Bearer $token" }
```

---

## Module 0 — Database schema

**What this checks:** all 6 tables exist with correct columns.

```powershell
$env:PGPASSWORD = 'postgres'
& 'C:\Program Files\PostgreSQL\18\bin\psql.exe' -h localhost -U postgres -d media_dashboard -c '\dt'
```

✅ Expect 7 rows: `User`, `Connection`, `Campaign`, `Insight`, `ShopifyOrder`, `AlertRule`, `_prisma_migrations`.

To inspect any table:
```powershell
& 'C:\Program Files\PostgreSQL\18\bin\psql.exe' -h localhost -U postgres -d media_dashboard -c '\d+ "User"'
```

GUI alternative:
```powershell
cd backend
npx prisma studio
# Opens http://localhost:5555
```

---

## Module 1 — Auth

**What this checks:** register, login, /me, password hashing, JWT issuance, duplicate-email rejection.

### Register

```powershell
$body = @{ email = "you@example.com"; password = "supersecret123"; name = "You" } | ConvertTo-Json
$reg = Invoke-RestMethod -Uri "$api/auth/register" -Method Post -ContentType 'application/json' -Body $body
$token = $reg.token
$auth = @{ Authorization = "Bearer $token" }
$reg.user
```

✅ `user.plan` = `"trial"`, JWT non-empty, `token.length ≈ 200`.

### Login

```powershell
$body = @{ email = "you@example.com"; password = "supersecret123" } | ConvertTo-Json
Invoke-RestMethod -Uri "$api/auth/login" -Method Post -ContentType 'application/json' -Body $body
```

✅ Returns `{ token, user }`.

### /me

```powershell
Invoke-RestMethod -Uri "$api/auth/me" -Headers $auth
```

✅ Returns the same user.

### Duplicate / bad password / no-token

```powershell
try { Invoke-RestMethod -Uri "$api/auth/register" -Method Post -ContentType 'application/json' -Body $body }
catch { "$($_.Exception.Response.StatusCode.value__) → expected 409" }

try { Invoke-RestMethod -Uri "$api/auth/login" -Method Post -ContentType 'application/json' -Body (@{ email='you@example.com'; password='wrong' } | ConvertTo-Json) }
catch { "$($_.Exception.Response.StatusCode.value__) → expected 401" }

try { Invoke-RestMethod -Uri "$api/auth/me" }
catch { "$($_.Exception.Response.StatusCode.value__) → expected 401" }
```

---

## Module 2 — Token encryption

**What this checks:** OAuth access tokens are stored encrypted in the DB, not plaintext.

Run a full Facebook flow once (see Module 3 below). Then:

```powershell
& 'C:\Program Files\PostgreSQL\18\bin\psql.exe' -h localhost -U postgres -d media_dashboard `
  -c 'SELECT "accessToken" FROM "Connection" LIMIT 1;'
```

✅ The output should be a base64 blob — **never a string starting with `EAA`** (the Meta token prefix). The unit test `encryption.test.ts` also verifies the round-trip and tamper-detection.

---

## Module 3 — Facebook OAuth

**Prerequisites:** `FB_APP_ID` and `FB_APP_SECRET` set in `backend/.env`, redirect URI registered in Meta dashboard.

### Get the auth URL

```powershell
$res = Invoke-RestMethod -Uri "$api/facebook/connect" -Headers $auth
$res.url
```

✅ URL is `https://www.facebook.com/v21.0/dialog/oauth?...client_id=<your-id>...state=<signed-jwt>`.

### Complete the flow

Open `$res.url` in your browser → log in to Facebook → authorize → you'll be redirected to:
```
http://localhost:4200/connections?facebook=connected&count=N
```

(where N = number of ad accounts on your Business profile).

### Verify the connection was stored

```powershell
$conns = Invoke-RestMethod -Uri "$api/connections" -Headers $auth
$conns.connections
```

✅ One or more rows with `platform = "facebook"`, `accountId` like `act_123456789`, `status = "active"`.

### Trigger a sync

```powershell
Invoke-RestMethod -Uri "$api/sync/run" -Method Post -Headers $auth
```

✅ Returns `{ ranAt, results: [{ ok: true, platform: "facebook", details: { campaigns: N } }] }`.

### Verify the data landed

```powershell
& 'C:\Program Files\PostgreSQL\18\bin\psql.exe' -h localhost -U postgres -d media_dashboard `
  -c 'SELECT COUNT(*) FROM "Campaign"; SELECT COUNT(*) FROM "Insight";'
```

---

## Module 4 — Shopify OAuth

**Prerequisites:** `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET` set; redirect URI registered in Partner dashboard; you have a development store (e.g. `dev-yourname.myshopify.com`).

### Domain validation

```powershell
try { Invoke-RestMethod -Uri "$api/shopify/connect?shop=evil.com" -Headers $auth }
catch { "$($_.Exception.Response.StatusCode.value__) → expected 400" }
```

✅ 400 (regex rejects non-`myshopify.com` domains).

### Get the auth URL

```powershell
$res = Invoke-RestMethod -Uri "$api/shopify/connect?shop=dev-yourname.myshopify.com" -Headers $auth
$res.url
```

✅ URL is `https://dev-yourname.myshopify.com/admin/oauth/authorize?...`.

### Complete the flow

Visit `$res.url` → install the app on your dev store → redirected back to `/connections?shopify=connected`.

### HMAC verification

The callback **must** pass Shopify's HMAC signature check. Trying to forge a callback fails:
```powershell
try {
  Invoke-RestMethod -Uri "$api/shopify/callback?code=fake&shop=dev-yourname.myshopify.com&state=fake&hmac=bad"
}
catch { "$($_.Exception.Response.StatusCode.value__) → expected 400 (Invalid state) or HMAC failure" }
```

### Sync orders

```powershell
Invoke-RestMethod -Uri "$api/sync/run" -Method Post -Headers $auth
& 'C:\Program Files\PostgreSQL\18\bin\psql.exe' -h localhost -U postgres -d media_dashboard `
  -c 'SELECT COUNT(*) FROM "ShopifyOrder";'
```

---

## Module 5 — TikTok OAuth

**Prerequisites:** `TIKTOK_APP_ID`, `TIKTOK_APP_SECRET` set; redirect URI registered in TikTok dashboard; access to at least one advertiser account.

### Get the auth URL

```powershell
$res = Invoke-RestMethod -Uri "$api/tiktok/connect" -Headers $auth
$res.url
```

✅ URL is `https://business-api.tiktok.com/portal/auth?...app_id=...`.

### Complete the flow

Visit `$res.url` → authorize → redirected to `/connections?tiktok=connected&count=N`.

### Sync

```powershell
Invoke-RestMethod -Uri "$api/sync/run" -Method Post -Headers $auth
```

✅ One row per advertiser, status `"active"`.

---

## Module 6 — Sync engine

**What this checks:** scheduled cron + manual trigger + failure isolation + auto-expiry on auth errors.

### Cron is scheduled at boot

When you `npm run dev`, you should see:
```
[sync] cron scheduled: */30 * * * *
```

### Manual sync trigger

```powershell
Invoke-RestMethod -Uri "$api/sync/run" -Method Post -Headers $auth
```

✅ Returns one result per active connection, each `ok: true` or `ok: false` with error message. **One bad connection does not stop the others.**

### Auto-expiry on bad token

Manually corrupt a token in the DB:
```powershell
& 'C:\Program Files\PostgreSQL\18\bin\psql.exe' -h localhost -U postgres -d media_dashboard `
  -c 'UPDATE "Connection" SET "accessToken"=''aGVsbG8='' WHERE platform=''facebook'' LIMIT 1;'
```

Then trigger a sync:
```powershell
Invoke-RestMethod -Uri "$api/sync/run" -Method Post -Headers $auth
```

✅ That connection's `status` should now be `"expired"`:
```powershell
& 'C:\Program Files\PostgreSQL\18\bin\psql.exe' -h localhost -U postgres -d media_dashboard `
  -c 'SELECT platform, status FROM "Connection";'
```

### Dev-only: cross-user sync

```powershell
Invoke-RestMethod -Uri "$api/sync/run-all" -Method Post -Headers $auth
```

✅ 200 in dev. Should 403 if `NODE_ENV=production`.

---

## Module 7 — Metrics endpoints

**What this checks:** the three endpoints that power the dashboard return correct shapes and aggregate correctly.

### Overview

```powershell
Invoke-RestMethod -Uri "$api/metrics/overview?range=7d" -Headers $auth | ConvertTo-Json
```

✅ Fields: `spend, revenue, roas, orders, aov, impressions, clicks, ctr, delta.{spend,revenue,roas,orders}`. Deltas are decimal fractions (`0.15` = +15%).

### Timeseries

```powershell
Invoke-RestMethod -Uri "$api/metrics/timeseries?range=30d" -Headers $auth | Select-Object -ExpandProperty points
```

✅ Exactly **30** points with `YYYY-MM-DD` dates, gaps filled with zeros.

### Campaigns

```powershell
Invoke-RestMethod -Uri "$api/metrics/campaigns?range=7d" -Headers $auth | ConvertTo-Json -Depth 4
```

✅ One row per campaign with `roas` (revenue/spend), `frequency` (impression-weighted).

### Range guard

```powershell
Invoke-RestMethod -Uri "$api/metrics/overview?range=garbage" -Headers $auth
```

✅ Should default to 7d (the route validates against an allowlist).

---

## Module 8 — Alerts engine

**What this checks:** default rules seed on register, CRUD on rules, evaluation against real campaign data.

### Default rules

Fresh user gets three default rules. Already verified during register:
```powershell
Invoke-RestMethod -Uri "$api/alerts/rules" -Headers $auth | Select-Object -ExpandProperty rules
```

✅ Expect three: `roas lt 2`, `frequency gt 4`, `ctr lt 0.005`.

### Create / update / delete

```powershell
# Create
$new = (Invoke-RestMethod -Uri "$api/alerts/rules" -Method Post -ContentType 'application/json' `
  -Headers $auth -Body (@{ metric='ctr'; operator='lt'; threshold=0.01 } | ConvertTo-Json)).rule
$new.id

# Update
Invoke-RestMethod -Uri "$api/alerts/rules/$($new.id)" -Method Patch -ContentType 'application/json' `
  -Headers $auth -Body (@{ threshold=0.02; enabled=$false } | ConvertTo-Json)

# Delete
Invoke-RestMethod -Uri "$api/alerts/rules/$($new.id)" -Method Delete -Headers $auth
```

### Invalid input

```powershell
try {
  Invoke-RestMethod -Uri "$api/alerts/rules" -Method Post -ContentType 'application/json' `
    -Headers $auth -Body (@{ metric='nope'; operator='lt'; threshold=1 } | ConvertTo-Json)
}
catch { "$($_.Exception.Response.StatusCode.value__) → expected 400" }
```

### Evaluate

```powershell
Invoke-RestMethod -Uri "$api/alerts" -Headers $auth | ConvertTo-Json -Depth 4
```

✅ With no campaigns: `{ alerts: [] }`. After a sync that brings in real data and your campaigns violate a rule: rows containing `campaignName`, `message` (human-readable), `severity` (`danger` if observation is 2× past threshold, else `warning`).

---

## Module 9 — Frontend journey

Browser, http://localhost:4200.

### Routing guards

- Visit `/dashboard` while logged out → redirected to `/login` ✅
- Visit `/login` while logged in → redirected to `/dashboard` ✅
- Visit `/anything-bogus` → redirected to `/dashboard` (or `/login`) ✅

### Register journey

1. Open http://localhost:4200/register
2. Fill name + email + 8+ char password → **Create account**
3. Toast: "Account created. Let's connect your platforms."
4. Land on `/connections`
5. localStorage has `auth.token` and `auth.user`

### Login journey

1. Open `/login`
2. Wrong password → red toast "Invalid credentials"
3. Correct password → green toast "Welcome back!"
4. Land on `/dashboard`
5. Top nav shows your email + Log out button

### Connections page

1. Click **Connect Facebook** → browser leaves to facebook.com OAuth
2. After authorize → back on `/connections?facebook=connected&count=N` → green toast
3. Connection row appears with status badge `active`
4. **Disconnect** → confirm → row gone, green toast

### Dashboard page

After at least one sync:

1. KPI cards populated, deltas show up arrow (green) / down arrow (red)
2. **Spend vs Revenue** chart renders (ApexCharts loaded lazily)
3. Click column headers in the campaign table → sort toggles asc/desc
4. ROAS column shows green ≥ 2, red < 1
5. Funnel bars animate, percentages display
6. Alerts panel lists any rule violations
7. **Sync now** → spinner → green toast → KPIs refresh
8. 7d / 14d / 30d toggle changes data without page reload

### Alerts page

1. `/alerts` shows three default rules
2. Edit a threshold → blur → green toast "Updated"
3. Toggle enabled off → row persists, won't fire alerts
4. Add new rule → it appears in the table
5. Delete → row gone

### Logout

Click **Log out** → toast → land on `/login` → localStorage cleared.

---

## Module 10 — Rate limiting

**What this checks:** the new `express-rate-limit` middleware.

### Auth zone (strict)

```powershell
1..12 | ForEach-Object {
  try {
    Invoke-RestMethod -Uri "$api/auth/login" -Method Post -ContentType 'application/json' `
      -Body (@{ email='you@example.com'; password='wrong' } | ConvertTo-Json) -ErrorAction Stop
  } catch {
    "$_.iteration_$($_) → $($_.Exception.Response.StatusCode.value__)"
  }
}
```

✅ After 10 attempts in 15 minutes: 429 `"Too many auth requests..."`.

### Global zone

The general API limiter allows 200 req/min per IP. To verify it's wired:
```powershell
Invoke-WebRequest -Uri "$api/health" -UseBasicParsing |
  Select-Object -ExpandProperty Headers |
  Where-Object { $_.Key -like 'RateLimit*' }
```

✅ Headers like `RateLimit-Limit: 200`, `RateLimit-Remaining: 199`.

> **Note:** rate limiters are auto-disabled when `NODE_ENV=test` (so unit tests aren't capped).

---

## Module 11 — Unit test suite

```powershell
cd backend
npm test
```

✅ Expected: **36 tests across 5 files**, all green.

| File | What it covers |
|---|---|
| `src/utils/encryption.test.ts` | AES-256-GCM round-trip, random IV, tamper detection, missing/short key throws |
| `src/utils/oauthState.test.ts` | Signed state round-trip, rejects tampered payloads |
| `src/modules/shopify/shopify.service.test.ts` | Shop domain regex (table-driven), HMAC verification accepts valid + rejects tampered/missing |
| `src/modules/alerts/alerts.service.test.ts` | Metric/operator type guards (table-driven) |
| `src/modules/facebook/facebook.service.test.ts` | ROAS extraction (prefers `omni_purchase`), purchase action extraction |

Run continuously while editing:
```powershell
npm run test:watch
```

---

## Golden path — full end-to-end

The 10-minute happy-path script. Run this after credentials are pasted.

1. ✅ Boot backend + frontend
2. ✅ Open http://localhost:4200/register → create account "demo@yours.com"
3. ✅ Land on `/connections`
4. ✅ Click **Connect Facebook** → OAuth → return to `/connections?facebook=connected`
5. ✅ Enter shop domain → **Connect** → install on dev store → return to `/connections?shopify=connected`
6. ✅ Click **Connect TikTok** → OAuth → return to `/connections?tiktok=connected`
7. ✅ Navigate to `/dashboard` → empty state (no sync yet)
8. ✅ Click **Sync now** → wait ~10s → toast "Sync complete" → KPIs populated
9. ✅ Spend, Revenue, ROAS cards show non-zero values
10. ✅ Spend vs Revenue chart renders
11. ✅ Campaign table lists rows from at least one platform
12. ✅ Navigate to `/alerts` → see 3 default rules
13. ✅ Lower the ROAS threshold to 5 → return to `/dashboard` → at least one alert should now appear in the panel
14. ✅ Log out → land on `/login`
15. ✅ Log back in → state restored from DB (campaigns/insights persist; only your JWT is recreated)

If all 15 steps pass, the build is good.

---

## Negative tests

A short list of things that **should fail safely**, to confirm no security holes were introduced:

| Test | Expectation |
|---|---|
| POST `/api/auth/register` with password `"short"` | 400 |
| POST `/api/auth/login` with no body | 400 |
| GET `/api/connections` without Bearer header | 401 |
| GET `/api/connections` with `Bearer garbage` | 401 |
| GET `/api/auth/me` with another user's token | returns that user (token is bound to user, by design) |
| GET `/api/facebook/callback?state=<tampered>` | 400 "Invalid or expired state" |
| GET `/api/shopify/connect?shop=facebook.com` | 400 |
| GET `/api/shopify/callback?hmac=bad&...` | 400 HMAC failure |
| DELETE `/api/connections/<other-user's-id>` | 404 (scoped to caller's userId) |
| DELETE `/api/alerts/rules/<other-user's-id>` | 404 (same) |
| POST `/api/sync/run-all` with `NODE_ENV=production` | 403 |

---

## Cleanup

When you're done testing:

```powershell
# Stop dev servers (Ctrl+C in each terminal)

# Optional: wipe DB for a fresh start
cd backend
npx prisma migrate reset
```

To remove a single user without nuking everything:
```powershell
& 'C:\Program Files\PostgreSQL\18\bin\psql.exe' -h localhost -U postgres -d media_dashboard `
  -c 'DELETE FROM "User" WHERE email=''you@example.com'';'
```
(Cascading FKs will clean up `Connection`, `Campaign`, `Insight`, `ShopifyOrder`, `AlertRule`.)

---

**That's the full surface.** If anything fails: the error message tells you which module to revisit, and the Module-by-Module sections above isolate each piece so you can fix without rebuilding the whole app.
