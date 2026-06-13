import type { Connection } from "@prisma/client";
import { prisma } from "../db/client";
import { fetchOrders } from "../modules/shopify/shopify.service";
import { toNum } from "../lib/numeric";

/** Pull recent Shopify orders for one connection. Only fetches since the last seen order. */
export async function syncShopify(connection: Connection): Promise<{ orders: number }> {
  const latest = await prisma.shopifyOrder.findFirst({
    where: { connectionId: connection.id },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });

  const orders = await fetchOrders(connection, latest?.createdAt ?? undefined);

  for (const order of orders) {
    await prisma.shopifyOrder.upsert({
      where: {
        connectionId_externalId: { connectionId: connection.id, externalId: String(order.id) },
      },
      update: {
        totalPrice: toNum(order.total_price),
        createdAt: new Date(order.created_at),
        raw: order as unknown as object,
      },
      create: {
        connectionId: connection.id,
        externalId: String(order.id),
        totalPrice: toNum(order.total_price),
        createdAt: new Date(order.created_at),
        raw: order as unknown as object,
      },
    });
  }

  return { orders: orders.length };
}
