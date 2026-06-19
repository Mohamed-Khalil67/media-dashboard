export type Platform = "facebook" | "shopify";

export interface Connection {
  id: string;
  platform: Platform;
  accountId: string;
  accountName: string | null;
  status: "active" | "expired" | "revoked" | "pending";
  createdAt: string;
  tokenExpiresAt: string | null;
  lastSyncAt: string | null;
  lastSyncOk: boolean | null;
  lastSyncError: string | null;
  syncSince: string | null;
  syncUntil: string | null;
}

export interface ConnectionsResponse {
  connections: Connection[];
}

export interface ConnectStartRequest {
  appId: string;
  appSecret: string;
  redirectUri?: string;
  since?: string;
  until?: string;
  shop?: string;
}

export interface ConnectStartResponse {
  url: string;
  connectionId: string;
}
