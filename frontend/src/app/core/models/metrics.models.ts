export type Range = "7d" | "14d" | "30d";

export interface OverviewKpis {
  spend: number;
  revenue: number;
  roas: number;
  orders: number;
  aov: number;
  impressions: number;
  clicks: number;
  ctr: number;
  delta: {
    spend: number;
    revenue: number;
    roas: number;
    orders: number;
  };
  previous: {
    spend: number;
    revenue: number;
    roas: number;
    orders: number;
  };
}

export interface TimeseriesPoint {
  date: string;
  spend: number;
  revenue: number;
  roas: number;
}

export interface TimeseriesResponse {
  points: TimeseriesPoint[];
}

export interface CampaignAggregate {
  campaignId: string;
  externalId: string;
  name: string;
  accountName: string;
  connectionId: string;
  platform: "facebook" | "tiktok" | "shopify";
  status: string;
  createdAtPlatform: string | null;
  spend: number;
  impressions: number;
  clicks: number;
  purchases: number;
  revenue: number;
  roas: number;
  frequency: number;
  cpa: number;
  dailySpend: number[];
  dailyRoas: number[];
  deliveryStalled: boolean;
  anomalous: boolean;
}

export interface CampaignsResponse {
  campaigns: CampaignAggregate[];
}

export interface ShopifyOverview {
  revenue: number;
  orders: number;
  aov: number;
  conversionRate: number;
  delta: { revenue: number; orders: number; aov: number };
  previous: { revenue: number; orders: number; aov: number };
}

export interface ShopifyDailyPoint {
  date: string;
  revenue: number;
  orders: number;
}

export interface ShopifyTimeseriesResponse {
  points: ShopifyDailyPoint[];
}
