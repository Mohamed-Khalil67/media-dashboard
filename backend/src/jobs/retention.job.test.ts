import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mocks = vi.hoisted(() => ({
  executeRawUnsafe: vi.fn(),
}));

vi.mock("../db/client", () => ({
  prisma: { $executeRawUnsafe: mocks.executeRawUnsafe },
}));
vi.mock("../lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { runRetentionSweep } from "./retention.job";

const originalEnv = { ...process.env };
beforeEach(() => {
  vi.clearAllMocks();
  process.env.SYNC_RUN_RETENTION_DAYS = "7";
  process.env.INSIGHT_RETENTION_DAYS = "30";
  process.env.RETENTION_BATCH_SIZE = "1000";
});
afterEach(() => {
  process.env = { ...originalEnv };
});

describe("retention sweeper", () => {
  it("issues batched DELETEs for SyncRun and Insight tables", async () => {
    // First batch returns full size (1000), then a partial → loop exits.
    mocks.executeRawUnsafe.mockResolvedValueOnce(1000).mockResolvedValueOnce(0); // SyncRun: 1 partial-batch + drain
    mocks.executeRawUnsafe.mockResolvedValueOnce(50); // Insight: single partial batch

    const result = await runRetentionSweep();

    expect(result.syncRunsDeleted).toBe(1000);
    expect(result.insightsDeleted).toBe(50);
    // 2 calls for SyncRun batches + 1 for Insight.
    expect(mocks.executeRawUnsafe).toHaveBeenCalledTimes(3);
    expect(mocks.executeRawUnsafe.mock.calls[0]?.[0]).toContain('DELETE FROM "SyncRun"');
    expect(mocks.executeRawUnsafe.mock.calls[2]?.[0]).toContain('DELETE FROM "Insight"');
  });

  it("stops batching once a batch returns fewer rows than the limit", async () => {
    // SyncRun: 500 deleted < 1000 batch size → done.
    mocks.executeRawUnsafe.mockResolvedValueOnce(500); // SyncRun
    mocks.executeRawUnsafe.mockResolvedValueOnce(0);   // Insight

    const result = await runRetentionSweep();
    expect(result.syncRunsDeleted).toBe(500);
    expect(result.insightsDeleted).toBe(0);
    expect(mocks.executeRawUnsafe).toHaveBeenCalledTimes(2);
  });

  it("passes the correct cutoff timestamps", async () => {
    mocks.executeRawUnsafe.mockResolvedValueOnce(0);
    mocks.executeRawUnsafe.mockResolvedValueOnce(0);

    const before = Date.now();
    await runRetentionSweep();
    const after = Date.now();

    const syncCutoff = mocks.executeRawUnsafe.mock.calls[0]?.[1] as Date;
    const insightCutoff = mocks.executeRawUnsafe.mock.calls[1]?.[1] as Date;
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

    expect(syncCutoff.getTime()).toBeGreaterThanOrEqual(before - sevenDaysMs - 50);
    expect(syncCutoff.getTime()).toBeLessThanOrEqual(after - sevenDaysMs + 50);
    expect(insightCutoff.getTime()).toBeGreaterThanOrEqual(before - thirtyDaysMs - 50);
    expect(insightCutoff.getTime()).toBeLessThanOrEqual(after - thirtyDaysMs + 50);
  });
});
