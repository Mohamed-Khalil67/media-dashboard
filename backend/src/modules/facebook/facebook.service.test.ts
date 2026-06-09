import { describe, it, expect } from "vitest";
import { extractPurchaseRoas, extractPurchases } from "./facebook.service";

describe("Facebook insights helpers", () => {
  describe("extractPurchaseRoas", () => {
    it("prefers omni_purchase when present", () => {
      const result = extractPurchaseRoas({
        purchase_roas: [
          { action_type: "offsite_conversion.fb_pixel_purchase", value: "2.5" },
          { action_type: "omni_purchase", value: "3.4" },
        ],
      });
      expect(result).toBe(3.4);
    });

    it("falls back to the first entry if omni_purchase missing", () => {
      const result = extractPurchaseRoas({
        purchase_roas: [{ action_type: "offsite_conversion.fb_pixel_purchase", value: "1.8" }],
      });
      expect(result).toBe(1.8);
    });

    it("returns 0 when no roas data", () => {
      expect(extractPurchaseRoas(undefined)).toBe(0);
      expect(extractPurchaseRoas({})).toBe(0);
      expect(extractPurchaseRoas({ purchase_roas: [] })).toBe(0);
    });
  });

  describe("extractPurchases", () => {
    it("picks the purchase action type", () => {
      const result = extractPurchases({
        actions: [
          { action_type: "link_click", value: "120" },
          { action_type: "purchase", value: "7" },
        ],
      });
      expect(result).toBe(7);
    });

    it("returns 0 when no purchase action present", () => {
      expect(extractPurchases({ actions: [{ action_type: "link_click", value: "120" }] })).toBe(0);
      expect(extractPurchases(undefined)).toBe(0);
    });
  });
});
