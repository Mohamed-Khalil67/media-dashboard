import { describe, it, expect, vi, beforeEach } from "vitest";
import express, { Request, Response, NextFunction } from "express";
import request from "supertest";

const mocks = vi.hoisted(() => ({
  getOverview: vi.fn(),
  getTimeseries: vi.fn(),
  getCampaignAggregates: vi.fn(),
  getShopifyOverview: vi.fn(),
  getShopifyTimeseries: vi.fn(),
  callerWorkspaceId: "ws_caller",
}));

vi.mock("../../middleware/auth", () => ({
  requireAuth: (req: Request, _res: Response, next: NextFunction) => {
    const headerWs = req.headers["x-test-workspace-id"];
    (req as any).userId = "u_caller";
    (req as any).workspaceId = typeof headerWs === "string" ? headerWs : mocks.callerWorkspaceId;
    (req as any).role = "owner";
    (req as any).userRole = "media_buyer";
    next();
  },
}));

vi.mock("./metrics.service", () => ({
  getOverview: mocks.getOverview,
  getTimeseries: mocks.getTimeseries,
  getCampaignAggregates: mocks.getCampaignAggregates,
  getShopifyOverview: mocks.getShopifyOverview,
  getShopifyTimeseries: mocks.getShopifyTimeseries,
}));

import metricsRoutes from "./metrics.routes";

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/metrics", metricsRoutes);
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default success payloads so handlers don't choke when the test only asserts on the call args.
  mocks.getOverview.mockResolvedValue({ spend: 0, revenue: 0 });
  mocks.getTimeseries.mockResolvedValue([]);
  mocks.getCampaignAggregates.mockResolvedValue([]);
  mocks.getShopifyOverview.mockResolvedValue({ orders: 0, revenue: 0 });
  mocks.getShopifyTimeseries.mockResolvedValue([]);
});

describe("range parsing", () => {
  it("defaults the range to 7d when no query param is supplied", async () => {
    await request(makeApp()).get("/api/metrics/overview");
    const args = mocks.getOverview.mock.calls[0];
    expect(args[1]).toBe("7d");
  });

  it.each(["7d", "14d", "30d"])("accepts %s as a valid range", async (range) => {
    await request(makeApp()).get(`/api/metrics/overview?range=${range}`);
    expect(mocks.getOverview.mock.calls.at(-1)?.[1]).toBe(range);
  });

  it("falls back to 7d when the range is not in the allowlist", async () => {
    await request(makeApp()).get("/api/metrics/overview?range=90d");
    expect(mocks.getOverview.mock.calls.at(-1)?.[1]).toBe("7d");
  });
});

describe("date param parsing", () => {
  it("forwards valid ISO YYYY-MM-DD dates to the service", async () => {
    await request(makeApp()).get("/api/metrics/overview?since=2026-01-01&until=2026-01-31");
    const args = mocks.getOverview.mock.calls.at(-1)!;
    expect(args[2]).toBe("2026-01-01");
    expect(args[3]).toBe("2026-01-31");
  });

  it("drops malformed dates as undefined (avoids passing garbage downstream)", async () => {
    await request(makeApp()).get("/api/metrics/overview?since=2026/01/01&until=last-week");
    const args = mocks.getOverview.mock.calls.at(-1)!;
    expect(args[2]).toBeUndefined();
    expect(args[3]).toBeUndefined();
  });
});

describe("connection + platform filters", () => {
  it("forwards connectionId verbatim", async () => {
    await request(makeApp()).get("/api/metrics/overview?connectionId=c_42");
    const args = mocks.getOverview.mock.calls.at(-1)!;
    expect(args[4]).toBe("c_42");
  });

  it("forwards a valid platform value", async () => {
    await request(makeApp()).get("/api/metrics/overview?platform=facebook");
    const args = mocks.getOverview.mock.calls.at(-1)!;
    expect(args[5]).toBe("facebook");
  });

  it("drops an unsupported platform value", async () => {
    await request(makeApp()).get("/api/metrics/overview?platform=etsy");
    const args = mocks.getOverview.mock.calls.at(-1)!;
    expect(args[5]).toBeUndefined();
  });

  it("scopes the query to the caller's workspace", async () => {
    await request(makeApp())
      .get("/api/metrics/overview")
      .set("X-Test-Workspace-Id", "ws_alpha");
    const args = mocks.getOverview.mock.calls.at(-1)!;
    expect(args[0]).toBe("ws_alpha");
  });
});

describe("per-route smoke checks", () => {
  it("GET /timeseries returns { points: [] }", async () => {
    const res = await request(makeApp()).get("/api/metrics/timeseries");
    expect(res.status).toBe(200);
    expect(res.body.points).toEqual([]);
    expect(mocks.getTimeseries).toHaveBeenCalledTimes(1);
  });

  it("GET /campaigns returns { campaigns: [] }", async () => {
    const res = await request(makeApp()).get("/api/metrics/campaigns");
    expect(res.status).toBe(200);
    expect(res.body.campaigns).toEqual([]);
    expect(mocks.getCampaignAggregates).toHaveBeenCalledTimes(1);
  });

  it("GET /shopify/overview delegates to getShopifyOverview", async () => {
    const res = await request(makeApp()).get("/api/metrics/shopify/overview");
    expect(res.status).toBe(200);
    expect(mocks.getShopifyOverview).toHaveBeenCalledTimes(1);
  });

  it("GET /shopify/timeseries returns { points: [] }", async () => {
    const res = await request(makeApp()).get("/api/metrics/shopify/timeseries");
    expect(res.status).toBe(200);
    expect(res.body.points).toEqual([]);
    expect(mocks.getShopifyTimeseries).toHaveBeenCalledTimes(1);
  });
});
