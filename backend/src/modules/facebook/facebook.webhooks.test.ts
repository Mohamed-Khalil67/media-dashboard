import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "crypto";
import express from "express";
import request from "supertest";

const mocks = vi.hoisted(() => ({
  identityFindMany: vi.fn(),
  connectionUpdateMany: vi.fn(),
}));

vi.mock("../../db/client", () => ({
  prisma: {
    identity: { findMany: mocks.identityFindMany },
    connection: { updateMany: mocks.connectionUpdateMany },
  },
}));
vi.mock("../../lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const SECRET = "test-fb-secret";
process.env.FB_APP_SECRET = SECRET;

import webhookRoutes from "./facebook.webhooks";

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/facebook/webhooks", webhookRoutes);
  return app;
}

function base64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function signedRequest(payload: object, secret: string): string {
  const payloadStr = base64url(Buffer.from(JSON.stringify(payload), "utf8"));
  const sig = base64url(crypto.createHmac("sha256", secret).update(payloadStr).digest());
  return `${sig}.${payloadStr}`;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("facebook webhooks", () => {
  describe("POST /deauth", () => {
    it("rejects a request with no signed_request", async () => {
      const res = await request(makeApp()).post("/api/facebook/webhooks/deauth").send({});
      expect(res.status).toBe(400);
    });

    it("rejects a forged signature", async () => {
      const forged = signedRequest({ algorithm: "HMAC-SHA256", user_id: "fb_123" }, "wrong-secret");
      const res = await request(makeApp())
        .post("/api/facebook/webhooks/deauth")
        .send({ signed_request: forged });
      expect(res.status).toBe(401);
      expect(mocks.connectionUpdateMany).not.toHaveBeenCalled();
    });

    it("revokes facebook connections on a valid deauth", async () => {
      mocks.identityFindMany.mockResolvedValueOnce([{ userId: "u_1" }, { userId: "u_2" }]);
      mocks.connectionUpdateMany.mockResolvedValueOnce({ count: 3 });

      const signed = signedRequest({ algorithm: "HMAC-SHA256", user_id: "fb_123" }, SECRET);
      const res = await request(makeApp())
        .post("/api/facebook/webhooks/deauth")
        .send({ signed_request: signed });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });
      expect(mocks.identityFindMany).toHaveBeenCalledWith({
        where: { provider: "facebook", providerId: "fb_123" },
        select: { userId: true },
      });
      expect(mocks.connectionUpdateMany).toHaveBeenCalledWith({
        where: { userId: { in: ["u_1", "u_2"] }, platform: "facebook" },
        data: { status: "revoked", accessToken: "" },
      });
    });
  });

  describe("POST /data-deletion", () => {
    it("returns url + confirmation_code on a valid request", async () => {
      mocks.identityFindMany.mockResolvedValueOnce([{ userId: "u_1" }]);
      mocks.connectionUpdateMany.mockResolvedValueOnce({ count: 1 });

      const signed = signedRequest({ algorithm: "HMAC-SHA256", user_id: "fb_xyz" }, SECRET);
      const res = await request(makeApp())
        .post("/api/facebook/webhooks/data-deletion")
        .send({ signed_request: signed });

      expect(res.status).toBe(200);
      expect(res.body.confirmation_code).toMatch(/^[a-f0-9]{32}$/);
      expect(res.body.url).toContain("/data-deletion?code=");
    });

    it("rejects a forged signature", async () => {
      const forged = signedRequest({ algorithm: "HMAC-SHA256", user_id: "fb_xyz" }, "wrong-secret");
      const res = await request(makeApp())
        .post("/api/facebook/webhooks/data-deletion")
        .send({ signed_request: forged });
      expect(res.status).toBe(401);
    });
  });
});
