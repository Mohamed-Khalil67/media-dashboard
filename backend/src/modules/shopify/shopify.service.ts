import axios from "axios";
import crypto from "crypto";
import type { Connection } from "@prisma/client";
import { decrypt } from "../../utils/encryption";

const API_VERSION = process.env.SHOPIFY_API_VERSION ?? "2025-01";

export interface ShopifyOrder {
  id: number;
  total_price: string;
  currency: string;
  created_at: string;
  email?: string | null;
  financial_status?: string;
  fulfillment_status?: string | null;
  /** Shopify's human-readable identifier, e.g. "#1023" (without # prefix in `order_number`). */
  order_number?: number;
  name?: string;
  line_items?: Array<{ id?: number; title?: string; sku?: string; quantity?: number; price?: string }>;
  customer?: { email?: string | null; first_name?: string | null; last_name?: string | null } | null;
  shipping_address?: { name?: string | null; city?: string | null; country?: string | null } | null;
  note?: string | null;
}

const SHOP_DOMAIN_RE = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i;

export function isValidShopDomain(shop: string): boolean {
  return typeof shop === "string" && SHOP_DOMAIN_RE.test(shop);
}

/** Verify the HMAC signature Shopify appends to OAuth callbacks. */
export function verifyCallbackHmac(query: Record<string, string | undefined>): boolean {
  const { hmac, ...rest } = query;
  if (typeof hmac !== "string") return false;
  const message = Object.keys(rest)
    .filter((k) => rest[k] !== undefined)
    .sort()
    .map((k) => `${k}=${rest[k]}`)
    .join("&");
  const digest = crypto
    .createHmac("sha256", process.env.SHOPIFY_API_SECRET ?? "")
    .update(message)
    .digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(digest, "utf8"), Buffer.from(hmac, "utf8"));
  } catch {
    return false;
  }
}

export async function exchangeCodeForToken(shop: string, code: string): Promise<string> {
  const res = await axios.post(`https://${shop}/admin/oauth/access_token`, {
    client_id: process.env.SHOPIFY_API_KEY,
    client_secret: process.env.SHOPIFY_API_SECRET,
    code,
  });
  return res.data.access_token as string;
}

/** Paginated fetch of orders via Shopify's Link-header cursor pagination. */
export async function fetchOrders(connection: Connection, since?: Date): Promise<ShopifyOrder[]> {
  const token = decrypt(connection.accessToken);
  const orders: ShopifyOrder[] = [];

  let url: string | null =
    `https://${connection.accountId}/admin/api/${API_VERSION}/orders.json` +
    `?status=any&limit=250` +
    (since ? `&updated_at_min=${since.toISOString()}` : "");

  while (url) {
    const res: { data: { orders: ShopifyOrder[] }; headers: Record<string, string> } = await axios.get(url, {
      headers: { "X-Shopify-Access-Token": token },
    });
    orders.push(...(res.data.orders ?? []));
    url = parseNextLink(res.headers["link"]);
  }

  return orders;
}

/** Shopify pagination uses RFC 5988 Link headers: <url>; rel="next" */
function parseNextLink(linkHeader: string | undefined): string | null {
  if (!linkHeader) return null;
  const match = linkHeader.split(",").find((p) => p.includes('rel="next"'));
  if (!match) return null;
  const urlMatch = match.match(/<([^>]+)>/);
  return urlMatch ? urlMatch[1] : null;
}
