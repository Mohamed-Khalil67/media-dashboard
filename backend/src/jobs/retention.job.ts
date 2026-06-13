import { prisma } from "../db/client";
import { logger } from "../lib/logger";

const SYNC_RUN_RETENTION_DAYS = Number(process.env.SYNC_RUN_RETENTION_DAYS ?? 7);
const INSIGHT_RETENTION_DAYS = Number(process.env.INSIGHT_RETENTION_DAYS ?? 30);
const DELETE_BATCH_SIZE = Number(process.env.RETENTION_BATCH_SIZE ?? 1000);

/**
 * Daily sweep: drop sync logs older than SYNC_RUN_RETENTION_DAYS and daily
 * insights older than INSIGHT_RETENTION_DAYS.
 *
 * Implementation notes:
 *  - Deletes are batched (DELETE_BATCH_SIZE rows per round) so we never hold a
 *    long table lock and a runaway query can't pin the connection.
 *  - We use raw SQL with `LIMIT` because Prisma's `deleteMany` has no batch limit
 *    and would lock the whole match set at once on a large table.
 *  - Idempotent: re-running mid-day just no-ops once the candidates are gone.
 */
export interface RetentionResult {
  syncRunsDeleted: number;
  insightsDeleted: number;
  durationMs: number;
}

export async function runRetentionSweep(): Promise<RetentionResult> {
  const t0 = Date.now();
  const syncCutoff = new Date(Date.now() - SYNC_RUN_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const insightCutoff = new Date(Date.now() - INSIGHT_RETENTION_DAYS * 24 * 60 * 60 * 1000);

  const syncRunsDeleted = await deleteInBatches(
    `DELETE FROM "SyncRun" WHERE id IN (SELECT id FROM "SyncRun" WHERE COALESCE("finishedAt", "startedAt") < $1 LIMIT $2)`,
    syncCutoff,
  );

  const insightsDeleted = await deleteInBatches(
    `DELETE FROM "Insight" WHERE id IN (SELECT id FROM "Insight" WHERE "date" < $1 LIMIT $2)`,
    insightCutoff,
  );

  const durationMs = Date.now() - t0;
  logger.info(
    { syncRunsDeleted, insightsDeleted, durationMs, syncCutoff, insightCutoff },
    "retention sweep complete",
  );
  return { syncRunsDeleted, insightsDeleted, durationMs };
}

async function deleteInBatches(sql: string, cutoff: Date): Promise<number> {
  let total = 0;
  // Hard cap iterations so a clock skew or table explosion can never spin forever.
  for (let i = 0; i < 1000; i++) {
    const deleted: number = await prisma.$executeRawUnsafe(sql, cutoff, DELETE_BATCH_SIZE);
    total += deleted;
    if (deleted < DELETE_BATCH_SIZE) break;
  }
  return total;
}
