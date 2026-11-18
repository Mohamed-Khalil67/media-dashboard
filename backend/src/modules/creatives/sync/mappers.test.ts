import { describe, it, expect } from "vitest";
import {
  additiveMetrics,
  budgetFromMinor,
  detectFormat,
  isoDay,
  issueMessages,
  parseRetentionCurve,
  pickAction,
  rejectionReasons,
  videoIdOf,
} from "./mappers";
import { AdDetails, AdInsightRow } from "./meta.schemas";

const baseDetails = {
  id: "a1",
  name: "Ad",
  effective_status: "ACTIVE",
  adset: { id: "s1", name: "Set", effective_status: "ACTIVE" },
  campaign: { id: "c1", name: "Camp" },
};

describe("pickAction", () => {
  it("uses the first type present in priority order", () => {
    const list = [
      { action_type: "purchase", value: "3" },
      { action_type: "omni_purchase", value: "5" },
    ];
    expect(pickAction(list, ["omni_purchase", "purchase"])).toBe(5);
    expect(pickAction(list, ["lead"])).toBe(0);
    expect(pickAction(undefined, ["purchase"])).toBe(0);
  });
});

describe("additiveMetrics", () => {
  it("maps a Meta row with string numbers", () => {
    const row = AdInsightRow.parse({
      ad_id: "a1",
      date_start: "2026-11-01",
      spend: "120.5",
      impressions: "10000",
      inline_link_clicks: "95",
      actions: [
        { action_type: "video_view", value: "3100" },
        { action_type: "landing_page_view", value: "80" },
        { action_type: "omni_purchase", value: "4" },
        { action_type: "lead", value: "2" },
      ],
      action_values: [{ action_type: "omni_purchase", value: "640.25" }],
      video_play_actions: [{ action_type: "video_view", value: "9000" }],
      video_thruplay_watched_actions: [{ action_type: "video_view", value: "1200" }],
      video_p25_watched_actions: [{ action_type: "video_view", value: "2500" }],
      video_p100_watched_actions: [{ action_type: "video_view", value: "300" }],
    });
    expect(additiveMetrics(row)).toEqual({
      spend: 120.5,
      impressions: 10000,
      linkClicks: 95,
      videoPlays: 9000,
      video3s: 3100,
      thruplays: 1200,
      p25: 2500,
      p50: 0,
      p75: 0,
      p95: 0,
      p100: 300,
      landingPageViews: 80,
      purchases: 4,
      leads: 2,
      revenue: 640.25,
    });
  });

  it("treats missing and junk values as zero", () => {
    const row = AdInsightRow.parse({ ad_id: "a1", spend: "N/A" });
    const m = additiveMetrics(row);
    expect(m.spend).toBe(0);
    expect(m.impressions).toBe(0);
    expect(m.video3s).toBe(0);
  });
});

describe("parseRetentionCurve", () => {
  it("maps percent buckets to seconds and shares", () => {
    const pts = parseRetentionCurve(["100", "80", "50"], null);
    expect(pts).toEqual([
      { second: 0, share: 1 },
      { second: 1, share: 0.8 },
      { second: 2, share: 0.5 },
    ]);
  });

  it("uses the coarse buckets after 14 seconds", () => {
    const values = Array.from({ length: 22 }, (_, i) => 100 - i * 4);
    const pts = parseRetentionCurve(values, null);
    expect(pts?.map((p) => p.second).slice(14)).toEqual([14, 15, 20, 25, 30, 40, 50, 60]);
  });

  it("cuts the curve at the video length", () => {
    const values = Array.from({ length: 22 }, () => 50);
    const pts = parseRetentionCurve(values, 12);
    expect(pts?.at(-1)?.second).toBe(12);
  });

  it("returns null for missing or all-zero curves and clamps out-of-range values", () => {
    expect(parseRetentionCurve(undefined, null)).toBeNull();
    expect(parseRetentionCurve([0, 0, 0], null)).toBeNull();
    expect(parseRetentionCurve([140, -5], null)).toEqual([
      { second: 0, share: 1 },
      { second: 1, share: 0 },
    ]);
  });
});

describe("detectFormat", () => {
  const cases: Array<[string, AdDetails["creative"], string]> = [
    ["no creative", undefined, "UNKNOWN"],
    ["direct video", { id: "cr", video_id: "v1" }, "VIDEO"],
    ["video in story spec", { id: "cr", object_story_spec: { video_data: { video_id: "v2" } } }, "VIDEO"],
    ["post-based video", { id: "cr", object_type: "VIDEO" }, "VIDEO"],
    ["dynamic creative", { id: "cr", asset_feed_spec: { videos: [{}, {}] } }, "DYNAMIC"],
    ["carousel", { id: "cr", object_story_spec: { link_data: { child_attachments: [{}, {}, {}] } } }, "CAROUSEL"],
    ["image link ad", { id: "cr", object_type: "SHARE" }, "IMAGE"],
    ["photo", { id: "cr", object_type: "PHOTO" }, "IMAGE"],
    ["something else", { id: "cr", object_type: "EVENT" }, "UNKNOWN"],
  ];
  it.each(cases)("%s", (_label, creative, expected) => {
    expect(detectFormat(creative)).toBe(expected);
  });

  it("finds the video id wherever Meta puts it", () => {
    expect(videoIdOf({ id: "cr", video_id: "v1" })).toBe("v1");
    expect(videoIdOf({ id: "cr", object_story_spec: { video_data: { video_id: "v2" } } })).toBe("v2");
    expect(videoIdOf(undefined)).toBeNull();
  });
});

describe("delivery messages", () => {
  it("collects issues and rejection reasons", () => {
    const d = AdDetails.parse({
      ...baseDetails,
      issues_info: [{ error_summary: "Billing issue" }, { error_message: "Payment failed" }, {}],
      ad_review_feedback: { global: { "Text overlay": "Too much text in the image" } },
    });
    expect(issueMessages(d)).toEqual(["Billing issue", "Payment failed"]);
    expect(rejectionReasons(d)).toEqual(["Too much text in the image"]);
  });

  it("returns empty lists when Meta sends nothing", () => {
    const d = AdDetails.parse(baseDetails);
    expect(issueMessages(d)).toEqual([]);
    expect(rejectionReasons(d)).toEqual([]);
  });
});

describe("helpers", () => {
  it("converts budgets from minor units", () => {
    expect(budgetFromMinor("150000")).toBe(1500);
    expect(budgetFromMinor(undefined)).toBeNull();
    expect(budgetFromMinor("0")).toBeNull();
  });

  it("formats days relative to now in UTC", () => {
    const now = new Date("2026-11-06T10:00:00Z");
    expect(isoDay(now)).toBe("2026-11-06");
    expect(isoDay(now, 6)).toBe("2026-10-31");
  });
});
