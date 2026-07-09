# Credentials — where to get them and where to paste them

This app has **no shared platform app** and no platform credentials in `backend/.env`. Every user brings their **own** Facebook and Shopify developer-app credentials, pasted directly into the Connections page in the UI when they connect an account. This sidesteps Meta/Shopify's app-review approval process — real users can connect immediately instead of waiting on platform review.

The only credentials that live in `backend/.env` are infrastructure secrets:

| Variable | Required for | Notes |
|---|---|---|
| `DATABASE_URL` | Everything | Local Postgres connection string |
| `JWT_SECRET` | OAuth CSRF state signing | Not used for session auth — see below |
| `ENCRYPTION_KEY` | Token-at-rest encryption | 32-byte hex; AES-256-GCM key for connection tokens/secrets |
| `FRONTEND_URL` | CORS + OAuth redirects | `http://localhost:4200` for local dev |
| `PORT` | API port | `3000` |
| `FIREBASE_SERVICE_ACCOUNT_JSON` or `GOOGLE_APPLICATION_CREDENTIALS` | Auth | Firebase Admin SDK — verifies ID tokens from the Angular app's Firebase sign-in |
| `SYNC_CRON` | Sync cadence | Optional, defaults to `*/2 * * * *` |
| `ACTIVITY_WINDOW_MINUTES` / `SYNC_COOLDOWN_SECONDS` | Sync gating | Optional — see `backend/.env.example` |

**Auth is Firebase, not a local password system.** The frontend signs users in via the Firebase JS SDK (email/password); the backend never sees a password — it only verifies the Firebase ID token on each request (`backend/src/middleware/auth.ts`). Set up a Firebase project and download an Admin SDK service-account key (Firebase Console → Project Settings → Service Accounts → Generate new private key), then set `FIREBASE_SERVICE_ACCOUNT_JSON` per `backend/.env.example`.

---

## 1. Facebook (Meta) — connected per-user, via the UI

There's no `FB_APP_ID`/`FB_APP_SECRET` env var. Each user creates their own Meta app and pastes its credentials into the **Connect Facebook** modal on the Connections page.

### Get the credentials

1. Go to https://developers.facebook.com/apps and sign in with your Business account
2. Click **Create app** → choose **Business** type
3. From **App Dashboard** → **App settings** → **Basic**, copy the **App ID** and **App secret**
4. Under **Add a product**, add **Facebook Login for Business** (or classic Facebook Login)
5. Under **Facebook Login** → **Settings** → **Valid OAuth Redirect URIs**, add:
   ```
   http://localhost:3000/api/facebook/callback
   ```
6. Make sure the app has the **Marketing API** product added too
7. In dev mode you can only connect **your own** ad accounts. To let other users connect their own apps, each user submits their own app for Meta's `ads_read`/`ads_management` App Review — this app never needs a shared, reviewed app of its own

### Connect it

In the running app: **Connections → Connect Facebook** → paste the App ID + App secret + (optional) a historical sync window → you're redirected through Facebook's OAuth dialog and back. Under the hood this hits `POST /api/facebook/connect-start` (persists a pending `Connection` row, builds the OAuth URL) and `GET /api/facebook/callback` (exchanges the code, pulls your ad accounts, marks the connection active).

---

## 2. Shopify — connected per-user, via the UI

Same pattern: no global `SHOPIFY_API_KEY` env var. Each user creates their own custom app in Shopify Partners and pastes the credentials into the **Connect Shopify** modal.

### Get the credentials

1. Go to https://partners.shopify.com and create a Partner account (free, instant)
2. **Apps** → **Create app** → **Custom app**
3. From the app's **API credentials** page, copy the **API key** and **API secret key**
4. Under **Allowed redirection URL(s)**, add:
   ```
   http://localhost:3000/api/shopify/callback
   ```
5. Required scopes (`read_orders,read_products,read_analytics`) are hardcoded in the OAuth request — nothing to configure on the Partner dashboard side

### Connect it

**Connections → Connect Shopify** → enter your `*.myshopify.com` domain + API key + API secret → OAuth redirect and back. The callback verifies Shopify's HMAC signature (timing-safe compare) before marking the connection active — see `backend/src/modules/shopify/shopify.service.ts`.

For a development store, create one for free from the Partner dashboard (**Stores** → **Add store** → **Development store**).

---

## Sanity checklist before testing

- [ ] `backend/.env` has `DATABASE_URL`, `JWT_SECRET`, `ENCRYPTION_KEY`, and a Firebase credential set
- [ ] Postgres is running on `localhost:5432`
- [ ] You restarted `npm run dev` after editing `.env` (changes don't hot-reload env vars)
- [ ] You have a Facebook app (App ID + Secret) and/or Shopify custom app (API key + Secret) ready to paste into the Connections UI
- [ ] Each platform's app dashboard has the exact redirect URI listed above

Once the boxes are ticked, jump to [`TEST_PLAN.md`](./TEST_PLAN.md) for the step-by-step verification.
