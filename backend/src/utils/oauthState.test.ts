import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { signState, verifyState } from "./oauthState";

beforeAll(() => {
  process.env.JWT_SECRET = crypto.randomBytes(32).toString("hex");
});

afterEach(() => {
  vi.useRealTimers();
});

describe("oauthState", () => {
  it("round-trips a payload", () => {
    const token = signState({ userId: "user_123", connectionId: "conn_1", provider: "facebook" });
    const decoded = verifyState(token);
    expect(decoded.userId).toBe("user_123");
    expect(decoded.connectionId).toBe("conn_1");
    expect(decoded.provider).toBe("facebook");
  });

  it("rejects tampering with the payload", () => {
    const token = signState({ userId: "user_a", connectionId: "conn_a", provider: "facebook" });
    const parts = token.split(".");
    parts[1] = Buffer.from(JSON.stringify({ userId: "attacker", connectionId: "conn_a", provider: "facebook" })).toString("base64url");
    const tampered = parts.join(".");
    expect(() => verifyState(tampered)).toThrow();
  });

  it("rejects a token signed with a different secret", () => {
    const forged = jwt.sign({ userId: "u", connectionId: "c", provider: "facebook" }, "different-secret", { expiresIn: "5m" });
    expect(() => verifyState(forged)).toThrow();
  });

  it("rejects an expired token (>5 min)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-18T00:00:00Z"));
    const token = signState({ userId: "u", connectionId: "c", provider: "shopify" });
    vi.setSystemTime(new Date("2026-06-18T00:06:00Z"));
    expect(() => verifyState(token)).toThrow(/expired/i);
  });

  it("preserves the provider discriminator for each platform", () => {
    for (const provider of ["facebook", "shopify"] as const) {
      const token = signState({ userId: "u", connectionId: "c", provider });
      expect(verifyState(token).provider).toBe(provider);
    }
  });

  it("embeds iat + exp claims with a 5-minute window", () => {
    const token = signState({ userId: "u", connectionId: "c", provider: "facebook" });
    const decoded = jwt.decode(token) as { iat: number; exp: number };
    expect(decoded.exp - decoded.iat).toBe(5 * 60);
  });
});
