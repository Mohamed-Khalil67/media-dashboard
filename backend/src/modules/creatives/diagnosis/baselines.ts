import { heuristicBaseline, resolveThresholds } from "./config";
import type { Baseline, Baselines, DerivedMetrics, MetricKey, Thresholds } from "./types";

const METRIC_KEYS: readonly MetricKey[] = [
  "hookRate",
  "holdRate",
  "completionRate",
  "ctr",
  "cpm",
  "costPer1000Reached",
  "cpc",
  "lpvRate",
  "costPerLpv",
  "costPerThruplay",
  "cvr",
  "cpa",
  "roas",
];

/** Median of a non-empty list; undefined for an empty one. */
export function median(values: readonly number[]): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const upper = sorted[mid];
  if (upper === undefined) return undefined;
  if (sorted.length % 2 === 1) return upper;
  const lower = sorted[mid - 1];
  return lower === undefined ? upper : (lower + upper) / 2;
}

export interface Peer {
  metrics: DerivedMetrics;
  spend: number;
  impressions: number;
}

export interface BaselineOptions {
  /** Peers below this spend are ignored (too little data to be representative). */
  minSpend?: number;
  thresholds?: Partial<Thresholds>;
}

/**
 * Account baselines: the median of each metric across comparable ads (same
 * objective — the caller filters). Falls back to the heuristic baseline when
 * fewer than `minPeers` ads have a value for that metric.
 */
export function computeBaselines(peers: readonly Peer[], options: BaselineOptions = {}): Baselines {
  const { minPeers, minImpressions } = resolveThresholds(options.thresholds);
  const minSpend = options.minSpend ?? 0;
  const eligible = peers.filter((p) => p.spend >= minSpend && p.impressions >= minImpressions);

  const baselines: Baselines = {};
  for (const key of METRIC_KEYS) {
    const values = eligible.map((p) => p.metrics[key]).filter((v): v is number => v !== null);
    const value = values.length >= minPeers ? median(values) : undefined;
    const baseline: Baseline | undefined =
      value !== undefined ? { value, source: "account", sampleSize: values.length } : heuristicBaseline(key);
    if (baseline) baselines[key] = baseline;
  }
  return baselines;
}
