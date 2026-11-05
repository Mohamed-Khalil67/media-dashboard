import { ratio } from "./metrics";
import type { DailyPoint, RetentionDrop, RetentionPoint } from "./types";

/**
 * The curve segment where the most viewers leave (largest absolute loss
 * between consecutive points). Null when the curve has fewer than 2 points.
 */
export function biggestDrop(curve: readonly RetentionPoint[] | null): RetentionDrop | null {
  if (!curve || curve.length < 2) return null;
  const points = [...curve].sort((a, b) => a.second - b.second);
  let worst: RetentionDrop | null = null;
  for (let i = 1; i < points.length; i++) {
    const from = points[i - 1];
    const to = points[i];
    if (!from || !to) continue;
    const loss = from.share - to.share;
    if (worst === null || loss > worst.loss) {
      worst = { fromSecond: from.second, toSecond: to.second, fromShare: from.share, toShare: to.share, loss };
    }
  }
  return worst !== null && worst.loss > 0 ? worst : null;
}

export interface Trend {
  /** Hook rate over the most recent window. */
  recentHook: number | null;
  /** Hook rate over the earlier baseline window. */
  earlierHook: number | null;
  recentCtr: number | null;
  earlierCtr: number | null;
  /** Relative change, e.g. -0.25 = down 25%. Null when not computable. */
  hookChange: number | null;
  ctrChange: number | null;
}

function sum(points: readonly DailyPoint[], key: keyof Omit<DailyPoint, "date">): number {
  return points.reduce((s, p) => s + p[key], 0);
}

function relativeChange(recent: number | null, earlier: number | null): number | null {
  if (recent === null || earlier === null || earlier === 0) return null;
  return (recent - earlier) / earlier;
}

/**
 * Compare the last `recentDays` days with the `baselineDays` before them.
 * Needs at least `recentDays + 3` days with impressions, otherwise every
 * value is null — too little history to call a trend.
 */
export function recentTrend(daily: readonly DailyPoint[], recentDays = 7, baselineDays = 14): Trend {
  const active = [...daily].filter((d) => d.impressions > 0).sort((a, b) => a.date.localeCompare(b.date));
  const empty: Trend = { recentHook: null, earlierHook: null, recentCtr: null, earlierCtr: null, hookChange: null, ctrChange: null };
  if (active.length < recentDays + 3) return empty;

  const recent = active.slice(-recentDays);
  const earlier = active.slice(-(recentDays + baselineDays), -recentDays);

  const recentHook = ratio(sum(recent, "video3s"), sum(recent, "impressions"));
  const earlierHook = ratio(sum(earlier, "video3s"), sum(earlier, "impressions"));
  const recentCtr = ratio(sum(recent, "linkClicks"), sum(recent, "impressions"));
  const earlierCtr = ratio(sum(earlier, "linkClicks"), sum(earlier, "impressions"));

  return {
    recentHook,
    earlierHook,
    recentCtr,
    earlierCtr,
    hookChange: relativeChange(recentHook, earlierHook),
    ctrChange: relativeChange(recentCtr, earlierCtr),
  };
}

/** Number of distinct days with spend > 0. */
export function daysWithSpend(daily: readonly DailyPoint[]): number {
  return new Set(daily.filter((d) => d.spend > 0).map((d) => d.date)).size;
}
