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
} from "./models/metrics.models";

export type AdPlatform = "facebook" | "tiktok";

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

  async setCampaignStatus(campaignId: string, status: "PAUSED" | "ACTIVE"): Promise<void> {
    await firstValueFrom(
      this.http.post(`${this.api}/facebook/campaigns/${campaignId}/status`, { status })
    );
  }
}
