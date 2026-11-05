import { describe, it, expect } from "vitest";
import { conversionsFor, deriveMetrics, ratio } from "./metrics";
import { objectiveFromMeta } from "./config";
import { HEALTHY_TOTALS } from "./test-fixtures";

describe("ratio", () => {
  it.each([
    [1, 2, 0.5],
    [0, 5, 0],
    [3, 0, null],
    [3, -1, null],
    [Number.NaN, 2, null],
    [2, Number.POSITIVE_INFINITY, null],
  ])("ratio(%s, %s) = %s", (a, b, expected) => {
    expect(ratio(a, b)).toBe(expected);
  });
});

describe("deriveMetrics", () => {
  it("computes every metric for a video sales ad", () => {
    const m = deriveMetrics(HEALTHY_TOTALS, "SALES", "VIDEO");
    expect(m.hookRate).toBeCloseTo(0.3);
    expect(m.holdRate).toBeCloseTo(0.45);
    expect(m.completionRate).toBeCloseTo(0.075);
    expect(m.ctr).toBeCloseTo(0.015);
    expect(m.cpm).toBeCloseTo(20);
    expect(m.costPer1000Reached).toBeCloseTo(33.33, 1);
    expect(m.cpc).toBeCloseTo(1.333, 2);
    expect(m.lpvRate).toBeCloseTo(0.8);
    expect(m.costPerThruplay).toBeCloseTo(0.148, 2);
    expect(m.conversions).toBe(30);
    expect(m.cvr).toBeCloseTo(0.05);
    expect(m.cpa).toBeCloseTo(33.33, 1);
    expect(m.roas).toBeCloseTo(3);
  });

  it("returns null, not 0 or NaN, for zero denominators", () => {
    const zero = { ...HEALTHY_TOTALS, spend: 0, impressions: 0, reach: 0, linkClicks: 0, video3s: 0, videoPlays: 0, thruplays: 0, landingPageViews: 0, purchases: 0, revenue: 0 };
    const m = deriveMetrics(zero, "SALES", "VIDEO");
    for (const value of [m.hookRate, m.holdRate, m.completionRate, m.ctr, m.cpm, m.costPer1000Reached, m.cpc, m.lpvRate, m.costPerLpv, m.costPerThruplay, m.cvr, m.cpa, m.roas]) {
      expect(value).toBeNull();
    }
  });

  it.each(["IMAGE", "CAROUSEL", "DYNAMIC", "UNKNOWN"] as const)("leaves video metrics null for %s ads", (format) => {
    const m = deriveMetrics(HEALTHY_TOTALS, "SALES", format);
    expect(m.hookRate).toBeNull();
    expect(m.holdRate).toBeNull();
    expect(m.completionRate).toBeNull();
    expect(m.costPerThruplay).toBeNull();
    expect(m.ctr).toBeCloseTo(0.015);
  });

  it("counts leads, not purchases, for lead campaigns", () => {
    const totals = { ...HEALTHY_TOTALS, leads: 50 };
    expect(conversionsFor("LEADS", totals)).toBe(50);
    expect(conversionsFor("SALES", totals)).toBe(30);
    expect(deriveMetrics(totals, "LEADS", "VIDEO").cpa).toBeCloseTo(20);
  });
});

describe("objectiveFromMeta", () => {
  it.each([
    ["OUTCOME_SALES", "SALES"],
    ["OUTCOME_LEADS", "LEADS"],
    ["OUTCOME_TRAFFIC", "TRAFFIC"],
    ["OUTCOME_ENGAGEMENT", "ENGAGEMENT"],
    ["OUTCOME_AWARENESS", "AWARENESS"],
    ["OUTCOME_APP_PROMOTION", "APP_PROMOTION"],
    ["CONVERSIONS", "SALES"],
    ["PRODUCT_CATALOG_SALES", "SALES"],
    ["LINK_CLICKS", "TRAFFIC"],
    ["VIDEO_VIEWS", "ENGAGEMENT"],
    ["REACH", "AWARENESS"],
    ["BRAND_AWARENESS", "AWARENESS"],
    ["LEAD_GENERATION", "LEADS"],
    ["APP_INSTALLS", "APP_PROMOTION"],
    [" outcome_sales ", "SALES"],
    ["SOMETHING_NEW", "UNKNOWN"],
    ["", "UNKNOWN"],
    [null, "UNKNOWN"],
    [undefined, "UNKNOWN"],
  ])("%j → %s", (raw, expected) => {
    expect(objectiveFromMeta(raw)).toBe(expected);
  });
});
