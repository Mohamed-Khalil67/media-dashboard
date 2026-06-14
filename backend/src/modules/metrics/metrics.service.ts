import { prisma } from "../../db/client";

export interface OverviewKpis {
  spend: number;
  revenue: number;
  roas: number;
  orders: number;
  aov: number;
  impressions: number;
  clicks: number;
  ctr: number;
  /** Day-over-day deltas vs the equivalent prior period (e.g. previous 7 days). */
  delta: {
    spend: number;
    revenue: number;
    roas: number;
    orders: number;
  };
  /** Raw values for the prior period — for side-by-side comparison UI. */
  previous: {
    spend: number;
    revenue: number;
    roas: number;
    orders: number;
  };
}

export interface TimeseriesPoint {
  date: string; // YYYY-MM-DD
  spend: number;
  revenue: number;
  roas: number;
}

export interface CampaignAggregate {
  campaignId: string;
  externalId: string;
  name: string;
  accountName: string;
  connectionId: string;
  platform: string;
  status: string;
  createdAtPlatform: string | null; // ISO-8601 date string of when the campaign was created on the platform
  spend: number;
  impressions: number;
  clicks: number;
  purchases: number;
  revenue: number;
  roas: number;
  frequency: number;
  cpa: number; // cost per purchase
  /** Daily spend per day across the range — for sparkline. */
  dailySpend: number[];
  /** Daily ROAS per day across the range — for sparkline / anomaly. */
  dailyRoas: number[];
  /** Whether this campaign appears to have stopped delivering (recent zero-spend days after activity). */
  deliveryStalled: boolean;
  /** True if today's spend is >2σ from this campaign's own rolling baseline. */
  anomalous: boolean;
}

function rangeToDays(range: string): number {
  if (range === "30d") return 30;
  if (range === "14d") return 14;
  return 7;
}

export interface DateWindow {
  since: Date;
  until: Date;
  days: number;
}

/** Resolves either a preset range or a custom since/until pair into a date window. */
export function resolveWindow(range: string, since?: string, until?: string): DateWindow {
  if (since && until) {
    const s = new Date(since);
    s.setUTCHours(0, 0, 0, 0);
    const u = new Date(until);
    u.setUTCHours(0, 0, 0, 0);
    u.setUTCDate(u.getUTCDate() + 1); // exclusive upper bound
    const days = Math.max(1, Math.round((u.getTime() - s.getTime()) / 86_400_000));
    return { since: s, until: u, days };
  }
  const days = rangeToDays(range);
  const until_ = startOfDayUTC(new Date());
  until_.setUTCDate(until_.getUTCDate() + 1);
  const since_ = new Date(until_);
  since_.setUTCDate(since_.getUTCDate() - days);
  return { since: since_, until: until_, days };
}

function startOfDayUTC(d: Date): Date {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}

function safeDiv(num: number, den: number): number {
  return den > 0 ? num / den : 0;
}

function pctDelta(now: number, prev: number): number {
  if (prev === 0) return now === 0 ? 0 : 1;
  return (now - prev) / prev;
}

async function aggregateUserMetrics(workspaceId: string, since: Date, until: Date, connectionId?: string, platform?: string) {
  const connFilter: Record<string, string> = { workspaceId };
  if (connectionId) connFilter.id = connectionId;
  if (platform) connFilter.platform = platform;

  const insights = await prisma.insight.findMany({
    where: {
      date: { gte: since, lt: until },
      campaign: { connection: connFilter },
    },
  });

  const purchases = insights.reduce((s, i) => s + i.purchases, 0);
  const insightSpend = insights.reduce((s, i) => s + i.spend, 0);
  const insightRevenue = insights.reduce((s, i) => s + i.revenue, 0);
  const impressions = insights.reduce((s, i) => s + i.impressions, 0);
  const clicks = insights.reduce((s, i) => s + i.clicks, 0);

  return {
    spend: insightSpend,
    revenue: insightRevenue,
    impressions,
    clicks,
    orders: purchases,
  };
}

export async function getOverview(workspaceId: string, range: string, sinceISO?: string, untilISO?: string, connectionId?: string, platform?: string): Promise<OverviewKpis> {
  const { since, until: now, days } = resolveWindow(range, sinceISO, untilISO);
  const prevSince = new Date(since);
  prevSince.setUTCDate(prevSince.getUTCDate() - days);

  const [current, previous] = await Promise.all([
    aggregateUserMetrics(workspaceId, since, now, connectionId, platform),
    aggregateUserMetrics(workspaceId, prevSince, since, connectionId, platform),
  ]);

  const roas = safeDiv(current.revenue, current.spend);
  const prevRoas = safeDiv(previous.revenue, previous.spend);

  return {
    spend: round(current.spend),
    revenue: round(current.revenue),
    roas: round(roas, 2),
    orders: current.orders,
    aov: round(safeDiv(current.revenue, current.orders), 2),
    impressions: current.impressions,
    clicks: current.clicks,
    ctr: round(safeDiv(current.clicks, current.impressions), 4),
    delta: {
      spend: round(pctDelta(current.spend, previous.spend), 3),
      revenue: round(pctDelta(current.revenue, previous.revenue), 3),
      roas: round(pctDelta(roas, prevRoas), 3),
      orders: round(pctDelta(current.orders, previous.orders), 3),
    },
    previous: {
      spend: round(previous.spend),
      revenue: round(previous.revenue),
      roas: round(prevRoas, 2),
      orders: previous.orders,
    },
  };
}

export async function getTimeseries(workspaceId: string, range: string, connectionId?: string, sinceISO?: string, untilISO?: string, platform?: string): Promise<TimeseriesPoint[]> {
  const { since, until: now, days } = resolveWindow(range, sinceISO, untilISO);

  const connFilter: Record<string, string> = { workspaceId };
  if (connectionId) connFilter.id = connectionId;
  if (platform) connFilter.platform = platform;

  const insights = await prisma.insight.findMany({
    where: { date: { gte: since, lt: now }, campaign: { connection: connFilter } },
    select: { date: true, spend: true, revenue: true },
  });

  const buckets = new Map<string, { spend: number; revenue: number }>();
  for (let i = 0; i < days; i++) {
    const d = new Date(since);
    d.setUTCDate(d.getUTCDate() + i);
    buckets.set(d.toISOString().slice(0, 10), { spend: 0, revenue: 0 });
  }

  for (const i of insights) {
    const key = i.date.toISOString().slice(0, 10);
    const b = buckets.get(key);
    if (b) {
      b.spend += i.spend;
      b.revenue += i.revenue;
    }
  }

  return Array.from(buckets.entries()).map(([date, b]) => ({
    date,
    spend: round(b.spend),
    revenue: round(b.revenue),
    roas: round(safeDiv(b.revenue, b.spend), 2),
  }));
}

export async function getCampaignAggregates(workspaceId: string, range: string, sinceISO?: string, untilISO?: string, connectionId?: string, platform?: string): Promise<CampaignAggregate[]> {
  const { since, until: now } = resolveWindow(range, sinceISO, untilISO);

  const connFilter: Record<string, string> = { workspaceId };
  if (connectionId) connFilter.id = connectionId;
  if (platform) connFilter.platform = platform;
  const where = { connection: connFilter };

  const campaigns = await prisma.campaign.findMany({
    where,
    include: {
      connection: { select: { platform: true, accountName: true } },
      insights: { where: { date: { gte: since, lt: now } } },
    },
  });

  return campaigns
    .map((c) => {
      const spend = c.insights.reduce((s, i) => s + i.spend, 0);
      const impressions = c.insights.reduce((s, i) => s + i.impressions, 0);
      const clicks = c.insights.reduce((s, i) => s + i.clicks, 0);
      const purchases = c.insights.reduce((s, i) => s + i.purchases, 0);
      const revenue = c.insights.reduce((s, i) => s + i.revenue, 0);
      const frequency = impressions > 0
        ? c.insights.reduce((s, i) => s + i.frequency * i.impressions, 0) / impressions
        : 0;

      // Build per-day arrays sorted by date — for sparkline + anomaly + delivery checks.
      const sortedInsights = [...c.insights].sort((a, b) => a.date.getTime() - b.date.getTime());
      const dailySpend = sortedInsights.map((i) => round(i.spend));
      const dailyRoas = sortedInsights.map((i) => round(safeDiv(i.revenue, i.spend), 2));

      // Delivery stalled: had spend in first half of window but last 2 days are zero.
      const half = Math.floor(dailySpend.length / 2);
      const hadEarlyActivity = dailySpend.slice(0, half).some((s) => s > 0);
      const recentZeros = dailySpend.slice(-2).every((s) => s === 0);
      const deliveryStalled = hadEarlyActivity && recentZeros && dailySpend.length >= 3;

      // Anomalous: today's spend is >2σ from baseline (all prior days).
      const anomalous = isAnomalous(dailySpend);

      return {
        campaignId: c.id,
        externalId: c.externalId,
        name: c.name,
        accountName: c.connection.accountName ?? "",
        connectionId: c.connectionId,
        platform: c.connection.platform,
        status: c.status,
        createdAtPlatform: c.createdAtPlatform ? c.createdAtPlatform.toISOString() : null,
        spend: round(spend),
        impressions,
        clicks,
        purchases,
        revenue: round(revenue),
        roas: round(safeDiv(revenue, spend), 2),
        frequency: round(frequency, 2),
        cpa: round(safeDiv(spend, purchases), 2),
        dailySpend,
        dailyRoas,
        deliveryStalled,
        anomalous,
      };
    })
    .filter((c) => c.spend > 0);
}

function isAnomalous(series: number[]): boolean {
  if (series.length < 4) return false;
  const today = series[series.length - 1];
  const baseline = series.slice(0, -1);
  const mean = baseline.reduce((s, v) => s + v, 0) / baseline.length;
  if (mean === 0) return false;
  const variance = baseline.reduce((s, v) => s + (v - mean) ** 2, 0) / baseline.length;
  const std = Math.sqrt(variance);
  if (std === 0) return false;
  return Math.abs(today - mean) > 2 * std;
}

function round(n: number, decimals = 0): number {
  const m = 10 ** decimals;
  return Math.round(n * m) / m;
}

// ── Shopify-specific dashboard ────────────────────────────────────────────────

export interface ShopifyOverview {
  revenue: number;
  orders: number;
  aov: number;
  conversionRate: number; // orders / ad clicks (cross-platform)
  delta: { revenue: number; orders: number; aov: number };
  previous: { revenue: number; orders: number; aov: number };
}

export interface ShopifyDailyPoint {
  date: string;
  revenue: number;
  orders: number;
}

async function aggregateShopify(workspaceId: string, since: Date, until: Date, connectionId?: string) {
  const where: Record<string, unknown> = {
    createdAt: { gte: since, lt: until },
    connection: connectionId ? { workspaceId, id: connectionId } : { workspaceId },
  };
  const orders = await prisma.shopifyOrder.findMany({
    where,
    select: { totalPrice: true, createdAt: true },
  });

  // Ad clicks across all connected platforms — used to compute conversion rate.
  const insights = await prisma.insight.findMany({
    where: { date: { gte: since, lt: until }, campaign: { connection: { workspaceId } } },
    select: { clicks: true },
  });

  const revenue = orders.reduce((s, o) => s + o.totalPrice, 0);
  const ordersCount = orders.length;
  const clicks = insights.reduce((s, i) => s + i.clicks, 0);
  return { revenue, orders: ordersCount, clicks, orderRows: orders };
}

export async function getShopifyOverview(workspaceId: string, range: string, sinceISO?: string, untilISO?: string, connectionId?: string): Promise<ShopifyOverview> {
  const { since, until: now, days } = resolveWindow(range, sinceISO, untilISO);
  const prevSince = new Date(since);
  prevSince.setUTCDate(prevSince.getUTCDate() - days);

  const [current, previous] = await Promise.all([
    aggregateShopify(workspaceId, since, now, connectionId),
    aggregateShopify(workspaceId, prevSince, since, connectionId),
  ]);

  const aov = safeDiv(current.revenue, current.orders);
  const prevAov = safeDiv(previous.revenue, previous.orders);
  const conversionRate = safeDiv(current.orders, current.clicks);

  return {
    revenue: round(current.revenue),
    orders: current.orders,
    aov: round(aov, 2),
    conversionRate: round(conversionRate, 4),
    delta: {
      revenue: round(pctDelta(current.revenue, previous.revenue), 3),
      orders: round(pctDelta(current.orders, previous.orders), 3),
      aov: round(pctDelta(aov, prevAov), 3),
    },
    previous: {
      revenue: round(previous.revenue),
      orders: previous.orders,
      aov: round(prevAov, 2),
    },
  };
}

export async function getShopifyTimeseries(workspaceId: string, range: string, sinceISO?: string, untilISO?: string, connectionId?: string): Promise<ShopifyDailyPoint[]> {
  const { since, until: now, days } = resolveWindow(range, sinceISO, untilISO);
  const orders = await prisma.shopifyOrder.findMany({
    where: {
      createdAt: { gte: since, lt: now },
      connection: connectionId ? { workspaceId, id: connectionId } : { workspaceId },
    },
    select: { createdAt: true, totalPrice: true },
  });

  const buckets = new Map<string, { revenue: number; orders: number }>();
  for (let i = 0; i < days; i++) {
    const d = new Date(since);
    d.setUTCDate(d.getUTCDate() + i);
    buckets.set(d.toISOString().slice(0, 10), { revenue: 0, orders: 0 });
  }
  for (const o of orders) {
    const key = o.createdAt.toISOString().slice(0, 10);
    const b = buckets.get(key);
    if (b) { b.revenue += o.totalPrice; b.orders += 1; }
  }

  return Array.from(buckets.entries()).map(([date, b]) => ({
    date, revenue: round(b.revenue), orders: b.orders,
  }));
}

export interface ShopifyOrderListItem {
  id: string;
  externalId: string;
  orderNumber: string | null;
  customerEmail: string | null;
  totalPrice: number;
  currency: string | null;
  financialStatus: string | null;
  fulfillmentStatus: string | null;
  lineItemsCount: number;
  createdAt: string;
}

export interface ShopifyOrderListResult {
  orders: ShopifyOrderListItem[];
  nextCursor: string | null;
}

/**
 * Paginated, filterable orders list. Used by the Shopify orders page.
 *
 * Pagination is cursor-based on (createdAt DESC, id DESC) so newest orders
 * come first. Pass the previous response's `nextCursor` back as `cursor` to
 * fetch the next page; null `nextCursor` means there are no more orders.
 */
export async function getShopifyOrdersList(
  workspaceId: string,
  opts: {
    connectionId?: string;
    financialStatus?: string;
    q?: string; // matches customerEmail OR externalId OR orderNumber
    limit?: number;
    cursor?: string; // opaque `${ISO}|${id}` token
  } = {},
): Promise<ShopifyOrderListResult> {
  const take = Math.min(Math.max(opts.limit ?? 50, 1), 200);

  // Cursor decoding: encoded as "ISO|id". Anything malformed → ignore (no cursor).
  let cursorCreatedAt: Date | undefined;
  let cursorId: string | undefined;
  if (opts.cursor && typeof opts.cursor === "string") {
    const sep = opts.cursor.indexOf("|");
    if (sep > 0) {
      const t = new Date(opts.cursor.slice(0, sep));
      if (Number.isFinite(t.getTime())) {
        cursorCreatedAt = t;
        cursorId = opts.cursor.slice(sep + 1);
      }
    }
  }

  // (createdAt < cursor.createdAt) OR (createdAt = cursor.createdAt AND id < cursor.id)
  // — i.e. strictly older than the cursor row in descending order.
  const cursorWhere = cursorCreatedAt && cursorId
    ? {
        OR: [
          { createdAt: { lt: cursorCreatedAt } },
          { createdAt: cursorCreatedAt, id: { lt: cursorId } },
        ],
      }
    : {};

  const qWhere = opts.q
    ? {
        OR: [
          { customerEmail: { contains: opts.q, mode: "insensitive" as const } },
          { externalId: { contains: opts.q, mode: "insensitive" as const } },
          { orderNumber: { contains: opts.q, mode: "insensitive" as const } },
        ],
      }
    : {};

  const rows = await prisma.shopifyOrder.findMany({
    where: {
      connection: opts.connectionId ? { workspaceId, id: opts.connectionId } : { workspaceId },
      ...(opts.financialStatus ? { financialStatus: opts.financialStatus } : {}),
      ...qWhere,
      ...cursorWhere,
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: take + 1, // probe for next page
    select: {
      id: true,
      externalId: true,
      orderNumber: true,
      customerEmail: true,
      totalPrice: true,
      currency: true,
      financialStatus: true,
      fulfillmentStatus: true,
      lineItemsCount: true,
      createdAt: true,
    },
  });

  const hasMore = rows.length > take;
  const slice = hasMore ? rows.slice(0, take) : rows;
  const last = slice.at(-1);
  const nextCursor = hasMore && last
    ? `${last.createdAt.toISOString()}|${last.id}`
    : null;

  return {
    orders: slice.map((r) => ({
      id: r.id,
      externalId: r.externalId,
      orderNumber: r.orderNumber,
      customerEmail: r.customerEmail,
      totalPrice: round(r.totalPrice),
      currency: r.currency,
      financialStatus: r.financialStatus,
      fulfillmentStatus: r.fulfillmentStatus,
      lineItemsCount: r.lineItemsCount,
      createdAt: r.createdAt.toISOString(),
    })),
    nextCursor,
  };
}

/**
 * Fetch a single order's full details (the raw payload). Used by the orders
 * page drawer for line-items, addresses, notes.
 */
export async function getShopifyOrderDetail(
  workspaceId: string,
  orderId: string,
): Promise<{ id: string; raw: unknown } | null> {
  const row = await prisma.shopifyOrder.findFirst({
    where: { id: orderId, connection: { workspaceId } },
    select: { id: true, raw: true },
  });
  return row ?? null;
}

export interface TopProductRow {
  title: string;
  sku: string | null;
  units: number;
  revenue: number;
}

/**
 * Top products by revenue within the given range. Reads from ShopifyOrder.raw
 * — line items are not denormalized, so this iterates orders in-memory. Cheap
 * up to a few thousand orders per range; for higher volume we'd materialize a
 * separate ShopifyOrderLineItem table.
 */
export async function getShopifyTopProducts(
  workspaceId: string,
  range: string,
  sinceISO?: string,
  untilISO?: string,
  connectionId?: string,
  limit = 10,
): Promise<TopProductRow[]> {
  const { since, until: now } = resolveWindow(range, sinceISO, untilISO);
  const orders = await prisma.shopifyOrder.findMany({
    where: {
      createdAt: { gte: since, lt: now },
      connection: connectionId ? { workspaceId, id: connectionId } : { workspaceId },
    },
    select: { raw: true },
  });

  const agg = new Map<string, TopProductRow>();
  for (const o of orders) {
    const raw = (o.raw ?? {}) as { line_items?: Array<{ title?: string; sku?: string; quantity?: number; price?: string }> };
    for (const li of raw.line_items ?? []) {
      const title = li.title?.trim() || li.sku || "Unknown item";
      const key = li.sku?.trim() || title; // dedupe by SKU when present, else by title
      const qty = typeof li.quantity === "number" ? li.quantity : 0;
      const price = typeof li.price === "string" ? Number(li.price) : 0;
      const line = qty * (Number.isFinite(price) ? price : 0);
      const existing = agg.get(key);
      if (existing) {
        existing.units += qty;
        existing.revenue += line;
      } else {
        agg.set(key, { title, sku: li.sku ?? null, units: qty, revenue: line });
      }
    }
  }

  return Array.from(agg.values())
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, Math.min(Math.max(limit, 1), 50))
    .map((r) => ({ ...r, revenue: round(r.revenue) }));
}

export interface TopCustomerRow {
  email: string;
  orders: number;
  revenue: number;
}

/**
 * Top customers by spend within the range. Uses the denormalized
 * `customerEmail` column for the aggregate so no JSON parsing is needed.
 */
export async function getShopifyTopCustomers(
  workspaceId: string,
  range: string,
  sinceISO?: string,
  untilISO?: string,
  connectionId?: string,
  limit = 10,
): Promise<TopCustomerRow[]> {
  const { since, until: now } = resolveWindow(range, sinceISO, untilISO);
  const grouped = await prisma.shopifyOrder.groupBy({
    by: ["customerEmail"],
    where: {
      createdAt: { gte: since, lt: now },
      connection: connectionId ? { workspaceId, id: connectionId } : { workspaceId },
      customerEmail: { not: null },
    },
    _count: { _all: true },
    _sum: { totalPrice: true },
    orderBy: { _sum: { totalPrice: "desc" } },
    take: Math.min(Math.max(limit, 1), 50),
  });

  return grouped.map((g) => ({
    email: g.customerEmail ?? "",
    orders: g._count._all,
    revenue: round(g._sum.totalPrice ?? 0),
  }));
}
