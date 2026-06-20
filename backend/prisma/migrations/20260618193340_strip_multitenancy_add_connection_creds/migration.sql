-- Pivot to single-user public SaaS.
--   - Drop all multi-tenant tables (Workspace, WorkspaceMember, Identity,
--     SystemConfig, AllowedEmail, DeletionLog).
--   - Drop role/disabled/legacy columns on User.
--   - Drop workspaceId from Connection + AlertRule.
--   - Drop tiktok-platform Connection rows (and downstream cascade rows).
--   - Add per-connection developer-app credentials + historical sync window on Connection.

-- Sweep tiktok data first; cascade handles Campaign/Insight/SyncRun.
DELETE FROM "Connection" WHERE platform = 'tiktok';

-- Drop FK columns BEFORE dropping the tables they reference.
-- (PostgreSQL won't drop a table while FK constraints still point to it.)
ALTER TABLE "Connection" DROP COLUMN IF EXISTS "workspaceId";
ALTER TABLE "AlertRule"  DROP COLUMN IF EXISTS "workspaceId";

-- User columns we no longer use.
ALTER TABLE "User"
  DROP COLUMN IF EXISTS "role",
  DROP COLUMN IF EXISTS "disabled",
  DROP COLUMN IF EXISTS "activeWorkspaceId",
  DROP COLUMN IF EXISTS "pendingMigration",
  DROP COLUMN IF EXISTS "passwordHash";

-- Tables that go away entirely (FK refs already dropped above).
DROP TABLE IF EXISTS "WorkspaceMember";
DROP TABLE IF EXISTS "Identity";
DROP TABLE IF EXISTS "Workspace";
DROP TABLE IF EXISTS "SystemConfig";
DROP TABLE IF EXISTS "AllowedEmail";
DROP TABLE IF EXISTS "DeletionLog";

-- New per-connection developer credentials + historical sync window.
ALTER TABLE "Connection"
  ADD COLUMN IF NOT EXISTS "appId" TEXT,
  ADD COLUMN IF NOT EXISTS "appSecret" TEXT,
  ADD COLUMN IF NOT EXISTS "redirectUri" TEXT,
  ADD COLUMN IF NOT EXISTS "syncSince" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "syncUntil" TIMESTAMP(3);

-- The previous default was 'active' because rows were only inserted post-OAuth.
-- Under the new flow we create rows BEFORE OAuth (status=pending), so flip the
-- default for new inserts to 'pending'. Pre-existing rows keep their value.
ALTER TABLE "Connection" ALTER COLUMN "status" SET DEFAULT 'pending';
