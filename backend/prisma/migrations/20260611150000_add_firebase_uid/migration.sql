-- AlterTable
ALTER TABLE "User"
  ADD COLUMN "firebaseUid" TEXT,
  ADD COLUMN "pendingMigration" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX "User_firebaseUid_key" ON "User"("firebaseUid");

-- Backfill: every existing user must do the one-time password reset to migrate to Firebase.
UPDATE "User" SET "pendingMigration" = true WHERE "passwordHash" IS NOT NULL;
