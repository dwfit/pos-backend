-- AlterTable
ALTER TABLE "Device" ADD COLUMN     "brandId" TEXT;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "brandId" TEXT;

-- CreateIndex
CREATE INDEX "Device_brandId_idx" ON "Device"("brandId");

-- AddForeignKey
ALTER TABLE "Device" ADD CONSTRAINT "Device_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE SET NULL ON UPDATE CASCADE;
