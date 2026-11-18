import { prisma } from "../../db/client";
import { syncFacebook, isAuthError, describeSyncError } from "../../jobs/sync.facebook";
import { syncShopify } from "../../jobs/sync.shopify";
import { logger } from "../../lib/logger";
import type { Connection } from "@prisma/client";
import { SyncResultDto } from "./dto/sync.dto";

/** A connection synced less than this long ago is skipped by manual sync. */
const MANUAL_SYNC_COOLDOWN_SECONDS = Math.max(0, Number(process.env.MANUAL_SYNC_COOLDOWN_SECONDS ?? 60) || 0);

export type ManualSyncOutcome =
  | { kind: "ok"; results: SyncResultDto[] }
  | { kind: "busy" }
  | { kind: "cooldown"; retryAfterSeconds: number };

export class SyncService {
  /** Users with a manual sync in flight in this process. */
  private readonly inFlight = new Set<string>();

  /**
   * Manual "sync now". Bounded so one account can't hammer Meta/Shopify or
   * exhaust the free-tier database: one manual sync per user at a time, and
   * connections synced within the cooldown are skipped.
   */
  async runUserConnections(userId: string, platformFilter?: "facebook" | "shopify"): Promise<ManualSyncOutcome> {
    if (this.inFlight.has(userId)) return { kind: "busy" };
    this.inFlight.add(userId);
    try {
      const connections = await prisma.connection.findMany({
        where: { userId, status: "active", ...(platformFilter ? { platform: platformFilter } : {}) },
      });
      const now = Date.now();
      const waitSeconds = (c: Connection) =>
        c.lastSyncAt ? Math.ceil(MANUAL_SYNC_COOLDOWN_SECONDS - (now - c.lastSyncAt.getTime()) / 1000) : 0;
      const eligible = connections.filter((c) => waitSeconds(c) <= 0);
      if (connections.length > 0 && eligible.length === 0) {
        return { kind: "cooldown", retryAfterSeconds: Math.max(1, Math.min(...connections.map(waitSeconds))) };
      }
      return { kind: "ok", results: await this.syncList(eligible) };
    } finally {
      this.inFlight.delete(userId);
    }
  }

  private async syncList(connections: Connection[]): Promise<SyncResultDto[]> {
    const results: SyncResultDto[] = [];
    for (const conn of connections) {
      const run = await prisma.syncRun.create({ data: { connectionId: conn.id } });
      const log = logger.child({
        connectionId: conn.id,
        platform: conn.platform,
        accountId: conn.accountId,
        manual: true,
      });

      try {
        let details: { campaigns?: number; days?: number; orders?: number } | undefined;
        if (conn.platform === "facebook") details = await syncFacebook(conn);
        else if (conn.platform === "shopify") details = await syncShopify(conn);

        const finishedAt = new Date();
        await prisma.syncRun.update({
          where: { id: run.id },
          data: {
            finishedAt,
            ok: true,
            campaignCount: details?.campaigns ?? null,
            insightCount: details?.days ?? null,
          },
        });
        await prisma.connection.update({
          where: { id: conn.id },
          data: { lastSyncAt: finishedAt, lastSyncOk: true, lastSyncError: null },
        });
        log.info({ details }, "manual sync ok");
        results.push({ connectionId: conn.id, platform: conn.platform, ok: true, details });
      } catch (err) {
        const message = describeSyncError(err);
        const expired = isAuthError(err);
        const finishedAt = new Date();
        await prisma.syncRun.update({
          where: { id: run.id },
          data: { finishedAt, ok: false, error: message },
        });
        await prisma.connection.update({
          where: { id: conn.id },
          data: {
            lastSyncAt: finishedAt,
            lastSyncOk: false,
            lastSyncError: message,
            ...(expired ? { status: "expired" } : {}),
          },
        });
        log.error({ err, expired }, "manual sync failed");
        results.push({ connectionId: conn.id, platform: conn.platform, ok: false, error: message });
      }
    }
    return results;
  }
}

export const syncService = new SyncService();
