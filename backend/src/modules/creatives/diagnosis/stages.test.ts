import { describe, it, expect } from "vitest";
import { diagnoseAd } from "./diagnose";
import { applicableStages } from "./stages";
import { ACCOUNT_BASELINES, flatDaily, makeAd, makeCtx, type AdOverrides } from "./test-fixtures";
import type { Finding, FindingKind } from "./types";

function findingsFor(o: AdOverrides, ctx = makeCtx()): Finding[] {
  return diagnoseAd(makeAd(o), ctx).findings;
}

function find<K extends FindingKind>(findings: Finding[], kind: K): Extract<Finding, { kind: K }> | undefined {
  return findings.find((f): f is Extract<Finding, { kind: K }> => f.kind === kind);
}

describe("healthy ad", () => {
  it("produces no findings", () => {
    expect(findingsFor({})).toEqual([]);
  });
});

describe("delivery checks", () => {
  it("flags a rejected ad as critical with the reasons", () => {
    const f = find(findingsFor({ delivery: { effectiveStatus: "DISAPPROVED", rejectionReasons: ["Text overlay"] } }), "rejected");
    expect(f?.severity).toBe("critical");
    expect(f?.message).toBe("Meta rejected this ad: Text overlay.");
  });

  it("treats rejection reasons as rejected even before the status updates", () => {
    expect(find(findingsFor({ delivery: { rejectionReasons: ["Misleading claim"] } }), "rejected")).toBeDefined();
  });

  it("flags a paused ad with no impressions as not delivering", () => {
    const f = find(findingsFor({ delivery: { effectiveStatus: "PAUSED" }, totals: { impressions: 0 } }), "not_delivering");
    expect(f?.severity).toBe("critical");
    expect(f?.effectiveStatus).toBe("PAUSED");
  });

  it.each(["ACTIVE", "IN_PROCESS", "PENDING_REVIEW"])("does not flag %s with no impressions yet", (status) => {
    expect(find(findingsFor({ delivery: { effectiveStatus: status }, totals: { impressions: 0 } }), "not_delivering")).toBeUndefined();
  });

  it.each([
    [50_000, "warning"],
    [0, "critical"],
  ] as const)("flags WITH_ISSUES (impressions %s) as %s", (impressions, severity) => {
    const f = find(findingsFor({ delivery: { effectiveStatus: "WITH_ISSUES", issues: ["Payment failed"] }, totals: { impressions } }), "issues");
    expect(f?.severity).toBe(severity);
    expect(f?.message).toContain("Payment failed");
  });

  it("flags a learning-limited ad set as a warning", () => {
    expect(find(findingsFor({ delivery: { learningStatus: "FAIL" } }), "learning_limited")?.severity).toBe("warning");
  });
});

describe("auction checks", () => {
  it.each([
    [2000, "warning"],
    [2500, "critical"],
  ] as const)("flags CPM from spend %s as %s", (spend, severity) => {
    const f = find(findingsFor({ totals: { spend } }), "high_cpm");
    expect(f?.severity).toBe(severity);
    expect(f?.comparison.metric).toBe("cpm");
  });

  it("ignores CPM within 1.5× of the median", () => {
    expect(find(findingsFor({ totals: { spend: 1400 } }), "high_cpm")).toBeUndefined();
  });

  it("maps ranking buckets to severities", () => {
    const findings = findingsFor({
      rankings: { quality: "BELOW_AVERAGE_10", engagement: "BELOW_AVERAGE_35", conversion: "ABOVE_AVERAGE" },
    });
    const rankings = findings.filter((f) => f.kind === "low_ranking");
    expect(rankings.map((f) => [f.kind === "low_ranking" ? f.which : null, f.severity])).toEqual([
      ["quality", "warning"],
      ["engagement", "info"],
    ]);
    expect(rankings[0]?.message).toBe("Quality ranking is in the bottom 10% compared with ads competing for the same people.");
  });
});

describe("creative funnel checks", () => {
  it("flags a weak hook with the numbers and the fix", () => {
    const f = find(findingsFor({ totals: { video3s: 6000 } }), "weak_hook");
    expect(f?.severity).toBe("critical");
    expect(f?.message).toBe("12% of people stop scrolling, vs 30% account median.");
    expect(f?.recommendation).toContain("first 3 seconds");
  });

  it("labels heuristic baselines as a typical benchmark", () => {
    const ctx = makeCtx({ baselines: { ...ACCOUNT_BASELINES, hookRate: { value: 0.25, source: "heuristic", sampleSize: 0 } } });
    expect(find(findingsFor({ totals: { video3s: 9000 } }, ctx), "weak_hook")?.message).toContain("typical benchmark");
  });

  it("flags a weak hold and points at the drop-off seconds", () => {
    const f = find(
      findingsFor({
        totals: { thruplays: 3000 },
        retention: [
          { second: 0, share: 1 },
          { second: 3, share: 0.9 },
          { second: 5, share: 0.45 },
          { second: 15, share: 0.3 },
        ],
      }),
      "weak_hold",
    );
    expect(f?.drop?.fromSecond).toBe(3);
    expect(f?.message).toContain("most leave between 0:03 and 0:05");
    expect(f?.recommendation).toBe("Rework 0:03–0:05 or move the payoff earlier; keep the opening.");
  });

  it("flags a weak hold without a curve", () => {
    const f = find(findingsFor({ totals: { thruplays: 3000 } }), "weak_hold");
    expect(f?.drop).toBeNull();
    expect(f?.recommendation).toContain("Shorten the video");
  });

  it("flags low click-through", () => {
    expect(find(findingsFor({ totals: { linkClicks: 300 } }), "low_ctr")?.message).toBe(
      "0.6% of people who see it click the link, vs 1.5% account median.",
    );
  });

  it.each([
    [300, "warning"],
    [200, "critical"],
  ] as const)("flags landing page drop-off with %s page views as %s", (landingPageViews, severity) => {
    const f = find(findingsFor({ totals: { landingPageViews } }), "page_drop_off");
    expect(f?.severity).toBe(severity);
  });

  it("flags low conversion rate", () => {
    expect(find(findingsFor({ totals: { purchases: 10 } }), "low_cvr")?.severity).toBe("critical");
  });
});

describe("targets", () => {
  it("flags ROAS below the target", () => {
    const f = find(findingsFor({ totals: { revenue: 1500 } }), "below_target");
    expect(f?.metric).toBe("roas");
    expect(f?.message).toBe("ROAS is 1.50 against a target of 2.00.");
  });

  it("uses the CPA target when there is no ROAS target", () => {
    const f = find(findingsFor({}, makeCtx({ targets: { roas: null, cpa: 20, source: "campaign" } })), "below_target");
    expect(f?.metric).toBe("cpa");
    expect(f?.message).toBe("Cost per result is 33.33 against a target of 20.00.");
  });

  it("explains spend with no results against a CPA target", () => {
    const f = find(
      findingsFor({ totals: { purchases: 0 } }, makeCtx({ targets: { roas: null, cpa: 20, source: "account" } })),
      "below_target",
    );
    expect(f?.message).toBe("No results yet after 1000.00 spent, against a target cost per result of 20.00.");
  });

  it("does not judge awareness ads on ROAS or conversions", () => {
    const findings = findingsFor({ objective: "AWARENESS", totals: { revenue: 0, purchases: 0, landingPageViews: 0 } });
    expect(findings.filter((f) => f.stage === "conversion" || f.stage === "landing")).toEqual([]);
  });
});

describe("fatigue", () => {
  const fading = [...flatDaily(21).slice(0, 14), ...flatDaily(21).slice(14).map((d) => ({ ...d, video3s: 1000 }))];

  it("flags high frequency with a falling hook rate", () => {
    const f = find(findingsFor({ daily: fading, totals: { frequency: 3.5 } }), "creative_fatigue");
    expect(f?.hookDrop).toBeCloseTo(1 / 3);
    expect(f?.ctrDrop).toBeNull();
    expect(f?.message).toBe("Frequency is 3.5 and the hook rate fell 33% over the last 7 days.");
  });

  it("ignores a falling hook rate at low frequency", () => {
    expect(find(findingsFor({ daily: fading, totals: { frequency: 2 } }), "creative_fatigue")).toBeUndefined();
  });

  it("ignores high frequency when engagement holds up", () => {
    expect(find(findingsFor({ daily: flatDaily(21), totals: { frequency: 5 } }), "creative_fatigue")).toBeUndefined();
  });
});

describe("placements", () => {
  const reels = { placement: "instagram / instagram_reels", spend: 100, impressions: 5000, video3s: 2000, linkClicks: 50, revenue: 300 };
  const feed = { placement: "facebook / feed", spend: 100, impressions: 5000, video3s: 1000, linkClicks: 50, revenue: 100 };

  it("reports a large gap between placements as info", () => {
    const f = find(findingsFor({ placements: [feed, reels] }), "placement_gap");
    expect(f?.severity).toBe("info");
    expect(f?.best).toBe(reels.placement);
    expect(f?.message).toBe("Hook rate is 40% on instagram / instagram_reels vs 20% on facebook / feed.");
  });

  it("ignores placements with under 1,000 impressions", () => {
    expect(find(findingsFor({ placements: [reels, { ...feed, impressions: 900, video3s: 10 }] }), "placement_gap")).toBeUndefined();
  });

  it("ignores small gaps", () => {
    expect(find(findingsFor({ placements: [reels, { ...feed, video3s: 1600 }] }), "placement_gap")).toBeUndefined();
  });

  it("compares click-through for image ads", () => {
    const f = find(findingsFor({ format: "IMAGE", placements: [{ ...feed, linkClicks: 20 }, reels] }), "placement_gap");
    expect(f?.metric).toBe("ctr");
  });
});

describe("applicableStages", () => {
  it("skips hook and hold for non-video ads", () => {
    expect(applicableStages(makeAd({ format: "IMAGE" }))).not.toContain("hook");
    expect(applicableStages(makeAd({ format: "IMAGE" }))).not.toContain("hold");
    expect(find(findingsFor({ format: "IMAGE", totals: { video3s: 100, thruplays: 1 } }), "weak_hook")).toBeUndefined();
  });

  it.each([
    ["AWARENESS", ["delivery", "auction", "hook", "fatigue", "placement"]],
    ["ENGAGEMENT", ["delivery", "auction", "hook", "hold", "fatigue", "placement"]],
    ["TRAFFIC", ["delivery", "auction", "hook", "click", "landing", "fatigue", "placement"]],
  ] as const)("limits %s to its stages", (objective, stages) => {
    expect(applicableStages(makeAd({ objective }))).toEqual(stages);
  });
});
