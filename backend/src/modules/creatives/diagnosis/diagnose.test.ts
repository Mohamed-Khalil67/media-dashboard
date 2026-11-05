import { describe, it, expect } from "vitest";
import { diagnoseAd, sortFindings } from "./diagnose";
import { ACCOUNT_BASELINES, flatDaily, makeAd, makeCtx, type AdOverrides } from "./test-fixtures";
import type { DiagnosisContext } from "./types";

function diagnose(o: AdOverrides = {}, ctx: DiagnosisContext = makeCtx()) {
  return diagnoseAd(makeAd(o), ctx);
}

/** Small but complete SALES ad: 2,000 impressions, ROAS 1, healthy funnel, 50 spent. */
const SMALL = {
  spend: 50,
  impressions: 2000,
  reach: 1500,
  linkClicks: 30,
  videoPlays: 1600,
  video3s: 600,
  thruplays: 270,
  landingPageViews: 24,
  purchases: 1,
  revenue: 50,
};

describe("verdict paths", () => {
  it.each<[string, AdOverrides, DiagnosisContext | undefined, string]>([
    ["healthy and above target", {}, undefined, "scale"],
    ["rejected", { delivery: { effectiveStatus: "DISAPPROVED" } }, undefined, "fix_delivery"],
    ["paused with no impressions", { delivery: { effectiveStatus: "PAUSED" }, totals: { impressions: 0 } }, undefined, "fix_delivery"],
    ["delivery issues", { delivery: { effectiveStatus: "WITH_ISSUES" } }, undefined, "fix_delivery"],
    ["below the data gate", { totals: { impressions: 500 } }, undefined, "wait"],
    ["meets target but only 2 days of spend", { daily: flatDaily(2) }, undefined, "keep"],
    [
      "meets target but fatigued",
      { totals: { frequency: 4 }, daily: [...flatDaily(21).slice(0, 14), ...flatDaily(21).slice(14).map((d) => ({ ...d, video3s: 900 }))] },
      undefined,
      "keep",
    ],
    ["meets target with a weak hook", { totals: { video3s: 6000 } }, undefined, "keep"],
    ["misses target with one weak stage", { totals: { video3s: 6000, revenue: 1500 } }, undefined, "iterate"],
    ["misses target with two weak stages after enough spend", { totals: { video3s: 6000, linkClicks: 300, revenue: 500 } }, undefined, "kill"],
    ["far below target with a healthy funnel", { totals: { revenue: 500 } }, undefined, "kill"],
    ["somewhat below target with a healthy funnel", { totals: { revenue: 1500 } }, undefined, "iterate"],
    ["below target before enough spend", { totals: SMALL }, undefined, "wait"],
    ["no success metric, healthy", { objective: "APP_PROMOTION" }, undefined, "keep"],
    ["no success metric, weak hook", { objective: "UNKNOWN", totals: { video3s: 6000 } }, undefined, "iterate"],
  ])("%s → %s", (_name, overrides, ctx, verdict) => {
    expect(diagnose(overrides, ctx).verdict).toBe(verdict);
  });

  it("does not let a learning-limited ad set block the verdict", () => {
    expect(diagnose({ delivery: { learningStatus: "FAIL" } }).verdict).not.toBe("fix_delivery");
  });

  it("ignores info-level findings when deciding to scale", () => {
    const d = diagnose({ rankings: { quality: "AVERAGE", engagement: "BELOW_AVERAGE_35", conversion: "AVERAGE" } });
    expect(d.verdict).toBe("scale");
  });
});

describe("objective-specific success metrics", () => {
  const noSales = { revenue: 0, purchases: 0 };

  it("never kills an awareness ad for having no ROAS", () => {
    const d = diagnose({ objective: "AWARENESS", totals: noSales });
    expect(d.performance.metric).toBe("costPer1000Reached");
    expect(d.performance.status).toBe("meets");
    expect(d.verdict).toBe("scale");
    expect(d.findings.some((f) => f.kind === "below_target")).toBe(false);
  });

  it("judges an awareness ad on reach cost", () => {
    const d = diagnose({ objective: "AWARENESS", totals: { ...noSales, reach: 10_000 } });
    expect(d.performance.status).toBe("misses");
    expect(d.verdict).toBe("kill");
  });

  it.each([
    ["ENGAGEMENT", "costPerThruplay"],
    ["TRAFFIC", "costPerLpv"],
  ] as const)("judges %s ads on %s against the account median", (objective, metric) => {
    const d = diagnose({ objective, totals: noSales });
    expect(d.performance).toMatchObject({ metric, referenceSource: "baseline", status: "meets" });
    expect(d.verdict).not.toBe("kill");
  });

  it("judges lead ads on cost per lead", () => {
    const leads = { purchases: 0, revenue: 0, leads: 30 };
    const target = (cpa: number): DiagnosisContext => makeCtx({ targets: { roas: null, cpa, source: "campaign" } });
    expect(diagnose({ objective: "LEADS", totals: leads }, target(50)).performance).toMatchObject({ metric: "cpa", status: "meets" });
    expect(diagnose({ objective: "LEADS", totals: leads }, target(20)).performance.status).toBe("misses");
  });

  it("falls back to break-even ROAS when a sales ad has no targets", () => {
    const d = diagnose({}, makeCtx({ targets: { roas: null, cpa: null, source: "default" } }));
    expect(d.performance).toMatchObject({ metric: "roas", reference: 1, referenceSource: "default", status: "meets" });
  });

  it("reports unknown performance for app promotion", () => {
    expect(diagnose({ objective: "APP_PROMOTION" }).performance.status).toBe("unknown");
  });

  it("diagnoses image ads without video stages", () => {
    const d = diagnose({ format: "IMAGE", totals: { video3s: 100 } });
    expect(d.metrics.hookRate).toBeNull();
    expect(d.verdict).toBe("scale");
  });
});

describe("headline, primary stage and progress", () => {
  it("leads with the failing stage when iterating", () => {
    const d = diagnose({ totals: { video3s: 6000, revenue: 1500 } });
    expect(d.primaryStage).toBe("hook");
    expect(d.headline).toBe(
      "12% of people stop scrolling, vs 30% account median. Rework the first 3 seconds (opening frame, motion, on-screen text); keep the rest.",
    );
  });

  it("explains an offer problem when no stage fails", () => {
    const d = diagnose({ totals: { revenue: 1500 } });
    expect(d.primaryStage).toBe("conversion");
    expect(d.headline).toBe(
      "It misses its ROAS goal (1.50 vs target 2.00) although each funnel step looks normal. Test a different offer, audience or angle.",
    );
  });

  it("tells the buyer to scale gradually", () => {
    const d = diagnose();
    expect(d.primaryStage).toBeNull();
    expect(d.headline).toContain("Raise the budget gradually");
  });

  it("counts failing stages when killing", () => {
    expect(diagnose({ totals: { video3s: 6000, linkClicks: 300, revenue: 500 } }).headline).toContain("fails at 2 funnel steps");
  });

  it("uses the delivery fix as the headline", () => {
    const d = diagnose({ delivery: { effectiveStatus: "DISAPPROVED", rejectionReasons: ["Text overlay"] } });
    expect(d.primaryStage).toBe("delivery");
    expect(d.headline).toBe("It isn't delivering properly. Fix the policy issue and resubmit, or launch a compliant version.");
  });

  it("shows progress toward the data gate while waiting", () => {
    const d = diagnose({ totals: { impressions: 500 } });
    expect(d.dataProgress).toBe(0.5);
    expect(d.headline).toBe("Not enough data yet: 500 of 1,000 impressions needed. Check back once it has more.");
  });

  it("says it is too early when behind target on little spend", () => {
    const d = diagnose({ totals: SMALL });
    expect(d.dataProgress).toBe(1);
    expect(d.headline).toContain("too early to call");
  });

  it("has no progress outside wait", () => {
    expect(diagnose().dataProgress).toBeNull();
  });
});

describe("confidence", () => {
  it("is high with lots of data and account baselines", () => {
    expect(diagnose().confidence).toBe("high");
  });

  it("drops to medium when a finding relies on a heuristic", () => {
    const ctx = makeCtx({ baselines: { ...ACCOUNT_BASELINES, hookRate: { value: 0.25, source: "heuristic", sampleSize: 0 } } });
    expect(diagnose({ totals: { video3s: 6000 } }, ctx).confidence).toBe("medium");
  });

  it("is low on little data", () => {
    expect(diagnose({ totals: SMALL }).confidence).toBe("low");
  });
});

describe("sortFindings", () => {
  it("orders by funnel stage, then severity", () => {
    const d = diagnose({
      totals: { video3s: 6000, linkClicks: 300 },
      rankings: { quality: "AVERAGE", engagement: "BELOW_AVERAGE_35", conversion: "BELOW_AVERAGE_10" },
      delivery: { learningStatus: "FAIL" },
    });
    expect(d.findings.map((f) => `${f.stage}:${f.severity}`)).toEqual([
      "delivery:warning",
      "auction:warning",
      "auction:info",
      "hook:critical",
      "click:critical",
    ]);
    expect(sortFindings([...d.findings].reverse())).toEqual(d.findings);
  });
});
