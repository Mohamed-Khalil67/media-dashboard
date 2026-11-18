import { z } from "zod";

/**
 * Zod schemas for the Meta Marketing API responses the ad-level sync reads.
 * Meta returns most numbers as strings; they are kept as-is here and converted
 * with `toNum` in the mappers. Unknown fields are stripped.
 */

const NumLike = z.union([z.string(), z.number()]);

export const ActionStat = z.object({
  action_type: z.string(),
  value: NumLike,
});
export type ActionStat = z.infer<typeof ActionStat>;

const ActionList = z.array(ActionStat).optional();

/** `video_play_curve_actions`: value is an array of percentages per bucket. */
export const CurveStat = z.object({
  action_type: z.string(),
  value: z.array(NumLike),
});

const Paging = z.object({ next: z.string().optional() }).optional();

/** One row of `GET /act_x/insights?level=ad` (with or without time_increment/breakdowns). */
export const AdInsightRow = z.object({
  ad_id: z.string(),
  date_start: z.string().optional(),
  date_stop: z.string().optional(),
  spend: NumLike.optional(),
  impressions: NumLike.optional(),
  reach: NumLike.optional(),
  frequency: NumLike.optional(),
  inline_link_clicks: NumLike.optional(),
  actions: ActionList,
  action_values: ActionList,
  video_play_actions: ActionList,
  video_thruplay_watched_actions: ActionList,
  video_p25_watched_actions: ActionList,
  video_p50_watched_actions: ActionList,
  video_p75_watched_actions: ActionList,
  video_p95_watched_actions: ActionList,
  video_p100_watched_actions: ActionList,
  quality_ranking: z.string().optional(),
  engagement_rate_ranking: z.string().optional(),
  conversion_rate_ranking: z.string().optional(),
  video_play_curve_actions: z.array(CurveStat).optional(),
  publisher_platform: z.string().optional(),
  platform_position: z.string().optional(),
});
export type AdInsightRow = z.infer<typeof AdInsightRow>;

export const InsightsPage = z.object({
  data: z.array(z.unknown()),
  paging: Paging,
});

const IssueInfo = z.object({
  error_summary: z.string().optional(),
  error_message: z.string().optional(),
});

/** `GET /?ids=…` ad details. */
export const AdDetails = z.object({
  id: z.string(),
  name: z.string(),
  effective_status: z.string(),
  created_time: z.string().optional(),
  issues_info: z.array(IssueInfo).optional(),
  ad_review_feedback: z
    .object({
      global: z.record(z.string(), z.string()).optional(),
      placement_specific: z.record(z.string(), z.unknown()).optional(),
    })
    .optional(),
  adset: z.object({
    id: z.string(),
    name: z.string(),
    effective_status: z.string(),
    optimization_goal: z.string().optional(),
    daily_budget: NumLike.optional(),
    lifetime_budget: NumLike.optional(),
    learning_stage_info: z.object({ status: z.string().optional() }).optional(),
  }),
  campaign: z.object({
    id: z.string(),
    name: z.string(),
    status: z.string().optional(),
    objective: z.string().optional(),
  }),
  creative: z
    .object({
      id: z.string(),
      object_type: z.string().optional(),
      video_id: z.string().optional(),
      thumbnail_url: z.string().optional(),
      asset_feed_spec: z.object({ videos: z.array(z.unknown()).optional() }).optional(),
      object_story_spec: z
        .object({
          video_data: z.object({ video_id: z.string().optional() }).optional(),
          link_data: z.object({ child_attachments: z.array(z.unknown()).optional() }).optional(),
        })
        .optional(),
    })
    .optional(),
});
export type AdDetails = z.infer<typeof AdDetails>;

export const AccountDetails = z.object({
  currency: z.string().optional(),
});
