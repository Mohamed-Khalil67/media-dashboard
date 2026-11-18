export interface ConnectionResponseDto {
  id: string;
  platform: string;
  accountId: string;
  accountName: string | null;
  status: string;
  createdAt: Date;
  tokenExpiresAt: Date | null;
  lastSyncAt: Date | null;
  lastSyncOk: boolean | null;
  lastSyncError: string | null;
  syncSince: Date | null;
  syncUntil: Date | null;
}

export interface SyncRunsQueryDto {
  limit?: number;
}

export interface SyncRunDto {
  id: string;
  startedAt: Date;
  finishedAt: Date | null;
  ok: boolean | null;
  error: string | null;
  campaignCount: number | null;
  insightCount: number | null;
}
