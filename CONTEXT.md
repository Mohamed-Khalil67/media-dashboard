# CONTEXT — start here when resuming work on this project

> **For Claude (or any new collaborator):** read this file first, then `README.md`, then `TEST_PLAN.md`. After that you'll have full context. Do not re-derive decisions already made below.

---

## What this project is

Multi-tenant SaaS dashboard that unifies **Facebook Ads + Shopify** into one media-buying command center. Solo-founder build, targeting media buyers and small agencies. (TikTok was originally planned and partially referenced in early docs — it was never built server-side and has been fully removed from the docs as of this pass.)

## Stack (locked-in choices — do not revisit without explicit ask)

| Layer         | Choice                                                     | Notes                                                                                                                                    |
| ------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Backend       | Node 22 + Express 5 + TypeScript                           | Plan-aligned                                                                                                                            |
| ORM / DB      | Prisma **6** + Postgres (local)                            | Plan asked for "latest Prisma"; v7 broke the plan's `datasource.url = env(...)` syntax — downgraded to 6 to keep build-plan code valid  |
| Frontend      | Angular **21**, standalone components + ApexCharts         | PrimeNG was scaffolded early on but never adopted — no `primeng` dependency exists; all UI is hand-built                                |
| Auth          | **Firebase Auth** (client-side sign-in) + Admin SDK token verification server-side + AES-256-GCM for platform tokens at rest | Superseded the original bcrypt+JWT plan — backend never sees a password, only verifies Firebase ID tokens (`middleware/auth.ts`) |
| Platform credentials | User-supplied per-connection (App ID/Secret pasted in the Connections UI), not global env vars | Sidesteps Meta/Shopify App Review for a solo project — see `CREDENTIALS.md` |
| State (FE)    | Signals (zoneless change detection)                        | Plan-aligned                                                                                                                             |
| Forms         | Reactive Forms (`ReactiveFormsModule`)                     | Plan was vague; chose reactive over signal forms (signal forms still evolving in Angular 21)                                            |
| Charts        | ApexCharts via `ng-apexcharts`, lazy-loaded                | Plan-aligned; lazy-loading is an upgrade                                                                                                |
| Cron          | `node-cron` every 2 min (activity-gated) + `POST /api/sync/run` for manual | Plan-aligned; interval tightened from an earlier 30-min plan to 2 min once activity-gating made frequent polling cheap |
| Tests         | Vitest + supertest (backend), Vitest (frontend)             | Plan didn't specify; Vitest chosen for speed + TS-native ergonomics                                                                     |
| Rate limiting | `express-rate-limit` (10/15min auth, 200/min global)       | Plan listed as security TODO; implemented                                                                                               |

## Build status

- [x] Phase 0 — environment setup and monorepo scaffold
- [x] Phase 1 — database schema (7 models, migrated)
- [x] Phase 2 — backend auth — **superseded**: Firebase Auth + Admin SDK verification, not the originally planned bcrypt/JWT register-login-me flow
- [x] Phase 3 — Facebook OAuth + service (per-connection user-supplied app credentials)
- [x] Phase 4 — Shopify OAuth + HMAC verify + paginated orders fetch (per-connection user-supplied app credentials)
- [x] Phase 6 — sync engine (cron + manual + auto-expiry on auth errors)
- [x] Phase 7 — Angular frontend (zoneless, signals, lazy routes, layout shell, status-bar notification system)
- [x] Phase 8 — dashboard UI (KPI cards, ROAS chart, campaign table, funnel, alerts panel)
- [x] Phase 9 — alerts engine (server-side rules, default seeding, CRUD UI)
- [ ] **Phase 10 — Stripe billing — DEFERRED** (see "Deferred decisions" below)
- [ ] Phase 11 — production deploy

**Phase 5 (TikTok) was dropped**, not completed — no TikTok module exists in `backend/src` or `frontend/src`. Earlier revisions of this file described it as done; that was inaccurate and has been corrected here.

## Deferred decisions (do not implement without re-confirming)

1. **Stripe billing (Phase 10)** — user wants to defer until after live testing of OAuth/sync flows. When picked back up:
   - Implement checkout + customer portal + webhook
   - Plan limits: trial=1 / starter=1 / pro=3 / agency=∞ connections
   - Pattern to use: `ADMIN_EMAILS` env var auto-promotes listed emails to `agency` (lets owner skip Stripe entirely)
2. **Production deploy (Phase 11)** — env-var checklist, Railway setup, OAuth redirect URI swap from `localhost` to prod domain
3. **Frontend unit tests** — a handful of `*.spec.ts` files exist (auth/dashboard/alerts services, kpi-card, dropdown, theme service) but coverage is thin. Backend has 36+ vitest tests.

## What's blocking forward progress

Three sets of OAuth credentials. Until they arrive, nothing more can be tested live. Code paths are fully built and waiting.

**Once credentials are pasted**:

1. Restart `npm run dev` in `backend/`
2. Run the **Golden Path** section of `TEST_PLAN.md` (15 steps, ~10 min)
3. If everything passes, the next phases are Stripe billing (when user is ready) and production deploy

See [`CREDENTIALS.md`](./CREDENTIALS.md) for exact paste locations and how to get each set of keys.

## Test user

A test user already exists in the local DB:

- Email: `test@example.com`
- Password: `supersecret123`

It has the three default alert rules seeded (ROAS<2, freq>4, CTR<0.5%).

## Architectural decisions worth remembering

- **OAuth state is a 5-min signed JWT**, not the raw `userId` the original plan used (CSRF-safe). Implemented in `src/utils/oauthState.ts`. Shared across FB/Shopify.
- **Shopify domain is regex-validated** (`*.myshopify.com` only) before the auth URL is built. Stops auth-URL redirection attacks.
- **Shopify HMAC verification** is enforced on the callback, timing-safe compare. Tested in `shopify.service.test.ts`.
- **Incremental Shopify sync** — uses `updated_at_min` cursor; doesn't refetch all orders every cron tick.
- **Auto-expiry on 401 / FB error 190 / 102** — sync orchestrator flips `Connection.status` to `"expired"` so the UI can prompt reconnect.
- **Shopify-actual revenue preferred over FB-attributed** when both exist, in the metrics aggregator.
- **Period-over-period deltas** are computed server-side in `/metrics/overview`.
- **Alerts: severity is computed**, not stored — "2× worse than threshold" promotes warning → danger. Stable sort: danger first, then by campaign name.
- **Default alert rules seed on register**, not as a migration. Existing users miss out; future migration can backfill if needed.
- **Rate limiters auto-skip when `NODE_ENV=test`** so unit suites aren't throttled.

## Repo layout — quick map

```
media-dashboard/
├── CONTEXT.md           ← you are here
├── README.md            setup + status checklist
├── TEST_PLAN.md         per-module test recipes + golden path
├── CREDENTIALS.md       where to paste OAuth keys
├── backend/             Express + TS + Prisma 6
│   ├── src/
│   │   ├── app.ts                       routes mounted here
│   │   ├── server.ts                    entry + cron boot
│   │   ├── db/client.ts                 Prisma client
│   │   ├── middleware/
│   │   │   ├── auth.ts                  requireAuth + AuthedRequest
│   │   │   └── rateLimit.ts             auth + api limiters
│   │   ├── utils/
│   │   │   ├── encryption.ts            AES-256-GCM
│   │   │   ├── encryption.test.ts
│   │   │   ├── oauthState.ts            signed JWT state
│   │   │   └── oauthState.test.ts
│   │   ├── modules/
│   │   │   ├── auth/                    /me, /logout, /password-reset (Firebase verifies sign-in)
│   │   │   ├── facebook/                OAuth + service
│   │   │   ├── shopify/                 OAuth + HMAC + paginated orders
│   │   │   ├── connections/             list + disconnect
│   │   │   ├── sync/                    POST /run + /run-all
│   │   │   ├── metrics/                 overview + timeseries + campaigns
│   │   │   └── alerts/                  evaluate + rules CRUD
│   │   ├── lib/firebase.ts              Firebase Admin SDK init + ID-token verification
│   │   └── jobs/
│   │       ├── sync.facebook.ts
│   │       ├── sync.shopify.ts
│   │       ├── retention.job.ts         daily sweep of old SyncRun/Insight rows
│   │       └── sync.job.ts              orchestrator + cron
│   ├── prisma/schema.prisma             7 models
│   └── vitest.config.ts                 36+ tests
└── frontend/            Angular 21
    └── src/app/
        ├── app.config.ts                zoneless + interceptors
        ├── app.routes.ts                lazy routes, authGuard/guestGuard
        ├── core/
        │   ├── auth.service.ts          signal-based, wraps Firebase Auth
        │   ├── auth.guard.ts            authGuard + guestGuard
        │   ├── auth.interceptor.ts      Bearer + 401→logout
        │   ├── firebase-auth.gateway.ts injection-token wrapper around the Firebase SDK
        │   ├── status-bar.service.ts    single-pill transient notifications
        │   ├── connections.service.ts
        │   ├── dashboard.service.ts
        │   ├── alerts.service.ts
        │   └── models/                  shared DTOs
        ├── shared/
        │   ├── app-shell.component.ts   layout with nav
        │   ├── status-bar.component.ts
        │   └── dropdown.component.ts    generic content-projected dropdown
        └── features/
            ├── auth/                    login + register + forgot-password
            ├── connections/             real list + connect buttons + sync history
            ├── dashboard/               KPIs + chart + table + funnel + alerts (FB + Shopify tabs)
            ├── alerts/                  rules CRUD page
            ├── guide/                   onboarding help page
            └── landing/                 marketing landing page
```

## How to resume work — checklist for next session

```
1. cd C:\Workspace\projects\media-dashboard
2. (terminal A) cd backend && npm run dev
3. (terminal B) cd frontend && npm start
4. Open http://localhost:4200
5. If credentials are now in .env: follow TEST_PLAN.md → Golden Path
6. If still waiting: ask user what to work on (Phase 10 Stripe? Phase 11 deploy? Frontend unit tests? Tighter validation with zod?)
```

## Open questions for the user (next time)

- Are the OAuth credentials ready to paste?
- Do you want Stripe billing built next, or production deploy first?
- Should frontend get unit tests (Jasmine/Karma scaffolded but unused)?
- Should we swap ad-hoc input validation for `zod` schemas?

---

**Last touched:** 2026-06-09 — Phases 0-9 complete, polish pass shipped (rate limiting + 36 unit tests), test plan + credentials guide written. Awaiting OAuth credentials.

claude --resume 3cb142ab-5699-4090-8107-a59cdf1dbd9f

claude --resume 3cb142ab-5699-4090-8107-a59cdf1dbd9f

FB app's Valid OAuth Redirect URIs : https://media-dashboard-58db5.firebaseapp.com/__/auth/handler

claude --resume 3cb142ab-5699-4090-8107-a59cdf1dbd9f

claude --resume 3cb142ab-5699-4090-8107-a59cdf1dbd9f

claude --resume 3cb142ab-5699-4090-8107-a59cdf1dbd9f

claude --resume 3cb142ab-5699-4090-8107-a59cdf1dbd9f
