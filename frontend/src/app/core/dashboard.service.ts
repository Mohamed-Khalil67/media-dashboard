import { Injectable, inject } from "@angular/core";
import { HttpClient, HttpParams } from "@angular/common/http";
import { firstValueFrom } from "rxjs";
import { environment } from "../../environments/environment";
import {
  CampaignAggregate,
  CampaignsResponse,
  OverviewKpis,
  Range,
  TimeseriesPoint,
  TimeseriesResponse,
  ShopifyOverview,
  ShopifyDailyPoint,
  ShopifyTimeseriesResponse,
  ShopifyOrdersListResponse,
  ShopifyOrderDetail,
  ShopifyTopProduct,
  ShopifyTopCustomer,
  ShopifyOrdersSummary,
} from "./models/metrics.models";

export type AdPlatform = "facebook";

export interface QueryOpts {
  since?: string;
  until?: string;
  connectionId?: string;
  platform?: AdPlatform;
}

@Injectable({ providedIn: "root" })
export class DashboardService {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiUrl;

  private buildParams(range: Range, opts?: QueryOpts): HttpParams {
    let p = new HttpParams().set("range", range);
    if (opts?.since && opts?.until) p = p.set("since", opts.since).set("until", opts.until);
    if (opts?.connectionId) p = p.set("connectionId", opts.connectionId);
    if (opts?.platform) p = p.set("platform", opts.platform);
    return p;
  }

  getOverview(range: Range, opts?: QueryOpts): Promise<OverviewKpis> {
    return firstValueFrom(
      this.http.get<OverviewKpis>(`${this.api}/metrics/overview`, { params: this.buildParams(range, opts) })
    );
  }

  async getTimeseries(range: Range, connectionId?: string, opts?: QueryOpts): Promise<TimeseriesPoint[]> {
    const res = await firstValueFrom(
      this.http.get<TimeseriesResponse>(`${this.api}/metrics/timeseries`, {
        params: this.buildParams(range, { ...opts, connectionId }),
      })
    );
    return res.points;
  }

  async getCampaigns(range: Range, opts?: QueryOpts): Promise<CampaignAggregate[]> {
    const res = await firstValueFrom(
      this.http.get<CampaignsResponse>(`${this.api}/metrics/campaigns`, { params: this.buildParams(range, opts) })
    );
    return res.campaigns;
  }

  getShopifyOverview(range: Range, opts?: QueryOpts): Promise<ShopifyOverview> {
    return firstValueFrom(
      this.http.get<ShopifyOverview>(`${this.api}/metrics/shopify/overview`, { params: this.buildParams(range, opts) })
    );
  }

  async getShopifyTimeseries(range: Range, opts?: QueryOpts): Promise<ShopifyDailyPoint[]> {
    const res = await firstValueFrom(
      this.http.get<ShopifyTimeseriesResponse>(`${this.api}/metrics/shopify/timeseries`, {
        params: this.buildParams(range, opts),
      })
    );
    return res.points;
  }

  /**
   * Paginated orders list for the Shopify orders page. `nextCursor` is opaque —
   * pass it back as-is to fetch the next page; null means no more pages.
   */
  async getShopifyOrdersList(opts: {
    connectionId?: string;
    status?: string;
    q?: string;
    limit?: number;
    cursor?: string;
  } = {}): Promise<ShopifyOrdersListResponse> {
    let params = new HttpParams();
    if (opts.connectionId) params = params.set("connectionId", opts.connectionId);
    if (opts.status) params = params.set("status", opts.status);
    if (opts.q) params = params.set("q", opts.q);
    if (opts.limit) params = params.set("limit", String(opts.limit));
    if (opts.cursor) params = params.set("cursor", opts.cursor);
    return firstValueFrom(this.http.get<ShopifyOrdersListResponse>(`${this.api}/metrics/shopify/orders`, { params }));
  }

  /** Fetch a single order's raw payload (for the drawer). */
  async getShopifyOrderDetail(id: string): Promise<ShopifyOrderDetail> {
    return firstValueFrom(this.http.get<ShopifyOrderDetail>(`${this.api}/metrics/shopify/orders/${id}`));
  }

  async getShopifyTopProducts(range: Range, opts: { connectionId?: string; since?: string; until?: string } = {}, limit = 10): Promise<ShopifyTopProduct[]> {
    let params = new HttpParams().set("range", range).set("limit", String(limit));
    if (opts.connectionId) params = params.set("connectionId", opts.connectionId);
    if (opts.since) params = params.set("since", opts.since);
    if (opts.until) params = params.set("until", opts.until);
    const res = await firstValueFrom(this.http.get<{ products: ShopifyTopProduct[] }>(`${this.api}/metrics/shopify/top-products`, { params }));
    return res.products;
  }

  async getShopifyTopCustomers(range: Range, opts: { connectionId?: string; since?: string; until?: string } = {}, limit = 10): Promise<ShopifyTopCustomer[]> {
    let params = new HttpParams().set("range", range).set("limit", String(limit));
    if (opts.connectionId) params = params.set("connectionId", opts.connectionId);
    if (opts.since) params = params.set("since", opts.since);
    if (opts.until) params = params.set("until", opts.until);
    const res = await firstValueFrom(this.http.get<{ customers: ShopifyTopCustomer[] }>(`${this.api}/metrics/shopify/top-customers`, { params }));
    return res.customers;
  }

  async getShopifyOrdersSummary(opts: { connectionId?: string; since?: string; until?: string } = {}): Promise<ShopifyOrdersSummary> {
    let params = new HttpParams();
    if (opts.connectionId) params = params.set("connectionId", opts.connectionId);
    if (opts.since) params = params.set("since", opts.since);
    if (opts.until) params = params.set("until", opts.until);
    return firstValueFrom(this.http.get<ShopifyOrdersSummary>(`${this.api}/metrics/shopify/orders-summary`, { params }));
  }

  async setCampaignStatus(campaignId: string, status: "PAUSED" | "ACTIVE"): Promise<void> {
    await firstValueFrom(
      this.http.post(`${this.api}/facebook/campaigns/${campaignId}/status`, { status })
    );
  }

  /**
   * Rename a Facebook campaign. Returns the persisted DB row so the table can
   * patch its in-memory copy without a full reload.
   */
  async renameCampaign(campaignId: string, name: string): Promise<{ id: string; name: string; status: string }> {
    const res = await firstValueFrom(
      this.http.patch<{ ok: boolean; campaign: { id: string; name: string; status: string } }>(
        `${this.api}/facebook/campaigns/${campaignId}`,
        { name },
      ),
    );
    return res.campaign;
  }

  /**
   * Update daily / lifetime budget of a Facebook campaign. Values are in major
   * units (dollars, EGP, etc.). The backend converts to minor units for Graph API.
   */
  async updateCampaignBudget(
    campaignId: string,
    budget: { dailyBudget?: number; lifetimeBudget?: number },
  ): Promise<void> {
    await firstValueFrom(
      this.http.patch(`${this.api}/facebook/campaigns/${campaignId}/budget`, budget),
    );
  }

  /**
   * Update start / end times of a Facebook campaign. Either or both may be set.
   * Pass ISO-8601 date or datetime strings.
   */
  async updateCampaignSchedule(
    campaignId: string,
    schedule: { startTime?: string; endTime?: string },
  ): Promise<void> {
    await firstValueFrom(
      this.http.patch(`${this.api}/facebook/campaigns/${campaignId}/schedule`, schedule),
    );
  }

  /**
   * Duplicate a Facebook campaign. The clone starts PAUSED by default so a
   * mis-click can't burn budget. Returns the new campaign row from our DB.
   */
  async duplicateCampaign(
    campaignId: string,
    overrides: {
      name?: string;
      dailyBudget?: number;
      lifetimeBudget?: number;
      startTime?: string;
      endTime?: string;
      startPaused?: boolean;
    },
  ): Promise<{ id: string; externalId: string; name: string; status: string }> {
    const res = await firstValueFrom(
      this.http.post<{ ok: boolean; campaign: { id: string; externalId: string; name: string; status: string } }>(
        `${this.api}/facebook/campaigns/${campaignId}/duplicate`,
        overrides,
      ),
    );
    return res.campaign;
  }
}
