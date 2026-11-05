import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  syncRunCreate: vi.fn(),
  syncRunUpdate: vi.fn(),
  connectionUpdate: vi.fn(),
  syncFacebook: vi.fn(),
  syncShopify: vi.fn(),
}));

vi.mock("../db/client", () => ({
  prisma: {
    connection: { findMany: mocks.findMany, update: mocks.connectionUpdate },
    syncRun: { create: mocks.syncRunCreate, update: mocks.syncRunUpdate },
  },
}));
vi.mock("../lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: () => ({ info: vi.fn(), error: vi.fn() }) },
}));
vi.mock("./sync.facebook", () => ({
  syncFacebook: mocks.syncFacebook,
  isAuthError: () => false,
  describeSyncError: (e: Error) => e.message,
}));
vi.mock("./sync.shopify", () => ({ syncShopify: mocks.syncShopify }));
vi.mock("./sync.facebook.ads", () => ({ maybeSyncFacebookAds: vi.fn().mockResolvedValue(null) }));
vi.mock("./retention.job", () => ({ runRetentionSweep: vi.fn() }));

import { runAllConnections, syncUserConnections } from "./sync.job";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.syncRunCreate.mockResolvedValue({ id: "run-1", startedAt: new Date() });
  mocks.syncRunUpdate.mockResolvedValue({});
  mocks.connectionUpdate.mockResolvedValue({});
});

describe("sync.job — post-logout ephemeral safety", () => {
  it("runAllConnections returns empty when user has zero connections (post-logout)", async () => {
    mocks.findMany.mockResolvedValueOnce([]);
    const results = await runAllConnections();
    expect(results).toEqual([]);
    expect(mocks.syncFacebook).not.toHaveBeenCalled();
    expect(mocks.syncShopify).not.toHaveBeenCalled();
  });

  it("runAllConnections filters by active status AND user activity window", async () => {
    mocks.findMany.mockResolvedValueOnce([]);
    await runAllConnections();
    const call = mocks.findMany.mock.calls[0]?.[0];
    expect(call?.where.status).toBe("active");
    expect(call?.where.user.lastActiveAt.gte).toBeInstanceOf(Date);
  });

  it("runAllConnections({ force: true }) bypasses the activity gate", async () => {
    mocks.findMany.mockResolvedValueOnce([]);
    await runAllConnections({ force: true });
    const call = mocks.findMany.mock.calls[0]?.[0];
    expect(call?.where.status).toBe("active");
    expect(call?.where.user).toBeUndefined();
  });

  it("syncUserConnections returns [] for a logged-out user (no rows survive the wipe)", async () => {
    mocks.findMany.mockResolvedValueOnce([]);
    const results = await syncUserConnections("user-A");
    expect(results).toEqual([]);
    expect(mocks.syncRunCreate).not.toHaveBeenCalled();
  });

  it("syncUserConnections scopes its lookup to the given userId + active status", async () => {
    mocks.findMany.mockResolvedValueOnce([]);
    await syncUserConnections("user-A");
    expect(mocks.findMany).toHaveBeenCalledWith({
      where: { userId: "user-A", status: "active" },
    });
  });

  it("skips connections synced within the cooldown window", async () => {
    const recent = new Date(Date.now() - 10 * 1000); // 10s ago, well within 90s cooldown
    mocks.findMany.mockResolvedValueOnce([
      { id: "c1", userId: "u1", platform: "facebook", accountId: "act_1", lastSyncAt: recent },
    ]);
    const results = await runAllConnections();
    expect(results).toEqual([]);
    expect(mocks.syncFacebook).not.toHaveBeenCalled();
  });

  it("syncs connections whose last sync is older than the cooldown", async () => {
    const stale = new Date(Date.now() - 10 * 60 * 1000); // 10 minutes ago
    mocks.findMany.mockResolvedValueOnce([
      { id: "c2", userId: "u1", platform: "facebook", accountId: "act_2", lastSyncAt: stale },
    ]);
    mocks.syncFacebook.mockResolvedValueOnce({ campaigns: 3, days: 7 });
    const results = await runAllConnections();
    expect(results).toHaveLength(1);
    expect(results[0]?.ok).toBe(true);
  });
});
