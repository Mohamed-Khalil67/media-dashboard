import type { Baseline, MetricKey, Objective, Stage, Thresholds } from "./types";

export const DEFAULT_THRESHOLDS: Thresholds = {
  minImpressions: 1_000,
  weakRatio: 0.75,
  highCostRatio: 1.5,
  lpvRateFloor: 0.7,
  fatigueFrequency: 3,
  fatigueDrop: 0.2,
  scaleMinDays: 3,
  killSpendMultiple: 2,
  confidentImpressions: 10_000,
  minPeers: 5,
};

export function resolveThresholds(overrides: Partial<Thresholds> | undefined): Thresholds {
  return { ...DEFAULT_THRESHOLDS, ...overrides };
}

/**
 * Fallback baselines used when an account has too few comparable ads.
 * These are vendor/agency heuristics (Motion, Vaizle, WordStream), not Meta
 * numbers — the UI labels them as such. Cost metrics have no heuristic: CPM
 * and CPA vary too much by market and currency to guess.
 */
export const HEURISTIC_BASELINES: Partial<Record<MetricKey, number>> = {
  hookRate: 0.25,
  holdRate: 0.4,
  ctr: 0.01,
  lpvRate: 0.75,
};

export function heuristicBaseline(metric: MetricKey): Baseline | undefined {
  const value = HEURISTIC_BASELINES[metric];
  return value === undefined ? undefined : { value, source: "heuristic", sampleSize: 0 };
}

/** Metrics where a lower value is better. */
export const LOWER_IS_BETTER: ReadonlySet<MetricKey> = new Set<MetricKey>([
  "cpm",
  "costPer1000Reached",
  "cpc",
  "costPerLpv",
  "costPerThruplay",
  "cpa",
]);

/** Funnel stages that matter for each objective, in funnel order. */
export const STAGES_BY_OBJECTIVE: Record<Objective, readonly Stage[]> = {
  AWARENESS: ["delivery", "auction", "hook", "fatigue", "placement"],
  ENGAGEMENT: ["delivery", "auction", "hook", "hold", "fatigue", "placement"],
  TRAFFIC: ["delivery", "auction", "hook", "click", "landing", "fatigue", "placement"],
  LEADS: ["delivery", "auction", "hook", "hold", "click", "landing", "conversion", "fatigue", "placement"],
  SALES: ["delivery", "auction", "hook", "hold", "click", "landing", "conversion", "fatigue", "placement"],
  APP_PROMOTION: ["delivery", "auction", "hook", "hold", "click", "fatigue", "placement"],
  UNKNOWN: ["delivery", "auction", "hook", "hold", "click", "landing", "conversion", "fatigue", "placement"],
};

export const STAGE_ORDER: readonly Stage[] = [
  "delivery",
  "auction",
  "hook",
  "hold",
  "click",
  "landing",
  "conversion",
  "fatigue",
  "placement",
];

const OBJECTIVE_ALIASES: Record<string, Objective> = {
  OUTCOME_AWARENESS: "AWARENESS",
  OUTCOME_ENGAGEMENT: "ENGAGEMENT",
  OUTCOME_TRAFFIC: "TRAFFIC",
  OUTCOME_LEADS: "LEADS",
  OUTCOME_SALES: "SALES",
  OUTCOME_APP_PROMOTION: "APP_PROMOTION",
  // Legacy (pre-ODAX) objectives still returned for old campaigns.
  BRAND_AWARENESS: "AWARENESS",
  REACH: "AWARENESS",
  VIDEO_VIEWS: "ENGAGEMENT",
  POST_ENGAGEMENT: "ENGAGEMENT",
  PAGE_LIKES: "ENGAGEMENT",
  EVENT_RESPONSES: "ENGAGEMENT",
  MESSAGES: "ENGAGEMENT",
  LINK_CLICKS: "TRAFFIC",
  LEAD_GENERATION: "LEADS",
  CONVERSIONS: "SALES",
  PRODUCT_CATALOG_SALES: "SALES",
  STORE_VISITS: "SALES",
  APP_INSTALLS: "APP_PROMOTION",
};

/** Map a Meta campaign `objective` string to our normalised objective. */
export function objectiveFromMeta(raw: string | null | undefined): Objective {
  if (!raw) return "UNKNOWN";
  return OBJECTIVE_ALIASES[raw.trim().toUpperCase()] ?? "UNKNOWN";
}
