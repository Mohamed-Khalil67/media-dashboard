import { Router, Request, Response } from "express";
import { requireAuth, AuthedRequest } from "../../middleware/auth";
import { prisma } from "../../db/client";
import { encrypt } from "../../utils/encryption";
import { signState, verifyState } from "../../utils/oauthState";
import { exchangeAuthCode } from "./tiktok.service";

const router = Router();

const AUTH_URL = "https://business-api.tiktok.com/portal/auth";

/** Step 1: return the TikTok portal auth URL. */
router.get("/connect", requireAuth, (req: Request, res: Response) => {
  const userId = (req as AuthedRequest).userId;
  const params = new URLSearchParams({
    app_id: process.env.TIKTOK_APP_ID ?? "",
    redirect_uri: process.env.TIKTOK_REDIRECT_URI ?? "",
    state: signState({ userId, provider: "tiktok" }),
  });
  res.json({ url: `${AUTH_URL}?${params.toString()}` });
});

/** Step 2: TikTok redirects here with auth_code (NOT "code"). */
router.get("/callback", async (req: Request, res: Response) => {
  const { auth_code, state } = req.query as Record<string, string | undefined>;

  if (typeof auth_code !== "string" || typeof state !== "string") {
    return res.status(400).json({ error: "Missing auth_code or state" });
  }

  let userId: string;
  try {
    const decoded = verifyState(state);
    if (decoded.provider !== "tiktok") throw new Error("provider mismatch");
    userId = decoded.userId;
  } catch {
    return res.status(400).json({ error: "Invalid or expired state" });
  }

  try {
    const { access_token, advertiser_ids } = await exchangeAuthCode(auth_code);

    if (!advertiser_ids?.length) {
      return res.redirect(`${process.env.FRONTEND_URL}/connections?tiktok=no_advertisers`);
    }

    const encrypted = encrypt(access_token);
    for (const advertiserId of advertiser_ids) {
      await prisma.connection.upsert({
        where: {
          userId_platform_accountId: { userId, platform: "tiktok", accountId: advertiserId },
        },
        update: { accessToken: encrypted, status: "active" },
        create: {
          userId,
          platform: "tiktok",
          accountId: advertiserId,
          accountName: `TikTok Advertiser ${advertiserId}`,
          accessToken: encrypted,
        },
      });
    }

    res.redirect(`${process.env.FRONTEND_URL}/connections?tiktok=connected&count=${advertiser_ids.length}`);
  } catch (err) {
    console.error("TikTok callback failed:", err);
    res.redirect(`${process.env.FRONTEND_URL}/connections?tiktok=error`);
  }
});

export default router;
