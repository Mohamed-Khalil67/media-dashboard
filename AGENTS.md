# AGENTS.md

Guidance for AI coding agents (and humans) working in this repository. Read it before changing code. When a rule here conflicts with a habit, the rule wins; when it conflicts with an explicit user instruction, the user wins.

## What this is

A media-buying dashboard: media buyers connect Meta (Facebook/Instagram) ad accounts and Shopify stores, see performance, and act on campaigns. The active feature work is **video creative diagnosis** — see `docs/plans/video-creative-diagnosis.md`.

| Path | What |
|---|---|
| `backend/` | Express 5 + TypeScript + Prisma (PostgreSQL). Entry `src/server.ts`, routes in `src/modules/<area>/<area>.routes.ts`, logic in `*.service.ts`, cron jobs in `src/jobs/` |
| `backend/src/modules/facebook/graph.ts` | The only place the Meta Graph API version and base URLs are defined. Every Meta call goes through its `graph` axios instance |
| `frontend/` | Angular 21, standalone components, signals, Tailwind 4, ApexCharts. Features in `src/app/features/<area>/<name>/`, shared services and models in `src/app/core/` |
| `docs/plans/` | Approved implementation plans |

## Commands

| Task | Command |
|---|---|
| Backend dev server | `npm --prefix backend run dev` (port 3000, reads `backend/.env`) |
| Backend type-check | `cd backend && npx tsc --noEmit` |
| Backend tests | `cd backend && npx vitest run` |
| Prisma migration | `cd backend && npx prisma migrate dev --name <change>` |
| Frontend dev server | `npm --prefix frontend start` (port 4200) |
| Frontend build (also type-checks templates) | `cd frontend && npx ng build` |
| Frontend tests | `cd frontend && npx ng test --watch=false` |

A change is done only when the type-check, the build and the tests for every project it touches pass.

## Type safety

These apply to backend and frontend alike. Both tsconfigs run `strict` and `noUncheckedIndexedAccess`; the frontend adds `strictTemplates`.

1. **No `any`.** Not in annotations, generics or casts. Data whose shape you don't control is `unknown` until a schema has parsed it.
2. **No unchecked `as`.** Allowed: `as const`, and `as T` immediately after a runtime check that proves it. Not allowed: `as unknown as T`, or casting an API response to the type you hope it has. Prisma `Json` columns take a value built from a parsed object, not a cast.
3. **Avoid `!` (non-null assertion).** Narrow instead: `const [first] = list; if (first === undefined) return …`, `list.at(-1) ?? fallback`, `map.get(k) ?? …`. In tests, `?.` inside `expect(...)` is fine.
4. **Validate every boundary with zod.** External APIs (Meta Graph, Shopify), request bodies and query strings in Express routes, and our own API responses read by the frontend. Parse failures are handled (logged, skipped or turned into a 400), never ignored.
5. **Derive types from schemas**, don't write them twice: `export const AdRow = z.object({...}); export type AdRow = z.infer<typeof AdRow>;`.
6. **Shared API contracts.** Request/response schemas used by both sides belong in one shared location (to be introduced as `shared/contracts/`); the backend validates with them, the frontend parses with them. Don't hand-copy DTO interfaces between projects.
7. **Model variants as discriminated unions** (`{ kind: "hook"; ... } | { kind: "delivery"; ... }`) and handle them with an exhaustive `switch` ending in `const _exhaustive: never = value;`.
8. **String enums are unions or `z.enum`**, not loose `string` (e.g. `platform: "facebook" | "shopify"`).
9. **Money and rates**: keep raw numbers in data; round only for display (`DecimalPipe`, `CurrencyPipe`, `Intl.NumberFormat`). Divisions go through a safe-divide helper that returns 0 for a zero denominator.

## Angular (v21)

Before writing Angular code, prefer the Angular CLI MCP server (configured in `.mcp.json`): call `get_best_practices`, and `search_documentation` for any API you're unsure of, instead of relying on memory.

- **Standalone components only**, `changeDetection: ChangeDetectionStrategy.OnPush` on every component.
- **Signal APIs**: `input()` / `input.required()`, `output()`, `model()`, `viewChild()`; no `@Input`/`@Output` decorators in new code.
- **State in signals**; derived state in `computed()`; state that resets when a source changes in `linkedSignal()`. Do not use `effect()` to copy one signal into another — effects are for side effects (DOM, logging, storage).
- **Reads use `httpResource`** with `parse: Schema.parse` so the response is validated; **writes use `HttpClient`** in a service. Components don't call `HttpClient` directly.
- **Control flow** `@if` / `@for (…; track id)` / `@switch` / `@defer`. Heavy charts go inside `@defer (on viewport)`.
- `inject()` instead of constructor injection. Services are `providedIn: "root"` unless scoped on purpose.
- Routes are lazy (`loadComponent`); route params bind to inputs (`withComponentInputBinding`). Filters and selections that should survive a refresh live in query params.
- File layout: one folder per component, `name.component.{ts,html,css}` plus `name.component.spec.ts` where tested.
- Templates must compile under `strictTemplates` — no `$any()`.

## Backend (Express + Prisma)

- Route handlers stay thin: parse input with zod, call a service, return its result. Business logic lives in services; pure logic (calculations, the creative diagnosis engine) has no I/O and is unit-tested.
- Every query is scoped to the authenticated user (`(req as AuthedRequest).userId`) — never trust an id from the request without checking ownership.
- Bulk writes are batched (`createMany`, chunked `$transaction`, or `INSERT … ON CONFLICT`), not one `upsert` per row in a loop.
- Tokens and app secrets are encrypted at rest via `utils/encryption`; never log them or return them to the client.
- Use the `logger` (pino), not `console`.

## Meta Marketing API

- All calls go through `graph` / `GRAPH_BASE` from `modules/facebook/graph.ts`. Never hard-code a version. Meta expires versions ~1 year after release; when the drift warning appears in logs, bump `DEFAULT_GRAPH_VERSION`.
- Writes to Meta (pause, budget, duplicate, rename) require explicit user confirmation in the UI, are recorded in an audit log, and only update local state after Meta confirms.
- Reach and frequency are not additive across days — never sum daily reach; request them for the whole window.
- Never store expiring media URLs (video `source`); store ids and thumbnails.
- Respect rate limits: read `x-business-use-case-usage` / `x-fb-ads-insights-throttle` and back off.

## UI and design

- Use the design tokens in `frontend/src/styles.css` (`--card-bg`, `--accent`, `--success`, `--danger`, …) and support both light and `html.dark`. No hard-coded colours in components.
- Status is never colour alone: pair it with an icon and text.
- Visible keyboard focus on every interactive element; honour `prefers-reduced-motion`.
- Copy is sentence case, plain verbs, specific errors that say how to fix the problem.

## Tests

- Backend: Vitest, files next to the code as `*.test.ts`; mock Prisma and the logger as existing tests do.
- Frontend: Vitest via `ng test`, `*.spec.ts`.
- New pure logic gets table-driven tests covering edge cases (zero values, missing data, empty arrays).

## Git

- Work on a branch; never commit straight to `master`.
- Commit only files that belong to the change. The working tree may contain the owner's unrelated in-progress work — don't sweep it into a commit.
- Never commit `.env`, service-account keys or credentials.
