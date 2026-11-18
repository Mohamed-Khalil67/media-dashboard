import { describe, it, expect } from "vitest";
import { computeBaselines, median, type Peer } from "./baselines";
import { nullMetrics } from "./test-fixtures";

describe("median", () => {
  it.each([
    [[], undefined],
    [[7], 7],
    [[3, 1, 2], 2],
    [[4, 1, 3, 2], 2.5],
    [[5, 5, 1], 5],
  ])("median(%j) = %s", (values, expected) => {
    expect(median(values)).toBe(expected);
  });

  it("does not mutate its input", () => {
    const values = [3, 1, 2];
    median(values);
    expect(values).toEqual([3, 1, 2]);
  });
});

function peer(hookRate: number | null, cpm: number | null, spend = 100, impressions = 5000): Peer {
  return { metrics: nullMetrics({ hookRate, cpm }), spend, impressions };
}

describe("computeBaselines", () => {
  it("uses the account median once there are enough peers", () => {
    const peers = [0.1, 0.2, 0.3, 0.4, 0.5].map((h) => peer(h, 20));
    const b = computeBaselines(peers);
    expect(b.hookRate).toEqual({ value: 0.3, source: "account", sampleSize: 5 });
    expect(b.cpm).toEqual({ value: 20, source: "account", sampleSize: 5 });
  });

  it("falls back to the heuristic with too few peers", () => {
    const peers = [0.1, 0.2, 0.3, 0.4].map((h) => peer(h, 20));
    const b = computeBaselines(peers);
    expect(b.hookRate).toEqual({ value: 0.25, source: "heuristic", sampleSize: 0 });
    expect(b.ctr).toEqual({ value: 0.01, source: "heuristic", sampleSize: 0 });
  });

  it("has no baseline for cost metrics without account data", () => {
    const b = computeBaselines([]);
    expect(b.cpm).toBeUndefined();
    expect(b.cpa).toBeUndefined();
    expect(b.roas).toBeUndefined();
  });

  it("ignores null metric values when counting peers", () => {
    const peers = [peer(0.2, 20), peer(0.3, 20), peer(null, 20), peer(null, 20), peer(null, 20)];
    const b = computeBaselines(peers);
    expect(b.hookRate?.source).toBe("heuristic");
    expect(b.cpm?.source).toBe("account");
  });

  it("filters out peers below minSpend or minImpressions", () => {
    const peers = [
      ...[0.1, 0.2, 0.3, 0.4, 0.5].map((h) => peer(h, 20)),
      peer(0.9, 99, 5),
      peer(0.9, 99, 500, 10),
    ];
    const b = computeBaselines(peers, { minSpend: 50 });
    expect(b.hookRate?.value).toBe(0.3);
    expect(b.hookRate?.sampleSize).toBe(5);
  });

  it("honours a custom minPeers threshold", () => {
    const peers = [peer(0.2, 20), peer(0.4, 20)];
    const b = computeBaselines(peers, { thresholds: { minPeers: 2 } }).hookRate;
    expect(b?.value).toBeCloseTo(0.3);
    expect(b).toMatchObject({ source: "account", sampleSize: 2 });
  });
});
