import { toNum } from "../../../lib/numeric";
import type { AdFormat, RetentionPoint } from "../diagnosis";
import type { ActionStat, AdDetails, AdInsightRow } from "./meta.schemas";

/** First matching action value, trying `types` in priority order. */
export function pickAction(list: readonly ActionStat[] | undefined, types: readonly string[]): number {
  if (!list) return 0;
  for (const type of types) {
    const hit = list.find((a) => a.action_type === type);
    if (hit) return toNum(hit.value);
  }
  return 0;
}

/** Sum of every entry — for video_* fields Meta returns one entry per action_type (usually just video_view). */
export function sumActions(list: readonly ActionStat[] | undefined): number {
  return (list ?? []).reduce((s, a) => s + toNum(a.value), 0);
}

const PURCHASE = ["omni_purchase", "purchase", "offsite_conversion.fb_pixel_purchase"] as const;
const LEAD = ["lead", "onsite_conversion.lead_grouped", "offsite_conversion.fb_pixel_lead"] as const;
const LANDING = ["landing_page_view", "omni_landing_page_view"] as const;

/** Additive per-row metrics shared by daily rows and placement rows. */
export interface AdditiveMetrics {
  spend: number;
  impressions: number;
  linkClicks: number;
  videoPlays: number;
  video3s: number;
  thruplays: number;
  p25: number;
  p50: number;
  p75: number;
  p95: number;
  p100: number;
  landingPageViews: number;
  purchases: number;
  leads: number;
  revenue: number;
}

export function additiveMetrics(row: AdInsightRow): AdditiveMetrics {
  return {
    spend: toNum(row.spend),
    impressions: Math.round(toNum(row.impressions)),
    linkClicks: Math.round(toNum(row.inline_link_clicks)),
    videoPlays: Math.round(sumActions(row.video_play_actions)),
    // 3-second plays have no dedicated field: Meta reports them as actions[video_view].
    video3s: Math.round(pickAction(row.actions, ["video_view"])),
    thruplays: Math.round(sumActions(row.video_thruplay_watched_actions)),
    p25: Math.round(sumActions(row.video_p25_watched_actions)),
    p50: Math.round(sumActions(row.video_p50_watched_actions)),
    p75: Math.round(sumActions(row.video_p75_watched_actions)),
    p95: Math.round(sumActions(row.video_p95_watched_actions)),
    p100: Math.round(sumActions(row.video_p100_watched_actions)),
    landingPageViews: Math.round(pickAction(row.actions, LANDING)),
    purchases: Math.round(pickAction(row.actions, PURCHASE)),
    leads: Math.round(pickAction(row.actions, LEAD)),
    revenue: pickAction(row.action_values, PURCHASE),
  };
}

/**
 * Seconds represented by each bucket of `video_play_curve_actions`:
 * one bucket per second for 0–14 s, then 15–20, 20–25, 25–30, 30–40, 40–50,
 * 50–60 and 60+ s (each labelled by its start).
 */
export const CURVE_BUCKET_SECONDS: readonly number[] = [
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 20, 25, 30, 40, 50, 60,
];

/**
 * Convert Meta's retention curve (percent of plays still watching per bucket)
 * into engine points with share 0..1, cut at the video length when known.
 * Returns null when the curve is missing or flat zero.
 */
export function parseRetentionCurve(
  values: readonly (string | number)[] | undefined,
  lengthSec: number | null,
): RetentionPoint[] | null {
  if (!values || values.length === 0) return null;
  const points: RetentionPoint[] = [];
  values.forEach((raw, i) => {
    const second = CURVE_BUCKET_SECONDS[i];
    if (second === undefined) return;
    if (lengthSec !== null && second > lengthSec) return;
    const pct = toNum(raw);
    points.push({ second, share: Math.min(Math.max(pct / 100, 0), 1) });
  });
  return points.some((p) => p.share > 0) ? points : null;
}

/** Classify the creative so the engine knows whether video metrics apply. */
export function detectFormat(creative: AdDetails["creative"]): AdFormat {
  if (!creative) return "UNKNOWN";
  if (creative.asset_feed_spec?.videos && creative.asset_feed_spec.videos.length > 0) return "DYNAMIC";
  if (creative.asset_feed_spec) return "DYNAMIC";
  if (creative.video_id || creative.object_story_spec?.video_data?.video_id) return "VIDEO";
  if ((creative.object_story_spec?.link_data?.child_attachments?.length ?? 0) > 1) return "CAROUSEL";
  switch (creative.object_type) {
    case "VIDEO":
      return "VIDEO";
    case "PHOTO":
    case "SHARE":
    case "STATUS":
      return "IMAGE";
    default:
      return "UNKNOWN";
  }
}

export function videoIdOf(creative: AdDetails["creative"]): string | null {
  return creative?.video_id ?? creative?.object_story_spec?.video_data?.video_id ?? null;
}

/** Human-readable delivery issues from `issues_info`. */
export function issueMessages(details: AdDetails): string[] {
  return (details.issues_info ?? [])
    .map((i) => i.error_summary ?? i.error_message ?? "")
    .filter((m) => m.length > 0);
}

/** Rejection reasons from `ad_review_feedback.global` ({ reason: message }). */
export function rejectionReasons(details: AdDetails): string[] {
  return Object.values(details.ad_review_feedback?.global ?? {}).filter((m) => m.length > 0);
}

/** Meta budgets are in the account currency's minor unit (e.g. piastres, cents). */
export function budgetFromMinor(value: string | number | undefined): number | null {
  if (value === undefined) return null;
  const n = toNum(value);
  return n > 0 ? n / 100 : null;
}

/** "YYYY-MM-DD" → UTC midnight, matching how Insight.date is stored. */
export function dayToDate(day: string): Date {
  return new Date(`${day}T00:00:00.000Z`);
}

/** YYYY-MM-DD for `daysAgo` days before `now` (UTC). */
export function isoDay(now: Date, daysAgo = 0): string {
  const d = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}
