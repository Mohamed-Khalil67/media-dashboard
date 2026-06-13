import { describe, it, expect } from "vitest";
import { toNum } from "./numeric";

describe("toNum", () => {
  it("passes finite numbers through unchanged", () => {
    expect(toNum(0)).toBe(0);
    expect(toNum(1.5)).toBe(1.5);
    expect(toNum(-42)).toBe(-42);
  });

  it("parses numeric strings", () => {
    expect(toNum("3.14")).toBe(3.14);
    expect(toNum("0")).toBe(0);
  });

  it("returns 0 for null, undefined, and empty string (typical missing-metric shape)", () => {
    expect(toNum(null)).toBe(0);
    expect(toNum(undefined)).toBe(0);
    expect(toNum("")).toBe(0);
  });

  it("returns 0 for unparseable strings (the canonical 'N/A' bug)", () => {
    expect(toNum("N/A")).toBe(0);
    expect(toNum("--")).toBe(0);
    expect(toNum("not a number")).toBe(0);
  });

  it("returns 0 for NaN and Infinity to avoid poisoning Postgres aggregations", () => {
    expect(toNum(NaN)).toBe(0);
    expect(toNum(Infinity)).toBe(0);
    expect(toNum(-Infinity)).toBe(0);
  });
});
