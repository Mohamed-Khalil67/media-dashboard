import { describe, it, expect, vi, beforeEach } from "vitest";
import express, { Request, Response, NextFunction } from "express";
import request from "supertest";

const mocks = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
  userFindMany: vi.fn(),
  userCreate: vi.fn(),
  userUpdate: vi.fn(),
  userDelete: vi.fn(),
  allowedUpsert: vi.fn(),
  allowedDeleteMany: vi.fn(),
  workspaceCreate: vi.fn(),
  // Cascade-count + deletion log
  connectionCount: vi.fn().mockResolvedValue(0),
  campaignCount: vi.fn().mockResolvedValue(0),
  insightCount: vi.fn().mockResolvedValue(0),
  syncRunCount: vi.fn().mockResolvedValue(0),
  shopifyOrderCount: vi.fn().mockResolvedValue(0),
  alertRuleCount: vi.fn().mockResolvedValue(0),
  workspaceMemberCount: vi.fn().mockResolvedValue(0),
  deletionLogCreate: vi.fn().mockResolvedValue({}),
  fbCreateUser: vi.fn(),
  fbUpdateUser: vi.fn(),
  fbDeleteUser: vi.fn(),
  seedDefaultRules: vi.fn(),
  // Test-controlled identity for the "admin caller" set by the stubbed requireAuth.
  callerUserId: "u_admin",
  callerUserRole: "admin" as "admin" | "media_buyer" | "client",
}));

// Stub requireAuth: trust the X-Test-User-Role header so each test can simulate
// either an admin caller (default) or a non-admin caller without minting tokens.
vi.mock("../../middleware/auth", () => ({
  requireAuth: (req: Request, _res: Response, next: NextFunction) => {
    const headerRole = req.headers["x-test-user-role"];
    (req as any).userId = mocks.callerUserId;
    (req as any).userRole = typeof headerRole === "string" ? headerRole : mocks.callerUserRole;
    next();
  },
}));

vi.mock("../../db/client", () => ({
  prisma: {
    user: {
      findUnique: mocks.userFindUnique,
      findMany: mocks.userFindMany,
      create: mocks.userCreate,
      update: mocks.userUpdate,
      delete: mocks.userDelete,
    },
    allowedEmail: { upsert: mocks.allowedUpsert, deleteMany: mocks.allowedDeleteMany },
    workspace: { create: mocks.workspaceCreate },
    connection: { count: mocks.connectionCount },
    campaign: { count: mocks.campaignCount },
    insight: { count: mocks.insightCount },
    syncRun: { count: mocks.syncRunCount },
    shopifyOrder: { count: mocks.shopifyOrderCount },
    alertRule: { count: mocks.alertRuleCount },
    workspaceMember: { count: mocks.workspaceMemberCount },
    deletionLog: { create: mocks.deletionLogCreate },
    $transaction: async (arg: unknown) => {
      if (typeof arg === "function") {
        return (arg as (tx: unknown) => Promise<unknown>)({
          user: {
            findUnique: mocks.userFindUnique,
            create: mocks.userCreate,
            update: mocks.userUpdate,
            delete: mocks.userDelete,
          },
          allowedEmail: { upsert: mocks.allowedUpsert, deleteMany: mocks.allowedDeleteMany },
          workspace: { create: mocks.workspaceCreate },
        });
      }
      if (Array.isArray(arg)) return Promise.all(arg);
      throw new Error("Unexpected $transaction call shape");
    },
  },
}));

vi.mock("../../lib/firebase", () => ({
  firebaseAuth: () => ({
    createUser: mocks.fbCreateUser,
    updateUser: mocks.fbUpdateUser,
    deleteUser: mocks.fbDeleteUser,
  }),
}));

vi.mock("../alerts/alerts.service", () => ({ seedDefaultRules: mocks.seedDefaultRules }));
vi.mock("../../lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import adminRoutes from "./admin.routes";

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/admin", adminRoutes);
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.callerUserId = "u_admin";
  mocks.callerUserRole = "admin";
});

describe("admin.routes", () => {
  describe("admin-only gating", () => {
    it("returns 403 admin_required for non-admin callers on GET /users", async () => {
      const res = await request(makeApp())
        .get("/api/admin/users")
        .set("X-Test-User-Role", "media_buyer");
      expect(res.status).toBe(403);
      expect(res.body.error).toBe("admin_required");
      expect(mocks.userFindMany).not.toHaveBeenCalled();
    });

    it("returns 403 admin_required for non-admin callers on POST /users", async () => {
      const res = await request(makeApp())
        .post("/api/admin/users")
        .set("X-Test-User-Role", "client")
        .send({ email: "x@y.com", password: "validPass123", role: "client" });
      expect(res.status).toBe(403);
      expect(mocks.fbCreateUser).not.toHaveBeenCalled();
    });
  });

  describe("GET /users", () => {
    it("returns the user list for admins", async () => {
      mocks.userFindMany.mockResolvedValueOnce([
        { id: "u_1", email: "a@x.com", name: null, role: "admin", disabled: false, createdAt: new Date("2026-01-01"), firebaseUid: "fb_1" },
      ]);
      const res = await request(makeApp()).get("/api/admin/users");
      expect(res.status).toBe(200);
      expect(res.body.users).toHaveLength(1);
      expect(res.body.users[0].email).toBe("a@x.com");
    });

    it("excludes the calling admin's own row from the list", async () => {
      // The calling admin can't modify themselves via this panel (self_* guards
      // on every mutation endpoint), so they shouldn't appear in their own list.
      mocks.userFindMany.mockResolvedValueOnce([]);
      await request(makeApp()).get("/api/admin/users");
      const args = mocks.userFindMany.mock.calls[0][0];
      expect(args.where).toEqual({ id: { not: "u_admin" } });
    });
  });

  describe("POST /users", () => {
    it("rejects an invalid email", async () => {
      const res = await request(makeApp())
        .post("/api/admin/users")
        .send({ email: "not-an-email", password: "validPass123", role: "client" });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("invalid_email");
      expect(mocks.fbCreateUser).not.toHaveBeenCalled();
    });

    it("rejects a weak password (< 8 chars)", async () => {
      const res = await request(makeApp())
        .post("/api/admin/users")
        .send({ email: "ok@example.com", password: "short", role: "client" });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("weak_password");
    });

    it("rejects an invalid role", async () => {
      const res = await request(makeApp())
        .post("/api/admin/users")
        .send({ email: "ok@example.com", password: "validPass123", role: "superuser" });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("invalid_role");
    });

    it("rejects when the email already belongs to a user", async () => {
      mocks.userFindUnique.mockResolvedValueOnce({ id: "u_existing" });
      const res = await request(makeApp())
        .post("/api/admin/users")
        .send({ email: "dup@example.com", password: "validPass123", role: "client" });
      expect(res.status).toBe(409);
      expect(res.body.error).toBe("email_exists");
      expect(mocks.fbCreateUser).not.toHaveBeenCalled();
    });

    it("re-creates a brand-new user when the email was previously deleted (hard delete leaves no trace)", async () => {
      // With hard delete in place, a previously-deleted email is indistinguishable
      // from one that never existed. Re-adding it provisions a fresh User row +
      // fresh workspace + seeds default rules — no historical data is restored.
      mocks.userFindUnique.mockResolvedValueOnce(null);
      mocks.fbCreateUser.mockResolvedValueOnce({ uid: "fb_again" });
      mocks.allowedUpsert.mockResolvedValueOnce({});
      mocks.userCreate.mockResolvedValueOnce({
        id: "u_fresh",
        email: "back@example.com",
        name: "Back Again",
        role: "client",
        disabled: false,
        firebaseUid: "fb_again",
        createdAt: new Date("2026-06-13"),
      });
      mocks.workspaceCreate.mockResolvedValueOnce({ id: "ws_fresh" });
      mocks.userUpdate.mockResolvedValueOnce({});

      const res = await request(makeApp())
        .post("/api/admin/users")
        .send({ email: "back@example.com", password: "validPass123", role: "client", name: "Back Again" });

      expect(res.status).toBe(201);
      // No `reactivated` field anymore.
      expect(res.body.reactivated).toBeUndefined();
      expect(mocks.userCreate).toHaveBeenCalledTimes(1);
      expect(mocks.workspaceCreate).toHaveBeenCalledTimes(1);
      expect(mocks.seedDefaultRules).toHaveBeenCalledTimes(1);
    });

    it("provisions a media buyer end-to-end on success", async () => {
      mocks.userFindUnique.mockResolvedValueOnce(null); // pre-check: no existing
      mocks.fbCreateUser.mockResolvedValueOnce({ uid: "fb_new" });
      mocks.allowedUpsert.mockResolvedValueOnce({ email: "buyer@example.com" });
      mocks.userCreate.mockResolvedValueOnce({
        id: "u_new",
        email: "buyer@example.com",
        name: "New Buyer",
        role: "media_buyer",
        disabled: false,
        firebaseUid: "fb_new",
        createdAt: new Date("2026-06-12"),
      });
      mocks.workspaceCreate.mockResolvedValueOnce({ id: "ws_new" });
      mocks.userUpdate.mockResolvedValueOnce({});

      const res = await request(makeApp())
        .post("/api/admin/users")
        .send({ email: "buyer@example.com", password: "validPass123", role: "media_buyer", name: "New Buyer" });

      expect(res.status).toBe(201);
      expect(res.body.user.email).toBe("buyer@example.com");
      expect(mocks.fbCreateUser).toHaveBeenCalledWith(expect.objectContaining({
        email: "buyer@example.com",
        password: "validPass123",
        displayName: "New Buyer",
      }));
      expect(mocks.allowedUpsert).toHaveBeenCalled();
      expect(mocks.userCreate).toHaveBeenCalled();
      expect(mocks.workspaceCreate).toHaveBeenCalled();
      expect(mocks.seedDefaultRules).toHaveBeenCalledWith("ws_new", "u_new");
    });

    it("rolls back the Firebase user when the Prisma transaction fails", async () => {
      mocks.userFindUnique.mockResolvedValueOnce(null);
      mocks.fbCreateUser.mockResolvedValueOnce({ uid: "fb_rollback" });
      mocks.allowedUpsert.mockRejectedValueOnce(new Error("DB blew up"));
      mocks.fbDeleteUser.mockResolvedValueOnce(undefined);

      const res = await request(makeApp())
        .post("/api/admin/users")
        .send({ email: "rollback@example.com", password: "validPass123", role: "client" });

      expect(res.status).toBe(500);
      expect(mocks.fbDeleteUser).toHaveBeenCalledWith("fb_rollback");
    });
  });

  describe("PATCH /users/:id", () => {
    it("blocks an admin from demoting themselves", async () => {
      const res = await request(makeApp())
        .patch("/api/admin/users/u_admin")
        .send({ role: "client" });
      expect(res.status).toBe(403);
      expect(res.body.error).toBe("self_demotion_blocked");
      expect(mocks.userUpdate).not.toHaveBeenCalled();
    });

    it("blocks an admin from disabling themselves", async () => {
      const res = await request(makeApp())
        .patch("/api/admin/users/u_admin")
        .send({ disabled: true });
      expect(res.status).toBe(403);
      expect(res.body.error).toBe("self_disable_blocked");
    });

    it("rejects role changes against a disabled user with 409 role_locked_while_disabled", async () => {
      mocks.userFindUnique.mockResolvedValueOnce({ disabled: true });
      const res = await request(makeApp())
        .patch("/api/admin/users/u_disabled")
        .send({ role: "media_buyer" });
      expect(res.status).toBe(409);
      expect(res.body.error).toBe("role_locked_while_disabled");
      expect(mocks.userUpdate).not.toHaveBeenCalled();
    });

    it("allows simultaneous role change + re-enable in a single PATCH", async () => {
      // The pre-check should be skipped when disabled:false accompanies the role change.
      mocks.userUpdate.mockResolvedValueOnce({
        id: "u_was_disabled", email: "wd@x.com", name: null, role: "media_buyer", disabled: false, firebaseUid: "fb_wd", createdAt: new Date(),
      });
      const res = await request(makeApp())
        .patch("/api/admin/users/u_was_disabled")
        .send({ role: "media_buyer", disabled: false });
      expect(res.status).toBe(200);
      expect(mocks.userFindUnique).not.toHaveBeenCalled();
      expect(mocks.userUpdate).toHaveBeenCalled();
    });

    it("allows changing another user's role", async () => {
      mocks.userUpdate.mockResolvedValueOnce({
        id: "u_other", email: "o@x.com", name: null, role: "media_buyer", disabled: false, firebaseUid: "fb_o", createdAt: new Date(),
      });
      const res = await request(makeApp())
        .patch("/api/admin/users/u_other")
        .send({ role: "media_buyer" });
      expect(res.status).toBe(200);
      expect(res.body.user.role).toBe("media_buyer");
      expect(mocks.userUpdate).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: "u_other" },
        data: expect.objectContaining({ role: "media_buyer" }),
      }));
    });
  });

  describe("POST /users/:id/password", () => {
    it("rejects weak passwords", async () => {
      const res = await request(makeApp())
        .post("/api/admin/users/u_other/password")
        .send({ password: "short" });
      expect(res.status).toBe(400);
      expect(mocks.fbUpdateUser).not.toHaveBeenCalled();
    });

    it("returns 404 when the user doesn't exist", async () => {
      mocks.userFindUnique.mockResolvedValueOnce(null);
      const res = await request(makeApp())
        .post("/api/admin/users/u_missing/password")
        .send({ password: "longEnough!!" });
      expect(res.status).toBe(404);
    });

    it("blocks an admin from resetting their own password", async () => {
      // Mirrors the self-delete / self-demotion safeguards. Admins must use the
      // forgot-password flow on themselves so a mis-click doesn't lock them out.
      const res = await request(makeApp())
        .post("/api/admin/users/u_admin/password")
        .send({ password: "brandNewPass1" });
      expect(res.status).toBe(403);
      expect(res.body.error).toBe("self_password_reset_blocked");
      expect(mocks.fbUpdateUser).not.toHaveBeenCalled();
    });

    it("calls firebase updateUser on valid input", async () => {
      mocks.userFindUnique.mockResolvedValueOnce({ firebaseUid: "fb_xyz", email: "u@x.com" });
      mocks.fbUpdateUser.mockResolvedValueOnce(undefined);
      const res = await request(makeApp())
        .post("/api/admin/users/u_other/password")
        .send({ password: "brandNewPass1" });
      expect(res.status).toBe(200);
      expect(mocks.fbUpdateUser).toHaveBeenCalledWith("fb_xyz", { password: "brandNewPass1" });
    });
  });

  describe("DELETE /users/:id", () => {
    it("blocks an admin from deleting themselves", async () => {
      const res = await request(makeApp()).delete("/api/admin/users/u_admin");
      expect(res.status).toBe(403);
      expect(res.body.error).toBe("self_delete_blocked");
      expect(mocks.fbDeleteUser).not.toHaveBeenCalled();
    });

    // Helper: the delete handler does TWO findUnique calls — first to load the
    // target user, second to load the acting admin (so we can persist their
    // email in the DeletionLog even if they're later deleted too).
    function mockTargetThenActor(target: any, actorEmail = "admin@x.com") {
      mocks.userFindUnique.mockResolvedValueOnce(target);
      mocks.userFindUnique.mockResolvedValueOnce({ email: actorEmail });
    }

    it("hard-deletes the Firebase user, the allowlist row, AND the User row", async () => {
      mockTargetThenActor({ firebaseUid: "fb_gone", email: "bye@x.com", name: "Bye", role: "client" });
      mocks.fbDeleteUser.mockResolvedValueOnce(undefined);
      mocks.allowedDeleteMany.mockResolvedValueOnce({ count: 1 });
      mocks.userDelete.mockResolvedValueOnce({ id: "u_other" });

      const res = await request(makeApp()).delete("/api/admin/users/u_other");
      expect(res.status).toBe(200);
      expect(mocks.fbDeleteUser).toHaveBeenCalledWith("fb_gone");
      expect(mocks.allowedDeleteMany).toHaveBeenCalledWith({ where: { email: "bye@x.com" } });
      expect(mocks.userDelete).toHaveBeenCalledWith({ where: { id: "u_other" } });
      expect(mocks.userUpdate).not.toHaveBeenCalled();
    });

    it("ignores auth/user-not-found from Firebase and still hard-deletes DB rows", async () => {
      mockTargetThenActor({ firebaseUid: "fb_ghost", email: "ghost@x.com", name: null, role: "client" });
      mocks.fbDeleteUser.mockRejectedValueOnce({ code: "auth/user-not-found" });
      mocks.allowedDeleteMany.mockResolvedValueOnce({ count: 0 });
      mocks.userDelete.mockResolvedValueOnce({ id: "u_other" });

      const res = await request(makeApp()).delete("/api/admin/users/u_other");
      expect(res.status).toBe(200);
      expect(mocks.userDelete).toHaveBeenCalled();
    });

    it("returns 404 when the user doesn't exist (no actor lookup, no cascade count)", async () => {
      mocks.userFindUnique.mockResolvedValueOnce(null);
      const res = await request(makeApp()).delete("/api/admin/users/u_missing");
      expect(res.status).toBe(404);
      expect(res.body.error).toBe("user_not_found");
      expect(mocks.fbDeleteUser).not.toHaveBeenCalled();
      expect(mocks.allowedDeleteMany).not.toHaveBeenCalled();
      expect(mocks.userDelete).not.toHaveBeenCalled();
      expect(mocks.connectionCount).not.toHaveBeenCalled();
      expect(mocks.deletionLogCreate).not.toHaveBeenCalled();
    });

    it("skips the Firebase call when the user has no firebaseUid (e.g. legacy unverified row)", async () => {
      mockTargetThenActor({ firebaseUid: null, email: "legacy@x.com", name: null, role: "client" });
      mocks.allowedDeleteMany.mockResolvedValueOnce({ count: 0 });
      mocks.userDelete.mockResolvedValueOnce({ id: "u_legacy" });

      const res = await request(makeApp()).delete("/api/admin/users/u_legacy");
      expect(res.status).toBe(200);
      expect(mocks.fbDeleteUser).not.toHaveBeenCalled();
      expect(mocks.allowedDeleteMany).toHaveBeenCalledWith({ where: { email: "legacy@x.com" } });
      expect(mocks.userDelete).toHaveBeenCalled();
    });

    it("does NOT touch the DB when Firebase delete throws an unrecoverable error", async () => {
      mockTargetThenActor({ firebaseUid: "fb_oops", email: "oops@x.com", name: null, role: "client" });
      mocks.fbDeleteUser.mockRejectedValueOnce({ code: "auth/internal-error" });

      const res = await request(makeApp()).delete("/api/admin/users/u_oops");
      expect(res.status).toBeGreaterThanOrEqual(500);
      expect(mocks.allowedDeleteMany).not.toHaveBeenCalled();
      expect(mocks.userDelete).not.toHaveBeenCalled();
      expect(mocks.deletionLogCreate).not.toHaveBeenCalled();
    });

    it("writes a DeletionLog row in the same transaction as the delete", async () => {
      mockTargetThenActor(
        { firebaseUid: "fb_logged", email: "logged@x.com", name: "Logged User", role: "media_buyer" },
        "admin@example.com",
      );
      mocks.fbDeleteUser.mockResolvedValueOnce(undefined);
      mocks.allowedDeleteMany.mockResolvedValueOnce({ count: 1 });
      mocks.connectionCount.mockResolvedValueOnce(3);
      mocks.campaignCount.mockResolvedValueOnce(47);
      mocks.insightCount.mockResolvedValueOnce(12890);
      mocks.syncRunCount.mockResolvedValueOnce(120);
      mocks.shopifyOrderCount.mockResolvedValueOnce(0);
      mocks.alertRuleCount.mockResolvedValueOnce(2);
      mocks.workspaceMemberCount.mockResolvedValueOnce(1);
      mocks.userDelete.mockResolvedValueOnce({ id: "u_logged" });

      const res = await request(makeApp()).delete("/api/admin/users/u_logged");

      expect(res.status).toBe(200);
      expect(res.body.cascade).toEqual({
        connections: 3, campaigns: 47, insights: 12890, syncRuns: 120,
        shopifyOrders: 0, alertRules: 2, workspaceMembers: 1,
      });
      expect(mocks.deletionLogCreate).toHaveBeenCalledTimes(1);
      const arg = mocks.deletionLogCreate.mock.calls[0][0];
      expect(arg.data).toMatchObject({
        deletedUserId: "u_logged",
        deletedUserEmail: "logged@x.com",
        deletedUserName: "Logged User",
        deletedUserRole: "media_buyer",
        deletedBy: "u_admin",
        deletedByEmail: "admin@example.com",
        cascadeSummary: { connections: 3, campaigns: 47, insights: 12890, syncRuns: 120, shopifyOrders: 0, alertRules: 2, workspaceMembers: 1 },
      });
    });

    it("falls back to deletedByEmail='unknown' if the actor row vanished between requests", async () => {
      // Defensive: the actor lookup returns null (admin was deleted concurrently).
      // The log still gets written so the audit trail isn't lost.
      mocks.userFindUnique.mockResolvedValueOnce({ firebaseUid: "fb_x", email: "x@x.com", name: null, role: "client" });
      mocks.userFindUnique.mockResolvedValueOnce(null);
      mocks.fbDeleteUser.mockResolvedValueOnce(undefined);
      mocks.allowedDeleteMany.mockResolvedValueOnce({ count: 0 });
      mocks.userDelete.mockResolvedValueOnce({ id: "u_x" });

      await request(makeApp()).delete("/api/admin/users/u_x");

      const arg = mocks.deletionLogCreate.mock.calls[0][0];
      expect(arg.data.deletedByEmail).toBe("unknown");
    });
  });

  describe("GET /users/:id/delete-preview", () => {
    it("returns the user + cascade counts", async () => {
      mocks.userFindUnique.mockResolvedValueOnce({
        id: "u_target", email: "preview@x.com", name: "Preview", role: "media_buyer",
      });
      mocks.connectionCount.mockResolvedValueOnce(2);
      mocks.campaignCount.mockResolvedValueOnce(15);
      mocks.insightCount.mockResolvedValueOnce(420);
      mocks.syncRunCount.mockResolvedValueOnce(30);
      mocks.shopifyOrderCount.mockResolvedValueOnce(0);
      mocks.alertRuleCount.mockResolvedValueOnce(1);
      mocks.workspaceMemberCount.mockResolvedValueOnce(1);

      const res = await request(makeApp()).get("/api/admin/users/u_target/delete-preview");

      expect(res.status).toBe(200);
      expect(res.body.user).toMatchObject({ id: "u_target", email: "preview@x.com", role: "media_buyer" });
      expect(res.body.cascade).toEqual({
        connections: 2, campaigns: 15, insights: 420, syncRuns: 30,
        shopifyOrders: 0, alertRules: 1, workspaceMembers: 1,
      });
    });

    it("returns 404 when the user doesn't exist", async () => {
      mocks.userFindUnique.mockResolvedValueOnce(null);
      const res = await request(makeApp()).get("/api/admin/users/u_missing/delete-preview");
      expect(res.status).toBe(404);
      expect(mocks.connectionCount).not.toHaveBeenCalled();
    });

    it("returns 403 self_delete_blocked when previewing self (matches DELETE semantics)", async () => {
      const res = await request(makeApp()).get("/api/admin/users/u_admin/delete-preview");
      expect(res.status).toBe(403);
      expect(res.body.error).toBe("self_delete_blocked");
      expect(mocks.userFindUnique).not.toHaveBeenCalled();
      expect(mocks.connectionCount).not.toHaveBeenCalled();
    });

    it("is admin-gated like every other admin route", async () => {
      const res = await request(makeApp())
        .get("/api/admin/users/u_target/delete-preview")
        .set("X-Test-User-Role", "media_buyer");
      expect(res.status).toBe(403);
      expect(res.body.error).toBe("admin_required");
    });
  });
});
