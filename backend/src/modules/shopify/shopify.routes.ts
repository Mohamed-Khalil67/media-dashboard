import { Router, Request, Response } from "express";
import { requireAuth, AuthedRequest } from "../../middleware/auth";
import { prisma } from "../../db/client";
import { encrypt, decrypt } from "../../utils/encryption";
import { signState, verifyState } from "../../utils/oauthState";
import { parseSyncWindow } from "../../utils/syncWindow";
import {
  exchangeCodeForToken,
  isValidShopDomain,
  verifyCallbackHmac,
} from "./shopify.service";
import { logger } from "../../lib/logger";

const router = Router();

const SCOPES = "read_orders,read_products,read_analytics";

function frontendUrl(): string {
  return process.env.FRONTEND_URL ?? "http://localhost:4200";
}

/**
 * Step 1: user supplies THEIR Shopify custom-app credentials + shop domain +
 * historical sync window. We persist a pending Connection and return the
 * OAuth authorize URL built from THEIR API key.
 */
router.post("/connect-start", requireAuth, async (req: Request, res: Response) => {
  const { userId } = req as AuthedRequest;
  const { apiKey, apiSecret, redirectUri, shop, since, until } = (req.body ?? {}) as {
    apiKey?: string; apiSecret?: string; redirectUri?: string; shop?: string; since?: string; until?: string;
  };

  if (typeof shop !== "string" || !isValidShopDomain(shop)) {
    return res.status(400).json({ error: "shop must be a valid *.myshopify.com domain" });
  }
  if (typeof apiKey !== "string" || apiKey.trim().length < 16) {
    return res.status(400).json({ error: "api_key_required" });
  }
  if (typeof apiSecret !== "string" || apiSecret.trim().length < 16) {
    return res.status(400).json({ error: "api_secret_required" });
  }
  const window = parseSyncWindow(since, until);
  if (!window.ok) {
    return res.status(400).json({ error: "invalid_sync_window", message: window.error });
  }
  const { since: syncSince, until: syncUntil } = window.value;
  const effectiveRedirect = (typeof redirectUri === "string" && redirectUri.length > 0)
    ? redirectUri
    : `${frontendUrl().replace(/\/$/, "")}/api/shopify/callback`;

  // Persist as pending so the callback can find these credentials.
  const connection = await prisma.connection.upsert({
    where: { userId_platform_accountId: { userId, platform: "shopify", accountId: shop } },
    update: {
      status: "pending",
      appId: apiKey,
      appSecret: encrypt(apiSecret),
      redirectUri: effectiveRedirect,
      syncSince,
      syncUntil,
    },
    create: {
      userId,
      platform: "shopify",
      accountId: shop,
      accountName: shop,
      accessToken: "",
      status: "pending",
      appId: apiKey,
      appSecret: encrypt(apiSecret),
      redirectUri: effectiveRedirect,
      syncSince,
      syncUntil,
    },
  });

  const params = new URLSearchParams({
    client_id: apiKey,
    scope: SCOPES,
    redirect_uri: effectiveRedirect,
    state: signState({ userId, connectionId: connection.id, provider: "shopify" }),
  });
  res.json({ connectionId: connection.id, url: `https://${shop}/admin/oauth/authorize?${params.toString()}` });
});

router.get("/callback", async (req: Request, res: Response) => {
  const query = req.query as Record<string, string | undefined>;
  const { code, shop, state } = query;

  if (typeof code !== "string" || typeof shop !== "string" || typeof state !== "string") {
    return res.status(400).json({ error: "Missing code, shop, or state" });
  }
  if (!isValidShopDomain(shop)) {
    return res.status(400).json({ error: "Invalid shop domain" });
  }

  let connectionId: string;
  try {
    const decoded = verifyState(state) as { userId: string; connectionId: string; provider: string };
    if (decoded.provider !== "shopify") throw new Error("provider mismatch");
    connectionId = decoded.connectionId;
  } catch {
    return res.status(400).json({ error: "Invalid or expired state" });
  }

  const pending = await prisma.connection.findUnique({ where: { id: connectionId } });
  if (!pending || pending.platform !== "shopify" || !pending.appId || !pending.appSecret) {
    return res.status(404).json({ error: "Pending connection not found" });
  }
  const decryptedSecret = decrypt(pending.appSecret);
  if (!verifyCallbackHmac(query, decryptedSecret)) {
    return res.status(400).json({ error: "HMAC verification failed" });
  }

  try {
    const accessToken = await exchangeCodeForToken(shop, code, {
      apiKey: pending.appId,
      apiSecret: decryptedSecret,
    });
    await prisma.connection.update({
      where: { id: pending.id },
      data: { accessToken: encrypt(accessToken), status: "active" },
    });
    res.redirect(`${frontendUrl()}/connections?shopify=connected`);
  } catch (err) {
    logger.error({ err }, "shopify callback failed");
    res.redirect(`${frontendUrl()}/connections?shopify=error`);
  }
});

export default router;
