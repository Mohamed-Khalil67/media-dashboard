import { describe, it, expect } from "vitest";
import { biggestDrop, daysWithSpend, recentTrend } from "./signals";
import { flatDaily } from "./test-fixtures";

describe("biggestDrop", () => {
  it.each([[null], [[]], [[{ second: 0, share: 1 }]]])("returns null for %j", (curve) => {
    expect(biggestDrop(curve)).toBeNull();
  });

  it("finds the steepest segment, even when points arrive unsorted", () => {
    const drop = biggestDrop([
      { second: 15, share: 0.3 },
      { second: 0, share: 1 },
      { second: 5, share: 0.45 },
      { second: 3, share: 0.9 },
    ]);
    expect(drop).toEqual({ fromSecond: 3, toSecond: 5, fromShare: 0.9, toShare: 0.45, loss: expect.closeTo(0.45) });
  });

  it("returns null when the curve never falls", () => {
    expect(biggestDrop([{ second: 0, share: 0.5 }, { second: 3, share: 0.5 }])).toBeNull();
  });
});

describe("recentTrend", () => {
  it("needs at least 10 days with impressions", () => {
    const t = recentTrend(flatDaily(9));
    expect(t.hookChange).toBeNull();
    expect(t.ctrChange).toBeNull();
  });

  it("ignores days without impressions when counting history", () => {
    const daily = [...flatDaily(9), ...flatDaily(5, { spend: 0, impressions: 0, video3s: 0, linkClicks: 0 }).map((d, i) => ({ ...d, date: `2026-12-0${i + 1}` }))];
    expect(recentTrend(daily).hookChange).toBeNull();
  });

  it("compares the last 7 days with the 14 before", () => {
    const earlier = flatDaily(21).slice(0, 14);
    const recent = flatDaily(21).slice(14).map((d) => ({ ...d, video3s: 1000, linkClicks: 60 }));
    const t = recentTrend([...recent, ...earlier]);
    expect(t.earlierHook).toBeCloseTo(0.3);
    expect(t.recentHook).toBeCloseTo(0.2);
    expect(t.hookChange).toBeCloseTo(-1 / 3);
    expect(t.ctrChange).toBeCloseTo(-0.2);
  });

  it("reports no change for a flat series", () => {
    expect(recentTrend(flatDaily(21)).hookChange).toBeCloseTo(0);
  });
});

describe("daysWithSpend", () => {
  it("counts distinct dates with spend", () => {
    const daily = [...flatDaily(3), ...flatDaily(2), ...flatDaily(4, { spend: 0, impressions: 10, video3s: 0, linkClicks: 0 }).map((d) => ({ ...d, date: `x-${d.date}` }))];
    expect(daysWithSpend(daily)).toBe(3);
    expect(daysWithSpend([])).toBe(0);
  });
});
