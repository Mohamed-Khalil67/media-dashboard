/**
 * One-off backfill: populates the denormalized columns on existing ShopifyOrder
 * rows by parsing their `raw` JSON. New rows are populated at sync time by
 * `src/jobs/sync.shopify.ts:project`, so this is only needed for rows that
 * predate the migration `add_shopify_order_denormalized_fields`.
 *
 * Idempotent: rerunning is a no-op for rows that have already been backfilled
 * (the script overwrites with the same projected values).
 *
 * Run with:
 *   cd backend && npx ts-node-dev --transpile-only scripts/backfill-shopify-denorm.ts
 */
import { prisma } from "../src/db/client";
import { toNum } from "../src/lib/numeric";

const BATCH = 500;

interface RawOrder {
  total_price?: string;
  currency?: string;
  email?: string | null;
  financial_status?: string;
  fulfillment_status?: string | null;
  order_number?: number;
  name?: string;
  line_items?: Array<{ quantity?: number }>;
  customer?: { email?: string | null } | null;
}

async function main() {
  let cursor: string | undefined = undefined;
  let scanned = 0;
  let updated = 0;

  while (true) {
    const batch = await prisma.shopifyOrder.findMany({
      where: cursor ? { id: { gt: cursor } } : {},
      orderBy: { id: "asc" },
      take: BATCH,
      select: { id: true, raw: true },
    });
    if (batch.length === 0) break;

    for (const row of batch) {
      scanned++;
      const order = (row.raw ?? {}) as RawOrder;
      const lineItemsCount = (order.line_items ?? []).reduce(
        (sum, li) => sum + (typeof li.quantity === "number" ? li.quantity : 0),
        0,
      );
      await prisma.shopifyOrder.update({
        where: { id: row.id },
        data: {
          customerEmail: order.customer?.email ?? order.email ?? null,
          lineItemsCount,
          financialStatus: order.financial_status ?? null,
          fulfillmentStatus: order.fulfillment_status ?? null,
          currency: order.currency ?? null,
          orderNumber: order.name ?? (typeof order.order_number === "number" ? `#${order.order_number}` : null),
          // Re-project total_price too in case it was stored as a string previously.
          totalPrice: typeof order.total_price === "string" ? toNum(order.total_price) : undefined,
        },
      });
      updated++;
    }

    cursor = batch[batch.length - 1].id;
    process.stdout.write(`scanned=${scanned} updated=${updated}\r`);
  }

  console.log(`\nBackfill complete. scanned=${scanned} updated=${updated}`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
