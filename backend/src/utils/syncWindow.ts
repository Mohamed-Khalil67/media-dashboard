import { z } from "zod";

/** Meta keeps insights for 37 months; cap history there for both platforms. */
export const MAX_LOOKBACK_DAYS = 37 * 30;
const DAY_MS = 24 * 60 * 60 * 1000;

const IsoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "use YYYY-MM-DD")
  .transform((s, ctx) => {
    const d = new Date(`${s}T00:00:00Z`);
    // Round-trip catches impossible dates such as 2026-02-31.
    if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) {
      ctx.addIssue({ code: "custom", message: "not a real date" });
      return z.NEVER;
    }
    return d;
  });

const OptionalDate = z.union([z.literal("").transform(() => null), IsoDate, z.undefined().transform(() => null), z.null()]);

export type SyncWindow = { since: Date | null; until: Date | null };

/**
 * Validate the historical sync window a user picks when connecting an account.
 * Both ends optional; when given they must be real dates, in order, not in the
 * future, and no more than MAX_LOOKBACK_DAYS back — an unbounded range would
 * let one account trigger an arbitrarily large first sync.
 */
export function parseSyncWindow(
  since: unknown,
  until: unknown,
  now: Date = new Date(),
): { ok: true; value: SyncWindow } | { ok: false; error: string } {
  const s = OptionalDate.safeParse(since);
  const u = OptionalDate.safeParse(until);
  if (!s.success) return { ok: false, error: "since must be a date in YYYY-MM-DD format" };
  if (!u.success) return { ok: false, error: "until must be a date in YYYY-MM-DD format" };

  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const earliest = today - MAX_LOOKBACK_DAYS * DAY_MS;
  // Allow one day ahead for account time zones east of UTC.
  const latest = today + DAY_MS;

  for (const [name, d] of [["since", s.data], ["until", u.data]] as const) {
    if (d === null) continue;
    if (d.getTime() > latest) return { ok: false, error: `${name} can't be in the future` };
    if (d.getTime() < earliest) return { ok: false, error: `${name} can be at most ${MAX_LOOKBACK_DAYS} days ago` };
  }
  if (s.data && u.data && s.data.getTime() > u.data.getTime()) {
    return { ok: false, error: "since must be on or before until" };
  }
  return { ok: true, value: { since: s.data, until: u.data } };
}
