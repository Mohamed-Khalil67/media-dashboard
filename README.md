# Media Buying Dashboard

Multi-tenant SaaS that unifies Facebook Ads, TikTok Ads, and Shopify into one media-buying command center.

See [`BUILD_PLAN.md`](./BUILD_PLAN.md) for the full phase-by-phase build plan.

## Stack

- **Backend** — Node.js 22 + Express + TypeScript, Prisma + PostgreSQL
- **Frontend** — Angular 21 (stable) + PrimeNG + ApexCharts
- **Auth** — JWT + bcrypt
- **Background sync** — node-cron polling FB / TikTok / Shopify APIs
- **Billing** — Stripe (Phase 10)

## Layout

```
media-dashboard/
├── backend/    Express + Prisma API
└── frontend/   Angular 21 dashboard
```

## Local setup

### Prerequisites

- Node.js >= 22.22.3
- npm 11+
- Angular CLI 21 — `npm install -g @angular/cli@21`
- PostgreSQL (local or Supabase project)

### Backend

```bash
cd backend
cp .env.example .env       # then fill in DATABASE_URL, JWT_SECRET, ENCRYPTION_KEY
npm install
npx prisma migrate dev     # once schema is defined (Phase 1)
npm run dev                # http://localhost:3000
```

Health check: `GET http://localhost:3000/api/health`.

### Frontend

```bash
cd frontend
npm install
npm start                  # http://localhost:4200
```

## Scripts

| Where    | Script              | Purpose                         |
|----------|---------------------|---------------------------------|
| backend  | `npm run dev`       | Run API with hot reload         |
| backend  | `npm run build`     | Compile TypeScript to `dist/`   |
| backend  | `npm start`         | Run compiled API                |
| backend  | `npm run prisma:migrate` | Apply Prisma migrations    |
| backend  | `npm run prisma:studio`  | Open Prisma Studio         |
| frontend | `npm start`         | Run Angular dev server          |
| frontend | `npm run build`     | Production build                |
| frontend | `npm test`          | Run unit tests                  |

## Environment variables

See [`backend/.env.example`](./backend/.env.example) for the full list. Never commit `.env`.

## Current status

- [x] Phase 0 — environment setup and monorepo scaffold
- [x] Phase 1 — database schema
- [x] Phase 2 — backend auth
- [x] Phase 3 — Facebook OAuth + first data (placeholder credentials)
- [x] Phase 4 — Shopify integration (placeholder credentials)
- [x] Phase 5 — TikTok integration (placeholder credentials)
- [x] Phase 6 — sync engine (cron, manual trigger)
- [x] Phase 7 — Angular frontend foundation
- [x] Phase 8 — dashboard UI (KPIs, ROAS chart, campaigns, funnel)
- [x] Phase 9 — alerts engine (server-side, configurable rules)
- [ ] Phase 10 — Stripe billing **(deferred — implement after live testing)**
- [ ] Phase 11 — production launch
