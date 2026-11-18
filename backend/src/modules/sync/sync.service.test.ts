import { describe, it, expect, vi, beforeEach } from "vitest";

const prismaMock = vi.hoisted(() => ({
  connection: { findMany: vi.fn(), update: vi.fn() },
  syncRun: { create: vi.fn(), update: vi.fn() },
}));
const syncFacebook = vi.hoisted(() => vi.fn());

vi.mock("../../db/client", () => ({ prisma: prismaMock }));
vi.mock("../../lib/logger", () => {
  const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  return { logger: { ...log, child: () => log } };
});
vi.mock("../../jobs/sync.facebook", () => ({
  syncFacebook,
  isAuthError: () => false,
  describeSyncError: (e: unknown) => String(e),
}));
vi.mock("../../jobs/sync.shopify", () => ({ syncShopify: vi.fn() }));

import { SyncService } from "./sync.service";

function conn(id: string, lastSyncAt: Date | null) {
  return { id, platform: "facebook", accountId: `act_${id}`, lastSyncAt };
}
const secondsAgo = (s: number) => new Date(Date.now() - s * 1000);

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.syncRun.create.mockResolvedValue({ id: "run" });
  prismaMock.syncRun.update.mockResolvedValue({});
  prismaMock.connection.update.mockResolvedValue({});
  syncFacebook.mockResolvedValue({ campaigns: 1 });
});

describe("SyncService.runUserConnections", () => {
  it("syncs connections outside the cooldown and skips recent ones", async () => {
    prismaMock.connection.findMany.mockResolvedValue([conn("old", secondsAgo(600)), conn("new", secondsAgo(5)), conn("never", null)]);
    const out = await new SyncService().runUserConnections("u1");
    expect(out.kind).toBe("ok");
    if (out.kind === "ok") expect(out.results.map((r) => r.connectionId)).toEqual(["old", "never"]);
    expect(syncFacebook).toHaveBeenCalledTimes(2);
  });

  it("returns cooldown with the shortest wait when every connection is fresh", async () => {
    prismaMock.connection.findMany.mockResolvedValue([conn("a", secondsAgo(10)), conn("b", secondsAgo(40))]);
    const out = await new SyncService().runUserConnections("u1");
    expect(out).toEqual({ kind: "cooldown", retryAfterSeconds: 20 });
    expect(syncFacebook).not.toHaveBeenCalled();
  });

  it("returns ok with no results when the user has no connections", async () => {
    prismaMock.connection.findMany.mockResolvedValue([]);
    expect(await new SyncService().runUserConnections("u1")).toEqual({ kind: "ok", results: [] });
  });

  it("rejects a second sync for the same user while one is running, and frees it afterwards", async () => {
    let release: () => void = () => {};
    syncFacebook.mockImplementationOnce(() => new Promise((r) => { release = () => r({ campaigns: 1 }); }));
    prismaMock.connection.findMany.mockResolvedValue([conn("a", null)]);
    const svc = new SyncService();

    const first = svc.runUserConnections("u1");
    await vi.waitFor(() => expect(syncFacebook).toHaveBeenCalledTimes(1));
    expect(await svc.runUserConnections("u1")).toEqual({ kind: "busy" });
    // Other users are not blocked.
    expect((await svc.runUserConnections("u2")).kind).toBe("ok");

    release();
    expect((await first).kind).toBe("ok");
    expect((await svc.runUserConnections("u1")).kind).toBe("ok");
  });

  it("scopes the query to the user and platform", async () => {
    prismaMock.connection.findMany.mockResolvedValue([]);
    await new SyncService().runUserConnections("u1", "shopify");
    expect(prismaMock.connection.findMany).toHaveBeenCalledWith({ where: { userId: "u1", status: "active", platform: "shopify" } });
  });
});
