import type { Connection } from "@prisma/client";
import { prisma } from "../db/client";
import { fetchOrders, ShopifyOrder } from "../modules/shopify/shopify.service";
import { toNum } from "../lib/numeric";

/**
 * Project the order payload to the denormalized columns we surface in the
 * orders-list UI. Keeps the upsert blocks below symmetric and gives the
 * backfill script (and any future read paths) a single canonical projection.
 */
function project(order: ShopifyOrder) {
  const lineItemsCount = (order.line_items ?? []).reduce(
    (sum, li) => sum + (typeof li.quantity === "number" ? li.quantity : 0),
    0,
  );
  return {
    totalPrice: toNum(order.total_price),
    createdAt: new Date(order.created_at),
    customerEmail: order.customer?.email ?? order.email ?? null,
    lineItemsCount,
    financialStatus: order.financial_status ?? null,
    fulfillmentStatus: order.fulfillment_status ?? null,
    currency: order.currency ?? null,
    orderNumber: order.name ?? (typeof order.order_number === "number" ? `#${order.order_number}` : null),
  };
}

/** Pull recent Shopify orders for one connection. Only fetches since the last seen order. */
export async function syncShopify(connection: Connection): Promise<{ orders: number }> {
  const latest = await prisma.shopifyOrder.findFirst({
    where: { connectionId: connection.id },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });

  const orders = await fetchOrders(connection, latest?.createdAt ?? undefined);

  for (const order of orders) {
    const fields = project(order);
    await prisma.shopifyOrder.upsert({
      where: {
        connectionId_externalId: { connectionId: connection.id, externalId: String(order.id) },
      },
      update: {
        ...fields,
        raw: order as unknown as object,
      },
      create: {
        connectionId: connection.id,
        externalId: String(order.id),
        ...fields,
        raw: order as unknown as object,
      },
    });
  }

  return { orders: orders.length };
}
