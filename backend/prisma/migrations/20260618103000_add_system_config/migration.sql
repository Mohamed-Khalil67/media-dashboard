-- Phase 6.1: SystemConfig table backs the first-run setup wizard.
-- Secrets are encrypted in `value` (see encryption flag column).

CREATE TABLE "SystemConfig" (
    "key"       TEXT NOT NULL,
    "value"     TEXT NOT NULL,
    "encrypted" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "SystemConfig_pkey" PRIMARY KEY ("key")
);
