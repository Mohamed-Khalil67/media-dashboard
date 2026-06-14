-- AlterTable
ALTER TABLE "ShopifyOrder" ADD COLUMN     "currency" TEXT,
ADD COLUMN     "customerEmail" TEXT,
ADD COLUMN     "financialStatus" TEXT,
ADD COLUMN     "fulfillmentStatus" TEXT,
ADD COLUMN     "lineItemsCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "orderNumber" TEXT;

-- CreateIndex
CREATE INDEX "ShopifyOrder_connectionId_createdAt_idx" ON "ShopifyOrder"("connectionId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "ShopifyOrder_customerEmail_idx" ON "ShopifyOrder"("customerEmail");
