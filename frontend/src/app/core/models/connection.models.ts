export type Platform = "facebook" | "tiktok" | "shopify";

export interface Connection {
  id: string;
  platform: Platform;
  accountId: string;
  accountName: string | null;
  status: "active" | "expired" | "revoked";
  createdAt: string;
  tokenExpiresAt: string | null;
}

export interface ConnectionsResponse {
  connections: Connection[];
}

export interface ConnectUrlResponse {
  url: string;
}
