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
}

export interface TimeseriesPoint {
  date: string; // YYYY-MM-DD
  spend: number;
  revenue: number;
  roas: number;
}

export interface CampaignAggregate {
  campaignId: string;
  name: string;
  accountName: string;
  platform: string;
  status: string;
  spend: number;
  impressions: number;
  clicks: number;
  purchases: number;
  revenue: number;
  roas: number;
  frequency: number;
}

function rangeToDays(range: string): number {
  if (range === "30d") return 30;
  if (range === "14d") return 14;
  return 7;
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

async function aggregateUserMetrics(userId: string, since: Date, until: Date) {
  const insights = await prisma.insight.findMany({
    where: {
      date: { gte: since, lt: until },
      campaign: { connection: { userId } },
    },
  });

  const orders = await prisma.shopifyOrder.findMany({
    where: {
      createdAt: { gte: since, lt: until },
      connection: { userId },
    },
    select: { totalPrice: true },
  });

  const insightSpend = insights.reduce((s, i) => s + i.spend, 0);
  const insightRevenue = insights.reduce((s, i) => s + i.revenue, 0);
  const impressions = insights.reduce((s, i) => s + i.impressions, 0);
  const clicks = insights.reduce((s, i) => s + i.clicks, 0);

  const shopifyRevenue = orders.reduce((s, o) => s + o.totalPrice, 0);
  // Prefer Shopify-actual revenue when present (more accurate than platform-attributed).
  const revenue = shopifyRevenue > 0 ? shopifyRevenue : insightRevenue;

  return {
    spend: insightSpend,
    revenue,
    impressions,
    clicks,
    orders: orders.length,
  };
}

export async function getOverview(userId: string, range: string): Promise<OverviewKpis> {
  const days = rangeToDays(range);
  const now = startOfDayUTC(new Date());
  now.setUTCDate(now.getUTCDate() + 1); // exclusive upper bound = tomorrow 00:00
  const since = new Date(now);
  since.setUTCDate(since.getUTCDate() - days);
  const prevSince = new Date(since);
  prevSince.setUTCDate(prevSince.getUTCDate() - days);

  const [current, previous] = await Promise.all([
    aggregateUserMetrics(userId, since, now),
    aggregateUserMetrics(userId, prevSince, since),
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
  };
}

export async function getTimeseries(userId: string, range: string): Promise<TimeseriesPoint[]> {
  const days = rangeToDays(range);
  const now = startOfDayUTC(new Date());
  now.setUTCDate(now.getUTCDate() + 1);
  const since = new Date(now);
  since.setUTCDate(since.getUTCDate() - days);

  const insights = await prisma.insight.findMany({
    where: { date: { gte: since, lt: now }, campaign: { connection: { userId } } },
    select: { date: true, spend: true, revenue: true },
  });
  const orders = await prisma.shopifyOrder.findMany({
    where: { createdAt: { gte: since, lt: now }, connection: { userId } },
    select: { createdAt: true, totalPrice: true },
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
  // Prefer Shopify-actual revenue per day where available.
  for (const o of orders) {
    const key = o.createdAt.toISOString().slice(0, 10);
    const b = buckets.get(key);
    if (b) b.revenue += o.totalPrice;
  }

  return Array.from(buckets.entries()).map(([date, b]) => ({
    date,
    spend: round(b.spend),
    revenue: round(b.revenue),
    roas: round(safeDiv(b.revenue, b.spend), 2),
  }));
}

export async function getCampaignAggregates(userId: string, range: string): Promise<CampaignAggregate[]> {
  const days = rangeToDays(range);
  const now = startOfDayUTC(new Date());
  now.setUTCDate(now.getUTCDate() + 1);
  const since = new Date(now);
  since.setUTCDate(since.getUTCDate() - days);

  const campaigns = await prisma.campaign.findMany({
    where: { connection: { userId } },
    include: {
      connection: { select: { platform: true } },
      insights: { where: { date: { gte: since, lt: now } } },
    },
  });

  return campaigns.map((c) => {
    const spend = c.insights.reduce((s, i) => s + i.spend, 0);
    const impressions = c.insights.reduce((s, i) => s + i.impressions, 0);
    const clicks = c.insights.reduce((s, i) => s + i.clicks, 0);
    const purchases = c.insights.reduce((s, i) => s + i.purchases, 0);
    const revenue = c.insights.reduce((s, i) => s + i.revenue, 0);
    // Average frequency, weighted by impressions.
    const frequency = impressions > 0
      ? c.insights.reduce((s, i) => s + i.frequency * i.impressions, 0) / impressions
      : 0;
    return {
      campaignId: c.id,
      name: c.name,
      platform: c.connection.platform,
      status: c.status,
      spend: round(spend),
      impressions,
      clicks,
      purchases,
      revenue: round(revenue),
      roas: round(safeDiv(revenue, spend), 2),
      frequency: round(frequency, 2),
    };
  });
}

function round(n: number, decimals = 0): number {
  const m = 10 ** decimals;
  return Math.round(n * m) / m;
}
