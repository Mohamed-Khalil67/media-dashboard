/**
 * Coerce an arbitrary upstream value to a finite number, defaulting to 0
 * when the value is missing, non-numeric, NaN, or Infinity.
 *
 * Why: ad-platform APIs sporadically return strings like "" or "N/A" for
 * metrics they don't have data for. `Number("N/A")` is `NaN`, and writing
 * NaN to Postgres turns every downstream `SUM`/`AVG` into NaN, which then
 * propagates through the dashboard as `NaN` everywhere — a hard bug to
 * triangulate. This helper makes the conversion explicit and safe.
 */
export function toNum(value: unknown): number {
  if (value === null || value === undefined || value === "") return 0;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}
