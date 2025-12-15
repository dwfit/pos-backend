/*
  Warnings:

  - You are about to drop the `DiscountProduct` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "DiscountProduct" DROP CONSTRAINT "DiscountProduct_discountId_fkey";

-- DropForeignKey
ALTER TABLE "DiscountProduct" DROP CONSTRAINT "DiscountProduct_productId_fkey";

-- AlterTable
ALTER TABLE "ModifierItem" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;

-- DropTable
DROP TABLE "DiscountProduct";

-- CreateTable
CREATE TABLE "DiscountProductSize" (
    "id" TEXT NOT NULL,
    "discountId" TEXT NOT NULL,
    "productSizeId" TEXT NOT NULL,
    "productId" TEXT,

    CONSTRAINT "DiscountProductSize_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DiscountProductSize_discountId_idx" ON "DiscountProductSize"("discountId");

-- CreateIndex
CREATE INDEX "DiscountProductSize_productSizeId_idx" ON "DiscountProductSize"("productSizeId");

-- AddForeignKey
ALTER TABLE "DiscountProductSize" ADD CONSTRAINT "DiscountProductSize_discountId_fkey" FOREIGN KEY ("discountId") REFERENCES "Discount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscountProductSize" ADD CONSTRAINT "DiscountProductSize_productSizeId_fkey" FOREIGN KEY ("productSizeId") REFERENCES "ProductSize"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscountProductSize" ADD CONSTRAINT "DiscountProductSize_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
