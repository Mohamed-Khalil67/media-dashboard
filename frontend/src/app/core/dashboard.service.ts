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
} from "./models/metrics.models";

@Injectable({ providedIn: "root" })
export class DashboardService {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiUrl;

  getOverview(range: Range): Promise<OverviewKpis> {
    return firstValueFrom(
      this.http.get<OverviewKpis>(`${this.api}/metrics/overview`, {
        params: new HttpParams().set("range", range),
      })
    );
  }

  async getTimeseries(range: Range): Promise<TimeseriesPoint[]> {
    const res = await firstValueFrom(
      this.http.get<TimeseriesResponse>(`${this.api}/metrics/timeseries`, {
        params: new HttpParams().set("range", range),
      })
    );
    return res.points;
  }

  async getCampaigns(range: Range): Promise<CampaignAggregate[]> {
    const res = await firstValueFrom(
      this.http.get<CampaignsResponse>(`${this.api}/metrics/campaigns`, {
        params: new HttpParams().set("range", range),
      })
    );
    return res.campaigns;
  }
}
