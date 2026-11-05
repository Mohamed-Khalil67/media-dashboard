export interface SyncResultDto {
  connectionId: string;
  platform: string;
  ok: boolean;
  details?: {
    campaigns?: number;
    days?: number;
    orders?: number;
  };
  error?: string;
}

export interface SyncResponseDto {
  ranAt: string;
  results: SyncResultDto[];
}
