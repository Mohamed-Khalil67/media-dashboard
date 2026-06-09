import { describe, it, expect, beforeAll } from "vitest";
import crypto from "crypto";
import { signState, verifyState } from "./oauthState";

beforeAll(() => {
  process.env.JWT_SECRET = crypto.randomBytes(32).toString("hex");
});

describe("oauthState", () => {
  it("round-trips a payload", () => {
    const token = signState({ userId: "user_123", provider: "facebook" });
    const decoded = verifyState(token);
    expect(decoded.userId).toBe("user_123");
    expect(decoded.provider).toBe("facebook");
  });

  it("rejects tampering with the payload", () => {
    const token = signState({ userId: "user_a", provider: "facebook" });
    // Modify the middle (payload) segment.
    const parts = token.split(".");
    parts[1] = Buffer.from(JSON.stringify({ userId: "attacker", provider: "facebook" })).toString("base64url");
    const tampered = parts.join(".");
    expect(() => verifyState(tampered)).toThrow();
  });
});
