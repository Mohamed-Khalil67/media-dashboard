import type { AdFormat, AdTotals, DerivedMetrics, Objective } from "./types";

/** a / b, or null when b is zero/negative or either side is not finite. */
export function ratio(a: number, b: number): number | null {
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= 0) return null;
  return a / b;
}

/** Conversions that count for this objective: leads for lead campaigns, purchases otherwise. */
export function conversionsFor(objective: Objective, totals: AdTotals): number {
  return objective === "LEADS" ? totals.leads : totals.purchases;
}

/** Compute every derived metric for an ad's totals. Video-only metrics are null for non-video ads. */
export function deriveMetrics(totals: AdTotals, objective: Objective, format: AdFormat): DerivedMetrics {
  const isVideo = format === "VIDEO";
  const conversions = conversionsFor(objective, totals);
  const cpm = ratio(totals.spend, totals.impressions);
  const costPerReach = ratio(totals.spend, totals.reach);

  return {
    hookRate: isVideo ? ratio(totals.video3s, totals.impressions) : null,
    holdRate: isVideo ? ratio(totals.thruplays, totals.video3s) : null,
    completionRate: isVideo ? ratio(totals.p100, totals.videoPlays) : null,
    ctr: ratio(totals.linkClicks, totals.impressions),
    cpm: cpm === null ? null : cpm * 1000,
    costPer1000Reached: costPerReach === null ? null : costPerReach * 1000,
    cpc: ratio(totals.spend, totals.linkClicks),
    lpvRate: ratio(totals.landingPageViews, totals.linkClicks),
    costPerLpv: ratio(totals.spend, totals.landingPageViews),
    costPerThruplay: isVideo ? ratio(totals.spend, totals.thruplays) : null,
    conversions,
    cvr: ratio(conversions, totals.landingPageViews),
    cpa: ratio(totals.spend, conversions),
    roas: ratio(totals.revenue, totals.spend),
  };
}
