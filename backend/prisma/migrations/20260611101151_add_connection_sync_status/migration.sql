-- AlterTable
ALTER TABLE "Connection" ADD COLUMN     "lastSyncAt" TIMESTAMP(3),
ADD COLUMN     "lastSyncError" TEXT,
ADD COLUMN     "lastSyncOk" BOOLEAN;
