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
  name: string;
  platform: "facebook" | "tiktok" | "shopify";
  status: string;
  spend: number;
  impressions: number;
  clicks: number;
  purchases: number;
  revenue: number;
  roas: number;
  frequency: number;
}

export interface CampaignsResponse {
  campaigns: CampaignAggregate[];
}
