-- AlterTable
ALTER TABLE "Product" ADD COLUMN "promotionId" TEXT;
ALTER TABLE "Product" ADD COLUMN "promotionExpiresAt" TIMESTAMP(3);
ALTER TABLE "Product" ADD COLUMN "promotionLink" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Product_promotionId_key" ON "Product"("promotionId");
