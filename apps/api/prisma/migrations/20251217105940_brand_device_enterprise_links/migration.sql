/*
  Warnings:

  - The `status` column on the `Order` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - A unique constraint covering the columns `[brandId,deviceCode]` on the table `PosDevice` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `deviceId` to the `Order` table without a default value. This is not possible if the table is not empty.
  - Made the column `brandId` on table `Order` required. This step will fail if there are existing NULL values in that column.
  - Added the required column `brandId` to the `OrderItem` table without a default value. This is not possible if the table is not empty.
  - Added the required column `deviceId` to the `OrderItem` table without a default value. This is not possible if the table is not empty.
  - Added the required column `brandId` to the `OrderItemModifier` table without a default value. This is not possible if the table is not empty.
  - Added the required column `deviceId` to the `OrderItemModifier` table without a default value. This is not possible if the table is not empty.
  - Added the required column `brandId` to the `Payment` table without a default value. This is not possible if the table is not empty.
  - Added the required column `deviceId` to the `Payment` table without a default value. This is not possible if the table is not empty.
  - Added the required column `brandId` to the `PosDevice` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "Order" DROP CONSTRAINT "Order_brandId_fkey";

-- DropIndex
DROP INDEX "PosDevice_deviceCode_key";

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "deviceId" TEXT NOT NULL,
DROP COLUMN "status",
ADD COLUMN     "status" "OrderStatus" NOT NULL DEFAULT 'ACTIVE',
ALTER COLUMN "brandId" SET NOT NULL;

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "brandId" TEXT NOT NULL,
ADD COLUMN     "deviceId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "OrderItemModifier" ADD COLUMN     "brandId" TEXT NOT NULL,
ADD COLUMN     "deviceId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "brandId" TEXT NOT NULL,
ADD COLUMN     "deviceId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "PosDevice" ADD COLUMN     "brandId" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "Order_brandId_idx" ON "Order"("brandId");

-- CreateIndex
CREATE INDEX "Order_deviceId_idx" ON "Order"("deviceId");

-- CreateIndex
CREATE INDEX "OrderItem_brandId_idx" ON "OrderItem"("brandId");

-- CreateIndex
CREATE INDEX "OrderItem_deviceId_idx" ON "OrderItem"("deviceId");

-- CreateIndex
CREATE INDEX "OrderItemModifier_brandId_idx" ON "OrderItemModifier"("brandId");

-- CreateIndex
CREATE INDEX "OrderItemModifier_deviceId_idx" ON "OrderItemModifier"("deviceId");

-- CreateIndex
CREATE INDEX "Payment_brandId_idx" ON "Payment"("brandId");

-- CreateIndex
CREATE INDEX "Payment_deviceId_idx" ON "Payment"("deviceId");

-- CreateIndex
CREATE UNIQUE INDEX "uq_posdevice_brand_deviceCode" ON "PosDevice"("brandId", "deviceCode");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "PosDevice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "PosDevice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItemModifier" ADD CONSTRAINT "OrderItemModifier_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItemModifier" ADD CONSTRAINT "OrderItemModifier_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "PosDevice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "PosDevice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosDevice" ADD CONSTRAINT "PosDevice_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
