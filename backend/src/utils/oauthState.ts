import jwt from "jsonwebtoken";

const STATE_EXPIRY = "5m";

export interface OAuthState {
  userId: string;
  workspaceId: string;
  provider: "facebook" | "tiktok" | "shopify";
}

export function signState(payload: OAuthState): string {
  return jwt.sign(payload, process.env.JWT_SECRET!, { expiresIn: STATE_EXPIRY });
}

export function verifyState(token: string): OAuthState {
  return jwt.verify(token, process.env.JWT_SECRET!) as OAuthState;
}
