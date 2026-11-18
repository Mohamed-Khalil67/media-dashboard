import type {
  AdInput,
  AdTotals,
  Baselines,
  DailyPoint,
  DeliveryState,
  DerivedMetrics,
  DiagnosisContext,
  Targets,
} from "./types";

/**
 * A healthy SALES video ad and matching account context, for tests.
 * Derived: hook 30%, hold 45%, CTR 1.5%, CPM 20, LPV rate 80%, CVR 5%,
 * CPA 33.33, ROAS 3, cost/ThruPlay 0.148, cost/1000 reached 33.33.
 */
export const HEALTHY_TOTALS: AdTotals = {
  spend: 1000,
  impressions: 50_000,
  reach: 30_000,
  frequency: 1.67,
  linkClicks: 750,
  videoPlays: 40_000,
  video3s: 15_000,
  thruplays: 6_750,
  p25: 9_000,
  p50: 6_000,
  p75: 4_000,
  p95: 3_200,
  p100: 3_000,
  landingPageViews: 600,
  purchases: 30,
  leads: 0,
  revenue: 3000,
};

export const ACTIVE: DeliveryState = { effectiveStatus: "ACTIVE", issues: [], rejectionReasons: [], learningStatus: "SUCCESS" };

/** `days` consecutive days ending 2026-11-01 with identical numbers. */
export function flatDaily(days: number, point: Omit<DailyPoint, "date"> = { spend: 100, impressions: 5000, video3s: 1500, linkClicks: 75 }): DailyPoint[] {
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(Date.UTC(2026, 10, 1 - (days - 1 - i)));
    return { date: d.toISOString().slice(0, 10), ...point };
  });
}

export interface AdOverrides extends Partial<Omit<AdInput, "totals" | "delivery">> {
  totals?: Partial<AdTotals>;
  delivery?: Partial<DeliveryState>;
}

export function makeAd(o: AdOverrides = {}): AdInput {
  const { totals, delivery, ...rest } = o;
  return {
    adId: "ad-1",
    objective: "SALES",
    format: "VIDEO",
    daily: flatDaily(10),
    rankings: { quality: "AVERAGE", engagement: "AVERAGE", conversion: "AVERAGE" },
    retention: null,
    videoLengthSec: 22,
    placements: [],
    ...rest,
    totals: { ...HEALTHY_TOTALS, ...totals },
    delivery: { ...ACTIVE, ...delivery },
  };
}

export const ACCOUNT_BASELINES: Baselines = {
  hookRate: { value: 0.3, source: "account", sampleSize: 10 },
  holdRate: { value: 0.45, source: "account", sampleSize: 10 },
  ctr: { value: 0.015, source: "account", sampleSize: 10 },
  cpm: { value: 20, source: "account", sampleSize: 10 },
  lpvRate: { value: 0.8, source: "account", sampleSize: 10 },
  cvr: { value: 0.05, source: "account", sampleSize: 10 },
  cpa: { value: 33.33, source: "account", sampleSize: 10 },
  costPerLpv: { value: 1.67, source: "account", sampleSize: 10 },
  costPerThruplay: { value: 0.15, source: "account", sampleSize: 10 },
  costPer1000Reached: { value: 33.4, source: "account", sampleSize: 10 },
  roas: { value: 3, source: "account", sampleSize: 10 },
};

export const ROAS_TARGET: Targets = { roas: 2, cpa: null, source: "account" };

export function makeCtx(o: Partial<DiagnosisContext> = {}): DiagnosisContext {
  return { baselines: ACCOUNT_BASELINES, targets: ROAS_TARGET, ...o };
}

export function nullMetrics(o: Partial<DerivedMetrics> = {}): DerivedMetrics {
  return {
    hookRate: null,
    holdRate: null,
    completionRate: null,
    ctr: null,
    cpm: null,
    costPer1000Reached: null,
    cpc: null,
    lpvRate: null,
    costPerLpv: null,
    costPerThruplay: null,
    conversions: 0,
    cvr: null,
    cpa: null,
    roas: null,
    ...o,
  };
}
