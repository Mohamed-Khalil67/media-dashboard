import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import express, { Request, Response, NextFunction } from "express";
import request from "supertest";

const mocks = vi.hoisted(() => ({
  connectionFindMany: vi.fn(),
  connectionUpdate: vi.fn(),
  syncRunCreate: vi.fn(),
  syncRunUpdate: vi.fn(),
  runAllConnections: vi.fn(),
  syncFacebook: vi.fn(),
  syncTiktok: vi.fn(),
  syncShopify: vi.fn(),
  isAuthError: vi.fn().mockReturnValue(false),
  describeSyncError: vi.fn().mockReturnValue("err"),
  callerUserRole: "media_buyer" as "admin" | "media_buyer" | "client",
}));

vi.mock("../../middleware/auth", () => ({
  requireAuth: (req: Request, _res: Response, next: NextFunction) => {
    const headerRole = req.headers["x-test-user-role"];
    (req as any).userId = "u_caller";
    (req as any).workspaceId = "ws_caller";
    (req as any).role = "owner";
    (req as any).userRole = typeof headerRole === "string" ? headerRole : mocks.callerUserRole;
    next();
  },
}));

vi.mock("../../db/client", () => ({
  prisma: {
    connection: { findMany: mocks.connectionFindMany, update: mocks.connectionUpdate },
    syncRun: { create: mocks.syncRunCreate, update: mocks.syncRunUpdate },
  },
}));

vi.mock("../../jobs/sync.job", () => ({ runAllConnections: mocks.runAllConnections }));
vi.mock("../../jobs/sync.facebook", () => ({
  syncFacebook: mocks.syncFacebook,
  isAuthError: mocks.isAuthError,
  describeSyncError: mocks.describeSyncError,
}));
vi.mock("../../jobs/sync.tiktok", () => ({ syncTiktok: mocks.syncTiktok }));
vi.mock("../../jobs/sync.shopify", () => ({ syncShopify: mocks.syncShopify }));
vi.mock("../../lib/logger", () => ({
  logger: {
    info: vi.fn(), warn: vi.fn(), error: vi.fn(),
    child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  },
}));

import syncRoutes from "./sync.routes";

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/sync", syncRoutes);
  return app;
}

const originalEnv = process.env.NODE_ENV;
beforeEach(() => {
  vi.clearAllMocks();
  mocks.isAuthError.mockReturnValue(false);
  mocks.describeSyncError.mockReturnValue("upstream borked");
  mocks.callerUserRole = "media_buyer";
});
afterEach(() => {
  process.env.NODE_ENV = originalEnv;
});

describe("POST /api/sync/run — role gating", () => {
  it("rejects clients", async () => {
    const res = await request(makeApp())
      .post("/api/sync/run")
      .set("X-Test-User-Role", "client");
    expect(res.status).toBe(403);
    expect(mocks.connectionFindMany).not.toHaveBeenCalled();
  });

  it("rejects admins (admins manage users, not data)", async () => {
    const res = await request(makeApp())
      .post("/api/sync/run")
      .set("X-Test-User-Role", "admin");
    expect(res.status).toBe(403);
    expect(mocks.connectionFindMany).not.toHaveBeenCalled();
  });
});

describe("POST /api/sync/run — platform filter", () => {
  it("filters by valid platform query param", async () => {
    mocks.connectionFindMany.mockResolvedValueOnce([]);
    await request(makeApp()).post("/api/sync/run?platform=facebook");
    expect(mocks.connectionFindMany).toHaveBeenCalledWith({
      where: { workspaceId: "ws_caller", status: "active", platform: "facebook" },
    });
  });

  it("ignores an unknown platform value (treats as no filter)", async () => {
    mocks.connectionFindMany.mockResolvedValueOnce([]);
    await request(makeApp()).post("/api/sync/run?platform=etsy");
    expect(mocks.connectionFindMany).toHaveBeenCalledWith({
      where: { workspaceId: "ws_caller", status: "active" },
    });
  });

  it("returns an empty result list when the workspace has no active connections", async () => {
    mocks.connectionFindMany.mockResolvedValueOnce([]);
    const res = await request(makeApp()).post("/api/sync/run");
    expect(res.status).toBe(200);
    expect(res.body.results).toEqual([]);
  });
});

describe("POST /api/sync/run — success and failure paths", () => {
  beforeEach(() => {
    mocks.syncRunCreate.mockResolvedValue({ id: "run_1", startedAt: new Date() });
    mocks.syncRunUpdate.mockResolvedValue({});
    mocks.connectionUpdate.mockResolvedValue({});
  });

  it("marks the connection as expired when the adapter throws an auth error", async () => {
    mocks.connectionFindMany.mockResolvedValueOnce([
      { id: "c_fb", platform: "facebook", accountId: "acc_fb" },
    ]);
    mocks.syncFacebook.mockRejectedValueOnce(new Error("401"));
    mocks.isAuthError.mockReturnValue(true);
    mocks.describeSyncError.mockReturnValue("token expired");

    const res = await request(makeApp()).post("/api/sync/run");
    expect(res.status).toBe(200);
    expect(res.body.results[0]).toMatchObject({ ok: false, error: "token expired" });
    // The connection should have been flipped to status: "expired".
    const updateArg = mocks.connectionUpdate.mock.calls.at(-1)?.[0];
    expect(updateArg.data.status).toBe("expired");
  });

  it("does not change connection status when the error is non-auth", async () => {
    mocks.connectionFindMany.mockResolvedValueOnce([
      { id: "c_fb", platform: "facebook", accountId: "acc_fb" },
    ]);
    mocks.syncFacebook.mockRejectedValueOnce(new Error("transient 500"));
    mocks.isAuthError.mockReturnValue(false);

    await request(makeApp()).post("/api/sync/run");
    const updateArg = mocks.connectionUpdate.mock.calls.at(-1)?.[0];
    expect(updateArg.data.status).toBeUndefined();
    expect(updateArg.data.lastSyncOk).toBe(false);
  });

  it("records a successful sync and clears lastSyncError on the connection", async () => {
    mocks.connectionFindMany.mockResolvedValueOnce([
      { id: "c_fb", platform: "facebook", accountId: "acc_fb" },
    ]);
    mocks.syncFacebook.mockResolvedValueOnce({ campaigns: 2, days: 5 });

    const res = await request(makeApp()).post("/api/sync/run");
    expect(res.status).toBe(200);
    expect(res.body.results[0]).toMatchObject({ ok: true, details: { campaigns: 2, days: 5 } });
    const updateArg = mocks.connectionUpdate.mock.calls.at(-1)?.[0];
    expect(updateArg.data.lastSyncOk).toBe(true);
    expect(updateArg.data.lastSyncError).toBeNull();
  });
});

describe("POST /api/sync/run-all", () => {
  it("returns 403 in production mode", async () => {
    process.env.NODE_ENV = "production";
    const res = await request(makeApp()).post("/api/sync/run-all");
    expect(res.status).toBe(403);
    expect(mocks.runAllConnections).not.toHaveBeenCalled();
  });

  it("delegates to runAllConnections in non-production", async () => {
    process.env.NODE_ENV = "development";
    mocks.runAllConnections.mockResolvedValueOnce([{ connectionId: "c1", platform: "facebook", ok: true }]);
    const res = await request(makeApp()).post("/api/sync/run-all");
    expect(res.status).toBe(200);
    expect(res.body.results).toHaveLength(1);
    expect(mocks.runAllConnections).toHaveBeenCalledTimes(1);
  });

  it("rejects non-media-buyers even outside production", async () => {
    process.env.NODE_ENV = "development";
    const res = await request(makeApp())
      .post("/api/sync/run-all")
      .set("X-Test-User-Role", "client");
    expect(res.status).toBe(403);
    expect(mocks.runAllConnections).not.toHaveBeenCalled();
  });
});
