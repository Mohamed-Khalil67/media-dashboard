/**
 * Types for the creative diagnosis engine.
 *
 * The engine is pure: it receives already-synced numbers for one ad plus the
 * account context (baselines, targets) and returns a verdict with findings.
 * No Prisma, no HTTP, no clock — everything it needs is passed in.
 *
 * Rates are fractions (0.31 = 31%). Money is in the ad account's currency.
 */

/** Campaign objective, normalised from Meta's OUTCOME_* (and legacy) values. */
export type Objective = "AWARENESS" | "ENGAGEMENT" | "TRAFFIC" | "LEADS" | "SALES" | "APP_PROMOTION" | "UNKNOWN";

export type AdFormat = "VIDEO" | "IMAGE" | "CAROUSEL" | "DYNAMIC" | "UNKNOWN";

/** Meta ad relevance diagnostics (quality / engagement / conversion ranking). */
export type Ranking =
  | "ABOVE_AVERAGE"
  | "AVERAGE"
  | "BELOW_AVERAGE_35"
  | "BELOW_AVERAGE_20"
  | "BELOW_AVERAGE_10"
  | "UNKNOWN";

/** `adset.learning_stage_info.status`. FAIL ≈ Ads Manager's "Learning limited". */
export type LearningStatus = "LEARNING" | "SUCCESS" | "FAIL";

export interface DeliveryState {
  /** Ad `effective_status`, e.g. ACTIVE, PAUSED, DISAPPROVED, WITH_ISSUES. */
  effectiveStatus: string;
  /** Human-readable `issues_info[].error_summary` / `error_message`. */
  issues: string[];
  /** Rejection reasons from `ad_review_feedback`. */
  rejectionReasons: string[];
  learningStatus: LearningStatus | null;
}

/** Totals for the selected window. Reach and frequency come from a window-level call, never summed days. */
export interface AdTotals {
  spend: number;
  impressions: number;
  reach: number;
  frequency: number;
  linkClicks: number;
  /** `video_play_actions` — plays started. */
  videoPlays: number;
  /** `actions[video_view]` — 3-second plays. */
  video3s: number;
  thruplays: number;
  p25: number;
  p50: number;
  p75: number;
  p95: number;
  p100: number;
  landingPageViews: number;
  purchases: number;
  leads: number;
  revenue: number;
}

export interface DailyPoint {
  /** YYYY-MM-DD in the ad account's time zone. */
  date: string;
  spend: number;
  impressions: number;
  video3s: number;
  linkClicks: number;
}

/** One point of the retention curve: share of plays still watching at `second`. */
export interface RetentionPoint {
  second: number;
  /** 0..1 */
  share: number;
}

export interface PlacementStat {
  /** e.g. "instagram / instagram_reels" */
  placement: string;
  spend: number;
  impressions: number;
  video3s: number;
  linkClicks: number;
  revenue: number;
}

export interface AdRankings {
  quality: Ranking;
  engagement: Ranking;
  conversion: Ranking;
}

export interface AdInput {
  adId: string;
  objective: Objective;
  format: AdFormat;
  delivery: DeliveryState;
  totals: AdTotals;
  /** Daily points for the window, any order. Used for fatigue and spend stability. */
  daily: DailyPoint[];
  /**
   * Last day of the reporting window (YYYY-MM-DD, ad account time zone).
   * Fatigue windows end here; defaults to the latest date in `daily`. Pass it
   * when `daily` omits days without delivery, so a paused week reads as empty.
   */
  asOf?: string;
  rankings: AdRankings;
  retention: RetentionPoint[] | null;
  videoLengthSec: number | null;
  placements: PlacementStat[];
}

/** Metrics derived from totals. `null` means "not computable" (zero denominator or not applicable). */
export interface DerivedMetrics {
  hookRate: number | null;
  holdRate: number | null;
  completionRate: number | null;
  ctr: number | null;
  cpm: number | null;
  costPer1000Reached: number | null;
  cpc: number | null;
  lpvRate: number | null;
  costPerLpv: number | null;
  costPerThruplay: number | null;
  conversions: number;
  cvr: number | null;
  cpa: number | null;
  roas: number | null;
}

export type MetricKey = Exclude<keyof DerivedMetrics, "conversions">;

/** Where a baseline value came from. */
export type BaselineSource = "account" | "heuristic";

export interface Baseline {
  value: number;
  source: BaselineSource;
  /** Number of peer ads behind an account baseline; 0 for heuristics. */
  sampleSize: number;
}

export type Baselines = Partial<Record<MetricKey, Baseline>>;

export interface Targets {
  roas: number | null;
  cpa: number | null;
  /** Which level the targets came from, so the UI can say so. */
  source: "campaign" | "account" | "default";
}

export interface Thresholds {
  /** Below this, the verdict is `wait`. */
  minImpressions: number;
  /** Metric counts as weak when below `weakRatio` × baseline (higher-is-better metrics). */
  weakRatio: number;
  /** Cost counts as high when above `highCostRatio` × baseline (lower-is-better metrics). */
  highCostRatio: number;
  /** Share of link clicks that should become landing page views. */
  lpvRateFloor: number;
  /** Frequency above which a falling hook/CTR counts as fatigue. */
  fatigueFrequency: number;
  /** Relative drop (0.2 = 20%) in hook rate or CTR that counts as fatigue. */
  fatigueDrop: number;
  /** Days with spend needed before a `scale` verdict. */
  scaleMinDays: number;
  /** Spend multiple of the reference CPA needed before a conversion `kill`. */
  killSpendMultiple: number;
  /** Impressions for a `high` confidence verdict. */
  confidentImpressions: number;
  /** Minimum peers before an account baseline replaces the heuristic. */
  minPeers: number;
}

export interface DiagnosisContext {
  baselines: Baselines;
  targets: Targets;
  thresholds?: Partial<Thresholds>;
}

export type Stage = "delivery" | "auction" | "hook" | "hold" | "click" | "landing" | "conversion" | "fatigue" | "placement";

export type Severity = "critical" | "warning" | "info";

export interface Comparison {
  metric: MetricKey;
  value: number;
  baseline: number;
  baselineSource: BaselineSource;
  /** value / baseline */
  ratio: number;
}

export interface RetentionDrop {
  fromSecond: number;
  toSecond: number;
  fromShare: number;
  toShare: number;
  /** Absolute share lost in this segment (fromShare - toShare). */
  loss: number;
}

interface FindingBase {
  severity: Severity;
  /** One sentence: what is wrong, with numbers. */
  message: string;
  /** One sentence: what to do. */
  recommendation: string;
}

export type Finding = FindingBase &
  (
    | { stage: "delivery"; kind: "rejected"; reasons: string[] }
    | { stage: "delivery"; kind: "not_delivering"; effectiveStatus: string }
    | { stage: "delivery"; kind: "issues"; issues: string[] }
    | { stage: "delivery"; kind: "learning_limited" }
    | { stage: "auction"; kind: "high_cpm"; comparison: Comparison }
    | { stage: "auction"; kind: "low_ranking"; ranking: Ranking; which: keyof AdRankings }
    | { stage: "hook"; kind: "weak_hook"; comparison: Comparison }
    | { stage: "hold"; kind: "weak_hold"; comparison: Comparison; drop: RetentionDrop | null }
    | { stage: "click"; kind: "low_ctr"; comparison: Comparison }
    | { stage: "landing"; kind: "page_drop_off"; lpvRate: number; floor: number }
    | { stage: "conversion"; kind: "low_cvr"; comparison: Comparison }
    | { stage: "conversion"; kind: "below_target"; metric: "roas" | "cpa"; value: number; target: number }
    | { stage: "fatigue"; kind: "creative_fatigue"; frequency: number; hookDrop: number | null; ctrDrop: number | null }
    | { stage: "placement"; kind: "placement_gap"; best: string; worst: string; metric: "hookRate" | "ctr" | "roas"; bestValue: number; worstValue: number }
  );

export type FindingKind = Finding["kind"];

export type Verdict = "scale" | "keep" | "iterate" | "kill" | "fix_delivery" | "wait";

export type Confidence = "high" | "medium" | "low";

/** How the ad does on the success metric its objective cares about. */
export interface Performance {
  metric: "roas" | "cpa" | "costPerLpv" | "costPerThruplay" | "costPer1000Reached" | null;
  value: number | null;
  /** Target or baseline it was compared against. */
  reference: number | null;
  referenceSource: "target" | "baseline" | "default" | null;
  status: "meets" | "misses" | "unknown";
}

export interface Diagnosis {
  adId: string;
  verdict: Verdict;
  confidence: Confidence;
  /** One-sentence verdict for the page header. */
  headline: string;
  /** Stage of the first finding that drove the verdict, if any. */
  primaryStage: Stage | null;
  performance: Performance;
  metrics: DerivedMetrics;
  /** Ordered by funnel stage, critical first within a stage. */
  findings: Finding[];
  /** Present when verdict is `wait`: share of the data gate reached (0..1). */
  dataProgress: number | null;
}
