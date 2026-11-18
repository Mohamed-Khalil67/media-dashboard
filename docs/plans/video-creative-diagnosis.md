# Plan: video creative diagnosis

Goal: for every video or reel ad that has launched, show a media buyer **where it is failing** (delivery, hook, hold, click, landing page, conversion, fatigue) and **what to do next** (scale, keep, iterate, kill, fix delivery, wait for data), backed by Meta data.

Status: draft for approval. Nothing below is implemented yet. Revision 2 (2026-11-05) resolved the three open decisions, made verdicts depend on the campaign objective, and fixed how reach is aggregated.

---

## 0. Findings that shape the plan

**Current state**

| Area | Today | Gap |
|---|---|---|
| Meta sync | Campaign level only: spend, impressions, clicks, frequency, purchases, ROAS (`facebook.service.ts`, `sync.facebook.ts`) | No ad sets, ads, creatives, video metrics, rankings, placements or delivery issues |
| Graph API version | `v21.0` default | **v21 expired on 2025-09-09. v24 expires on 2026-11-10.** Calls are currently auto-upgraded or failing. Pin to `v25.0`. |
| DB | `Campaign` and `Insight` (daily) | No `AdSet`, `Ad`, ad-level daily insights, placement breakdown, retention curve or decision log |
| Write path | Upserts one row at a time | Too slow at ad level (ads × days). Needs batched upserts. |
| Runtime validation | `as unknown as object` casts and generic `http.get<T>` assertions | No schema validation at the Meta, API or frontend boundaries |
| Frontend | Angular 21, signals, OnPush, Tailwind 4, ApexCharts, design tokens in `styles.css` | No creative views; services use promises, not `httpResource` |
| Agent guidance | No `AGENTS.md` | Needs to be created |

**Meta API facts** (verified against developers.facebook.com and the v26 SDK)

- 3-second plays (needed for hook rate) come from `actions[action_type = "video_view"]`. There is no dedicated field.
- Video fields: `video_play_actions`, `video_thruplay_watched_actions`, `video_p25|p50|p75|p95|p100_watched_actions`, `video_avg_time_watched_actions`, `video_play_curve_actions` (per-second retention histogram).
- Ranking fields: `quality_ranking`, `engagement_rate_ranking`, `conversion_rate_ranking`. They are ad level only and need about 500 impressions.
- Delivery fields:
  - Ad: `effective_status`, `issues_info`, `ad_review_feedback`.
  - Ad set: `learning_stage_info.status` (`LEARNING | SUCCESS | FAIL`). `FAIL` is roughly what Ads Manager calls "learning limited".
- Creative fields: `creative{video_id, thumbnail_url, object_type, asset_feed_spec, effective_object_story_id}`. Use `thumbnail_width/height` to get a usable size. Never store the video `source` URL because it expires.
- Placement breakdown: `publisher_platform, platform_position`, where `instagram_reels` is the Reels position. Video fields can't be combined with hourly or region breakdowns.
- Advantage+ and Dynamic Creative ads put their videos in `asset_feed_spec`. Per-asset breakdowns give only impressions, clicks, spend and actions, with no retention. These ads get a reduced diagnosis.
- Scale:
  - Use async insights jobs (`POST /act_x/insights` → `report_run_id`) for large accounts.
  - Read the `x-business-use-case-usage` and `x-fb-ads-insights-throttle` headers to back off before hitting limits.
  - Re-pull a rolling 28 days, because Meta back-fills conversions.
- Attribution: `7d_view` and `28d_view` return no data since 2026-01-12. Default to the account's attribution setting.
- Benchmarks are vendor heuristics, not Meta numbers. The primary comparison is therefore **the account's own median**, with fixed heuristics as a fallback:

  | Metric | Fallback heuristic |
  |---|---|
  | Hook rate | about 25–30% |
  | Hold rate | about 40% |
  | Link CTR | about 1% |
  | Prospecting frequency | about 3 |

---

## 1. Foundations (first PR, small, can ship alone)

1. **Bump the Graph version** to `v25.0`, with `FB_GRAPH_VERSION` env override. Handle the `X-Ad-Api-Version-Warning` header by logging it. This is urgent and independent of the rest.
2. **Create `AGENTS.md`** at the repo root, with a `CLAUDE.md` that points to it:
   - **Type safety**
     - No `any`. Use `unknown` at boundaries, narrowed with zod.
     - No `as` casts except `as const` and narrowing that has been checked.
     - Turn on `noUncheckedIndexedAccess` in both tsconfigs.
     - Model variants as discriminated unions (verdicts, findings).
     - Exhaustive `switch` with a `never` check.
     - Validate every external response (Meta, Shopify, our own API in the browser) with a schema.
   - **Shared contracts**
     - Add a `shared/contracts/*.ts` folder of zod schemas plus `z.infer` types.
     - The backend imports them through a relative path. The frontend imports them through a `@contracts/*` tsconfig path.
     - One source of truth for DTOs.
   - **Angular rules**
     - Standalone components, `OnPush`, `input()`/`output()`/`model()`.
     - Signals for state, `computed` for derived state, `linkedSignal` for resettable state.
     - Use `httpResource` with `parse: schema.parse` for reads, and `HttpClient` for writes.
     - Use `@if`/`@for`/`@defer` and `inject()`.
     - No `effect()` for state propagation.
     - Use the intent-first naming from the v20+ style guide.
   - **Backend rules**
     - Thin route handlers; validate with zod.
     - Services are pure where possible; the diagnosis engine has no I/O.
     - Batched DB writes.
     - Every new module has tests.
   - **UI rules**
     - Use the tokens in `styles.css`.
     - Status is shown with colour, icon and text together, never colour alone.
     - Visible keyboard focus.
     - Honour `prefers-reduced-motion`.
3. **Angular CLI MCP server** (`.mcp.json` → `npx -y @angular/cli mcp --read-only`). Agents then use `get_best_practices` and `search_documentation` instead of guessing, and `AGENTS.md` tells them to.
4. **Add `zod`** to the backend and frontend.
5. **Enable `noUncheckedIndexedAccess`** and fix the fallout.

## 2. Data model (Prisma migration)

```
Connection    + targetRoas Float?, targetCpa Float?, currency String?
              (account-level defaults; null means fall back to break-even ROAS 1.0)

Campaign      + objective (OUTCOME_AWARENESS|OUTCOME_ENGAGEMENT|OUTCOME_TRAFFIC|
                OUTCOME_LEADS|OUTCOME_SALES|OUTCOME_APP_PROMOTION|UNKNOWN)
              + targetRoas Float?, targetCpa Float?   (optional per-campaign override)

AdWindowStat  adId, windowStart, windowEnd, reach, frequency, impressions, spend
              @@unique(adId, windowStart, windowEnd)
              (reach and frequency are NOT additive across days: summing daily reach
               double-counts people. These come from a separate window-level call,
               one per selected range, never from summing AdInsightDaily.)

AdSet         id, campaignId→Campaign, externalId, name, effectiveStatus,
              learningStatus (LEARNING|SUCCESS|FAIL|null), optimizationGoal,
              dailyBudget, lifetimeBudget, issues Json?, raw Json?
              @@unique(campaignId, externalId)

Ad            id, adSetId→AdSet, externalId, name, effectiveStatus,
              format (VIDEO|IMAGE|CAROUSEL|DYNAMIC|UNKNOWN),
              creativeId, videoId?, thumbnailUrl?, permalinkUrl?,
              issues Json?, reviewFeedback Json?, createdAtPlatform, raw Json?
              @@unique(adSetId, externalId)

AdVideo       videoId @id, lengthSec, title?, pictureUrl?   (no `source`, it expires)

AdInsightDaily  adId→Ad, date,
              spend, impressions, reach, frequency, clicks, linkClicks,
              videoPlays, video3s, thruplays, p25, p50, p75, p95, p100,
              avgWatchSec, landingPageViews, addToCart, initiateCheckout,
              purchases, revenue,
              qualityRanking?, engagementRanking?, conversionRanking?  (enum)
              raw Json?
              @@unique(adId, date) @@index(date)

AdPlacementStat adId, windowStart, windowEnd, publisherPlatform, platformPosition,
              spend, impressions, video3s, thruplays, linkClicks, purchases, revenue
              @@unique(adId, windowStart, windowEnd, publisherPlatform, platformPosition)

AdRetentionCurve adId, windowStart, windowEnd, points Json  (number[], % still watching per bucket)

AdDecision    id, adId, userId, verdict, note?, metricsSnapshot Json, createdAt
              (the buyer's decision log, which closes the loop "we saw X, did Y")

ActionAudit   id, userId, connectionId, level (AD|ADSET|CAMPAIGN), externalId,
              action (PAUSE|ACTIVATE|BUDGET|DUPLICATE|RENAME), before Json, after Json?,
              status (REQUESTED|SUCCEEDED|FAILED), error?, metricsSnapshot Json?,
              createdAt, completedAt?
              (one row per write to Meta, including the existing campaign actions.
               The local status only changes after Meta confirms; a failure stays
               visible and never shows the object as paused.)
```

Retention job: extend it to prune `AdInsightDaily`, `AdPlacementStat` and `AdRetentionCurve` on the same cutoff.

## 3. Sync (`jobs/sync.facebook.ads.ts`)

1. **Structure pass.** Request `GET /act_x/ads?fields=id,name,effective_status,issues_info,ad_review_feedback,created_time,adset{id,name,effective_status,learning_stage_info,optimization_goal,daily_budget,lifetime_budget,campaign_id},creative{id,object_type,video_id,thumbnail_url,asset_feed_spec,effective_object_story_id}&thumbnail_width=480&thumbnail_height=480`, paginated, filtered to ads that have delivered in the window.
2. **Campaign objective.** Add `objective` to the existing campaign fetch.
3. **Window reach.** For each selected range, one `level=ad` call with no `time_increment` for `reach,frequency,impressions,spend`, plus the same at account level for the header. Cache it per (range, day).
4. **Daily ad insights.** Use `level=ad`, `time_increment=1` and a rolling 28-day window, with fields:
   - Delivery and cost: spend, impressions, reach, frequency, clicks, inline_link_clicks
   - Actions: `actions` and `action_values`
   - Video: `video_play_actions`, `video_thruplay_watched_actions`, `video_p25` through `p100`, `video_avg_time_watched_actions`
   - Rankings: the three ranking fields

   Small accounts use a sync GET. Large accounts, or a GET that hits error 100/1487534, switch to an async job.
3. **Placement pass.** One call per window, with `breakdowns=publisher_platform,platform_position` and no `time_increment`.
4. **Retention pass.** `video_play_curve_actions` for video ads only. If it is empty, fall back to a 5-point curve built from 3 s, p25, p50, p75 and p100.
5. **Video meta.** Batch `GET /?ids=v1,v2&fields=length,title,picture`.
6. **Validation and writes**
   - Every response goes through a zod schema. On a parse failure, log it and skip the row, never crash the sync.
   - Upserts are batched in chunks with `$transaction`, or use `INSERT … ON CONFLICT` for daily rows.
7. **Throttling.** Parse the BUC headers. Pause when utilisation passes 75% and record it on `SyncRun`.

## 4. Diagnosis engine (`modules/creatives/diagnosis/`, pure, no I/O)

**Derived metrics** for each ad over the selected window:

| Metric | Formula |
|---|---|
| Hook rate | video3s / impressions |
| Hold rate | thruplays / video3s |
| Completion | p100 / videoPlays |
| Link CTR | linkClicks / impressions |
| CPM | spend / impressions × 1000 |
| CPC | spend / linkClicks |
| LPV rate | landingPageViews / linkClicks |
| CVR | purchases / landingPageViews |
| CPA, ROAS | from spend, purchases and revenue |
| Fatigue | last-7-day hook and CTR vs the ad's own earlier 7-to-21-day baseline |
| Biggest drop | the curve bucket with the steepest loss |

**Baselines.** For each metric, use the account median across ads with at least a minimum spend in the same window. If fewer than 5 ads qualify, fall back to the heuristics. Show both the baseline and its source in the UI.

**Data gate.** Below about 1,000 impressions or less than 1× target CPA in spend, the verdict is `wait`, with an estimate of how much data is still needed.

**Ordered stage checks.** The first failing stage is the primary issue; the rest are secondary.

| Stage | Fails when | Example finding |
|---|---|---|
| Delivery | status `DISAPPROVED` / `WITH_ISSUES`, `issues_info` present, learning `FAIL`, impressions ≈ 0 | "Rejected: text overlay policy" |
| Auction | CPM > 1.5× baseline, or quality ranking `BELOW_AVERAGE_*` | "You pay 2.1× the account CPM; quality ranking bottom 20%" |
| Hook | hook rate < 0.75× baseline | "12% stop scrolling vs 31% account median: first 3 s" |
| Hold | hold rate < 0.75× baseline, or a steep drop before 25% | "Half the viewers leave by 0:04" |
| Click | link CTR < 0.75× baseline while hold is fine | "People watch but don't click: CTA or offer" |
| Landing | LPV rate < 70% | "30% of clicks never load the page: speed" |
| Conversion | CVR < 0.75× baseline | "Visitors don't buy: page, price, stock" |
| Fatigue | frequency > 3 (prospecting) and hook or CTR down ≥ 20% vs the ad's own baseline | "Hook dropped from 34% to 22% as frequency hit 3.8" |

**Verdict** (typed discriminated union):

| Verdict | When |
|---|---|
| `fix_delivery` | Delivery stage fails |
| `wait` | Below the data gate |
| `scale` | ROAS ≥ target, no fatigue, at least 3 days of stable spend |
| `keep` | ROAS ≥ target with minor findings |
| `iterate` | One clear failing creative stage (hook, hold or click) and the others healthy. The recommendation names the exact change. |
| `kill` | Below target after ≥ 2× target CPA spent, and two or more stages failing |

Each finding carries `{ stage, severity, metric, value, baseline, baselineSource, message, recommendation }`.

**Objective decides the success metric.** ROAS and CPA measure conversion efficiency, not reach, so judging an awareness video by ROAS would kill it unfairly. The engine picks the primary metric and the stages that matter from the campaign objective:

| Objective | Primary success metric | Stages that drive the verdict | ROAS / CPA used? |
|---|---|---|---|
| Awareness | Cost per 1,000 people reached, reach growth, CPM | Delivery, auction, hook, fatigue | No |
| Engagement (video views) | Cost per ThruPlay, hold rate | Delivery, hook, hold, fatigue | No |
| Traffic | Cost per landing page view | Delivery, hook, click, landing | No |
| Leads | Cost per lead vs target CPA | All stages | CPA |
| Sales | ROAS vs target, CPA | All stages | Yes |
| Unknown | Show metrics and findings | All stages | No verdict beyond `iterate`/`wait` |

Baselines are computed only among ads with the same objective, so awareness ads aren't compared with sales ads.

**Targets.** Set per ad account (`Connection.targetRoas/targetCpa`), with an optional per-campaign override. The resolution order is campaign, then account, then break-even ROAS 1.0. The UI says which one was used. Targets are in the account currency, since accounts can bill in different currencies.

**Tests.** Table-driven Vitest cases for every stage and verdict, plus edge cases: zero impressions, image ads, dynamic creative, and missing curve.

## 5. API (`/api/creatives`), validated in and out with the shared contracts

| Method | Path | Returns |
|---|---|---|
| GET | `/creatives?range&since&until&connectionId&verdict&format&minSpend&sort&q` | Rows: thumbnail, name, campaign or ad set, spend, ROAS, hook, hold, CTR, CPA, verdict, primary issue |
| GET | `/creatives/summary?…` | Counts per verdict, plus account baselines |
| GET | `/creatives/:adId?range…` | Ad and ad set, daily series, retention curve, funnel, placements, rankings, diagnosis, decisions |
| POST | `/creatives/:adId/decisions` | Log a decision (verdict and note) with a snapshot of the metrics |
| POST | `/creatives/:adId/status` | Pause or activate at a chosen level: `{ level: "AD" \| "ADSET" \| "CAMPAIGN", status }`. Uses new `setAdStatus` and `setAdSetStatus` calls; the campaign call already exists. Writes an `ActionAudit` row, calls Meta, then marks it succeeded or failed. Returns the confirmed status only. |
| GET | `/actions?connectionId&adId` | The audit log, for the diagnosis page and a future account-level "Activity" view |
| PUT | `/connections/:id/targets`, `/campaigns/:id/targets` | Set the account targets and the per-campaign override (zod-validated, positive numbers or null) |

**Pause confirmation dialog** (in the UI, for every level):
- Shows the object's name, level, current status, and its spend, results and verdict for the selected range.
- When the level is ad set or campaign, says how many other ads will stop with it.
- Uses a destructive-style "Pause ad" button. No pause is triggered by a single click.
- If Meta rejects the call, shows the Meta error message and leaves the status unchanged.

## 6. Frontend (Angular 21)

**Routes:** `/creatives` (library) and `/creatives/:adId` (diagnosis), lazy-loaded under `AppShell`, plus a "Creatives" nav item. Filters live in query params, so views are shareable and survive a refresh.

**Data:** `core/creatives/creatives.api.ts`. Reads use `httpResource(() => …, { parse: CreativeListSchema.parse })`; mutations use `HttpClient`.

**Components** (feature folder `features/creatives/`):

| Component | Role |
|---|---|
| `creative-library` | Page. Verdict summary chips (Scale 3 · Iterate 7 · Kill 2 · Wait 4), filters, and a grid/table toggle. |
| `creative-tile` | Thumbnail with a play badge and length, verdict pill, and 4 metrics coloured against the account baseline. Click opens the detail page. |
| `creative-diagnosis` | Page with the layout below. |
| `verdict-header` | One-sentence verdict, confidence, primary issue, and action buttons (Log decision, Pause ad, Duplicate ad set). |
| `funnel-strip` | **The distinctive element.** Impressions → 3 s → ThruPlay → link click → landing page → purchase, as a horizontal drop-off strip. Each step shows its rate vs the baseline, and the failing step is outlined with the finding attached. |
| `retention-curve` | ApexCharts area chart (already a dependency): % still watching per second, an account-median band, markers at 3 s, 15 s and p25–p100, and a labelled biggest drop. |
| `ranking-badges` | The three relevance rankings, each with an icon and text. |
| `placement-breakdown` | Bars per placement (Reels, Feed, Stories…) for hook, CTR and ROAS. |
| `fatigue-trend` | Daily hook rate, CTR and frequency for the ad, compared with its own baseline. |
| `findings-list` | Secondary findings, each with a recommendation. |
| `decision-log` and `decision-dialog` | History, plus a form to record a new decision. |

**Angular practices**
- `OnPush` and signal inputs everywhere.
- `@defer (on viewport)` for the charts.
- `linkedSignal` resets filters when the account changes.
- Exhaustive `@switch` over the verdict union.
- Unit tests for formatters and the tile and funnel components.

**Design direction.** Stay inside the existing system (Space Grotesk headings, JetBrains Mono numbers, green accent, light and dark tokens) so this reads as part of the same product.
- The bold move is the funnel strip: one wide band that shows where viewers leave, so the diagnosis is visible before anything is read.
- Everything else stays quiet: bordered rows, few cards, and verdict colours used only for the verdict.
- Verdict labels pair colour with icon and text:

  | Verdict | Colour | Icon |
  |---|---|---|
  | Scale | green | trending-up |
  | Keep | neutral | check |
  | Iterate | amber | refresh |
  | Kill | red | x |
  | Fix delivery | blue | alert |
  | Wait | grey | clock |

**Empty and edge states**
- No ad-level data yet: offer "Sync ads".
- Image ad: hide the hook and hold metrics and explain why.
- Dynamic creative: show per-asset spend and CTR only, with a note.
- Not enough data: show a progress bar toward the data gate.

## 7. Follow-ups (after this feature ships)

| Priority | Feature | Notes |
|---|---|---|
| P1 | Alerts for `hook_rate`, `hold_rate` and `creative_fatigue` | Extend `AlertRule`, evaluated per ad, with links to the diagnosis page |
| P1 | Reach and frequency view at account and campaign level | Unique reach, cost per 1,000 reached, CPM and frequency trend. Uses window-level calls, never summed daily reach. |
| P2 | Budget shift suggestions | "Move X/day from ad set A (verdict kill) to B (verdict scale)". Suggest only; applying it goes through the confirmed budget action and the audit log. |
| P2 | Audience saturation | Age, gender and country breakdowns plus frequency. Meta's insights API has no interest breakdown, and video completion fields can't be broken down by region. |

## 8. Delivery order and progress screenshots

| Step | Content | Screenshot? |
|---|---|---|
| 1 | Foundations: Graph v25, AGENTS.md, MCP, zod, strict flags | — |
| 2 | Prisma models and migration | — |
| 3 | Diagnosis engine and tests (no I/O, so it can start in parallel with 2) | — |
| 4 | Sync job and zod schemas | — |
| 5 | API and contracts | — |
| 6 | **Dev fixture seed** (`npm run seed:creatives`): about 12 realistic fake ads with curves, so the UI can be built and screenshotted without waiting on Meta | — |
| 7 | Library page | ✅ |
| 8 | Diagnosis page: verdict header, then funnel strip | ✅ after each |
| 9 | Retention curve, placements, fatigue | ✅ |
| 10 | Decision log, and the pause action with confirmation | ✅ |
| 11 | Mobile and dark-mode pass | ✅ |
| 12 | `ng build`, backend `tsc`, and all tests green | — |

Screenshots need a signed-in session in the browser pane, which the user signs into once.

## 9. Decisions (resolved 2026-11-05)

1. **Targets:** per ad account, with an optional per-campaign override. They apply only to sales and leads objectives.
2. **Pause:** allowed on Meta at ad, ad set or campaign level. Every pause goes through the confirmation dialog and is recorded in `ActionAudit`.
3. **Graph version bump:** ships first, as its own small PR.
