import { describe, it, expect, beforeAll } from "vitest";
import crypto from "crypto";
import { isValidShopDomain, verifyCallbackHmac } from "./shopify.service";

beforeAll(() => {
  process.env.SHOPIFY_API_SECRET = "test-secret";
});

describe("isValidShopDomain", () => {
  it.each([
    ["mystore.myshopify.com", true],
    ["MyStore.myshopify.com", true],
    ["my-store-123.myshopify.com", true],
    ["evil.com", false],
    ["mystore.myshopify.com.evil.com", false],
    ["fake-myshopify.com", false],
    ["", false],
  ])("'%s' → %s", (input, expected) => {
    expect(isValidShopDomain(input)).toBe(expected);
  });
});

describe("verifyCallbackHmac", () => {
  function sign(params: Record<string, string>): string {
    const msg = Object.keys(params).sort().map((k) => `${k}=${params[k]}`).join("&");
    return crypto.createHmac("sha256", process.env.SHOPIFY_API_SECRET!).update(msg).digest("hex");
  }

  it("accepts a correctly-signed callback", () => {
    const params = { code: "abc", shop: "mystore.myshopify.com", state: "xyz", timestamp: "123" };
    const query = { ...params, hmac: sign(params) };
    expect(verifyCallbackHmac(query)).toBe(true);
  });

  it("rejects a tampered shop domain", () => {
    const params = { code: "abc", shop: "mystore.myshopify.com", state: "xyz" };
    const query = { ...params, hmac: sign(params), shop: "evil.myshopify.com" };
    expect(verifyCallbackHmac(query)).toBe(false);
  });

  it("rejects when hmac is absent", () => {
    expect(verifyCallbackHmac({ code: "abc", shop: "mystore.myshopify.com" })).toBe(false);
  });
});
