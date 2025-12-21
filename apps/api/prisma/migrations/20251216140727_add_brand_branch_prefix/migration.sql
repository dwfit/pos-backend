/*
  Warnings:

  - A unique constraint covering the columns `[brandId,reference]` on the table `Branch` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Brand" ADD COLUMN     "branchPrefix" VARCHAR(10);

-- CreateIndex
CREATE UNIQUE INDEX "Branch_brandId_reference_key" ON "Branch"("brandId", "reference");
