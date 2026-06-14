import { describe, it, expect, vi, beforeEach } from "vitest";
import express, { Request, Response, NextFunction } from "express";
import request from "supertest";

const mocks = vi.hoisted(() => ({
  getOverview: vi.fn(),
  getTimeseries: vi.fn(),
  getCampaignAggregates: vi.fn(),
  getShopifyOverview: vi.fn(),
  getShopifyTimeseries: vi.fn(),
  getShopifyOrdersList: vi.fn(),
  getShopifyOrderDetail: vi.fn(),
  getShopifyTopProducts: vi.fn(),
  getShopifyTopCustomers: vi.fn(),
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
  getShopifyOrdersList: mocks.getShopifyOrdersList,
  getShopifyOrderDetail: mocks.getShopifyOrderDetail,
  getShopifyTopProducts: mocks.getShopifyTopProducts,
  getShopifyTopCustomers: mocks.getShopifyTopCustomers,
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
  mocks.getShopifyOrdersList.mockResolvedValue({ orders: [], nextCursor: null });
  mocks.getShopifyOrderDetail.mockResolvedValue({ id: "o_1", raw: {} });
  mocks.getShopifyTopProducts.mockResolvedValue([]);
  mocks.getShopifyTopCustomers.mockResolvedValue([]);
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

describe("GET /shopify/orders", () => {
  it("forwards default pagination (limit=50, no cursor)", async () => {
    await request(makeApp()).get("/api/metrics/shopify/orders");
    const args = mocks.getShopifyOrdersList.mock.calls.at(-1)!;
    expect(args[0]).toBe("ws_caller");
    expect(args[1]).toMatchObject({ limit: 50, cursor: undefined, financialStatus: undefined });
  });

  it("caps the limit at 200 even when a larger value is requested", async () => {
    await request(makeApp()).get("/api/metrics/shopify/orders?limit=9999");
    expect(mocks.getShopifyOrdersList.mock.calls.at(-1)![1].limit).toBe(200);
  });

  it("falls back to 50 when limit is non-numeric (no NaN leak)", async () => {
    await request(makeApp()).get("/api/metrics/shopify/orders?limit=banana");
    expect(mocks.getShopifyOrdersList.mock.calls.at(-1)![1].limit).toBe(50);
  });

  it("accepts a valid financial status and drops invalid ones", async () => {
    await request(makeApp()).get("/api/metrics/shopify/orders?status=paid");
    expect(mocks.getShopifyOrdersList.mock.calls.at(-1)![1].financialStatus).toBe("paid");

    await request(makeApp()).get("/api/metrics/shopify/orders?status=cancelled-no-such-thing");
    expect(mocks.getShopifyOrdersList.mock.calls.at(-1)![1].financialStatus).toBeUndefined();
  });

  it("forwards search query (trimmed) and cursor", async () => {
    await request(makeApp()).get("/api/metrics/shopify/orders?q=  jane@x.com  &cursor=abc%7Cxyz");
    const opts = mocks.getShopifyOrdersList.mock.calls.at(-1)![1];
    expect(opts.q).toBe("jane@x.com");
    expect(opts.cursor).toBe("abc|xyz");
  });

  it("scopes to the caller's workspace", async () => {
    await request(makeApp())
      .get("/api/metrics/shopify/orders")
      .set("X-Test-Workspace-Id", "ws_alpha");
    expect(mocks.getShopifyOrdersList.mock.calls.at(-1)![0]).toBe("ws_alpha");
  });

  it("returns the service result verbatim", async () => {
    mocks.getShopifyOrdersList.mockResolvedValueOnce({
      orders: [{ id: "o_1", externalId: "1001", totalPrice: 99.5 }],
      nextCursor: "2026-06-01T00:00:00.000Z|o_1",
    });
    const res = await request(makeApp()).get("/api/metrics/shopify/orders");
    expect(res.status).toBe(200);
    expect(res.body.orders).toHaveLength(1);
    expect(res.body.nextCursor).toBe("2026-06-01T00:00:00.000Z|o_1");
  });
});

describe("GET /shopify/orders/:id", () => {
  it("returns 404 when the order isn't in the caller's workspace", async () => {
    mocks.getShopifyOrderDetail.mockResolvedValueOnce(null);
    const res = await request(makeApp()).get("/api/metrics/shopify/orders/o_missing");
    expect(res.status).toBe(404);
  });

  it("returns the raw payload on success", async () => {
    mocks.getShopifyOrderDetail.mockResolvedValueOnce({ id: "o_1", raw: { foo: "bar" } });
    const res = await request(makeApp()).get("/api/metrics/shopify/orders/o_1");
    expect(res.status).toBe(200);
    expect(res.body.raw).toEqual({ foo: "bar" });
  });

  it("scopes detail lookup to the caller's workspace", async () => {
    await request(makeApp())
      .get("/api/metrics/shopify/orders/o_1")
      .set("X-Test-Workspace-Id", "ws_other");
    expect(mocks.getShopifyOrderDetail).toHaveBeenCalledWith("ws_other", "o_1");
  });
});

describe("GET /shopify/top-products and /shopify/top-customers", () => {
  it("forwards range + workspace + default limit=10 to top-products", async () => {
    await request(makeApp()).get("/api/metrics/shopify/top-products?range=14d");
    const args = mocks.getShopifyTopProducts.mock.calls.at(-1)!;
    expect(args[0]).toBe("ws_caller");
    expect(args[1]).toBe("14d");
    expect(args.at(-1)).toBe(10);
  });

  it("caps top-products limit at 50", async () => {
    await request(makeApp()).get("/api/metrics/shopify/top-products?limit=9999");
    expect(mocks.getShopifyTopProducts.mock.calls.at(-1)!.at(-1)).toBe(50);
  });

  it("rejects non-numeric limit by defaulting to 10", async () => {
    await request(makeApp()).get("/api/metrics/shopify/top-products?limit=banana");
    expect(mocks.getShopifyTopProducts.mock.calls.at(-1)!.at(-1)).toBe(10);
  });

  it("wraps top-products response in { products: [...] }", async () => {
    mocks.getShopifyTopProducts.mockResolvedValueOnce([
      { title: "Hoodie", sku: "HOOD-1", units: 12, revenue: 480 },
    ]);
    const res = await request(makeApp()).get("/api/metrics/shopify/top-products");
    expect(res.status).toBe(200);
    expect(res.body.products[0].title).toBe("Hoodie");
  });

  it("wraps top-customers response in { customers: [...] }", async () => {
    mocks.getShopifyTopCustomers.mockResolvedValueOnce([
      { email: "fan@x.com", orders: 3, revenue: 175 },
    ]);
    const res = await request(makeApp()).get("/api/metrics/shopify/top-customers");
    expect(res.status).toBe(200);
    expect(res.body.customers[0].email).toBe("fan@x.com");
  });
});
