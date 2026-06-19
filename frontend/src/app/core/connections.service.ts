import { Injectable, inject } from "@angular/core";
import { HttpClient, HttpParams } from "@angular/common/http";
import { firstValueFrom } from "rxjs";
import { environment } from "../../environments/environment";
import {
  Connection,
  ConnectionsResponse,
  ConnectStartRequest,
  ConnectStartResponse,
  Platform,
} from "./models/connection.models";

export interface SyncRunResult {
  connectionId: string;
  platform: string;
  ok: boolean;
  details?: { campaigns?: number; orders?: number } & Record<string, unknown>;
  error?: string;
}

export interface SyncRunResponse {
  ranAt: string;
  results: SyncRunResult[];
}

export interface SyncHistoryRun {
  id: string;
  startedAt: string;
  finishedAt: string | null;
  ok: boolean | null;
  error: string | null;
  campaignCount: number | null;
  insightCount: number | null;
}

@Injectable({ providedIn: "root" })
export class ConnectionsService {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiUrl;

  async list(): Promise<Connection[]> {
    const res = await firstValueFrom(
      this.http.get<ConnectionsResponse>(`${this.api}/connections`)
    );
    return res.connections;
  }

  async disconnect(id: string): Promise<void> {
    await firstValueFrom(this.http.delete(`${this.api}/connections/${id}`));
  }

  async connectStart(platform: Platform, body: ConnectStartRequest): Promise<ConnectStartResponse> {
    return firstValueFrom(
      this.http.post<ConnectStartResponse>(`${this.api}/${platform}/connect-start`, body)
    );
  }

  async getSyncHistory(connectionId: string, limit = 50): Promise<SyncHistoryRun[]> {
    const res = await firstValueFrom(
      this.http.get<{ runs: SyncHistoryRun[] }>(`${this.api}/connections/${connectionId}/syncs?limit=${limit}`)
    );
    return res.runs;
  }

  async syncNow(platform?: Platform): Promise<SyncRunResponse> {
    const params = platform ? new HttpParams().set("platform", platform) : undefined;
    return firstValueFrom(
      this.http.post<SyncRunResponse>(`${this.api}/sync/run`, {}, { params })
    );
  }
}
