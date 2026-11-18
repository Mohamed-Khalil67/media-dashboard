import { describe, expect, it } from "vitest";
import { MAX_LOOKBACK_DAYS, parseSyncWindow } from "./syncWindow";

const NOW = new Date("2026-11-18T12:00:00Z");

describe("parseSyncWindow", () => {
  it.each([
    [undefined, undefined],
    ["", ""],
    [null, null],
  ])("accepts an empty window: %j / %j", (since, until) => {
    expect(parseSyncWindow(since, until, NOW)).toEqual({ ok: true, value: { since: null, until: null } });
  });

  it("parses a normal range", () => {
    const r = parseSyncWindow("2026-10-01", "2026-11-18", NOW);
    expect(r).toEqual({ ok: true, value: { since: new Date("2026-10-01T00:00:00Z"), until: new Date("2026-11-18T00:00:00Z") } });
  });

  it.each([
    ["not a date", "2026-11-01", /since must be a date/],
    ["2026-02-31", undefined, /since must be a date/],
    [123, undefined, /since must be a date/],
    [undefined, "11/01/2026", /until must be a date/],
    ["2026-11-10", "2026-11-01", /on or before/],
    ["2026-11-25", undefined, /future/],
    ["2020-01-01", undefined, new RegExp(`${MAX_LOOKBACK_DAYS} days`)],
  ])("rejects since=%j until=%j", (since, until, msg) => {
    const r = parseSyncWindow(since, until, NOW);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(msg);
  });

  it("allows tomorrow for time zones ahead of UTC", () => {
    expect(parseSyncWindow(undefined, "2026-11-19", NOW).ok).toBe(true);
  });
});
