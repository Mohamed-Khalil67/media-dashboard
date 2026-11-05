export type MetricsRange = "7d" | "14d" | "30d";

export interface MetricsFilterDto {
  range?: MetricsRange;
  since?: string;
  until?: string;
  connectionId?: string;
  platform?: "facebook";
}

export interface ShopifyOrdersQueryDto {
  connectionId?: string;
  limit?: number;
  offset?: number;
  financialStatus?: string;
  fulfillmentStatus?: string;
  search?: string;
  sort?: "date_desc" | "date_asc" | "total_desc" | "total_asc";
}
