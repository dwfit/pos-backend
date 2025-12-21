/*
  Warnings:

  - A unique constraint covering the columns `[brandId]` on the table `BrandSettings` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `brandId` to the `BrandSettings` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "BrandSettings" ADD COLUMN     "brandId" TEXT NOT NULL,
ADD COLUMN     "receipt" JSONB;

-- CreateIndex
CREATE UNIQUE INDEX "BrandSettings_brandId_key" ON "BrandSettings"("brandId");

-- AddForeignKey
ALTER TABLE "BrandSettings" ADD CONSTRAINT "BrandSettings_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;
