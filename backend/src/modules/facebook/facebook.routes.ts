import { Router, Request, Response } from "express";
import { requireAuth, AuthedRequest } from "../../middleware/auth";
import { prisma } from "../../db/client";
import { encrypt, decrypt } from "../../utils/encryption";
import { signState, verifyState } from "../../utils/oauthState";
import {
  duplicateCampaign,
  exchangeCodeForToken,
  listAdAccounts,
  renameCampaign,
  setCampaignStatus,
  updateCampaignBudget,
  updateCampaignSchedule,
} from "./facebook.service";
import { logger } from "../../lib/logger";

const router = Router();

const GRAPH_VERSION = process.env.FB_GRAPH_VERSION ?? "v21.0";
const SCOPES = "ads_read,ads_management";
const MAX_CAMPAIGN_NAME_LEN = 400;
const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})?)?$/;

function frontendUrl(): string {
  return process.env.FRONTEND_URL ?? "http://localhost:4200";
}

/**
 * Step 1: the user supplies THEIR Facebook developer-app credentials + the
 * historical sync window. We persist a pending Connection row and return the
 * OAuth dialog URL built from THEIR credentials.
 */
router.post("/connect-start", requireAuth, async (req: Request, res: Response) => {
  const { userId } = req as AuthedRequest;
  const { appId, appSecret, redirectUri, since, until } = (req.body ?? {}) as {
    appId?: string; appSecret?: string; redirectUri?: string; since?: string; until?: string;
  };

  if (typeof appId !== "string" || appId.trim().length < 6) {
    return res.status(400).json({ error: "app_id_required" });
  }
  if (typeof appSecret !== "string" || appSecret.trim().length < 16) {
    return res.status(400).json({ error: "app_secret_required" });
  }
  const effectiveRedirect = (typeof redirectUri === "string" && redirectUri.length > 0)
    ? redirectUri
    : `${frontendUrl().replace(/\/$/, "")}/api/facebook/callback`;

  // Persist as a pending connection. We use a synthetic accountId until the
  // callback comes back with real ad-account ids; the (userId, platform,
  // accountId) unique constraint requires a non-null value.
  const placeholderAccountId = `pending_${Date.now()}`;
  const connection = await prisma.connection.create({
    data: {
      userId,
      platform: "facebook",
      accountId: placeholderAccountId,
      accessToken: "",
      status: "pending",
      appId,
      appSecret: encrypt(appSecret),
      redirectUri: effectiveRedirect,
      syncSince: since ? new Date(since) : null,
      syncUntil: until ? new Date(until) : null,
    },
  });

  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: effectiveRedirect,
    scope: SCOPES,
    response_type: "code",
    state: signState({ userId, connectionId: connection.id, provider: "facebook" }),
  });

  res.json({
    connectionId: connection.id,
    url: `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth?${params.toString()}`,
  });
});

/** Step 2: Facebook redirects here. Look up the pending Connection, exchange code, mark active. */
router.get("/callback", async (req: Request, res: Response) => {
  const { code, state, error, error_description } = req.query as Record<string, string | undefined>;

  if (error) {
    return res.redirect(`${frontendUrl()}/connections?facebook=error&reason=${encodeURIComponent(error_description ?? error)}`);
  }
  if (typeof code !== "string" || typeof state !== "string") {
    return res.status(400).json({ error: "Missing code or state" });
  }

  let connectionId: string;
  try {
    const decoded = verifyState(state) as { userId: string; connectionId: string; provider: string };
    if (decoded.provider !== "facebook") throw new Error("provider mismatch");
    connectionId = decoded.connectionId;
  } catch {
    return res.status(400).json({ error: "Invalid or expired state" });
  }

  const pending = await prisma.connection.findUnique({ where: { id: connectionId } });
  if (!pending || pending.platform !== "facebook" || !pending.appId || !pending.appSecret || !pending.redirectUri) {
    return res.status(404).json({ error: "Pending connection not found" });
  }

  try {
    const accessToken = await exchangeCodeForToken(code, {
      appId: pending.appId,
      appSecret: decrypt(pending.appSecret),
      redirectUri: pending.redirectUri,
    });
    const accounts = await listAdAccounts(accessToken);

    if (accounts.length === 0) {
      // Clean up the pending row so the user can retry without "already exists" errors.
      await prisma.connection.delete({ where: { id: pending.id } }).catch(() => {});
      return res.redirect(`${frontendUrl()}/connections?facebook=no_accounts`);
    }

    const encryptedToken = encrypt(accessToken);

    // Replace the pending row with one row per ad account, keeping the same
    // user-supplied credentials so background sync can refresh tokens later.
    await prisma.connection.delete({ where: { id: pending.id } });
    for (const account of accounts) {
      await prisma.connection.upsert({
        where: {
          userId_platform_accountId: { userId: pending.userId, platform: "facebook", accountId: account.id },
        },
        update: {
          accessToken: encryptedToken,
          accountName: account.name,
          status: "active",
          appId: pending.appId,
          appSecret: pending.appSecret,
          redirectUri: pending.redirectUri,
          syncSince: pending.syncSince,
          syncUntil: pending.syncUntil,
        },
        create: {
          userId: pending.userId,
          platform: "facebook",
          accountId: account.id,
          accountName: account.name,
          accessToken: encryptedToken,
          status: "active",
          appId: pending.appId,
          appSecret: pending.appSecret,
          redirectUri: pending.redirectUri,
          syncSince: pending.syncSince,
          syncUntil: pending.syncUntil,
        },
      });
    }

    res.redirect(`${frontendUrl()}/connections?facebook=connected&count=${accounts.length}`);
  } catch (err) {
    logger.error({ err }, "facebook callback failed");
    res.redirect(`${frontendUrl()}/connections?facebook=error`);
  }
});

/** Helper: load a campaign and confirm it belongs to the caller. */
async function loadOwnedCampaign(req: Request, campaignDbId: string) {
  const { userId } = req as AuthedRequest;
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignDbId },
    include: { connection: true },
  });
  if (!campaign || campaign.connection.userId !== userId) return null;
  if (campaign.connection.platform !== "facebook") return "not_facebook";
  return campaign;
}

router.post("/campaigns/:campaignId/status", requireAuth, async (req: Request, res: Response) => {
  const campaignDbId = String(req.params.campaignId);
  const { status } = req.body as { status?: string };
  if (status !== "PAUSED" && status !== "ACTIVE") {
    return res.status(400).json({ error: "Status must be PAUSED or ACTIVE" });
  }
  const campaign = await loadOwnedCampaign(req, campaignDbId);
  if (!campaign) return res.status(404).json({ error: "Campaign not found" });
  if (campaign === "not_facebook") return res.status(400).json({ error: "Only Facebook campaigns" });

  try {
    await setCampaignStatus(campaign.connection, campaign.externalId, status);
    await prisma.campaign.update({ where: { id: campaignDbId }, data: { status } });
    res.json({ ok: true, status });
  } catch (err) {
    logger.error({ err, campaignId: campaignDbId }, "failed to set campaign status");
    res.status(502).json({ error: "Facebook API call failed" });
  }
});

router.patch("/campaigns/:campaignId", requireAuth, async (req: Request, res: Response) => {
  const campaignDbId = String(req.params.campaignId);
  const rawName = (req.body as { name?: unknown })?.name;
  if (typeof rawName !== "string") return res.status(400).json({ error: "name_required" });
  const name = rawName.trim();
  if (name.length === 0) return res.status(400).json({ error: "name_empty" });
  if (name.length > MAX_CAMPAIGN_NAME_LEN) return res.status(400).json({ error: "name_too_long" });

  const campaign = await loadOwnedCampaign(req, campaignDbId);
  if (!campaign) return res.status(404).json({ error: "Campaign not found" });
  if (campaign === "not_facebook") return res.status(400).json({ error: "Only Facebook campaigns" });

  try {
    await renameCampaign(campaign.connection, campaign.externalId, name);
    const updated = await prisma.campaign.update({
      where: { id: campaignDbId },
      data: { name },
      select: { id: true, name: true, status: true },
    });
    res.json({ ok: true, campaign: updated });
  } catch (err) {
    logger.error({ err, campaignId: campaignDbId }, "failed to rename campaign");
    res.status(502).json({ error: "Facebook API call failed" });
  }
});

router.patch("/campaigns/:campaignId/budget", requireAuth, async (req: Request, res: Response) => {
  const campaignDbId = String(req.params.campaignId);
  const body = (req.body ?? {}) as { dailyBudget?: unknown; lifetimeBudget?: unknown };
  const dailyBudget = typeof body.dailyBudget === "number" ? body.dailyBudget : undefined;
  const lifetimeBudget = typeof body.lifetimeBudget === "number" ? body.lifetimeBudget : undefined;
  if (dailyBudget === undefined && lifetimeBudget === undefined) {
    return res.status(400).json({ error: "budget_required" });
  }
  if (dailyBudget !== undefined && (!Number.isFinite(dailyBudget) || dailyBudget < 1)) {
    return res.status(400).json({ error: "invalid_daily_budget" });
  }
  if (lifetimeBudget !== undefined && (!Number.isFinite(lifetimeBudget) || lifetimeBudget < 1)) {
    return res.status(400).json({ error: "invalid_lifetime_budget" });
  }
  const campaign = await loadOwnedCampaign(req, campaignDbId);
  if (!campaign) return res.status(404).json({ error: "Campaign not found" });
  if (campaign === "not_facebook") return res.status(400).json({ error: "Only Facebook campaigns" });

  try {
    await updateCampaignBudget(campaign.connection, campaign.externalId, { dailyBudget, lifetimeBudget });
    res.json({ ok: true, campaignId: campaign.id, dailyBudget: dailyBudget ?? null, lifetimeBudget: lifetimeBudget ?? null });
  } catch (err) {
    logger.error({ err, campaignId: campaignDbId }, "failed to update campaign budget");
    res.status(502).json({ error: "Facebook API call failed" });
  }
});

router.patch("/campaigns/:campaignId/schedule", requireAuth, async (req: Request, res: Response) => {
  const campaignDbId = String(req.params.campaignId);
  const body = (req.body ?? {}) as { startTime?: unknown; endTime?: unknown };
  const startTime = typeof body.startTime === "string" && body.startTime.length > 0 ? body.startTime : undefined;
  const endTime = typeof body.endTime === "string" && body.endTime.length > 0 ? body.endTime : undefined;
  if (!startTime && !endTime) return res.status(400).json({ error: "schedule_required" });
  if (startTime && !ISO_DATETIME.test(startTime)) return res.status(400).json({ error: "invalid_start_time" });
  if (endTime && !ISO_DATETIME.test(endTime)) return res.status(400).json({ error: "invalid_end_time" });
  if (startTime && endTime && new Date(endTime).getTime() < new Date(startTime).getTime()) {
    return res.status(400).json({ error: "end_before_start" });
  }
  const campaign = await loadOwnedCampaign(req, campaignDbId);
  if (!campaign) return res.status(404).json({ error: "Campaign not found" });
  if (campaign === "not_facebook") return res.status(400).json({ error: "Only Facebook campaigns" });

  try {
    await updateCampaignSchedule(campaign.connection, campaign.externalId, { startTime, endTime });
    res.json({ ok: true, campaignId: campaign.id, startTime: startTime ?? null, endTime: endTime ?? null });
  } catch (err) {
    logger.error({ err, campaignId: campaignDbId }, "failed to update campaign schedule");
    res.status(502).json({ error: "Facebook API call failed" });
  }
});

router.post("/campaigns/:campaignId/duplicate", requireAuth, async (req: Request, res: Response) => {
  const campaignDbId = String(req.params.campaignId);
  const body = (req.body ?? {}) as Record<string, unknown>;
  const name = typeof body.name === "string" ? body.name.trim() : undefined;
  const dailyBudget = typeof body.dailyBudget === "number" ? body.dailyBudget : undefined;
  const lifetimeBudget = typeof body.lifetimeBudget === "number" ? body.lifetimeBudget : undefined;
  const startTime = typeof body.startTime === "string" && body.startTime ? body.startTime : undefined;
  const endTime = typeof body.endTime === "string" && body.endTime ? body.endTime : undefined;
  const startPaused = body.startPaused !== false;
  if (name !== undefined && (name.length === 0 || name.length > MAX_CAMPAIGN_NAME_LEN)) {
    return res.status(400).json({ error: "invalid_name" });
  }
  if (dailyBudget !== undefined && (!Number.isFinite(dailyBudget) || dailyBudget < 1)) {
    return res.status(400).json({ error: "invalid_daily_budget" });
  }
  if (lifetimeBudget !== undefined && (!Number.isFinite(lifetimeBudget) || lifetimeBudget < 1)) {
    return res.status(400).json({ error: "invalid_lifetime_budget" });
  }
  if (startTime && !ISO_DATETIME.test(startTime)) return res.status(400).json({ error: "invalid_start_time" });
  if (endTime && !ISO_DATETIME.test(endTime)) return res.status(400).json({ error: "invalid_end_time" });
  if (startTime && endTime && new Date(endTime).getTime() < new Date(startTime).getTime()) {
    return res.status(400).json({ error: "end_before_start" });
  }
  const campaign = await loadOwnedCampaign(req, campaignDbId);
  if (!campaign) return res.status(404).json({ error: "Campaign not found" });
  if (campaign === "not_facebook") return res.status(400).json({ error: "Only Facebook campaigns" });

  try {
    const { newCampaignId } = await duplicateCampaign(campaign.connection, campaign.externalId, {
      name, dailyBudget, lifetimeBudget, startTime, endTime, startPaused,
    });
    const created = await prisma.campaign.upsert({
      where: { connectionId_externalId: { connectionId: campaign.connectionId, externalId: newCampaignId } },
      create: {
        connectionId: campaign.connectionId,
        externalId: newCampaignId,
        name: name ?? `${campaign.name} — copy`,
        status: startPaused ? "PAUSED" : "ACTIVE",
      },
      update: {
        name: name ?? `${campaign.name} — copy`,
        status: startPaused ? "PAUSED" : "ACTIVE",
      },
      select: { id: true, externalId: true, name: true, status: true },
    });
    res.status(201).json({ ok: true, campaign: created });
  } catch (err) {
    logger.error({ err, campaignId: campaignDbId }, "failed to duplicate campaign");
    res.status(502).json({ error: "Facebook API call failed" });
  }
});

export default router;
