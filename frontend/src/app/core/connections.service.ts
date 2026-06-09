import { Injectable, inject } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { firstValueFrom } from "rxjs";
import { environment } from "../../environments/environment";
import {
  Connection,
  ConnectionsResponse,
  ConnectUrlResponse,
  Platform,
} from "./models/connection.models";

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

  async getConnectUrl(platform: Platform, params?: Record<string, string>): Promise<string> {
    const query = params ? "?" + new URLSearchParams(params).toString() : "";
    const res = await firstValueFrom(
      this.http.get<ConnectUrlResponse>(`${this.api}/${platform}/connect${query}`)
    );
    return res.url;
  }

  async syncNow(): Promise<unknown> {
    return firstValueFrom(this.http.post(`${this.api}/sync/run`, {}));
  }
}
