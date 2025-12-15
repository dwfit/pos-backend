-- AlterTable
ALTER TABLE "ModifierItem" ADD COLUMN     "taxId" INTEGER;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "taxId" INTEGER;

-- CreateIndex
CREATE INDEX "ModifierItem_taxId_idx" ON "ModifierItem"("taxId");

-- CreateIndex
CREATE INDEX "Product_taxId_idx" ON "Product"("taxId");

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_taxId_fkey" FOREIGN KEY ("taxId") REFERENCES "Tax"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModifierItem" ADD CONSTRAINT "ModifierItem_taxId_fkey" FOREIGN KEY ("taxId") REFERENCES "Tax"("id") ON DELETE SET NULL ON UPDATE CASCADE;
