import { Router, Request, Response } from "express";
import { requireAuth, AuthedRequest } from "../../middleware/auth";
import { requireRole } from "../../middleware/requireRole";
import { prisma } from "../../db/client";
import { encrypt } from "../../utils/encryption";
import { signState, verifyState } from "../../utils/oauthState";
import {
  exchangeCodeForToken,
  isValidShopDomain,
  verifyCallbackHmac,
} from "./shopify.service";
import { logger } from "../../lib/logger";

const router = Router();

const SCOPES = "read_orders,read_products,read_analytics";

/** Step 1: build the install URL for a given shop domain. */
router.get("/connect", requireAuth, requireRole("media_buyer"), (req: Request, res: Response) => {
  const { userId, workspaceId } = req as AuthedRequest;
  const shop = String(req.query.shop ?? "");

  if (!isValidShopDomain(shop)) {
    return res.status(400).json({ error: "shop must be a valid *.myshopify.com domain" });
  }

  const params = new URLSearchParams({
    client_id: process.env.SHOPIFY_API_KEY ?? "",
    scope: SCOPES,
    redirect_uri: process.env.SHOPIFY_REDIRECT_URI ?? "",
    state: signState({ userId, workspaceId, provider: "shopify" }),
  });

  res.json({ url: `https://${shop}/admin/oauth/authorize?${params.toString()}` });
});

/** Step 2: Shopify redirects here with code + signed query. */
router.get("/callback", async (req: Request, res: Response) => {
  const query = req.query as Record<string, string | undefined>;
  const { code, shop, state } = query;

  if (typeof code !== "string" || typeof shop !== "string" || typeof state !== "string") {
    return res.status(400).json({ error: "Missing code, shop, or state" });
  }
  if (!isValidShopDomain(shop)) {
    return res.status(400).json({ error: "Invalid shop domain" });
  }
  if (!verifyCallbackHmac(query)) {
    return res.status(400).json({ error: "HMAC verification failed" });
  }

  let userId: string;
  let workspaceId: string;
  try {
    const decoded = verifyState(state);
    if (decoded.provider !== "shopify") throw new Error("provider mismatch");
    userId = decoded.userId;
    workspaceId = decoded.workspaceId;
  } catch {
    return res.status(400).json({ error: "Invalid or expired state" });
  }

  try {
    const accessToken = await exchangeCodeForToken(shop, code);

    await prisma.connection.upsert({
      where: {
        userId_platform_accountId: { userId, platform: "shopify", accountId: shop },
      },
      update: { accessToken: encrypt(accessToken), status: "active", workspaceId },
      create: {
        userId,
        workspaceId,
        platform: "shopify",
        accountId: shop,
        accountName: shop,
        accessToken: encrypt(accessToken),
      },
    });

    res.redirect(`${process.env.FRONTEND_URL}/connections?shopify=connected`);
  } catch (err) {
    logger.error({ err }, "shopify callback failed");
    res.redirect(`${process.env.FRONTEND_URL}/connections?shopify=error`);
  }
});

export default router;
