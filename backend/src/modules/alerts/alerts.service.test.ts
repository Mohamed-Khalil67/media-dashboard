import { describe, it, expect } from "vitest";
import { isSupportedMetric, isSupportedOperator } from "./alerts.service";

describe("alerts service type guards", () => {
  it.each(["roas", "frequency", "ctr"])("accepts metric '%s'", (m) => {
    expect(isSupportedMetric(m)).toBe(true);
  });

  it.each(["budget_pace", "spend", "", null, 0])("rejects metric %p", (m) => {
    expect(isSupportedMetric(m)).toBe(false);
  });

  it.each(["lt", "gt"])("accepts operator '%s'", (o) => {
    expect(isSupportedOperator(o)).toBe(true);
  });

  it.each(["eq", "<=", "", null])("rejects operator %p", (o) => {
    expect(isSupportedOperator(o)).toBe(false);
  });
});
