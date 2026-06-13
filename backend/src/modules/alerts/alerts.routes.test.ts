import { describe, it, expect, vi, beforeEach } from "vitest";
import express, { Request, Response, NextFunction } from "express";
import request from "supertest";

const mocks = vi.hoisted(() => ({
  alertRuleFindMany: vi.fn(),
  alertRuleFindFirst: vi.fn(),
  alertRuleCreate: vi.fn(),
  alertRuleUpdate: vi.fn(),
  alertRuleDelete: vi.fn(),
  evaluateAlerts: vi.fn(),
  callerUserRole: "media_buyer" as "admin" | "media_buyer" | "client",
}));

vi.mock("../../middleware/auth", () => ({
  requireAuth: (req: Request, _res: Response, next: NextFunction) => {
    const headerRole = req.headers["x-test-user-role"];
    (req as any).userId = "u_caller";
    (req as any).workspaceId = "ws_caller";
    (req as any).role = "owner";
    (req as any).userRole = typeof headerRole === "string" ? headerRole : mocks.callerUserRole;
    next();
  },
}));

vi.mock("../../db/client", () => ({
  prisma: {
    alertRule: {
      findMany: mocks.alertRuleFindMany,
      findFirst: mocks.alertRuleFindFirst,
      create: mocks.alertRuleCreate,
      update: mocks.alertRuleUpdate,
      delete: mocks.alertRuleDelete,
    },
  },
}));

// Keep the real isSupportedMetric / isSupportedOperator predicates so validation
// errors exercise the same allowlist the production handler uses; only mock the
// expensive evaluator that pulls insights.
vi.mock("./alerts.service", async () => {
  const actual = await vi.importActual<typeof import("./alerts.service")>("./alerts.service");
  return { ...actual, evaluateAlerts: mocks.evaluateAlerts };
});

import alertsRoutes from "./alerts.routes";

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/alerts", alertsRoutes);
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.callerUserRole = "media_buyer";
});

describe("GET /api/alerts (evaluated alerts)", () => {
  it("returns evaluated alerts scoped to the caller's workspace", async () => {
    mocks.evaluateAlerts.mockResolvedValueOnce([
      { ruleId: "r1", metric: "roas", severity: "warning" },
    ]);
    const res = await request(makeApp()).get("/api/alerts");
    expect(res.status).toBe(200);
    expect(res.body.alerts).toHaveLength(1);
    expect(mocks.evaluateAlerts).toHaveBeenCalledWith("ws_caller", undefined, undefined);
  });

  it("forwards optional connectionId and a valid platform filter", async () => {
    mocks.evaluateAlerts.mockResolvedValueOnce([]);
    await request(makeApp()).get("/api/alerts?connectionId=c_1&platform=facebook");
    expect(mocks.evaluateAlerts).toHaveBeenCalledWith("ws_caller", "c_1", "facebook");
  });

  it("drops an unknown platform query value rather than passing it through", async () => {
    mocks.evaluateAlerts.mockResolvedValueOnce([]);
    await request(makeApp()).get("/api/alerts?platform=etsy");
    expect(mocks.evaluateAlerts).toHaveBeenCalledWith("ws_caller", undefined, undefined);
  });

  it("is callable by every role (clients need to see alerts)", async () => {
    for (const role of ["admin", "media_buyer", "client"] as const) {
      mocks.evaluateAlerts.mockResolvedValueOnce([]);
      const res = await request(makeApp()).get("/api/alerts").set("X-Test-User-Role", role);
      expect(res.status).toBe(200);
    }
  });
});

describe("GET /api/alerts/rules", () => {
  it("returns the workspace's rules ordered by metric", async () => {
    mocks.alertRuleFindMany.mockResolvedValueOnce([{ id: "r1", metric: "roas" }]);
    const res = await request(makeApp()).get("/api/alerts/rules");
    expect(res.status).toBe(200);
    expect(res.body.rules).toHaveLength(1);
    expect(mocks.alertRuleFindMany).toHaveBeenCalledWith({
      where: { workspaceId: "ws_caller" },
      orderBy: { metric: "asc" },
    });
  });
});

describe("POST /api/alerts/rules", () => {
  it("rejects clients", async () => {
    const res = await request(makeApp())
      .post("/api/alerts/rules")
      .set("X-Test-User-Role", "client")
      .send({ metric: "roas", operator: "lt", threshold: 2 });
    expect(res.status).toBe(403);
    expect(mocks.alertRuleCreate).not.toHaveBeenCalled();
  });

  it("rejects admins (admins manage users, not data)", async () => {
    const res = await request(makeApp())
      .post("/api/alerts/rules")
      .set("X-Test-User-Role", "admin")
      .send({ metric: "roas", operator: "lt", threshold: 2 });
    expect(res.status).toBe(403);
  });

  it("returns 400 when metric is not in the supported list", async () => {
    const res = await request(makeApp())
      .post("/api/alerts/rules")
      .send({ metric: "spend_per_hour", operator: "lt", threshold: 2 });
    expect(res.status).toBe(400);
    expect(mocks.alertRuleCreate).not.toHaveBeenCalled();
  });

  it("returns 400 when operator is not in the supported list", async () => {
    const res = await request(makeApp())
      .post("/api/alerts/rules")
      .send({ metric: "roas", operator: "eq", threshold: 2 });
    expect(res.status).toBe(400);
  });

  it("returns 400 when threshold is not a number", async () => {
    const res = await request(makeApp())
      .post("/api/alerts/rules")
      .send({ metric: "roas", operator: "lt", threshold: "low" });
    expect(res.status).toBe(400);
  });

  it("creates the rule with workspaceId + userId tied to the caller", async () => {
    mocks.alertRuleCreate.mockResolvedValueOnce({ id: "r_new" });
    const res = await request(makeApp())
      .post("/api/alerts/rules")
      .send({ metric: "roas", operator: "lt", threshold: 1.5 });
    expect(res.status).toBe(201);
    expect(mocks.alertRuleCreate).toHaveBeenCalledWith({
      data: {
        workspaceId: "ws_caller",
        userId: "u_caller",
        metric: "roas",
        operator: "lt",
        threshold: 1.5,
        enabled: true,
      },
    });
  });
});

describe("PATCH /api/alerts/rules/:id", () => {
  it("rejects clients", async () => {
    const res = await request(makeApp())
      .patch("/api/alerts/rules/r1")
      .set("X-Test-User-Role", "client")
      .send({ enabled: false });
    expect(res.status).toBe(403);
  });

  it("returns 404 when the rule belongs to a different workspace", async () => {
    mocks.alertRuleFindFirst.mockResolvedValueOnce(null);
    const res = await request(makeApp())
      .patch("/api/alerts/rules/r_other")
      .send({ enabled: false });
    expect(res.status).toBe(404);
    expect(mocks.alertRuleUpdate).not.toHaveBeenCalled();
  });

  it("returns 400 for an invalid operator", async () => {
    mocks.alertRuleFindFirst.mockResolvedValueOnce({ id: "r1" });
    const res = await request(makeApp())
      .patch("/api/alerts/rules/r1")
      .send({ operator: "ne" });
    expect(res.status).toBe(400);
    expect(mocks.alertRuleUpdate).not.toHaveBeenCalled();
  });

  it("updates only the supplied fields", async () => {
    mocks.alertRuleFindFirst.mockResolvedValueOnce({ id: "r1" });
    mocks.alertRuleUpdate.mockResolvedValueOnce({ id: "r1", enabled: false });
    await request(makeApp())
      .patch("/api/alerts/rules/r1")
      .send({ enabled: false });
    expect(mocks.alertRuleUpdate).toHaveBeenCalledWith({
      where: { id: "r1" },
      data: { enabled: false },
    });
  });
});

describe("DELETE /api/alerts/rules/:id", () => {
  it("rejects clients", async () => {
    const res = await request(makeApp())
      .delete("/api/alerts/rules/r1")
      .set("X-Test-User-Role", "client");
    expect(res.status).toBe(403);
  });

  it("returns 404 when the rule belongs to a different workspace", async () => {
    mocks.alertRuleFindFirst.mockResolvedValueOnce(null);
    const res = await request(makeApp()).delete("/api/alerts/rules/r_other");
    expect(res.status).toBe(404);
    expect(mocks.alertRuleDelete).not.toHaveBeenCalled();
  });

  it("deletes the rule when the caller owns it", async () => {
    mocks.alertRuleFindFirst.mockResolvedValueOnce({ id: "r1" });
    mocks.alertRuleDelete.mockResolvedValueOnce({ id: "r1" });
    const res = await request(makeApp()).delete("/api/alerts/rules/r1");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(mocks.alertRuleDelete).toHaveBeenCalledWith({ where: { id: "r1" } });
  });
});
