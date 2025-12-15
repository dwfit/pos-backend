-- CreateTable
CREATE TABLE "ProductModifier" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "modifierId" TEXT NOT NULL,

    CONSTRAINT "ProductModifier_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductModifier_productId_idx" ON "ProductModifier"("productId");

-- CreateIndex
CREATE INDEX "ProductModifier_modifierId_idx" ON "ProductModifier"("modifierId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductModifier_productId_modifierId_key" ON "ProductModifier"("productId", "modifierId");

-- AddForeignKey
ALTER TABLE "ProductModifier" ADD CONSTRAINT "ProductModifier_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductModifier" ADD CONSTRAINT "ProductModifier_modifierId_fkey" FOREIGN KEY ("modifierId") REFERENCES "ModifierGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
