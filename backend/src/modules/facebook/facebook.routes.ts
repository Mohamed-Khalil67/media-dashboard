import { Router, Request, Response } from "express";
import { requireAuth, AuthedRequest } from "../../middleware/auth";
import { requireRole } from "../../middleware/requireRole";
import { prisma } from "../../db/client";
import { encrypt } from "../../utils/encryption";
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

/** Step 1: return the Facebook OAuth dialog URL for the authenticated user to visit. */
router.get("/connect", requireAuth, requireRole("media_buyer"), (req: Request, res: Response) => {
  const { userId, workspaceId } = req as AuthedRequest;
  const params = new URLSearchParams({
    client_id: process.env.FB_APP_ID ?? "",
    redirect_uri: process.env.FB_REDIRECT_URI ?? "",
    scope: SCOPES,
    response_type: "code",
    state: signState({ userId, workspaceId, provider: "facebook" }),
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
  let workspaceId: string;
  try {
    const decoded = verifyState(state);
    if (decoded.provider !== "facebook") throw new Error("provider mismatch");
    userId = decoded.userId;
    workspaceId = decoded.workspaceId;
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
        update: { accessToken: encrypted, accountName: account.name, status: "active", workspaceId },
        create: {
          userId,
          workspaceId,
          platform: "facebook",
          accountId: account.id,
          accountName: account.name,
          accessToken: encrypted,
        },
      });
    }

    res.redirect(`${process.env.FRONTEND_URL}/connections?facebook=connected&count=${accounts.length}`);
  } catch (err) {
    logger.error({ err }, "facebook callback failed");
    res.redirect(`${process.env.FRONTEND_URL}/connections?facebook=error`);
  }
});

/** POST /api/facebook/campaigns/:campaignId/status — pause or resume a campaign. */
router.post("/campaigns/:campaignId/status", requireAuth, requireRole("media_buyer"), async (req: Request, res: Response) => {
  const { workspaceId } = req as AuthedRequest;
  const campaignDbId = String(req.params.campaignId);
  const { status } = req.body as { status?: string };

  if (status !== "PAUSED" && status !== "ACTIVE") {
    return res.status(400).json({ error: "Status must be PAUSED or ACTIVE" });
  }

  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignDbId },
    include: { connection: true },
  });

  if (!campaign || campaign.connection.workspaceId !== workspaceId) {
    return res.status(404).json({ error: "Campaign not found" });
  }
  if (campaign.connection.platform !== "facebook") {
    return res.status(400).json({ error: "Only Facebook campaigns can be paused via this endpoint" });
  }

  try {
    await setCampaignStatus(campaign.connection, campaign.externalId, status);
    await prisma.campaign.update({ where: { id: campaignDbId }, data: { status } });
    res.json({ ok: true, status });
  } catch (err) {
    logger.error({ err, campaignId: campaignDbId }, "failed to set campaign status");
    res.status(502).json({ error: "Facebook API call failed" });
  }
});

const MAX_CAMPAIGN_NAME_LEN = 400;

/** PATCH /api/facebook/campaigns/:campaignId — rename a campaign. */
router.patch("/campaigns/:campaignId", requireAuth, requireRole("media_buyer"), async (req: Request, res: Response) => {
  const { workspaceId } = req as AuthedRequest;
  const campaignDbId = String(req.params.campaignId);
  const rawName = (req.body as { name?: unknown })?.name;

  if (typeof rawName !== "string") {
    return res.status(400).json({ error: "name_required" });
  }
  const name = rawName.trim();
  if (name.length === 0) {
    return res.status(400).json({ error: "name_empty" });
  }
  if (name.length > MAX_CAMPAIGN_NAME_LEN) {
    return res.status(400).json({ error: "name_too_long", message: `Max ${MAX_CAMPAIGN_NAME_LEN} characters.` });
  }

  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignDbId },
    include: { connection: true },
  });

  if (!campaign || campaign.connection.workspaceId !== workspaceId) {
    return res.status(404).json({ error: "Campaign not found" });
  }
  if (campaign.connection.platform !== "facebook") {
    return res.status(400).json({ error: "Only Facebook campaigns can be renamed via this endpoint" });
  }

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

/**
 * PATCH /api/facebook/campaigns/:campaignId/budget — update daily / lifetime budget.
 *
 * Body shape: `{ dailyBudget?: number, lifetimeBudget?: number }`. At least one
 * must be present. Values are in major units (dollars, EGP, etc.); the service
 * layer converts to minor units before calling Graph API.
 */
router.patch("/campaigns/:campaignId/budget", requireAuth, requireRole("media_buyer"), async (req: Request, res: Response) => {
  const { workspaceId } = req as AuthedRequest;
  const campaignDbId = String(req.params.campaignId);
  const body = (req.body ?? {}) as { dailyBudget?: unknown; lifetimeBudget?: unknown };

  const dailyBudget = typeof body.dailyBudget === "number" ? body.dailyBudget : undefined;
  const lifetimeBudget = typeof body.lifetimeBudget === "number" ? body.lifetimeBudget : undefined;

  if (dailyBudget === undefined && lifetimeBudget === undefined) {
    return res.status(400).json({ error: "budget_required", message: "Provide dailyBudget or lifetimeBudget (or both)." });
  }
  if (dailyBudget !== undefined && (!Number.isFinite(dailyBudget) || dailyBudget < 1)) {
    return res.status(400).json({ error: "invalid_daily_budget", message: "Daily budget must be at least 1." });
  }
  if (lifetimeBudget !== undefined && (!Number.isFinite(lifetimeBudget) || lifetimeBudget < 1)) {
    return res.status(400).json({ error: "invalid_lifetime_budget", message: "Lifetime budget must be at least 1." });
  }

  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignDbId },
    include: { connection: true },
  });
  if (!campaign || campaign.connection.workspaceId !== workspaceId) {
    return res.status(404).json({ error: "Campaign not found" });
  }
  if (campaign.connection.platform !== "facebook") {
    return res.status(400).json({ error: "Only Facebook campaigns can have their budget updated via this endpoint" });
  }

  try {
    await updateCampaignBudget(campaign.connection, campaign.externalId, { dailyBudget, lifetimeBudget });
    res.json({
      ok: true,
      campaignId: campaign.id,
      dailyBudget: dailyBudget ?? null,
      lifetimeBudget: lifetimeBudget ?? null,
    });
  } catch (err) {
    logger.error({ err, campaignId: campaignDbId }, "failed to update campaign budget");
    res.status(502).json({ error: "Facebook API call failed" });
  }
});

const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})?)?$/;

/**
 * PATCH /api/facebook/campaigns/:campaignId/schedule — set start / end times.
 *
 * Body: `{ startTime?: string, endTime?: string }`. Values must be ISO-8601
 * date or datetime strings. At least one must be present. If both are given,
 * `endTime` must be at or after `startTime`.
 */
router.patch("/campaigns/:campaignId/schedule", requireAuth, requireRole("media_buyer"), async (req: Request, res: Response) => {
  const { workspaceId } = req as AuthedRequest;
  const campaignDbId = String(req.params.campaignId);
  const body = (req.body ?? {}) as { startTime?: unknown; endTime?: unknown };

  const startTime = typeof body.startTime === "string" && body.startTime.length > 0 ? body.startTime : undefined;
  const endTime = typeof body.endTime === "string" && body.endTime.length > 0 ? body.endTime : undefined;

  if (!startTime && !endTime) {
    return res.status(400).json({ error: "schedule_required", message: "Provide startTime or endTime (or both)." });
  }
  if (startTime && !ISO_DATETIME.test(startTime)) {
    return res.status(400).json({ error: "invalid_start_time" });
  }
  if (endTime && !ISO_DATETIME.test(endTime)) {
    return res.status(400).json({ error: "invalid_end_time" });
  }
  if (startTime && endTime) {
    const s = new Date(startTime).getTime();
    const e = new Date(endTime).getTime();
    if (!Number.isFinite(s) || !Number.isFinite(e)) {
      return res.status(400).json({ error: "invalid_schedule", message: "Could not parse the supplied dates." });
    }
    if (e < s) {
      return res.status(400).json({ error: "end_before_start", message: "End time must be on or after start time." });
    }
  }

  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignDbId },
    include: { connection: true },
  });
  if (!campaign || campaign.connection.workspaceId !== workspaceId) {
    return res.status(404).json({ error: "Campaign not found" });
  }
  if (campaign.connection.platform !== "facebook") {
    return res.status(400).json({ error: "Only Facebook campaigns can have their schedule updated via this endpoint" });
  }

  try {
    await updateCampaignSchedule(campaign.connection, campaign.externalId, { startTime, endTime });
    res.json({
      ok: true,
      campaignId: campaign.id,
      startTime: startTime ?? null,
      endTime: endTime ?? null,
    });
  } catch (err) {
    logger.error({ err, campaignId: campaignDbId }, "failed to update campaign schedule");
    res.status(502).json({ error: "Facebook API call failed" });
  }
});

/**
 * POST /api/facebook/campaigns/:campaignId/duplicate — clone a campaign.
 *
 * Body: `{ name?, dailyBudget?, lifetimeBudget?, startTime?, endTime?, startPaused? }`.
 * All fields are optional. Default startPaused=true so a clone never starts
 * spending immediately.
 *
 * The new campaign is upserted into our DB so the table can show it on the
 * very next fetch without waiting for the next full sync.
 */
router.post("/campaigns/:campaignId/duplicate", requireAuth, requireRole("media_buyer"), async (req: Request, res: Response) => {
  const { workspaceId } = req as AuthedRequest;
  const campaignDbId = String(req.params.campaignId);
  const body = (req.body ?? {}) as Record<string, unknown>;

  const name = typeof body.name === "string" ? body.name.trim() : undefined;
  const dailyBudget = typeof body.dailyBudget === "number" ? body.dailyBudget : undefined;
  const lifetimeBudget = typeof body.lifetimeBudget === "number" ? body.lifetimeBudget : undefined;
  const startTime = typeof body.startTime === "string" && body.startTime ? body.startTime : undefined;
  const endTime = typeof body.endTime === "string" && body.endTime ? body.endTime : undefined;
  const startPaused = body.startPaused !== false; // default ON

  if (name !== undefined && (name.length === 0 || name.length > MAX_CAMPAIGN_NAME_LEN)) {
    return res.status(400).json({ error: "invalid_name" });
  }
  if (dailyBudget !== undefined && (!Number.isFinite(dailyBudget) || dailyBudget < 1)) {
    return res.status(400).json({ error: "invalid_daily_budget" });
  }
  if (lifetimeBudget !== undefined && (!Number.isFinite(lifetimeBudget) || lifetimeBudget < 1)) {
    return res.status(400).json({ error: "invalid_lifetime_budget" });
  }
  if (startTime && !ISO_DATETIME.test(startTime)) {
    return res.status(400).json({ error: "invalid_start_time" });
  }
  if (endTime && !ISO_DATETIME.test(endTime)) {
    return res.status(400).json({ error: "invalid_end_time" });
  }
  if (startTime && endTime && new Date(endTime).getTime() < new Date(startTime).getTime()) {
    return res.status(400).json({ error: "end_before_start" });
  }

  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignDbId },
    include: { connection: true },
  });
  if (!campaign || campaign.connection.workspaceId !== workspaceId) {
    return res.status(404).json({ error: "Campaign not found" });
  }
  if (campaign.connection.platform !== "facebook") {
    return res.status(400).json({ error: "Only Facebook campaigns can be duplicated via this endpoint" });
  }

  try {
    const { newCampaignId } = await duplicateCampaign(campaign.connection, campaign.externalId, {
      name,
      dailyBudget,
      lifetimeBudget,
      startTime,
      endTime,
      startPaused,
    });

    // Upsert a minimal Campaign row so the new clone shows up in the UI right
    // away. The next sync will fill in raw / insights as data arrives.
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
