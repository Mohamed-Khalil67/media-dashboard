import { describe, it, expect, vi, beforeEach } from "vitest";

const warn = vi.hoisted(() => vi.fn());
vi.mock("../../lib/logger", () => ({ logger: { warn, info: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

import {
  DEFAULT_GRAPH_VERSION,
  GRAPH_BASE,
  OAUTH_DIALOG_URL,
  reportVersionDrift,
  resetVersionDriftReports,
  resolveGraphVersion,
} from "./graph";

beforeEach(() => {
  warn.mockClear();
  resetVersionDriftReports();
});

describe("resolveGraphVersion", () => {
  it("defaults to a supported version when unset or blank", () => {
    expect(resolveGraphVersion(undefined)).toBe(DEFAULT_GRAPH_VERSION);
    expect(resolveGraphVersion("   ")).toBe(DEFAULT_GRAPH_VERSION);
  });

  it("accepts a well-formed override", () => {
    expect(resolveGraphVersion("v26.0")).toBe("v26.0");
    expect(resolveGraphVersion(" v26.0 ")).toBe("v26.0");
  });

  it("rejects malformed values and warns", () => {
    expect(resolveGraphVersion("25.0")).toBe(DEFAULT_GRAPH_VERSION);
    expect(resolveGraphVersion("v25.0/../me")).toBe(DEFAULT_GRAPH_VERSION);
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it("is no longer pinned to the expired v21.0", () => {
    expect(DEFAULT_GRAPH_VERSION).not.toBe("v21.0");
    expect(GRAPH_BASE).toBe(`https://graph.facebook.com/${DEFAULT_GRAPH_VERSION}`);
    expect(OAUTH_DIALOG_URL).toBe(`https://www.facebook.com/${DEFAULT_GRAPH_VERSION}/dialog/oauth`);
  });
});

describe("reportVersionDrift", () => {
  it("stays quiet when Meta serves the requested version", () => {
    reportVersionDrift({ "facebook-api-version": "v25.0" }, "v25.0");
    reportVersionDrift({}, "v25.0");
    expect(warn).not.toHaveBeenCalled();
  });

  it("warns when Meta upgrades the call", () => {
    reportVersionDrift({ "facebook-api-version": "v25.0" }, "v21.0");
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ requested: "v21.0", served: "v25.0" }),
      expect.any(String),
    );
  });

  it("warns on the explicit version-warning header", () => {
    reportVersionDrift({ "x-ad-api-version-warning": "v24.0 expires soon" }, "v24.0");
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ warning: "v24.0 expires soon" }),
      expect.any(String),
    );
  });

  it("logs each distinct drift only once", () => {
    const headers = { "facebook-api-version": "v25.0" };
    reportVersionDrift(headers, "v21.0");
    reportVersionDrift(headers, "v21.0");
    reportVersionDrift(headers, "v21.0");
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
