-- CreateTable
CREATE TABLE "DeletionLog" (
    "id" TEXT NOT NULL,
    "deletedUserId" TEXT NOT NULL,
    "deletedUserEmail" TEXT NOT NULL,
    "deletedUserName" TEXT,
    "deletedUserRole" TEXT NOT NULL,
    "deletedBy" TEXT NOT NULL,
    "deletedByEmail" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cascadeSummary" JSONB NOT NULL,

    CONSTRAINT "DeletionLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DeletionLog_deletedAt_idx" ON "DeletionLog"("deletedAt" DESC);

-- CreateIndex
CREATE INDEX "DeletionLog_deletedByEmail_idx" ON "DeletionLog"("deletedByEmail");
