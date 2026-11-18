import { z } from "zod";

/**
 * API contract for /api/creatives — the single source of truth for both sides.
 * The backend builds responses typed by these schemas; the Angular app imports
 * this file (path alias `@contracts/*`) and parses responses with them.
 *
 * Rates are fractions (0.31 = 31%). Money is in the ad account's currency.
 */

export const CreativeRange = z.enum(["7d", "14d", "30d"]);
export type CreativeRange = z.infer<typeof CreativeRange>;

export const Verdict = z.enum(["scale", "keep", "iterate", "kill", "fix_delivery", "wait"]);
export type Verdict = z.infer<typeof Verdict>;

export const Confidence = z.enum(["high", "medium", "low"]);
export const Objective = z.enum(["AWARENESS", "ENGAGEMENT", "TRAFFIC", "LEADS", "SALES", "APP_PROMOTION", "UNKNOWN"]);
export type Objective = z.infer<typeof Objective>;
export const AdFormat = z.enum(["VIDEO", "IMAGE", "CAROUSEL", "DYNAMIC", "UNKNOWN"]);
export type AdFormat = z.infer<typeof AdFormat>;
export const Stage = z.enum(["delivery", "auction", "hook", "hold", "click", "landing", "conversion", "fatigue", "placement"]);
export type Stage = z.infer<typeof Stage>;
export const Severity = z.enum(["critical", "warning", "info"]);
export type Severity = z.infer<typeof Severity>;
export const Ranking = z.enum(["ABOVE_AVERAGE", "AVERAGE", "BELOW_AVERAGE_35", "BELOW_AVERAGE_20", "BELOW_AVERAGE_10", "UNKNOWN"]);
export type Ranking = z.infer<typeof Ranking>;
export const BaselineSource = z.enum(["account", "heuristic"]);

const Rate = z.number().nullable();

export const CreativeListQuery = z.object({
  range: CreativeRange.default("7d"),
  connectionId: z.string().min(1).optional(),
  objective: Objective.optional(),
  verdict: Verdict.optional(),
  minSpend: z.coerce.number().min(0).optional(),
  q: z.string().trim().max(200).optional(),
});
export type CreativeListQuery = z.infer<typeof CreativeListQuery>;

export const CreativeRow = z.object({
  adId: z.string(),
  externalId: z.string(),
  name: z.string(),
  connectionId: z.string(),
  accountName: z.string(),
  campaignName: z.string(),
  adSetName: z.string(),
  objective: Objective,
  format: AdFormat,
  effectiveStatus: z.string(),
  thumbnailUrl: z.string().nullable(),
  videoLengthSec: z.number().nullable(),
  currency: z.string().nullable(),
  spend: z.number(),
  impressions: z.number(),
  hookRate: Rate,
  holdRate: Rate,
  ctr: Rate,
  roas: Rate,
  cpa: Rate,
  verdict: Verdict,
  confidence: Confidence,
  headline: z.string(),
  primaryStage: Stage.nullable(),
  /** Stages the engine flagged (warning or critical), for tinting tile metrics. */
  weakStages: z.array(Stage),
});
export type CreativeRow = z.infer<typeof CreativeRow>;

export const CreativeListResponse = z.object({
  range: CreativeRange,
  rows: z.array(CreativeRow),
  /** Count per verdict across all rows before the verdict filter is applied. */
  summary: z.record(Verdict, z.number()),
  /** Latest successful ad sync across the user's accounts. */
  lastAdSyncAt: z.string().nullable(),
});
export type CreativeListResponse = z.infer<typeof CreativeListResponse>;

export const FindingView = z.object({
  stage: Stage,
  kind: z.string(),
  severity: Severity,
  message: z.string(),
  recommendation: z.string(),
});
export type FindingView = z.infer<typeof FindingView>;

export const FunnelStep = z.object({
  key: z.enum(["impressions", "hook", "hold", "click", "landing", "result"]),
  label: z.string(),
  /** Main figure: a count for impressions/results, a rate otherwise. */
  value: z.number().nullable(),
  kind: z.enum(["count", "rate"]),
  baseline: z.number().nullable(),
  baselineSource: BaselineSource.nullable(),
  /** Short secondary line, e.g. "CPM 92" or "ROAS 1.6 · target 2.5". */
  note: z.string().nullable(),
  status: z.enum(["good", "weak", "neutral", "na"]),
});
export type FunnelStep = z.infer<typeof FunnelStep>;

export const RetentionPoint = z.object({ second: z.number(), share: z.number() });
export type RetentionPoint = z.infer<typeof RetentionPoint>;

export const CreativeDetailResponse = z.object({
  range: CreativeRange,
  row: CreativeRow,
  learningStatus: z.string().nullable(),
  issues: z.array(z.string()),
  rejectionReasons: z.array(z.string()),
  createdAtPlatform: z.string().nullable(),
  targets: z.object({
    roas: z.number().nullable(),
    cpa: z.number().nullable(),
    source: z.enum(["campaign", "account", "default"]),
  }),
  performance: z.object({
    metric: z.string().nullable(),
    value: z.number().nullable(),
    reference: z.number().nullable(),
    referenceSource: z.string().nullable(),
    status: z.enum(["meets", "misses", "unknown"]),
  }),
  totals: z.object({
    spend: z.number(),
    impressions: z.number(),
    reach: z.number(),
    frequency: z.number(),
    linkClicks: z.number(),
    video3s: z.number(),
    thruplays: z.number(),
    landingPageViews: z.number(),
    purchases: z.number(),
    leads: z.number(),
    revenue: z.number(),
  }),
  funnel: z.array(FunnelStep),
  findings: z.array(FindingView),
  rankings: z.object({ quality: Ranking, engagement: Ranking, conversion: Ranking }),
  retention: z.object({
    points: z.array(RetentionPoint),
    /** Median curve across this account's other video ads, when at least 3 have one. */
    baseline: z.array(RetentionPoint).nullable(),
    biggestDrop: z
      .object({ fromSecond: z.number(), toSecond: z.number(), fromShare: z.number(), toShare: z.number(), loss: z.number() })
      .nullable(),
  }),
  placements: z.array(
    z.object({
      placement: z.string(),
      spend: z.number(),
      impressions: z.number(),
      hookRate: Rate,
      ctr: Rate,
      roas: Rate,
    }),
  ),
  daily: z.array(
    z.object({ date: z.string(), spend: z.number(), impressions: z.number(), hookRate: Rate, ctr: Rate }),
  ),
  dataProgress: z.number().nullable(),
});
export type CreativeDetailResponse = z.infer<typeof CreativeDetailResponse>;
