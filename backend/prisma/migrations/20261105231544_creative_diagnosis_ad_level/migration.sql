-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "objective" TEXT,
ADD COLUMN     "targetCpa" DOUBLE PRECISION,
ADD COLUMN     "targetRoas" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "Connection" ADD COLUMN     "currency" TEXT,
ADD COLUMN     "lastAdSyncAt" TIMESTAMP(3),
ADD COLUMN     "lastAdSyncError" TEXT,
ADD COLUMN     "targetCpa" DOUBLE PRECISION,
ADD COLUMN     "targetRoas" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "AdSet" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "effectiveStatus" TEXT NOT NULL,
    "learningStatus" TEXT,
    "optimizationGoal" TEXT,
    "dailyBudget" DOUBLE PRECISION,
    "lifetimeBudget" DOUBLE PRECISION,

    CONSTRAINT "AdSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ad" (
    "id" TEXT NOT NULL,
    "adSetId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "effectiveStatus" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "creativeId" TEXT,
    "videoId" TEXT,
    "thumbnailUrl" TEXT,
    "videoLengthSec" DOUBLE PRECISION,
    "issues" JSONB,
    "rejectionReasons" JSONB,
    "createdAtPlatform" TIMESTAMP(3),

    CONSTRAINT "Ad_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdInsightDaily" (
    "id" TEXT NOT NULL,
    "adId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "spend" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "linkClicks" INTEGER NOT NULL DEFAULT 0,
    "videoPlays" INTEGER NOT NULL DEFAULT 0,
    "video3s" INTEGER NOT NULL DEFAULT 0,
    "thruplays" INTEGER NOT NULL DEFAULT 0,
    "p25" INTEGER NOT NULL DEFAULT 0,
    "p50" INTEGER NOT NULL DEFAULT 0,
    "p75" INTEGER NOT NULL DEFAULT 0,
    "p95" INTEGER NOT NULL DEFAULT 0,
    "p100" INTEGER NOT NULL DEFAULT 0,
    "landingPageViews" INTEGER NOT NULL DEFAULT 0,
    "purchases" INTEGER NOT NULL DEFAULT 0,
    "leads" INTEGER NOT NULL DEFAULT 0,
    "revenue" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "AdInsightDaily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdWindowStat" (
    "id" TEXT NOT NULL,
    "adId" TEXT NOT NULL,
    "windowDays" INTEGER NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "windowEnd" TIMESTAMP(3) NOT NULL,
    "reach" INTEGER NOT NULL DEFAULT 0,
    "frequency" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "spend" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "qualityRanking" TEXT,
    "engagementRanking" TEXT,
    "conversionRanking" TEXT,
    "retention" JSONB,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdWindowStat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdPlacementStat" (
    "id" TEXT NOT NULL,
    "adId" TEXT NOT NULL,
    "windowDays" INTEGER NOT NULL,
    "publisherPlatform" TEXT NOT NULL,
    "platformPosition" TEXT NOT NULL,
    "spend" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "video3s" INTEGER NOT NULL DEFAULT 0,
    "linkClicks" INTEGER NOT NULL DEFAULT 0,
    "revenue" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "AdPlacementStat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdSet_campaignId_idx" ON "AdSet"("campaignId");

-- CreateIndex
CREATE UNIQUE INDEX "AdSet_campaignId_externalId_key" ON "AdSet"("campaignId", "externalId");

-- CreateIndex
CREATE INDEX "Ad_adSetId_idx" ON "Ad"("adSetId");

-- CreateIndex
CREATE UNIQUE INDEX "Ad_adSetId_externalId_key" ON "Ad"("adSetId", "externalId");

-- CreateIndex
CREATE INDEX "AdInsightDaily_date_idx" ON "AdInsightDaily"("date");

-- CreateIndex
CREATE UNIQUE INDEX "AdInsightDaily_adId_date_key" ON "AdInsightDaily"("adId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "AdWindowStat_adId_windowDays_key" ON "AdWindowStat"("adId", "windowDays");

-- CreateIndex
CREATE UNIQUE INDEX "AdPlacementStat_adId_windowDays_publisherPlatform_platformP_key" ON "AdPlacementStat"("adId", "windowDays", "publisherPlatform", "platformPosition");

-- AddForeignKey
ALTER TABLE "AdSet" ADD CONSTRAINT "AdSet_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ad" ADD CONSTRAINT "Ad_adSetId_fkey" FOREIGN KEY ("adSetId") REFERENCES "AdSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdInsightDaily" ADD CONSTRAINT "AdInsightDaily_adId_fkey" FOREIGN KEY ("adId") REFERENCES "Ad"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdWindowStat" ADD CONSTRAINT "AdWindowStat_adId_fkey" FOREIGN KEY ("adId") REFERENCES "Ad"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdPlacementStat" ADD CONSTRAINT "AdPlacementStat_adId_fkey" FOREIGN KEY ("adId") REFERENCES "Ad"("id") ON DELETE CASCADE ON UPDATE CASCADE;
