export interface FacebookOAuthCallbackDto {
  code: string;
  state: string;
}

export interface FacebookCampaignUpdateDto {
  status?: "ACTIVE" | "PAUSED";
  name?: string;
  dailyBudget?: number;
}

export interface FacebookCampaignDuplicateDto {
  name: string;
  status?: "ACTIVE" | "PAUSED";
  dailyBudget?: number;
}
