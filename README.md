# Media Buying Dashboard

Multi-tenant SaaS that unifies **Facebook Ads** and **Shopify** into one media-buying command center — spend, ROAS, orders, and alerts, refreshed automatically in the background. Each user connects their own ad and store accounts using their own developer-app credentials (no shared platform app, no App Review wait).

See [`CONTEXT.md`](./CONTEXT.md) for the full build history and architectural decisions.

## Stack

- **Backend** — Node.js 22 + Express 5 + TypeScript, Prisma 6 + PostgreSQL
- **Frontend** — Angular 21, standalone components, zoneless change detection + Signals, ApexCharts
- **Auth** — Firebase Auth (client-side sign-in) + Firebase Admin SDK (server-side ID-token verification); the backend never sees a password
- **Secrets at rest** — AES-256-GCM for every OAuth token / app secret stored in Postgres
- **Platform credentials** — supplied per-connection by each user via the Connections UI, not global env vars (see [`CREDENTIALS.md`](./CREDENTIALS.md))
- **Background sync** — `node-cron`, activity-gated (only syncs connections for recently-active users) + `POST /api/sync/run` for a manual trigger
- **Billing** — not yet built (Stripe is planned but deferred — see `CONTEXT.md`)

## Layout

```
media-dashboard/
├── backend/    Express + Prisma API
├── frontend/   Angular 21 dashboard
└── e2e/        Playwright end-to-end suite
```

## Local setup

### Prerequisites

- Node.js >= 22.22.3, npm 11+
- Angular CLI 21 — `npm install -g @angular/cli@21`
- PostgreSQL (local or hosted)
- A Firebase project (Authentication enabled) with an Admin SDK service-account key

### Backend

```bash
cd backend
cp .env.example .env       # fill in DATABASE_URL, JWT_SECRET, ENCRYPTION_KEY, FIREBASE_SERVICE_ACCOUNT_JSON
npm install
npx prisma migrate dev
npm run dev                # http://localhost:3000
```

Health check: `GET http://localhost:3000/api/health`.

### Frontend

```bash
cd frontend
npm install
npm start                  # http://localhost:4200
```

Set your Firebase web-app config in `frontend/src/environments/environment.development.ts`.

### Connecting a platform account

There's nothing to configure server-side for Facebook or Shopify. Sign in, go to **Connections**, and paste your own Facebook App ID/Secret or Shopify API key/secret when prompted — see [`CREDENTIALS.md`](./CREDENTIALS.md) for how to obtain them.

## Scripts

| Where    | Script                    | Purpose                              |
|----------|---------------------------|---------------------------------------|
| backend  | `npm run dev`             | Run API with hot reload               |
| backend  | `npm run build`           | Compile TypeScript to `dist/`         |
| backend  | `npm start`               | Run compiled API                      |
| backend  | `npm run prisma:migrate`  | Apply Prisma migrations               |
| backend  | `npm run prisma:generate` | Regenerate the Prisma client          |
| backend  | `npm run prisma:studio`   | Open Prisma Studio                    |
| backend  | `npm test`                | Run the Vitest suite once             |
| backend  | `npm run test:watch`      | Run Vitest in watch mode              |
| frontend | `npm start`                | Run Angular dev server                |
| frontend | `npm run build`            | Production build                      |
| frontend | `npm test`                  | Run unit tests                        |
| e2e      | `npx playwright test`      | Run the end-to-end suite (backend + frontend must be running) |

## Environment variables

See [`backend/.env.example`](./backend/.env.example) for the full list, and [`CREDENTIALS.md`](./CREDENTIALS.md) for what's needed and where it comes from. Never commit `.env`.

## Deployment

Single-service deploy via the root [`Dockerfile`](./Dockerfile): builds the Angular app, builds the Express API, and serves the compiled frontend as static files from the same Node process. [`railway.toml`](./railway.toml) configures a Railway deployment against `/api/health`.

## Current status

- [x] Database schema (7 models), migrated
- [x] Firebase Auth integration (client sign-in + server-side token verification)
- [x] Facebook OAuth + ad account sync (user-supplied app credentials)
- [x] Shopify OAuth + HMAC-verified callback + paginated order sync (user-supplied app credentials)
- [x] Background sync engine (activity-gated cron + manual trigger + auto-expiry on auth errors)
- [x] Angular frontend (zoneless, signals, lazy-loaded routes, layout shell, status-bar notifications)
- [x] Dashboard UI (KPI cards, ROAS chart, campaign table, funnel, alerts panel, Facebook/Shopify tabs)
- [x] Alerts engine (server-side rules, default seeding, CRUD UI)
- [ ] Stripe billing — deferred until after live testing of OAuth/sync flows
- [ ] Production launch checklist

TikTok Ads was part of the original plan but was never built server-side — it's been fully dropped from scope, not just deferred.
