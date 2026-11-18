import { Injectable, inject } from "@angular/core";
import { HttpClient, HttpErrorResponse, HttpParams } from "@angular/common/http";
import { firstValueFrom } from "rxjs";
import { environment } from "../../environments/environment";
import {
  Connection,
  ConnectionsResponse,
  ConnectStartRequest,
  ConnectStartResponse,
  Platform,
} from "./models/connection.models";

/** The API's human-readable `message` (or, failing that, its `error` code) from an HTTP error. */
export function apiErrorMessage(err: unknown): string | null {
  if (!(err instanceof HttpErrorResponse)) return null;
  const body: unknown = err.error;
  if (typeof body !== "object" || body === null) return null;
  if ("message" in body && typeof body.message === "string") return body.message;
  if ("error" in body && typeof body.error === "string") return body.error;
  return null;
}

/**
 * The server's explanation when "sync now" is refused (429: a sync is already
 * running, or the accounts synced moments ago). Null for any other failure.
 */
export function syncRefusedMessage(err: unknown): string | null {
  if (!(err instanceof HttpErrorResponse) || err.status !== 429) return null;
  const body: unknown = err.error;
  if (typeof body === "object" && body !== null && "message" in body && typeof body.message === "string") {
    return body.message;
  }
  return "Synced moments ago. Try again in a minute.";
}

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
