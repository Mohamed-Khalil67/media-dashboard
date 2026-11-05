import type { AdRankings, BaselineSource, Comparison, Ranking, RetentionDrop } from "./types";

/** Exhaustiveness guard for discriminated-union switches. */
export function assertNever(value: never): never {
  throw new Error(`Unhandled variant: ${JSON.stringify(value)}`);
}

/** 0.312 → "31%", 0.009 → "0.9%". */
export function pct(fraction: number): string {
  const p = fraction * 100;
  const rounded = Math.abs(p) < 10 ? Math.round(p * 10) / 10 : Math.round(p);
  return `${rounded}%`;
}

/** Money in the account currency, 2 decimals, no symbol (the UI adds the currency). */
export function money(value: number): string {
  return value.toFixed(2);
}

/** 1.83 → "1.8×" */
export function times(value: number): string {
  return `${Math.round(value * 10) / 10}×`;
}

/** 64 → "1:04" */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function baselineLabel(source: BaselineSource): string {
  return source === "account" ? "account median" : "typical benchmark";
}

export function vs(c: Comparison, format: (n: number) => string): string {
  return `${format(c.value)} vs ${format(c.baseline)} ${baselineLabel(c.baselineSource)}`;
}

const RANKING_LABEL: Record<Ranking, string> = {
  ABOVE_AVERAGE: "above average",
  AVERAGE: "average",
  BELOW_AVERAGE_35: "in the bottom 35%",
  BELOW_AVERAGE_20: "in the bottom 20%",
  BELOW_AVERAGE_10: "in the bottom 10%",
  UNKNOWN: "unknown",
};

export function rankingLabel(ranking: Ranking): string {
  return RANKING_LABEL[ranking];
}

export const RANKING_NAME: Record<keyof AdRankings, string> = {
  quality: "Quality",
  engagement: "Engagement rate",
  conversion: "Conversion rate",
};

export const RANKING_ADVICE: Record<keyof AdRankings, string> = {
  quality: "Make the creative feel less like an ad: native framing, no clickbait, and a clear product.",
  engagement: "Lead with a stronger hook and give people a reason to react or comment.",
  conversion: "Make the offer and next step clearer, and check the landing page matches the ad.",
};

export function holdRecommendation(drop: RetentionDrop | null): string {
  return drop
    ? `Rework ${clock(drop.fromSecond)}–${clock(drop.toSecond)} or move the payoff earlier; keep the opening.`
    : "Shorten the video or move the payoff earlier; keep the opening.";
}
