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

const DAY_MS = 24 * 60 * 60 * 1000;
/** Each window needs at least this many days with impressions to be compared. */
const MIN_ACTIVE_DAYS_PER_WINDOW = 3;

/** Whole days since the epoch for a YYYY-MM-DD date; null when it doesn't parse. */
function dayNumber(date: string): number | null {
  const ms = Date.parse(`${date}T00:00:00Z`);
  return Number.isNaN(ms) ? null : Math.floor(ms / DAY_MS);
}

/**
 * Compare the last `recentDays` calendar days with the `baselineDays` calendar
 * days before them. Windows end at `asOf` (YYYY-MM-DD), defaulting to the latest
 * date in `daily`, so a paused week is an empty window rather than being
 * back-filled with older active days.
 *
 * Every value is null — too little data to call a trend — unless the two
 * windows hold at least `recentDays + 3` days with impressions in total and
 * each holds at least 3.
 */
export function recentTrend(daily: readonly DailyPoint[], recentDays = 7, baselineDays = 14, asOf?: string): Trend {
  const empty: Trend = { recentHook: null, earlierHook: null, recentCtr: null, earlierCtr: null, hookChange: null, ctrChange: null };
  const dated = daily.flatMap((d) => {
    const day = dayNumber(d.date);
    return day === null ? [] : [{ point: d, day }];
  });
  const anchor = asOf !== undefined ? dayNumber(asOf) : dated.reduce<number | null>((max, d) => (max === null || d.day > max ? d.day : max), null);
  if (anchor === null) return empty;

  const active = dated.filter((d) => d.point.impressions > 0);
  const recentStart = anchor - recentDays + 1;
  const earlierStart = recentStart - baselineDays;
  const recent = active.filter((d) => d.day >= recentStart && d.day <= anchor).map((d) => d.point);
  const earlier = active.filter((d) => d.day >= earlierStart && d.day < recentStart).map((d) => d.point);
  if (
    recent.length + earlier.length < recentDays + 3 ||
    recent.length < MIN_ACTIVE_DAYS_PER_WINDOW ||
    earlier.length < MIN_ACTIVE_DAYS_PER_WINDOW
  ) {
    return empty;
  }

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
