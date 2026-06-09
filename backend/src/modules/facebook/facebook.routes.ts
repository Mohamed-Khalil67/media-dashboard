import { Router, Request, Response } from "express";
import { requireAuth, AuthedRequest } from "../../middleware/auth";
import { prisma } from "../../db/client";
import { encrypt } from "../../utils/encryption";
import { signState, verifyState } from "../../utils/oauthState";
import { exchangeCodeForToken, listAdAccounts } from "./facebook.service";

const router = Router();

const GRAPH_VERSION = process.env.FB_GRAPH_VERSION ?? "v21.0";
const SCOPES = "ads_read,ads_management";

/** Step 1: return the Facebook OAuth dialog URL for the authenticated user to visit. */
router.get("/connect", requireAuth, (req: Request, res: Response) => {
  const userId = (req as AuthedRequest).userId;
  const params = new URLSearchParams({
    client_id: process.env.FB_APP_ID ?? "",
    redirect_uri: process.env.FB_REDIRECT_URI ?? "",
    scope: SCOPES,
    response_type: "code",
    state: signState({ userId, provider: "facebook" }),
  });
  res.json({ url: `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth?${params.toString()}` });
});

/** Step 2: Facebook redirects here. Exchange code for token, fetch ad accounts, upsert connections. */
router.get("/callback", async (req: Request, res: Response) => {
  const { code, state, error, error_description } = req.query as Record<string, string | undefined>;

  if (error) {
    return res.redirect(`${process.env.FRONTEND_URL}/connections?facebook=error&reason=${encodeURIComponent(error_description ?? error)}`);
  }
  if (typeof code !== "string" || typeof state !== "string") {
    return res.status(400).json({ error: "Missing code or state" });
  }

  let userId: string;
  try {
    const decoded = verifyState(state);
    if (decoded.provider !== "facebook") throw new Error("provider mismatch");
    userId = decoded.userId;
  } catch {
    return res.status(400).json({ error: "Invalid or expired state" });
  }

  try {
    const accessToken = await exchangeCodeForToken(code);
    const accounts = await listAdAccounts(accessToken);

    if (accounts.length === 0) {
      return res.redirect(`${process.env.FRONTEND_URL}/connections?facebook=no_accounts`);
    }

    const encrypted = encrypt(accessToken);
    for (const account of accounts) {
      await prisma.connection.upsert({
        where: {
          userId_platform_accountId: { userId, platform: "facebook", accountId: account.id },
        },
        update: { accessToken: encrypted, accountName: account.name, status: "active" },
        create: {
          userId,
          platform: "facebook",
          accountId: account.id,
          accountName: account.name,
          accessToken: encrypted,
        },
      });
    }

    res.redirect(`${process.env.FRONTEND_URL}/connections?facebook=connected&count=${accounts.length}`);
  } catch (err) {
    console.error("Facebook callback failed:", err);
    res.redirect(`${process.env.FRONTEND_URL}/connections?facebook=error`);
  }
});

export default router;
