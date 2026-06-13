import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  connectionFindMany: vi.fn(),
  syncRunCreate: vi.fn(),
  syncRunUpdate: vi.fn(),
  connectionUpdate: vi.fn(),
  syncFacebook: vi.fn(),
  syncShopify: vi.fn(),
  syncTiktok: vi.fn(),
  isAuthError: vi.fn().mockReturnValue(false),
  describeSyncError: vi.fn().mockReturnValue("err"),
}));

vi.mock("../db/client", () => ({
  prisma: {
    connection: { findMany: mocks.connectionFindMany, update: mocks.connectionUpdate },
    syncRun: { create: mocks.syncRunCreate, update: mocks.syncRunUpdate },
  },
}));

vi.mock("./sync.facebook", () => ({
  syncFacebook: mocks.syncFacebook,
  isAuthError: mocks.isAuthError,
  describeSyncError: mocks.describeSyncError,
}));
vi.mock("./sync.shopify", () => ({ syncShopify: mocks.syncShopify }));
vi.mock("./sync.tiktok", () => ({ syncTiktok: mocks.syncTiktok }));
vi.mock("./retention.job", () => ({ runRetentionSweep: vi.fn() }));
vi.mock("../lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  },
}));

import { runAllConnections, syncUserConnections } from "./sync.job";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isAuthError.mockReturnValue(false);
  mocks.describeSyncError.mockReturnValue("upstream borked");
  // Make every syncRun.create return a usable id + startedAt so syncSingle's
  // duration calculation doesn't NaN out.
  mocks.syncRunCreate.mockResolvedValue({ id: "run_1", startedAt: new Date() });
  mocks.syncRunUpdate.mockResolvedValue({});
  mocks.connectionUpdate.mockResolvedValue({});
});

describe("runAllConnections — activity gate", () => {
  it("filters out idle users by default", async () => {
    mocks.connectionFindMany.mockResolvedValueOnce([]);
    await runAllConnections();
    // The where clause must include the user-activity filter when not forced.
    const arg = mocks.connectionFindMany.mock.calls[0][0];
    expect(arg.where.status).toBe("active");
    expect(arg.where.user).toBeDefined();
    expect(arg.where.user.lastActiveAt.gte).toBeInstanceOf(Date);
  });

  it("drops the activity filter when force is true", async () => {
    mocks.connectionFindMany.mockResolvedValueOnce([]);
    await runAllConnections({ force: true });
    const arg = mocks.connectionFindMany.mock.calls[0][0];
    expect(arg.where.user).toBeUndefined();
    expect(arg.where.status).toBe("active");
  });
});

describe("syncUserConnections — per-user scope", () => {
  it("scopes the query to the requested user and skips work when they have no connections", async () => {
    mocks.connectionFindMany.mockResolvedValueOnce([]);
    const results = await syncUserConnections("u_42");
    expect(results).toEqual([]);
    expect(mocks.connectionFindMany).toHaveBeenCalledWith({
      where: { userId: "u_42", status: "active" },
    });
    expect(mocks.syncRunCreate).not.toHaveBeenCalled();
  });

  it("invokes the platform adapter for each connection owned by the user", async () => {
    mocks.connectionFindMany.mockResolvedValueOnce([
      { id: "c_fb", platform: "facebook", accountId: "acc_fb", userId: "u_42" },
    ]);
    mocks.syncFacebook.mockResolvedValueOnce({ campaigns: 3, days: 7 });
    const results = await syncUserConnections("u_42", { reason: "test" });
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ connectionId: "c_fb", platform: "facebook", ok: true });
    expect(mocks.syncFacebook).toHaveBeenCalledOnce();
  });
});

describe("syncSingle error classification", () => {
  it("marks the connection expired when isAuthError says the failure is an auth one", async () => {
    mocks.connectionFindMany.mockResolvedValueOnce([
      { id: "c_fb", platform: "facebook", accountId: "acc_fb", userId: "u_1" },
    ]);
    mocks.syncFacebook.mockRejectedValueOnce(new Error("401 unauthorized"));
    mocks.isAuthError.mockReturnValue(true);
    mocks.describeSyncError.mockReturnValue("token expired");

    const results = await syncUserConnections("u_1");

    expect(results[0].ok).toBe(false);
    expect(mocks.connectionUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "expired", lastSyncOk: false, lastSyncError: "token expired" }),
      }),
    );
  });

  it("does NOT change connection status when the failure is not auth-related", async () => {
    mocks.connectionFindMany.mockResolvedValueOnce([
      { id: "c_fb", platform: "facebook", accountId: "acc_fb", userId: "u_1" },
    ]);
    mocks.syncFacebook.mockRejectedValueOnce(new Error("transient 500"));
    mocks.isAuthError.mockReturnValue(false);

    await syncUserConnections("u_1");

    const updateArg = mocks.connectionUpdate.mock.calls.at(-1)?.[0];
    expect(updateArg.data.status).toBeUndefined();
    expect(updateArg.data.lastSyncOk).toBe(false);
  });
});
