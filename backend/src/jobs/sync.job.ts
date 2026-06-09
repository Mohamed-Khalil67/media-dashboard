import cron from "node-cron";
import { prisma } from "../db/client";
import { syncFacebook, isAuthError } from "./sync.facebook";
import { syncShopify } from "./sync.shopify";
import { syncTiktok } from "./sync.tiktok";

const SCHEDULE = process.env.SYNC_CRON ?? "*/30 * * * *";

export interface SyncResult {
  connectionId: string;
  platform: string;
  ok: boolean;
  details?: object;
  error?: string;
}

/** Run sync for every active connection. Failures are isolated per connection. */
export async function runAllConnections(): Promise<SyncResult[]> {
  const connections = await prisma.connection.findMany({ where: { status: "active" } });
  const results: SyncResult[] = [];

  for (const conn of connections) {
    try {
      let details: object | undefined;
      if (conn.platform === "facebook") details = await syncFacebook(conn);
      else if (conn.platform === "shopify") details = await syncShopify(conn);
      else if (conn.platform === "tiktok") details = await syncTiktok(conn);
      results.push({ connectionId: conn.id, platform: conn.platform, ok: true, details });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (isAuthError(err)) {
        await prisma.connection.update({ where: { id: conn.id }, data: { status: "expired" } });
      }
      results.push({ connectionId: conn.id, platform: conn.platform, ok: false, error: message });
    }
  }

  return results;
}

export function startSyncJobs(): void {
  if (!cron.validate(SCHEDULE)) {
    throw new Error(`Invalid SYNC_CRON expression: ${SCHEDULE}`);
  }
  cron.schedule(SCHEDULE, async () => {
    const t0 = Date.now();
    const results = await runAllConnections();
    const ok = results.filter((r) => r.ok).length;
    console.log(`[sync] ${ok}/${results.length} connections succeeded in ${Date.now() - t0}ms`);
  });
  console.log(`[sync] cron scheduled: ${SCHEDULE}`);
}
