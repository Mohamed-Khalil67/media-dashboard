import { describe, it, expect, vi, beforeEach } from "vitest";
import express, { Request, Response, NextFunction } from "express";
import request from "supertest";

const mocks = vi.hoisted(() => ({
  campaignFindUnique: vi.fn(),
  campaignUpdate: vi.fn(),
  campaignUpsert: vi.fn(),
  setCampaignStatus: vi.fn().mockResolvedValue(undefined),
  renameCampaign: vi.fn().mockResolvedValue(undefined),
  updateCampaignBudget: vi.fn().mockResolvedValue(undefined),
  updateCampaignSchedule: vi.fn().mockResolvedValue(undefined),
  duplicateCampaign: vi.fn().mockResolvedValue({ newCampaignId: "fb_new_999" }),
  callerUserRole: "media_buyer" as "admin" | "media_buyer" | "client",
  callerWorkspaceId: "ws_caller",
}));

vi.mock("../../middleware/auth", () => ({
  requireAuth: (req: Request, _res: Response, next: NextFunction) => {
    const headerRole = req.headers["x-test-user-role"];
    (req as any).userId = "u_caller";
    (req as any).workspaceId = mocks.callerWorkspaceId;
    (req as any).role = "owner";
    (req as any).userRole = typeof headerRole === "string" ? headerRole : mocks.callerUserRole;
    next();
  },
}));

vi.mock("../../db/client", () => ({
  prisma: {
    campaign: {
      findUnique: mocks.campaignFindUnique,
      update: mocks.campaignUpdate,
      upsert: mocks.campaignUpsert,
    },
  },
}));

vi.mock("./facebook.service", () => ({
  setCampaignStatus: mocks.setCampaignStatus,
  renameCampaign: mocks.renameCampaign,
  updateCampaignBudget: mocks.updateCampaignBudget,
  updateCampaignSchedule: mocks.updateCampaignSchedule,
  duplicateCampaign: mocks.duplicateCampaign,
  // OAuth helpers that the route file imports but these tests never invoke.
  exchangeCodeForToken: vi.fn(),
  listAdAccounts: vi.fn(),
}));
vi.mock("../../utils/encryption", () => ({ encrypt: (v: string) => v }));
vi.mock("../../utils/oauthState", () => ({ signState: vi.fn(), verifyState: vi.fn() }));
vi.mock("../../lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import facebookRoutes from "./facebook.routes";

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/facebook", facebookRoutes);
  return app;
}

function fbCampaign(overrides: Record<string, unknown> = {}) {
  return {
    id: "c_db_1",
    connectionId: "conn_1",
    externalId: "fb_camp_123",
    name: "Test Campaign",
    status: "ACTIVE",
    connection: {
      id: "conn_1",
      workspaceId: "ws_caller",
      platform: "facebook",
      accessToken: "enc_token",
    },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.setCampaignStatus.mockResolvedValue(undefined);
  mocks.renameCampaign.mockResolvedValue(undefined);
  mocks.updateCampaignBudget.mockResolvedValue(undefined);
  mocks.updateCampaignSchedule.mockResolvedValue(undefined);
  mocks.duplicateCampaign.mockResolvedValue({ newCampaignId: "fb_new_999" });
  mocks.callerUserRole = "media_buyer";
  mocks.callerWorkspaceId = "ws_caller";
});

describe("POST /api/facebook/campaigns/:id/status — sanity", () => {
  it("rejects clients (role gate)", async () => {
    const res = await request(makeApp())
      .post("/api/facebook/campaigns/c_db_1/status")
      .set("X-Test-User-Role", "client")
      .send({ status: "PAUSED" });
    expect(res.status).toBe(403);
    expect(mocks.setCampaignStatus).not.toHaveBeenCalled();
  });

  it("rejects an invalid status value", async () => {
    const res = await request(makeApp())
      .post("/api/facebook/campaigns/c_db_1/status")
      .send({ status: "DELETED" });
    expect(res.status).toBe(400);
  });
});

describe("PATCH /api/facebook/campaigns/:id — rename", () => {
  it("rejects clients (role gate)", async () => {
    const res = await request(makeApp())
      .patch("/api/facebook/campaigns/c_db_1")
      .set("X-Test-User-Role", "client")
      .send({ name: "Anything" });
    expect(res.status).toBe(403);
    expect(mocks.renameCampaign).not.toHaveBeenCalled();
  });

  it("rejects admins too — admins manage users, not data", async () => {
    const res = await request(makeApp())
      .patch("/api/facebook/campaigns/c_db_1")
      .set("X-Test-User-Role", "admin")
      .send({ name: "Anything" });
    expect(res.status).toBe(403);
  });

  it("returns 400 when name is missing", async () => {
    const res = await request(makeApp())
      .patch("/api/facebook/campaigns/c_db_1")
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("name_required");
    expect(mocks.campaignFindUnique).not.toHaveBeenCalled();
  });

  it("returns 400 when name is whitespace-only", async () => {
    const res = await request(makeApp())
      .patch("/api/facebook/campaigns/c_db_1")
      .send({ name: "   " });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("name_empty");
  });

  it("returns 400 when name exceeds 400 characters", async () => {
    const res = await request(makeApp())
      .patch("/api/facebook/campaigns/c_db_1")
      .send({ name: "x".repeat(401) });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("name_too_long");
  });

  it("returns 404 when the campaign isn't in the caller's workspace", async () => {
    mocks.campaignFindUnique.mockResolvedValueOnce(
      fbCampaign({ connection: { ...fbCampaign().connection, workspaceId: "ws_other" } }),
    );
    const res = await request(makeApp())
      .patch("/api/facebook/campaigns/c_db_1")
      .send({ name: "New Name" });
    expect(res.status).toBe(404);
    expect(mocks.renameCampaign).not.toHaveBeenCalled();
  });

  it("returns 404 when the campaign row doesn't exist at all", async () => {
    mocks.campaignFindUnique.mockResolvedValueOnce(null);
    const res = await request(makeApp())
      .patch("/api/facebook/campaigns/c_db_missing")
      .send({ name: "New Name" });
    expect(res.status).toBe(404);
  });

  it("rejects non-facebook platforms with a clear error", async () => {
    mocks.campaignFindUnique.mockResolvedValueOnce(
      fbCampaign({ connection: { ...fbCampaign().connection, platform: "tiktok" } }),
    );
    const res = await request(makeApp())
      .patch("/api/facebook/campaigns/c_db_1")
      .send({ name: "New Name" });
    expect(res.status).toBe(400);
    expect(mocks.renameCampaign).not.toHaveBeenCalled();
  });

  it("calls Graph API and persists the trimmed name on success", async () => {
    mocks.campaignFindUnique.mockResolvedValueOnce(fbCampaign());
    mocks.campaignUpdate.mockResolvedValueOnce({ id: "c_db_1", name: "Q3 Promo — V2", status: "ACTIVE" });

    const res = await request(makeApp())
      .patch("/api/facebook/campaigns/c_db_1")
      .send({ name: "  Q3 Promo — V2  " });

    expect(res.status).toBe(200);
    expect(res.body.campaign.name).toBe("Q3 Promo — V2");
    expect(mocks.renameCampaign).toHaveBeenCalledWith(
      expect.objectContaining({ id: "conn_1", platform: "facebook" }),
      "fb_camp_123",
      "Q3 Promo — V2",
    );
    expect(mocks.campaignUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "c_db_1" }, data: { name: "Q3 Promo — V2" } }),
    );
  });

  it("returns 502 and does NOT persist when the Graph API call fails", async () => {
    mocks.campaignFindUnique.mockResolvedValueOnce(fbCampaign());
    mocks.renameCampaign.mockRejectedValueOnce(new Error("graph 500"));

    const res = await request(makeApp())
      .patch("/api/facebook/campaigns/c_db_1")
      .send({ name: "New Name" });

    expect(res.status).toBe(502);
    expect(mocks.campaignUpdate).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/facebook/campaigns/:id/budget — edit budget", () => {
  it("rejects clients (role gate)", async () => {
    const res = await request(makeApp())
      .patch("/api/facebook/campaigns/c_db_1/budget")
      .set("X-Test-User-Role", "client")
      .send({ dailyBudget: 50 });
    expect(res.status).toBe(403);
    expect(mocks.updateCampaignBudget).not.toHaveBeenCalled();
  });

  it("returns 400 when neither dailyBudget nor lifetimeBudget is provided", async () => {
    const res = await request(makeApp())
      .patch("/api/facebook/campaigns/c_db_1/budget")
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("budget_required");
    expect(mocks.campaignFindUnique).not.toHaveBeenCalled();
  });

  it("returns 400 for a daily budget less than 1", async () => {
    const res = await request(makeApp())
      .patch("/api/facebook/campaigns/c_db_1/budget")
      .send({ dailyBudget: 0.5 });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("invalid_daily_budget");
  });

  it("returns 400 for a non-numeric daily budget", async () => {
    const res = await request(makeApp())
      .patch("/api/facebook/campaigns/c_db_1/budget")
      .send({ dailyBudget: "fifty" });
    // String not accepted — falls through to "budget_required" because both budgets parse as undefined.
    expect(res.status).toBe(400);
  });

  it("returns 400 for a non-finite lifetime budget", async () => {
    const res = await request(makeApp())
      .patch("/api/facebook/campaigns/c_db_1/budget")
      .send({ lifetimeBudget: Number.POSITIVE_INFINITY });
    // JSON serializes Infinity as null, but if it gets through, we still reject.
    expect(res.status).toBe(400);
  });

  it("returns 404 when the campaign isn't in the caller's workspace", async () => {
    mocks.campaignFindUnique.mockResolvedValueOnce(
      fbCampaign({ connection: { ...fbCampaign().connection, workspaceId: "ws_other" } }),
    );
    const res = await request(makeApp())
      .patch("/api/facebook/campaigns/c_db_1/budget")
      .send({ dailyBudget: 50 });
    expect(res.status).toBe(404);
    expect(mocks.updateCampaignBudget).not.toHaveBeenCalled();
  });

  it("rejects non-facebook platforms", async () => {
    mocks.campaignFindUnique.mockResolvedValueOnce(
      fbCampaign({ connection: { ...fbCampaign().connection, platform: "tiktok" } }),
    );
    const res = await request(makeApp())
      .patch("/api/facebook/campaigns/c_db_1/budget")
      .send({ dailyBudget: 50 });
    expect(res.status).toBe(400);
  });

  it("calls Graph API with dailyBudget on success", async () => {
    mocks.campaignFindUnique.mockResolvedValueOnce(fbCampaign());

    const res = await request(makeApp())
      .patch("/api/facebook/campaigns/c_db_1/budget")
      .send({ dailyBudget: 75 });

    expect(res.status).toBe(200);
    expect(res.body.dailyBudget).toBe(75);
    expect(res.body.lifetimeBudget).toBeNull();
    expect(mocks.updateCampaignBudget).toHaveBeenCalledWith(
      expect.objectContaining({ id: "conn_1" }),
      "fb_camp_123",
      { dailyBudget: 75, lifetimeBudget: undefined },
    );
  });

  it("forwards both fields when both are provided", async () => {
    mocks.campaignFindUnique.mockResolvedValueOnce(fbCampaign());

    await request(makeApp())
      .patch("/api/facebook/campaigns/c_db_1/budget")
      .send({ dailyBudget: 50, lifetimeBudget: 1000 });

    expect(mocks.updateCampaignBudget).toHaveBeenCalledWith(
      expect.any(Object),
      "fb_camp_123",
      { dailyBudget: 50, lifetimeBudget: 1000 },
    );
  });

  it("returns 502 when the Graph API call fails", async () => {
    mocks.campaignFindUnique.mockResolvedValueOnce(fbCampaign());
    mocks.updateCampaignBudget.mockRejectedValueOnce(new Error("graph down"));

    const res = await request(makeApp())
      .patch("/api/facebook/campaigns/c_db_1/budget")
      .send({ dailyBudget: 50 });

    expect(res.status).toBe(502);
  });
});

describe("PATCH /api/facebook/campaigns/:id/schedule — schedule changes", () => {
  it("rejects clients (role gate)", async () => {
    const res = await request(makeApp())
      .patch("/api/facebook/campaigns/c_db_1/schedule")
      .set("X-Test-User-Role", "client")
      .send({ startTime: "2026-07-01" });
    expect(res.status).toBe(403);
    expect(mocks.updateCampaignSchedule).not.toHaveBeenCalled();
  });

  it("returns 400 when neither field is supplied", async () => {
    const res = await request(makeApp())
      .patch("/api/facebook/campaigns/c_db_1/schedule")
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("schedule_required");
  });

  it("returns 400 for a malformed start time", async () => {
    const res = await request(makeApp())
      .patch("/api/facebook/campaigns/c_db_1/schedule")
      .send({ startTime: "not-a-date" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("invalid_start_time");
  });

  it("returns 400 when end time is before start time", async () => {
    const res = await request(makeApp())
      .patch("/api/facebook/campaigns/c_db_1/schedule")
      .send({ startTime: "2026-07-15", endTime: "2026-07-01" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("end_before_start");
    expect(mocks.updateCampaignSchedule).not.toHaveBeenCalled();
  });

  it("accepts a valid date-only start (ISO 8601 short form)", async () => {
    mocks.campaignFindUnique.mockResolvedValueOnce(fbCampaign());
    const res = await request(makeApp())
      .patch("/api/facebook/campaigns/c_db_1/schedule")
      .send({ startTime: "2026-07-01" });
    expect(res.status).toBe(200);
    expect(mocks.updateCampaignSchedule).toHaveBeenCalledWith(
      expect.any(Object),
      "fb_camp_123",
      { startTime: "2026-07-01", endTime: undefined },
    );
  });

  it("forwards both fields when both valid", async () => {
    mocks.campaignFindUnique.mockResolvedValueOnce(fbCampaign());
    const res = await request(makeApp())
      .patch("/api/facebook/campaigns/c_db_1/schedule")
      .send({ startTime: "2026-07-01T00:00:00Z", endTime: "2026-07-31T23:59:59Z" });
    expect(res.status).toBe(200);
    expect(res.body.startTime).toBe("2026-07-01T00:00:00Z");
    expect(res.body.endTime).toBe("2026-07-31T23:59:59Z");
  });

  it("returns 404 when the campaign isn't in the caller's workspace", async () => {
    mocks.campaignFindUnique.mockResolvedValueOnce(
      fbCampaign({ connection: { ...fbCampaign().connection, workspaceId: "ws_other" } }),
    );
    const res = await request(makeApp())
      .patch("/api/facebook/campaigns/c_db_1/schedule")
      .send({ startTime: "2026-07-01" });
    expect(res.status).toBe(404);
  });

  it("returns 502 when Graph API call fails", async () => {
    mocks.campaignFindUnique.mockResolvedValueOnce(fbCampaign());
    mocks.updateCampaignSchedule.mockRejectedValueOnce(new Error("graph 500"));
    const res = await request(makeApp())
      .patch("/api/facebook/campaigns/c_db_1/schedule")
      .send({ startTime: "2026-07-01" });
    expect(res.status).toBe(502);
  });
});

describe("POST /api/facebook/campaigns/:id/duplicate", () => {
  it("rejects clients (role gate)", async () => {
    const res = await request(makeApp())
      .post("/api/facebook/campaigns/c_db_1/duplicate")
      .set("X-Test-User-Role", "client")
      .send({});
    expect(res.status).toBe(403);
    expect(mocks.duplicateCampaign).not.toHaveBeenCalled();
  });

  it("rejects an empty name", async () => {
    const res = await request(makeApp())
      .post("/api/facebook/campaigns/c_db_1/duplicate")
      .send({ name: "   " });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("invalid_name");
  });

  it("rejects a daily budget below 1", async () => {
    const res = await request(makeApp())
      .post("/api/facebook/campaigns/c_db_1/duplicate")
      .send({ dailyBudget: 0 });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("invalid_daily_budget");
  });

  it("rejects end_before_start", async () => {
    const res = await request(makeApp())
      .post("/api/facebook/campaigns/c_db_1/duplicate")
      .send({ startTime: "2026-07-15", endTime: "2026-07-01" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("end_before_start");
  });

  it("returns 404 when source campaign isn't in workspace", async () => {
    mocks.campaignFindUnique.mockResolvedValueOnce(
      fbCampaign({ connection: { ...fbCampaign().connection, workspaceId: "ws_other" } }),
    );
    const res = await request(makeApp())
      .post("/api/facebook/campaigns/c_db_1/duplicate")
      .send({});
    expect(res.status).toBe(404);
  });

  it("clones with defaults, upserts as PAUSED with '— copy' suffix", async () => {
    mocks.campaignFindUnique.mockResolvedValueOnce(fbCampaign());
    mocks.campaignUpsert.mockResolvedValueOnce({
      id: "c_db_new", externalId: "fb_new_999", name: "Test Campaign — copy", status: "PAUSED",
    });

    const res = await request(makeApp())
      .post("/api/facebook/campaigns/c_db_1/duplicate")
      .send({});

    expect(res.status).toBe(201);
    expect(res.body.campaign.name).toBe("Test Campaign — copy");
    expect(res.body.campaign.status).toBe("PAUSED");
    expect(mocks.duplicateCampaign).toHaveBeenCalledWith(
      expect.any(Object),
      "fb_camp_123",
      expect.objectContaining({ startPaused: true }),
    );
    const upsertArg = mocks.campaignUpsert.mock.calls[0][0];
    expect(upsertArg.where.connectionId_externalId).toEqual({
      connectionId: "conn_1", externalId: "fb_new_999",
    });
  });

  it("honors overrides and startPaused=false", async () => {
    mocks.campaignFindUnique.mockResolvedValueOnce(fbCampaign());
    mocks.campaignUpsert.mockResolvedValueOnce({
      id: "c_db_new", externalId: "fb_new_999", name: "Variant A", status: "ACTIVE",
    });

    const res = await request(makeApp())
      .post("/api/facebook/campaigns/c_db_1/duplicate")
      .send({
        name: "Variant A",
        dailyBudget: 25,
        startTime: "2026-07-01",
        startPaused: false,
      });

    expect(res.status).toBe(201);
    expect(res.body.campaign.status).toBe("ACTIVE");
    expect(mocks.duplicateCampaign).toHaveBeenCalledWith(
      expect.any(Object),
      "fb_camp_123",
      {
        name: "Variant A",
        dailyBudget: 25,
        lifetimeBudget: undefined,
        startTime: "2026-07-01",
        endTime: undefined,
        startPaused: false,
      },
    );
  });

  it("returns 502 when Graph clone fails", async () => {
    mocks.campaignFindUnique.mockResolvedValueOnce(fbCampaign());
    mocks.duplicateCampaign.mockRejectedValueOnce(new Error("graph 500"));

    const res = await request(makeApp())
      .post("/api/facebook/campaigns/c_db_1/duplicate")
      .send({});
    expect(res.status).toBe(502);
    expect(mocks.campaignUpsert).not.toHaveBeenCalled();
  });
});
