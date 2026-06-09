# Credentials — where to get them and where to paste them

Everything you need to enable real OAuth flows for **Facebook Ads**, **Shopify**, and **TikTok Ads**. All credentials live in **one place**: [`backend/.env`](./backend/.env). Never commit this file (it's already in `.gitignore`).

## Quick reference — every variable in `backend/.env`

| Variable | Required for | Notes |
|---|---|---|
| `DATABASE_URL` | Everything | Already set to local Postgres |
| `JWT_SECRET` | Auth | Already generated |
| `ENCRYPTION_KEY` | Token-at-rest encryption | Already generated |
| `FRONTEND_URL` | CORS + OAuth redirects | `http://localhost:4200` for local dev |
| `PORT` | API port | `3000` |
| `FB_APP_ID` | Facebook OAuth | **You paste this** — see §1 |
| `FB_APP_SECRET` | Facebook OAuth | **You paste this** — see §1 |
| `FB_REDIRECT_URI` | Facebook OAuth | Default `http://localhost:3000/api/facebook/callback` — must match Meta dashboard |
| `FB_GRAPH_VERSION` | Facebook API | Optional, defaults to `v21.0` |
| `SHOPIFY_API_KEY` | Shopify OAuth | **You paste this** — see §2 |
| `SHOPIFY_API_SECRET` | Shopify OAuth + HMAC | **You paste this** — see §2 |
| `SHOPIFY_REDIRECT_URI` | Shopify OAuth | Default `http://localhost:3000/api/shopify/callback` |
| `SHOPIFY_API_VERSION` | Shopify Admin API | Optional, defaults to `2025-01` |
| `TIKTOK_APP_ID` | TikTok OAuth | **You paste this** — see §3 |
| `TIKTOK_APP_SECRET` | TikTok OAuth | **You paste this** — see §3 |
| `TIKTOK_REDIRECT_URI` | TikTok OAuth | Default `http://localhost:3000/api/tiktok/callback` |
| `SYNC_CRON` | Sync cadence | Optional, defaults to `*/30 * * * *` |
| `DISABLE_CRON` | Skip cron on boot | Set to `true` to disable scheduled sync (useful for tests) |

Stripe variables (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_*`) are in the template but **not used yet** — Phase 10 was deferred.

---

## 1. Facebook (Meta)

### Get the credentials

1. Go to https://developers.facebook.com/apps and sign in with your Business account
2. Click **Create app** → choose **Business** type
3. App name: `Media Dashboard Dev` (any name)
4. From the **App Dashboard** → **App settings** → **Basic** you'll find:
   - **App ID** → paste into `FB_APP_ID`
   - **App secret** (click "Show") → paste into `FB_APP_SECRET`
5. Under **Add a product**, add **Facebook Login for Business** (or classic Facebook Login)
6. Under **Facebook Login** → **Settings** → **Valid OAuth Redirect URIs**, add:
   ```
   http://localhost:3000/api/facebook/callback
   ```
7. Make sure the app has the **Marketing API** product added too
8. In dev mode you can only connect **your own** Facebook ad accounts. To let other users connect, submit App Review for `ads_read` and `ads_management` (Phase 11 work)

### Verify

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"test@example.com","password":"supersecret123"}'
# Copy the token, then:
curl http://localhost:3000/api/facebook/connect \
  -H "Authorization: Bearer <token>"
# Should return a Facebook OAuth URL with your real FB_APP_ID embedded
```

---

## 2. Shopify

### Get the credentials

1. Go to https://partners.shopify.com and create a Partner account (free, instant)
2. **Apps** → **Create app** → choose **Custom app** (simplest for first install) or **Public app**
3. App name: `Media Dashboard Dev`
4. From the app's **API credentials** page you'll see:
   - **API key** → paste into `SHOPIFY_API_KEY`
   - **API secret key** → paste into `SHOPIFY_API_SECRET`
5. Under **App URL**: `http://localhost:4200` (where users land after install)
6. Under **Allowed redirection URL(s)**: add:
   ```
   http://localhost:3000/api/shopify/callback
   ```
7. Required scopes are hardcoded in the app: `read_orders,read_products,read_analytics`. The Partner dashboard doesn't need to know these in advance — the OAuth request includes them.

### Verify

```bash
curl 'http://localhost:3000/api/shopify/connect?shop=YOURSTORE.myshopify.com' \
  -H "Authorization: Bearer <token>"
# Should return an install URL containing your API key
```

For a development store, you can create one for free from the Partner dashboard (**Stores** → **Add store** → **Development store**).

---

## 3. TikTok Ads

TikTok is the slowest approval — **apply first** even if you build the rest later.

### Get the credentials

1. Go to https://business-api.tiktok.com and create a TikTok for Business developer account
2. Apply for **Marketing API** access (approval can take 3–7 days)
3. Once approved, **Manage Apps** → **Create app**
4. App name: `Media Dashboard Dev`
5. From the app's overview page:
   - **App ID** → paste into `TIKTOK_APP_ID`
   - **App secret** → paste into `TIKTOK_APP_SECRET`
6. Under **Redirect URL**: add:
   ```
   http://localhost:3000/api/tiktok/callback
   ```
7. The OAuth flow returns an `auth_code` (not `code` like the other two) — the backend already handles this distinction

### Verify

```bash
curl http://localhost:3000/api/tiktok/connect \
  -H "Authorization: Bearer <token>"
# Should return a business-api.tiktok.com/portal/auth URL with your real app_id
```

---

## Sanity checklist before testing

- [ ] `backend/.env` has `FB_APP_ID`, `FB_APP_SECRET` filled in
- [ ] `backend/.env` has `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET` filled in
- [ ] `backend/.env` has `TIKTOK_APP_ID`, `TIKTOK_APP_SECRET` filled in
- [ ] Each platform's app dashboard has the **exact** redirect URI listed above
- [ ] Postgres is running on `localhost:5432`
- [ ] You restarted `npm run dev` after editing `.env` (changes don't hot-reload env vars)

Once the boxes are ticked, jump to [`TEST_PLAN.md`](./TEST_PLAN.md) for the step-by-step verification.
