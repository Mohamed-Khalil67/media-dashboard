import type { AdFormat, Objective, Ranking, Stage, Verdict } from "@contracts/creatives.contract";

/** Display helpers for the creative pages. Pure functions, no Angular. */

export function pct(value: number | null, digits = 0): string {
  if (value === null || !Number.isFinite(value)) return "—";
  const v = value * 100;
  const d = digits === 0 && Math.abs(v) < 10 && v !== 0 ? 1 : digits;
  return `${v.toFixed(d)}%`;
}

export function num(value: number | null, digits = 2): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return value.toFixed(digits);
}

export function compact(value: number): string {
  return new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

export function money(value: number | null, currency: string | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency ?? "USD",
      maximumFractionDigits: value >= 100 ? 0 : 2,
    }).format(value);
  } catch {
    return `${value.toFixed(0)} ${currency ?? ""}`.trim();
  }
}

export function duration(seconds: number | null): string | null {
  if (seconds === null) return null;
  const s = Math.round(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export interface VerdictMeta {
  label: string;
  icon: string;
  /** Short explanation used as a tooltip and for screen readers. */
  hint: string;
}

export const VERDICTS: Record<Verdict, VerdictMeta> = {
  scale: { label: "Scale", icon: "▲", hint: "Meets its goal with a healthy funnel: candidate for more budget." },
  keep: { label: "Keep", icon: "✓", hint: "Meets its goal; minor issues to watch." },
  iterate: { label: "Iterate", icon: "↻", hint: "One part of the funnel is weak: change that part, keep the rest." },
  kill: { label: "Kill", icon: "✕", hint: "Misses its goal after enough spend, with several weak stages." },
  fix_delivery: { label: "Fix delivery", icon: "!", hint: "Meta isn't delivering it properly: rejected, limited or has issues." },
  wait: { label: "Wait", icon: "◷", hint: "Not enough data yet to judge." },
};

export const VERDICT_ORDER: readonly Verdict[] = ["scale", "keep", "iterate", "kill", "fix_delivery", "wait"];

export const STAGE_LABELS: Record<Stage, string> = {
  delivery: "Delivery",
  auction: "Auction cost",
  hook: "Hook",
  hold: "Hold",
  click: "Click",
  landing: "Landing page",
  conversion: "Conversion",
  fatigue: "Fatigue",
  placement: "Placement",
};

export const OBJECTIVE_LABELS: Record<Objective, string> = {
  AWARENESS: "Awareness",
  ENGAGEMENT: "Engagement",
  TRAFFIC: "Traffic",
  LEADS: "Leads",
  SALES: "Sales",
  APP_PROMOTION: "App promotion",
  UNKNOWN: "Unknown objective",
};

export const FORMAT_LABELS: Record<AdFormat, string> = {
  VIDEO: "video",
  IMAGE: "image",
  CAROUSEL: "carousel",
  DYNAMIC: "dynamic",
  UNKNOWN: "ad",
};

export interface RankingView {
  label: string;
  tone: "good" | "bad" | "neutral";
  icon: string;
}

export function rankingView(r: Ranking): RankingView {
  switch (r) {
    case "ABOVE_AVERAGE":
      return { label: "Above average", tone: "good", icon: "▲" };
    case "AVERAGE":
      return { label: "Average", tone: "good", icon: "✓" };
    case "BELOW_AVERAGE_35":
      return { label: "Bottom 35%", tone: "bad", icon: "▼" };
    case "BELOW_AVERAGE_20":
      return { label: "Bottom 20%", tone: "bad", icon: "▼" };
    case "BELOW_AVERAGE_10":
      return { label: "Bottom 10%", tone: "bad", icon: "▼" };
    case "UNKNOWN":
      return { label: "Not enough data", tone: "neutral", icon: "–" };
  }
}

/** "instagram / instagram_reels" → "Instagram Reels". */
export function placementLabel(raw: string): string {
  const position = raw.split(" / ").at(-1) ?? raw;
  return position
    .split("_")
    .map((w) => (w.length > 0 ? `${w.charAt(0).toUpperCase()}${w.slice(1)}` : w))
    .join(" ")
    .replace(/^Facebook Facebook/, "Facebook")
    .replace(/^Instagram Instagram/, "Instagram");
}
