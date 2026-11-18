# Media Buying Dashboard

Unified multi-tenant SaaS command center combining **Facebook Ads** and **Shopify** into a single real-time media-buying dashboard. Built with modern zoneless Angular 21, Node.js / Express 5 with TypeScript, and Prisma 6 with PostgreSQL.

---

## Table of Contents

1. [Quick Start & Local Launch](#1-quick-start--local-launch)
2. [Workspace Guidelines & Engineering Rules](#2-workspace-guidelines--engineering-rules)
3. [Product Context & Strategy](#3-product-context--strategy)
4. [Credentials & Configuration](#4-credentials--configuration)
5. [Frontend Architecture (Angular 21 Zoneless)](#5-frontend-architecture-angular-21-zoneless)
6. [Backend Architecture (Express 5 + Prisma + NestJS Patterns)](#6-backend-architecture-express-5--prisma--nestjs-patterns)
7. [Testing Strategy & Test Plan](#7-testing-strategy--test-plan)
8. [Technical Deep Dive & Interview Walkthrough](#8-technical-deep-dive--interview-walkthrough)

---

## 1. Quick Start & Local Launch

### Prerequisites
- **Node.js**: >= 22.0.0
- **npm**: >= 10.0.0
- **Angular CLI 21**: `npm install -g @angular/cli@21` (optional if using local scripts)
- **PostgreSQL**: Running locally on port `5432` or via hosted URL
- **Firebase Project**: Authentication enabled with an Admin SDK service account key

### One-Command Local Launch
To launch both the backend (Express API on `http://localhost:3000`) and the frontend (Angular SPA on `http://localhost:4200`) concurrently with unified logs and automatic graceful shutdown:

```bash
# Using npm
npm run dev

# Or Windows Batch (Double-click or run from cmd)
launch.bat

# Or PowerShell
.\launch.ps1

# Or Bash / Unix / macOS / Git Bash
./launch.sh
```

### Manual Individual Boot

#### 1. Backend (`backend/`)
```bash
cd backend
cp .env.example .env     # Fill in DATABASE_URL, JWT_SECRET, ENCRYPTION_KEY, FIREBASE_SERVICE_ACCOUNT_JSON
npm install
npx prisma migrate dev
npm run dev              # Starts Express API at http://localhost:3000
```
Health Check: `GET http://localhost:3000/api/health`

#### 2. Frontend (`frontend/`)
```bash
cd frontend
npm install
npm start                # Starts Angular dev server at http://localhost:4200
```

#### 3. End-to-End Suite (`e2e/`)
```bash
cd e2e
npm install
npx playwright install chromium
npm test
```

---

## 2. Workspace Guidelines & Engineering Rules

### 2.1 Type Safety Standards
- **Strict Mode Enforced**: `strict: true`, `noImplicitAny: true`, and `strictNullChecks: true` must remain enabled across all `tsconfig.json` configurations.
- **Zero `any` Policy**: Never use `any`. Use `unknown` and narrow it using type guards (`typeof`, `instanceof`, user-defined type guards `is`, or schema validation).
- **Template Type Checking**: `strictTemplates: true` is strictly enforced. Never use `$any()` casts in templates; always implement strongly-typed component event handlers.
- **Explicit Typing**: Public service methods, DTO contracts, and API endpoints must declare explicit return types.

### 2.2 Frontend (Angular) Standards
- **Standalone Components**: 100% standalone components without `standalone: true` metadata (Angular v20+ default).
- **Zoneless Reactivity**: Application runs zoneless via `provideZonelessChangeDetection()`. State is managed exclusively through Angular Signals (`signal()`, `computed()`, `input()`, `output()`).
- **OnPush Change Detection**: Every component explicitly declares `changeDetection: ChangeDetectionStrategy.OnPush`.
- **Modern Control Flow**: Strictly use native control flow (`@if`, `@for`, `@switch`). Never import `CommonModule` or use legacy `*ngIf`/`*ngFor`.
- **Component Styling & Structure**: Styled with Tailwind CSS v4 and modern component CSS (`.component.css`). Every component lives in its own dedicated directory containing `.component.ts`, `.component.html`, and `.component.css`. No decorators `@HostBinding` or `@HostListener` (use component metadata `host: { ... }` instead).

### 2.3 Backend (NestJS Architecture Patterns)
- **Feature Modularity**: Organize endpoints by domain under `src/modules/<feature>/`.
- **Separation of Concerns**: Controllers/routes strictly handle HTTP transport and status codes; services encapsulate business logic and database queries; DTOs (`src/modules/<feature>/dto/`) define strict contract boundaries.
- **Database Safety**: Keep Prisma client auto-generated (`prisma generate && tsc`). Wrap multi-table operations in atomic interactive transactions (`prisma.$transaction(...)`).

---

## 3. Product Context & Strategy

### The Problem
Media buyers running paid Facebook ads pointing to Shopify storefronts traditionally jump between multiple disconnected dashboards, spreadsheets, and ad managers to determine campaign profitability. 

### The Solution
A unified dashboard combining:
1. **Ad Performance**: Spend, Impressions, Clicks, CPC, CTR, Frequency, CPM from Meta Marketing API.
2. **Store Outcomes**: Attributed Purchases, Revenue, ROAS, CPA, and blended metrics from Shopify Admin API.
3. **Automated Alerting**: Real-time evaluation of performance rules (e.g. ROAS < 2.0, CTR < 1.0%, Frequency > 3.5) across historical evaluation windows.
4. **Automated Background Refresh**: Background cron job refreshing active user data every 2 minutes with cooldowns and automated token expiry tracking.

### Architecture Scope & Locked Decisions
- **Multi-Tenant SaaS**: Single-user SaaS model where each user connects their own ad and store accounts.
- **Zero App Review Wait**: Users connect using their own developer app credentials (App ID & Secret pasted in the UI) instead of a shared global application, eliminating Facebook App Review bottlenecks.
- **Dropped Modules**: TikTok Ads was explored initially but dropped prior to implementation to focus on Facebook + Shopify.
- **Deferred Decisions**: Stripe billing integration (Phase 10) is architected for later integration without disrupting core sync flows.

---

## 4. Credentials & Configuration

### Environment Variables (`backend/.env`)

| Variable | Description | Example / Default |
| :--- | :--- | :--- |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@localhost:5432/media_dashboard` |
| `JWT_SECRET` | Secret for signing OAuth CSRF state | Long random string |
| `ENCRYPTION_KEY` | 32-byte hex key for AES-256-GCM token encryption | `64-char-hex-string` |
| `FRONTEND_URL` | Allowed CORS origin and OAuth redirect target | `http://localhost:4200` |
| `PORT` | Backend HTTP API port | `3000` |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Firebase Admin SDK credentials in minified JSON | `{"type":"service_account",...}` |
| `SYNC_CRON` | Background sync schedule | `*/2 * * * *` (every 2 mins) |
| `ACTIVITY_WINDOW_MINUTES` | Activity threshold for background sync | `5` |
| `SYNC_COOLDOWN_SECONDS` | Rate-limit cooldown between platform syncs | `90` |
| `RETENTION_CRON` | Daily data cleanup cron | `0 3 * * *` |
| `SYNC_RUN_RETENTION_DAYS` | Sync run history TTL | `7` |
| `INSIGHT_RETENTION_DAYS` | Daily insights data TTL | `30` |

### Setting Up Platform OAuth

#### Facebook (Meta) App
1. Go to [Meta for Developers](https://developers.facebook.com/apps) and create a **Business** app.
2. Add products: **Facebook Login for Business** and **Marketing API**.
3. Under Facebook Login > Settings > Valid OAuth Redirect URIs, add:  
   `http://localhost:3000/api/facebook/callback`  
   Production: `https://media-dashboard-5yew.onrender.com/api/facebook/callback`
4. Copy **App ID** and **App Secret** from App Settings > Basic.
5. In the UI, navigate to **Connections > Connect Facebook** and paste credentials.

#### Shopify Partner App
1. Go to [Shopify Partners](https://partners.shopify.com) and create a **Custom App**.
2. Under Allowed redirection URL(s), add:  
   `http://localhost:3000/api/shopify/callback`  
   Production: `https://media-dashboard-5yew.onrender.com/api/shopify/callback`
3. Scopes required: `read_orders,read_products,read_analytics` (requested automatically during OAuth flow).
4. Copy **Client ID** and **Client Secret** and connect via **Connections > Connect Shopify** in the UI.

---

### Live Deployment (Render + Neon)

The app is deployed as a single Docker web service on [Render](https://render.com) (free plan), using a [Neon](https://neon.tech) Postgres database. The API and the Angular app share one URL.

- **Live app:** https://media-dashboard-5yew.onrender.com
- **Health check:** https://media-dashboard-5yew.onrender.com/api/health
- **Setup guide:** [docs/deploy-render-neon.md](docs/deploy-render-neon.md)
- **Blueprint:** [render.yaml](render.yaml), read by Render on each deploy from `master`

**Render environment variables:** `DATABASE_URL` (Neon direct connection string), `ENCRYPTION_KEY`, `FIREBASE_SERVICE_ACCOUNT_JSON`, `FRONTEND_URL` (`https://media-dashboard-5yew.onrender.com`, no trailing slash). `JWT_SECRET`, `NODE_ENV` and `TRUST_PROXY_HOPS` are set by the Blueprint.

**Follow-up setup after each new deployment URL:**

1. **Firebase:** Authentication → Settings → Authorized domains → add `media-dashboard-5yew.onrender.com`.
2. **Meta app:** Facebook Login → Settings → Valid OAuth Redirect URIs → add `https://media-dashboard-5yew.onrender.com/api/facebook/callback`.
3. **Shopify app:** add `https://media-dashboard-5yew.onrender.com/api/shopify/callback` to Allowed redirection URL(s).
4. **Render:** if `FRONTEND_URL` changes, update it and redeploy. The OAuth redirects use it.

**Notes on the free tier:** the service sleeps after about 15 minutes without traffic, so the first request after that can take around a minute. Background sync only runs while the service is awake, and the daily cleanup also runs at each startup.

---

## 5. Frontend Architecture (Angular 21 Zoneless + Tailwind CSS v4)

### Directory Structure
```
frontend/src/app/
├── app.config.ts                     # Bootstrap: zoneless change detection, router, HTTP interceptor
├── app.routes.ts                     # Route table with 100% lazy loading
├── app.component.ts                  # Root component (<router-outlet /> + <app-status-bar />)
├── app.component.html
├── app.component.css
├── core/                             # Global singleton services & cross-cutting logic
│   ├── auth.guard.ts                 # Functional route guard with hydration-safe promise
│   ├── auth.interceptor.ts           # Attaches Bearer ID token, handles 401 redirect
│   ├── auth.service.ts               # Signal-based authentication state
│   ├── connections.service.ts        # HTTP client for connections & sync runs
│   ├── dashboard.service.ts          # HTTP client for metrics, campaign aggregates, timeseries
│   ├── alerts.service.ts             # HTTP client for evaluated alerts & rule CRUD
│   ├── status-bar.service.ts         # Transient notification bus
│   ├── theme.service.ts              # LocalStorage-backed light/dark theme toggle
│   └── models/                       # Type definitions & DTO contracts
├── shared/                           # Reusable UI components (domain-agnostic)
│   ├── app-shell/                    # Top navigation & header layout chrome
│   │   ├── app-shell.component.ts
│   │   ├── app-shell.component.html
│   │   └── app-shell.component.css
│   ├── dropdown/                     # Accessible content-projected dropdown
│   │   ├── dropdown.component.ts
│   │   ├── dropdown.component.html
│   │   ├── dropdown.component.css
│   │   └── dropdown.component.spec.ts
│   └── status-bar/                   # Animated floating notification banner
│       ├── status-bar.component.ts
│       ├── status-bar.component.html
│       └── status-bar.component.css
└── features/                         # Feature routes
    ├── auth/                         # Dedicated folders for login, register, forgot-password
    │   ├── login/                    # login.component.{ts,html,css}
    │   ├── register/                 # register.component.{ts,html,css}
    │   └── forgot-password/          # forgot-password.component.{ts,html,css}
    ├── connections/                  # Connect/manage Facebook & Shopify accounts
    │   ├── connections/              # connections.component.{ts,html,css}
    │   └── sync-history/             # sync-history.component.{ts,html,css}
    ├── dashboard/                    # Overview metrics, charts, campaign tables, funnels
    │   ├── dashboard/                # Main dashboard page
    │   ├── dashboard-tabs/           # Tab navigation
    │   ├── shopify-dashboard/        # Shopify metrics view
    │   ├── shopify-orders/           # Shopify order list view
    │   ├── shopify-subtabs/          # Subtabs
    │   └── components/               # Sub-components with dedicated folders:
    │       ├── kpi-card/             # kpi-card.component.{ts,html,css,spec.ts}
    │       ├── roas-chart/           # roas-chart.component.{ts,html,css}
    │       ├── campaign-table/       # campaign-table.component.{ts,html,css}
    │       ├── funnel/               # funnel.component.{ts,html,css}
    │       ├── range-selector/       # range-selector.component.{ts,html,css}
    │       └── refresh-bar/          # refresh-bar.component.{ts,html,css}
    ├── alerts/                       # alerts/ (alerts.component.{ts,html,css})
    └── guide/, landing/              # guide/, landing/ (component.{ts,html,css})
```

### Key Architectural Highlights
1. **Zoneless Change Detection**: `provideZonelessChangeDetection()` eliminates `zone.js`. State transitions trigger view updates via Angular Signals without dirty-checking the entire component tree.
2. **Dedicated Component Folders**: 100% of components reside in their own folder with separate `.component.ts`, `.component.html`, and `.component.css` files, enforcing Angular CLI standard structure.
3. **Tailwind CSS v4 & PostCSS**: Native CSS modern stack using `@tailwindcss/postcss` and `@import "tailwindcss";` in `src/styles.css`, completely eliminating SCSS overhead.
4. **Signal-Based Reactivity**: Core services expose readonly signals (`auth.user()`, `theme.dark()`, `status.current()`). Components derive view models cleanly with `computed()`.
5. **Template Strictness & Zero Any**: Strict template type-checking (`strictTemplates: true`), zero template `$any()` casts, and strict TypeScript types.
6. **OnPush & Host Metadata**: All components declare `changeDetection: ChangeDetectionStrategy.OnPush` and modern `host: { ... }` event bindings without `@HostListener`.

---

## 6. Backend Architecture (Express 5 + Prisma + NestJS Patterns)

### Directory Structure
```
backend/src/
├── app.ts                            # Express application assembly, middleware pipeline, error handling
├── server.ts                         # Process entrypoint & background cron scheduler kickoff
├── db/
│   └── client.ts                     # Singleton Prisma client instance
├── jobs/                             # Background scheduled workers
│   ├── sync.job.ts                   # Activity-gated sync scheduler
│   ├── sync.facebook.ts              # Facebook Marketing API ingestion pipeline
│   ├── sync.shopify.ts               # Shopify GraphQL/REST ingestion pipeline
│   └── retention.job.ts              # Daily rolling data sweeper
├── lib/                              # Shared utility libraries
│   ├── firebase.ts                   # Firebase Admin SDK initialization
│   ├── logger.ts                     # Pino structured logger
│   └── numeric.ts                    # Safe float parsing and sanitization
├── middleware/
│   ├── auth.ts                       # requireAuth token verification & auto-provisioning
│   └── rateLimit.ts                  # Tiered IP rate limiting
├── modules/                          # Feature domains (NestJS architecture style)
│   ├── alerts/                       # alerts.routes.ts, alerts.service.ts, dto/
│   ├── auth/                         # auth.routes.ts, auth.service.ts, dto/
│   ├── connections/                  # connections.routes.ts, connections.service.ts, dto/
│   ├── facebook/                     # facebook.routes.ts, facebook.service.ts, dto/
│   ├── metrics/                      # metrics.routes.ts, metrics.service.ts, dto/
│   ├── shopify/                      # shopify.routes.ts, shopify.service.ts, dto/
│   └── sync/                         # sync.routes.ts, sync.service.ts, dto/
└── utils/
    ├── encryption.ts                 # AES-256-GCM symmetric encryption for tokens at rest
    └── oauthState.ts                 # HMAC-SHA256 signed CSRF state tokens
```

### Database Models (Prisma 6)
1. **`User`**: Account identity mapped to `firebaseUid`, with `lastActiveAt` for sync gating.
2. **`Connection`**: External platform account (Facebook or Shopify) with encrypted `appSecret` and tokens.
3. **`Campaign`**: Ad campaigns synchronized from Facebook Marketing API.
4. **`Insight`**: Daily performance slices (Spend, Impressions, Clicks, Purchases, Revenue).
5. **`ShopifyOrder`**: Normalized order records from Shopify store.
6. **`SyncRun`**: Audit trail of sync attempts, durations, campaign counts, and errors.
7. **`AlertRule`**: User-defined performance threshold rules (ROAS, Frequency, CTR).

### Security Architecture
- **Encryption at Rest**: Sensitive tokens (`appSecret`, OAuth access tokens) are encrypted with AES-256-GCM authenticated encryption before persisting to PostgreSQL.
- **OAuth CSRF Protection**: OAuth states are signed with HMAC-SHA256 tokens encoding the `userId` and timestamp to prevent CSRF attacks.
- **Firebase Token Verification**: Passwords never touch the backend. The API strictly validates Firebase JWTs via the Admin SDK.

---

## 7. Testing Strategy & Test Plan

### Test Suites
- **Backend Unit & Integration**: Tested using Vitest + Supertest (`npm --prefix backend test`). 38 tests covering numeric sanitizers, encryption, OAuth state, sync jobs, and auth routes.
- **Frontend Unit**: Tested using Angular CLI Unit Test Builder + Vitest (`npm --prefix frontend test`). 39 tests covering theme service, dashboard service, alerts service, dropdown, auth service, and KPI cards.
- **End-to-End (E2E)**: Playwright test suite (`npm --prefix e2e test`).

### Running the Full Test Suite
```bash
# Run backend tests
npm --prefix backend test

# Run frontend tests
npm --prefix frontend test

# Run all tests via root script
npm test
```

### Golden Path Validation Checklist
1. Register user via frontend at `/register`.
2. Connect Facebook account with mock/dev credentials at `/connections`.
3. Connect Shopify store with dev credentials.
4. Verify sync run creation in database.
5. Confirm metrics display in Dashboard: KPI cards, ROAS timeseries chart, campaign table.
6. Create an Alert Rule in `/alerts` (e.g. ROAS < 2.5) and verify badge in Alerts Panel.
7. Perform ephemeral logout: verify connections are wiped while user profile remains.

---

## 8. Technical Deep Dive & Interview Walkthrough

### 1. The Auth Race Condition on Hard Refresh
* **Problem**: In Firebase Auth, credentials are restored asynchronously from IndexedDB/localStorage. On hard refresh, `auth.currentUser` is initially `null`, causing standard Angular route guards to bounce users to `/login`.
* **Solution**: `AuthService` tracks an `authReady` signal. The functional `authGuard` checks `if (auth.authReady())` immediately for fast navigation, but if not yet hydrated, returns a promise that resolves once `onAuthStateChanged` fires its initial tick.

### 2. Ephemeral Data Logout
* **Design**: When a user logs out (`POST /api/auth/logout`), the system deletes all external platform connections and synced metrics (`onDelete: Cascade` wiping Campaigns, Insights, Orders, SyncRuns). The user profile row remains.
* **Why**: Ensures zero residual external platform data or OAuth tokens remain active when a session terminates, while allowing returning users to sign back in cleanly.

### 3. Activity-Gated Background Sync
* **Design**: Instead of indiscriminately syncing all database connections every 2 minutes, the backend inspects `user.lastActiveAt`. Only connections belonging to users active within the last 5 minutes are queued for sync.
* **Result**: Drastically reduces Meta and Shopify API rate limit consumption while ensuring active users see fresh data with a 90-second cooldown protection.

### 4. Zoneless Angular Architecture
* **Design**: Replaced Zone.js with `provideZonelessChangeDetection()` and Angular Signals.
* **Result**: Prevents unnecessary global change detection passes during ApexChart animations and periodic timers, delivering optimal client-side performance.
