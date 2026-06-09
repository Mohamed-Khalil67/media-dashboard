/**
 * One-off cleanup: deletes all Insight rows belonging to Facebook campaigns.
 *
 * Why: an earlier version of `fetchCampaigns` used `date_preset(last_7d)` without
 * `time_increment(1)`, which stored 7-day aggregates under a single `date = today` row.
 * Summing multiple such rows in the dashboard overcounted spend.
 *
 * The fix is already in place (time_increment(1) + per-day upsert). This script
 * wipes the legacy rows so the next sync writes clean daily data.
 *
 * Run with:
 *   cd backend && npx ts-node-dev --transpile-only scripts/reset-fb-insights.ts
 */
import { prisma } from "../src/db/client";

async function main() {
  const result = await prisma.insight.deleteMany({
    where: { campaign: { connection: { platform: "facebook" } } },
  });
  console.log(`Deleted ${result.count} Facebook insight rows.`);
  console.log("Now POST /api/sync/run (or click 'Sync now' in the dashboard) to repopulate with correct daily data.");
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
